/**
 * TD-037: integration tests for the HLS download spawn wrapper.
 *
 * `node:child_process` and `electron` are mocked at the module
 * boundary so we can drive ffmpeg's lifecycle (stdout chunks, stderr,
 * exit codes, signals) deterministically without ever shelling out.
 * The fake child process is a plain EventEmitter with `stdout` /
 * `stderr` sub-emitters and a `kill` spy.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

interface FakeChild extends EventEmitter {
  stdout: EventEmitter & { setEncoding: (e: string) => void }
  stderr: EventEmitter & { setEncoding: (e: string) => void }
  kill: ReturnType<typeof vi.fn>
}

let lastSpawnArgs: { cmd: string; args: string[] } | null = null
let lastChild: FakeChild | null = null

const spawnMock = vi.fn((cmd: string, args: string[]): FakeChild => {
  lastSpawnArgs = { cmd, args }
  const child = new EventEmitter() as FakeChild
  const stdout = new EventEmitter() as FakeChild['stdout']
  stdout.setEncoding = (): void => undefined
  const stderr = new EventEmitter() as FakeChild['stderr']
  stderr.setEncoding = (): void => undefined
  child.stdout = stdout
  child.stderr = stderr
  child.kill = vi.fn()
  lastChild = child
  return child
})

vi.mock('node:child_process', () => ({
  spawn: spawnMock
}))

vi.mock('electron', () => ({
  app: { isPackaged: false }
}))

vi.mock('ffmpeg-static', () => ({
  default: '/fake/ffmpeg'
}))

const { startHlsDownload, resolveBundledFfmpegPath } = await import('../browser-download-hls')

let tempDir = ''

function freshTargetPath(name = 'clip.mp4'): string {
  return join(tempDir, name)
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'thunder-hls-'))
  spawnMock.mockClear()
  lastSpawnArgs = null
  lastChild = null
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
  vi.useRealTimers()
})

describe('startHlsDownload', () => {
  it('spawns ffmpeg with the expected remux args', () => {
    const target = freshTargetPath()
    startHlsDownload({
      ffmpegPath: '/bin/ffmpeg',
      assetUrl: 'https://x/v.m3u8',
      targetPath: target,
      headers: 'Cookie: a=1\r\nUser-Agent: UA/1',
      onProgress: vi.fn(),
      onDone: vi.fn()
    })
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(lastSpawnArgs?.cmd).toBe('/bin/ffmpeg')
    expect(lastSpawnArgs?.args).toEqual([
      '-y',
      '-headers',
      'Cookie: a=1\r\nUser-Agent: UA/1',
      '-i',
      'https://x/v.m3u8',
      '-c',
      'copy',
      '-bsf:a',
      'aac_adtstoasc',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      '-nostats',
      target
    ])
  })

  it('omits the -headers flag when headers is empty', () => {
    startHlsDownload({
      ffmpegPath: '/bin/ffmpeg',
      assetUrl: 'https://x/v.m3u8',
      targetPath: freshTargetPath(),
      headers: '',
      onProgress: vi.fn(),
      onDone: vi.fn()
    })
    expect(lastSpawnArgs?.args).not.toContain('-headers')
  })

  it('emits onProgress with bytes parsed from total_size lines', () => {
    const onProgress = vi.fn()
    startHlsDownload({
      ffmpegPath: '/bin/ffmpeg',
      assetUrl: 'https://x/v.m3u8',
      targetPath: freshTargetPath(),
      headers: '',
      onProgress,
      onDone: vi.fn()
    })
    lastChild?.stdout.emit(
      'data',
      'frame=10\nout_time_ms=100000\ntotal_size=4096\nprogress=continue\n'
    )
    expect(onProgress).toHaveBeenLastCalledWith(4096, 0)
    lastChild?.stdout.emit('data', 'total_size=8192\nprogress=continue\n')
    expect(onProgress).toHaveBeenLastCalledWith(8192, 0)
  })

  it('handles a stdout chunk that splits a line across two emits', () => {
    const onProgress = vi.fn()
    startHlsDownload({
      ffmpegPath: '/bin/ffmpeg',
      assetUrl: 'https://x/v.m3u8',
      targetPath: freshTargetPath(),
      headers: '',
      onProgress,
      onDone: vi.fn()
    })
    lastChild?.stdout.emit('data', 'total_si')
    expect(onProgress).not.toHaveBeenCalled()
    lastChild?.stdout.emit('data', 'ze=2048\nprogress=continue\n')
    expect(onProgress).toHaveBeenCalledWith(2048, 0)
  })

  it('calls onDone(completed) on a clean exit (code 0)', () => {
    const onDone = vi.fn()
    startHlsDownload({
      ffmpegPath: '/bin/ffmpeg',
      assetUrl: 'https://x/v.m3u8',
      targetPath: freshTargetPath(),
      headers: '',
      onProgress: vi.fn(),
      onDone
    })
    lastChild?.emit('close', 0, null)
    expect(onDone).toHaveBeenCalledWith('completed', undefined)
  })

  it('does not delete the output file on a successful exit', () => {
    const target = freshTargetPath()
    writeFileSync(target, 'finished-bytes')
    startHlsDownload({
      ffmpegPath: '/bin/ffmpeg',
      assetUrl: 'https://x/v.m3u8',
      targetPath: target,
      headers: '',
      onProgress: vi.fn(),
      onDone: vi.fn()
    })
    lastChild?.emit('close', 0, null)
    expect(existsSync(target)).toBe(true)
  })

  it('calls onDone(interrupted) with the last stderr lines on non-zero exit', () => {
    const onDone = vi.fn()
    startHlsDownload({
      ffmpegPath: '/bin/ffmpeg',
      assetUrl: 'https://x/v.m3u8',
      targetPath: freshTargetPath(),
      headers: '',
      onProgress: vi.fn(),
      onDone
    })
    lastChild?.stderr.emit('data', 'A non-fatal warning\nServer returned 403 Forbidden\n')
    lastChild?.emit('close', 1, null)
    expect(onDone).toHaveBeenCalledTimes(1)
    const [state, error] = onDone.mock.calls[0]
    expect(state).toBe('interrupted')
    expect(error).toContain('exit=1')
    expect(error).toContain('Server returned 403 Forbidden')
  })

  it('caps captured stderr to the last 20 lines', () => {
    const onDone = vi.fn()
    startHlsDownload({
      ffmpegPath: '/bin/ffmpeg',
      assetUrl: 'https://x/v.m3u8',
      targetPath: freshTargetPath(),
      headers: '',
      onProgress: vi.fn(),
      onDone
    })
    const lines = Array.from({ length: 30 }, (_, i) => `line-${i}`).join('\n') + '\n'
    lastChild?.stderr.emit('data', lines)
    lastChild?.emit('close', 1, null)
    const error = onDone.mock.calls[0][1] as string
    expect(error).not.toContain('line-9\n')
    expect(error).toContain('line-10')
    expect(error).toContain('line-29')
  })

  it('removes the partial output file on non-zero exit', () => {
    const target = freshTargetPath('partial.mp4')
    writeFileSync(target, 'partial-bytes')
    startHlsDownload({
      ffmpegPath: '/bin/ffmpeg',
      assetUrl: 'https://x/v.m3u8',
      targetPath: target,
      headers: '',
      onProgress: vi.fn(),
      onDone: vi.fn()
    })
    expect(existsSync(target)).toBe(true)
    lastChild?.emit('close', 1, null)
    expect(existsSync(target)).toBe(false)
  })

  it('cancel() sends SIGTERM, removes the partial file, and reports cancelled', () => {
    const target = freshTargetPath('cancelled.mp4')
    writeFileSync(target, 'partial-bytes')
    const onDone = vi.fn()
    const handle = startHlsDownload({
      ffmpegPath: '/bin/ffmpeg',
      assetUrl: 'https://x/v.m3u8',
      targetPath: target,
      headers: '',
      onProgress: vi.fn(),
      onDone
    })
    handle.cancel()
    expect(lastChild?.kill).toHaveBeenCalledWith('SIGTERM')
    // ffmpeg traps SIGTERM and exits cleanly; close fires with a non-zero code
    // but the cancelled flag is what wins the state classification.
    lastChild?.emit('close', 255, 'SIGTERM')
    expect(onDone).toHaveBeenCalledWith('cancelled', undefined)
    expect(existsSync(target)).toBe(false)
  })

  it('cancel() escalates to SIGKILL after 2s if the child has not exited', () => {
    vi.useFakeTimers()
    const handle = startHlsDownload({
      ffmpegPath: '/bin/ffmpeg',
      assetUrl: 'https://x/v.m3u8',
      targetPath: freshTargetPath(),
      headers: '',
      onProgress: vi.fn(),
      onDone: vi.fn()
    })
    handle.cancel()
    expect(lastChild?.kill).toHaveBeenCalledWith('SIGTERM')
    vi.advanceTimersByTime(1999)
    expect(lastChild?.kill).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2)
    expect(lastChild?.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('cancel() is a no-op once the process has settled', () => {
    const handle = startHlsDownload({
      ffmpegPath: '/bin/ffmpeg',
      assetUrl: 'https://x/v.m3u8',
      targetPath: freshTargetPath(),
      headers: '',
      onProgress: vi.fn(),
      onDone: vi.fn()
    })
    lastChild?.emit('close', 0, null)
    handle.cancel()
    expect(lastChild?.kill).not.toHaveBeenCalled()
  })

  it('reports interrupted when spawn emits an error event', () => {
    const onDone = vi.fn()
    startHlsDownload({
      ffmpegPath: '/bin/ffmpeg',
      assetUrl: 'https://x/v.m3u8',
      targetPath: freshTargetPath(),
      headers: '',
      onProgress: vi.fn(),
      onDone
    })
    lastChild?.emit('error', new Error('ENOENT spawn /bin/ffmpeg'))
    expect(onDone).toHaveBeenCalledWith('interrupted', expect.stringContaining('ENOENT'))
  })

  it('settles only once even if close fires after error', () => {
    const onDone = vi.fn()
    startHlsDownload({
      ffmpegPath: '/bin/ffmpeg',
      assetUrl: 'https://x/v.m3u8',
      targetPath: freshTargetPath(),
      headers: '',
      onProgress: vi.fn(),
      onDone
    })
    lastChild?.emit('error', new Error('boom'))
    lastChild?.emit('close', 1, null)
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

describe('resolveBundledFfmpegPath', () => {
  it('returns the ffmpeg-static path unchanged in dev (app.isPackaged=false)', () => {
    expect(resolveBundledFfmpegPath()).toBe('/fake/ffmpeg')
  })
})
