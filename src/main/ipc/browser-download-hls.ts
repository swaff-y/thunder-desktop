/**
 * TD-037: HLS-to-MP4 download via ffmpeg remux. Spawns the ffmpeg
 * binary shipped by `ffmpeg-static`, parses `-progress pipe:1` output
 * for byte counts, and exposes a cancel handle that terminates the
 * child within 2s and deletes the partial output file.
 *
 * Pure-ish wrapper: `electron` is only touched at module load (for
 * `app.isPackaged` + the asar-unpacked path rewrite); the rest is
 * `child_process.spawn` + `node:fs`. The spawn wrapper itself accepts
 * `ffmpegPath` as an option so tests don't have to mock `ffmpeg-static`.
 */

import { spawn } from 'node:child_process'
import { unlinkSync } from 'node:fs'
import { app } from 'electron'
import ffmpegStaticPath from 'ffmpeg-static'
import {
  estimateHlsTotalBytes,
  parseFfmpegDurationLine,
  parseFfmpegProgressLine,
  rewriteAsarPathToUnpacked
} from './browser-download-hls-helpers'

const CANCEL_GRACE_MS = 2000
const STDERR_TAIL_LINES = 20
// Cap each captured stderr line so a pathological ffmpeg build can't
// inflate the error string the renderer ultimately receives.
const STDERR_LINE_MAX_CHARS = 2048

export type HlsExitState = 'completed' | 'cancelled' | 'interrupted'

export interface HlsDownloadOptions {
  ffmpegPath: string
  assetUrl: string
  targetPath: string
  /** CRLF-joined `Key: Value` string for ffmpeg's `-headers` flag. */
  headers: string
  onProgress: (receivedBytes: number, totalBytes: number) => void
  onDone: (state: HlsExitState, error?: string) => void
}

export interface HlsDownloadHandle {
  cancel: () => void
}

export function resolveBundledFfmpegPath(): string {
  if (typeof ffmpegStaticPath !== 'string' || ffmpegStaticPath.length === 0) {
    throw new Error('[hls] ffmpeg-static did not provide a binary path')
  }
  return rewriteAsarPathToUnpacked(ffmpegStaticPath, app.isPackaged)
}

function buildFfmpegArgs(opts: HlsDownloadOptions): string[] {
  const args: string[] = ['-y']
  if (opts.headers.length > 0) {
    args.push('-headers', opts.headers)
  }
  args.push(
    '-i',
    opts.assetUrl,
    '-c',
    'copy',
    // HLS carries AAC in ADTS framing; the MP4 container needs ASC
    // headers — without this filter ffmpeg refuses the remux.
    '-bsf:a',
    'aac_adtstoasc',
    // Hoist the moov atom to the start so a player can begin
    // streaming the resulting file before it's fully read.
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    opts.targetPath
  )
  return args
}

function deletePartial(path: string): void {
  try {
    unlinkSync(path)
  } catch {
    // Either the file never landed on disk (cancel before headers) or
    // the OS won't let us delete it right now (Windows + still-open
    // handle). Swallow — the user's intent was "stop and clean up",
    // and we have no recovery path here.
  }
}

