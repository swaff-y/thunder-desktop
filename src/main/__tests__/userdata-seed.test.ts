import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AUTH_CREDENTIALS_FILENAME,
  AWS_CREDENTIALS_FILENAME,
  DEV_USERDATA_SUFFIX,
  SEEDED_FILENAMES,
  SETTINGS_FILENAME,
  WINDOW_STATE_FILENAME,
  devUserDataPath,
  ensureDevUserData,
  removeStaleAwsCredentials
} from '../userdata-seed'

describe('userdata-seed (TD-063)', () => {
  let root: string
  let source: string
  let target: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'thunder-userdata-'))
    source = join(root, 'thunder-desktop')
    target = devUserDataPath(source)
    mkdirSync(source, { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // ─── Path shape ───────────────────────────────────────────────────

  it('suffixes the userData path rather than nesting inside it', () => {
    expect(devUserDataPath('/a/b/thunder-desktop')).toBe(
      `/a/b/thunder-desktop${DEV_USERDATA_SUFFIX}`
    )
  })

  it('seeds settings, window state and the Halo credential store', () => {
    expect(SEEDED_FILENAMES).toEqual([
      SETTINGS_FILENAME,
      WINDOW_STATE_FILENAME,
      AUTH_CREDENTIALS_FILENAME
    ])
  })

  // TD-065: copying it would hand a fresh dev profile a secret the
  // cutover exists to get rid of.
  it('does not seed the retired AWS credential file', () => {
    expect(SEEDED_FILENAMES).not.toContain(AWS_CREDENTIALS_FILENAME)
  })

  // ─── First launch ─────────────────────────────────────────────────

  it('creates the dev directory and copies the seeded files', () => {
    writeFileSync(join(source, SETTINGS_FILENAME), '{"apiUrl":"https://halo.swaff.name/"}')
    writeFileSync(join(source, AUTH_CREDENTIALS_FILENAME), 'ciphertext', { mode: 0o600 })

    expect(ensureDevUserData(source, target)).toBe(true)

    expect(readFileSync(join(target, SETTINGS_FILENAME), 'utf-8')).toBe(
      '{"apiUrl":"https://halo.swaff.name/"}'
    )
    expect(readFileSync(join(target, AUTH_CREDENTIALS_FILENAME), 'utf-8')).toBe('ciphertext')
  })

  it('leaves the shared directory untouched — the packaged app still reads it', () => {
    writeFileSync(join(source, SETTINGS_FILENAME), '{"apiUrl":"https://halo.swaff.name/"}')

    ensureDevUserData(source, target)

    expect(readFileSync(join(source, SETTINGS_FILENAME), 'utf-8')).toBe(
      '{"apiUrl":"https://halo.swaff.name/"}'
    )
  })

  it('creates the dev directory 0700, matching the mode Electron gives userData', () => {
    ensureDevUserData(source, target)

    expect(statSync(target).mode & 0o777).toBe(0o700)
  })

  it('carries the source mode across so credential files stay 0600', () => {
    writeFileSync(join(source, AUTH_CREDENTIALS_FILENAME), 'ciphertext', { mode: 0o600 })

    ensureDevUserData(source, target)

    expect(statSync(join(target, AUTH_CREDENTIALS_FILENAME)).mode & 0o777).toBe(0o600)
  })

  it('does not copy files outside the seed list (Chromium profile stays behind)', () => {
    mkdirSync(join(source, 'Local Storage'), { recursive: true })
    writeFileSync(join(source, 'Cookies'), 'sqlite')

    ensureDevUserData(source, target)

    expect(existsSync(join(target, 'Cookies'))).toBe(false)
    expect(existsSync(join(target, 'Local Storage'))).toBe(false)
  })

  // ─── Later launches ───────────────────────────────────────────────

  it('no-ops once the dev directory exists, without overwriting its files', () => {
    writeFileSync(join(source, SETTINGS_FILENAME), '{"apiUrl":"https://halo.swaff.name/"}')
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, SETTINGS_FILENAME), '{"apiUrl":"https://halo-dev.swaff.name/"}')

    expect(ensureDevUserData(source, target)).toBe(false)

    expect(readFileSync(join(target, SETTINGS_FILENAME), 'utf-8')).toBe(
      '{"apiUrl":"https://halo-dev.swaff.name/"}'
    )
  })

  it('creates an empty dev directory when the target exists but is empty', () => {
    mkdirSync(target, { recursive: true })

    expect(ensureDevUserData(source, target)).toBe(false)
    expect(existsSync(target)).toBe(true)
  })

  // ─── Missing / partial sources ────────────────────────────────────

  it('still creates the dev directory when the shared directory is missing', () => {
    rmSync(source, { recursive: true, force: true })

    expect(ensureDevUserData(source, target)).toBe(true)
    expect(existsSync(target)).toBe(true)
  })

  it('skips seeded files that do not exist', () => {
    writeFileSync(join(source, SETTINGS_FILENAME), '{}')

    ensureDevUserData(source, target)

    expect(existsSync(join(target, SETTINGS_FILENAME))).toBe(true)
    expect(existsSync(join(target, AUTH_CREDENTIALS_FILENAME))).toBe(false)
  })

  it('logs and continues when a file cannot be copied — a bad copy is a re-login, not a crash', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // A directory where a file is expected: `copyFileSync` throws EISDIR.
    mkdirSync(join(source, WINDOW_STATE_FILENAME), { recursive: true })
    writeFileSync(join(source, AUTH_CREDENTIALS_FILENAME), 'ciphertext')

    expect(ensureDevUserData(source, target)).toBe(true)

    expect(warn).toHaveBeenCalled()
    // The later file in the list still made it across.
    expect(readFileSync(join(target, AUTH_CREDENTIALS_FILENAME), 'utf-8')).toBe('ciphertext')
  })

  // ─── Retired AWS credentials (TD-065) ─────────────────────────────

  describe('removeStaleAwsCredentials', () => {
    it('deletes the encrypted credential file an upgrade left behind', () => {
      writeFileSync(join(source, AWS_CREDENTIALS_FILENAME), 'ciphertext', { mode: 0o600 })

      removeStaleAwsCredentials(source)

      expect(existsSync(join(source, AWS_CREDENTIALS_FILENAME))).toBe(false)
    })

    it('leaves every other file in the directory alone', () => {
      writeFileSync(join(source, AWS_CREDENTIALS_FILENAME), 'ciphertext')
      writeFileSync(join(source, AUTH_CREDENTIALS_FILENAME), 'halo-token')
      writeFileSync(join(source, SETTINGS_FILENAME), '{}')

      removeStaleAwsCredentials(source)

      expect(readFileSync(join(source, AUTH_CREDENTIALS_FILENAME), 'utf-8')).toBe('halo-token')
      expect(existsSync(join(source, SETTINGS_FILENAME))).toBe(true)
    })

    // Runs on every launch, so the common case is that there is nothing
    // to do.
    it('no-ops when there is no credential file', () => {
      expect(() => removeStaleAwsCredentials(source)).not.toThrow()
    })

    it('logs rather than throwing when the file cannot be removed', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      // A non-empty directory in its place: `unlinkSync` throws EPERM.
      mkdirSync(join(source, AWS_CREDENTIALS_FILENAME, 'nested'), { recursive: true })

      expect(() => removeStaleAwsCredentials(source)).not.toThrow()
      expect(warn).toHaveBeenCalled()
    })
  })
})
