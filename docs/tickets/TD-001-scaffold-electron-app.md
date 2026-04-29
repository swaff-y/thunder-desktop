# TD-001 — Scaffold Electron app with electron-vite

## Description

Bootstrap the `thunder-desktop` repo as an Electron + React 19 + TypeScript + Vite application using the `electron-vite` template, mirroring the structure of [halo-desktop](../../../halo-desktop/). This ticket sets up the empty shell — no UI from web-thunder yet, just a launchable Electron window that loads a placeholder renderer.

## Requirements

- Use `npm create @quick-start/electron@latest` with the `react-ts` template (or copy halo-desktop's scaffolding directly to keep tooling versions aligned).
- Establish the directory layout described in §3 of the plan: `src/main/`, `src/preload/`, `src/renderer/` with `electron-vite` config aliasing `@renderer` to `src/renderer/src`.
- Include `package.json` scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`.
- Set `appId: com.ruby-sei.thunder-desktop` and `productName: Thunder Desktop` in placeholder build config.
- Configure `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json` mirroring halo-desktop.
- Add `.gitignore`, `.editorconfig`, `.prettierrc.yaml`, ESLint config (lift halo-desktop's).
- Preload exposes a typed `window.thunder` namespace (empty in this ticket — the contextBridge skeleton only).

## ACs

- `npm install` succeeds.
- `npm run dev` opens an Electron window showing the default electron-vite welcome content (or a placeholder "Thunder Desktop" string).
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run build` produces a `out/` directory with main, preload, and renderer bundles.
- `window.thunder` exists in the renderer (verified via DevTools), even if it has no methods yet.

## Test plan

1. Clean clone the repo, run `npm install`.
2. Run `npm run dev`; confirm window appears, no console errors.
3. Open DevTools, run `typeof window.thunder` → `"object"`.
4. Run `npm run typecheck && npm run lint && npm run build` — all green.
5. Verify `out/main/index.js`, `out/preload/index.js`, `out/renderer/index.html` exist after build.