export function startHlsDownload(opts: HlsDownloadOptions): HlsDownloadHandle {
  const proc = spawn(opts.ffmpegPath, buildFfmpegArgs(opts), {
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let cancelled = false
  let settled = false
  let killTimer: NodeJS.Timeout | null = null
  let stdoutBuf = ''
  let stderrBuf = ''
  // Manifest duration in microseconds, latched on the first
  // parseable `Duration:` line ffmpeg prints. Stays null when
  // ffmpeg can't determine the duration up front (live streams,
  // some malformed manifests) — callers fall back to indeterminate.
  let durationUs: number | null = null
  // Per-`-progress` block accumulators. ffmpeg flushes a block
  // every ~1s terminated by `progress=continue` (or `=end`); we
  // emit one onProgress per block boundary using the latched
  // values so the receivedBytes/totalBytes pair stays consistent
  // within a single tick.
  let blockTotalSize: number | null = null
  let blockOutTimeUs: number | null = null
  const stderrTail: string[] = []

  // The `stdio: ['ignore', 'pipe', 'pipe']` contract guarantees
  // both streams are present, but TypeScript can't narrow the
  // generic spawn return — guard so a future stdio change degrades
  // to a clean "interrupted" instead of a crashing dereference.
  if (proc.stdout === null || proc.stderr === null) {
    opts.onDone('interrupted', '[hls] ffmpeg child has no stdout/stderr')
    return { cancel: () => undefined }
  }

  proc.stdout.setEncoding('utf-8')
  proc.stdout.on('data', (chunk: string) => {
    stdoutBuf += chunk
    let nl: number
    while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, nl)
      stdoutBuf = stdoutBuf.slice(nl + 1)
      const kv = parseFfmpegProgressLine(line)
      if (kv === null) continue
      if (kv.key === 'total_size') {
        const n = Number.parseInt(kv.value, 10)
        if (Number.isFinite(n) && n >= 0) blockTotalSize = n
      } else if (kv.key === 'out_time_us') {
        const n = Number.parseInt(kv.value, 10)
        if (Number.isFinite(n) && n >= 0) blockOutTimeUs = n
      } else if (kv.key === 'progress') {
        // End of a progress block — emit one event with whatever we
        // saw this tick. When duration is known, totalBytes is a
        // duration-scaled estimate (bar fills left-to-right and
        // converges to the true size); otherwise 0 keeps the
        // renderer in indeterminate-shimmer mode.
        if (blockTotalSize !== null) {
          const totalBytes =
            blockOutTimeUs !== null && durationUs !== null
              ? estimateHlsTotalBytes(blockTotalSize, blockOutTimeUs, durationUs)
              : 0
          opts.onProgress(blockTotalSize, totalBytes)
        }
        blockTotalSize = null
        blockOutTimeUs = null
      }
    }
  })

  proc.stderr.setEncoding('utf-8')
  proc.stderr.on('data', (chunk: string) => {
    stderrBuf += chunk
    let nl: number
    while ((nl = stderrBuf.indexOf('\n')) !== -1) {
      const line = stderrBuf.slice(0, nl)
      stderrBuf = stderrBuf.slice(nl + 1)
      // Latch the first parseable Duration line. ffmpeg prints it
      // once per input near startup; subsequent lines never carry
      // a corrected value, so re-parsing wastes work.
      if (durationUs === null) {
        const parsed = parseFfmpegDurationLine(line)
        if (parsed !== null && parsed > 0) durationUs = parsed
      }
      if (line.length === 0) continue
      stderrTail.push(
        line.length > STDERR_LINE_MAX_CHARS ? line.slice(0, STDERR_LINE_MAX_CHARS) : line
      )
      if (stderrTail.length > STDERR_TAIL_LINES) {
        stderrTail.shift()
      }
    }
  })

  function settle(state: HlsExitState, error?: string): void {
    if (settled) return
    settled = true
    if (killTimer !== null) {
      clearTimeout(killTimer)
      killTimer = null
    }
    if (state !== 'completed') {
      deletePartial(opts.targetPath)
    }
    opts.onDone(state, error)
  }

  proc.on('error', (err) => {
    // Spawn-time failure (binary missing / permission denied). No
    // file on disk yet, but settle() runs deletePartial defensively.
    settle('interrupted', err.message)
  })

  proc.on('close', (code, signal) => {
    if (cancelled) {
      settle('cancelled')
      return
    }
    if (code === 0) {
      settle('completed')
      return
    }
    const tail = stderrTail.join('\n')
    const detail = signal !== null ? `signal=${signal}` : `exit=${code}`
    settle('interrupted', tail.length > 0 ? `${detail}: ${tail}` : detail)
  })

  return {
    cancel(): void {
      if (settled || cancelled) return
      cancelled = true
      proc.kill('SIGTERM')
      killTimer = setTimeout(() => {
        killTimer = null
        if (!settled) proc.kill('SIGKILL')
      }, CANCEL_GRACE_MS)
      // Don't pin the event loop just to wait for ffmpeg's grace
      // window — app shutdown should still proceed if the user quits
      // mid-cancel.
      killTimer.unref?.()
    }
  }
}
