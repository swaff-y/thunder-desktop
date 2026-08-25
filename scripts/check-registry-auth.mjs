/**
 * TCC-003: turn GitHub Packages' misleading 404 into an error that names the
 * cause. The registry answers an unauthenticated request for a private package
 * with 404 — the same 404 it returns for a package that does not exist — and
 * that cannot be fixed from the publishing side.
 *
 * Run this BEFORE npm. It is deliberately not an npm `preinstall` script:
 * npm resolves the dependency tree from the registry before it runs the root
 * `preinstall`, so a guard wired there fires only once the 404 has already
 * happened (npm/cli#2660, npm/cli#4067 — verified against npm 10.9).
 *
 * Wired instead to the hooks that genuinely run first:
 *   - `npm run setup`            developer entry point, ahead of `npm ci`
 *   - `eas-build-pre-install`    thunder only; EAS runs it before npm install
 *   - the CI install scripts     web-thunder's scripts/*.sh, ahead of `npm ci`
 *
 * Kept byte-identical in thunder-desktop, web-thunder and thunder. The package
 * that would otherwise carry it is the very package this guard exists to
 * install, so a shared copy is not available at the moment it is needed.
 */

import { readFileSync } from 'node:fs'

const SCOPE = '@swaff-y/'
const REGISTRY = 'https://npm.pkg.github.com'

let manifest
try {
  manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
} catch {
  // Fails open, deliberately and for every read or parse failure — not just a
  // missing file. A manifest npm cannot read is a problem npm reports far
  // better than we would, and blocking here would replace its clear error with
  // a confusing one about a token.
  process.exit(0)
}

// Every dependency map, not just the two obvious ones: a dependency declared
// as peer or optional still resolves against the same registry, and a guard
// that ignored those would go quietly inert exactly when it was needed.
const scoped = Object.keys({
  ...manifest.dependencies,
  ...manifest.devDependencies,
  ...manifest.peerDependencies,
  ...manifest.optionalDependencies
})
  .filter((name) => name.startsWith(SCOPE))
  .sort()

// Nothing is fetched from that registry yet, so there is no 404 to prevent and
// no reason to make anyone set a token. The guard arms itself when the first
// @swaff-y dependency lands.
if (scoped.length === 0 || process.env.NODE_AUTH_TOKEN) {
  process.exit(0)
}

/**
 * TCC-007: the variable that is missing is rarely the variable the reader can
 * set. Every CI below maps some *other* name onto NODE_AUTH_TOKEN, so a build
 * log told to `export NODE_AUTH_TOKEN` names something nobody sets there — the
 * same misdirection this guard exists to remove, one layer up.
 *
 * Detected from the environment rather than configured, because the file is
 * kept byte-identical across three repos and none of them may hold a local
 * opinion about where it is running.
 */
function fix() {
  if (process.env.BUILDKITE) {
    return [
      'Fix, in Buildkite: the agent has no GITHUB_PACKAGES_READ_TOKEN, and an',
      'unset variable interpolates to empty rather than failing, so the build',
      'gets this far. Add a machine-user PAT with the read:packages scope to',
      "the agent's secrets or its environment hook under that name; the",
      'pipeline maps it onto NODE_AUTH_TOKEN. Not a personal token — the build',
      'breaks the day it is rotated.'
    ]
  }

  if (process.env.GITHUB_ACTIONS) {
    return [
      'Fix, in GitHub Actions: give the installing step an env block —',
      '',
      '  env:',
      '    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_PACKAGES_READ_TOKEN }}',
      '',
      'holding a machine-user PAT with the read:packages scope.'
    ]
  }

  if (process.env.EAS_BUILD) {
    return [
      "Fix, on EAS Build: Expo's builders are not your machine, so your local",
      'token is not there. Set it once per project —',
      '',
      '  eas secret:create --scope project --name NODE_AUTH_TOKEN \\',
      '    --value <token> --type string',
      '',
      'and check .npmrc is not excluded by .easignore or .gitignore.'
    ]
  }

  return [
    'Fix: create a PAT with the read:packages scope, then export it from your',
    'shell profile rather than from a repo:',
    '',
    '  export NODE_AUTH_TOKEN=<token>',
    '',
    'Verify it before blaming the package:',
    '',
    '  npm view @swaff-y/thunder-chat-core version',
    '',
    'A version number means the token works. A 404 means it does not.'
  ]
}

console.error(
  [
    '',
    'NODE_AUTH_TOKEN is not set.',
    '',
    'This repo depends on:',
    ...scoped.map((name) => `  ${name}`),
    '',
    `Those are published private to GitHub Packages (${REGISTRY}),`,
    'which serves private packages to authenticated requests only. It answers',
    'an unauthenticated request with 404 — the same 404 it returns for a',
    'package that does not exist. Without this variable the install fails',
    'reading "no such package" when it means "no such permission".',
    '',
    ...fix(),
    '',
    'See thunder-chat-core/docs/consuming.md for the four places this token is',
    'needed — developer machines, CI, EAS Build and electron-builder.',
    ''
  ].join('\n')
)

process.exit(1)
