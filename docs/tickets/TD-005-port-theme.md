# TD-005 — Port Thunder theme to renderer

## Description

Lift the Thunder theme verbatim from web-thunder so the desktop app inherits identical colors, typography, spacing, radii, and Bootstrap overrides.

## Requirements

- Copy `web-thunder/src/theme/variables.css` → `src/renderer/src/theme/variables.css`.
- Copy `web-thunder/src/theme/bootstrap-overrides.css` → `src/renderer/src/theme/bootstrap-overrides.css`.
- Add `bootstrap` and `react-bootstrap` to `dependencies` (versions matching `web-thunder/package.json`: `bootstrap ^5.3.8`, `react-bootstrap ^2.10.10`).
- In `src/renderer/src/main.tsx`, import in this order:
  1. `bootstrap/dist/css/bootstrap.min.css`
  2. `./theme/variables.css`
  3. `./theme/bootstrap-overrides.css`
- Copy `web-thunder/THEME.md` → `docs/THEME.md` for reference.
- Renderer body uses `var(--color-bg)` and `var(--color-text)` so the dark theme is the visible default.

## ACs

- App background renders `#0f172a` (Thunder dark navy) on launch.
- Default text color is `#f1f5f9`.
- A test `<button class="btn btn-primary">` rendered in the renderer matches web-thunder's primary button styling pixel-for-pixel.
- `var(--color-accent)` resolves to `#0ea5e9` (verified via DevTools computed styles).
- All CSS custom properties from `THEME.md` resolve to their documented values.

## Test plan

1. Side-by-side launch of `web-thunder` (`npm run dev`) and `thunder-desktop` (`npm run dev`) with the same placeholder content.
2. Visually compare backgrounds, text colors, button styling.
3. In DevTools → Computed, sample 5–10 random CSS variables and confirm they resolve identically across both apps.
4. Render a row of `<Button variant="primary|secondary|outline-primary|outline-secondary|danger|success">` and confirm overrides apply.
5. Toggle a `<Card>` and `<Modal>` to confirm Bootstrap overrides do not break component behavior.
