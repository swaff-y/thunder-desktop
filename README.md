# Thunder Desktop

Desktop view layer for the [Halo](https://github.com/swaff-y/halo) REST API. Mirrors [web-thunder](https://github.com/swaff-y/web-thunder) one-to-one, plus an embedded **Browser** tab that detects and downloads video assets from arbitrary web pages.

## Status

Pre-implementation. See [docs/thunder-desktop-plan.md](docs/thunder-desktop-plan.md) for the full plan and [docs/tickets/](docs/tickets/) for the 28 implementation tickets.

## Installing

Use `npm run setup` on a fresh clone, not `npm install`.

Thunder's own packages (`@swaff-y/…`) come from GitHub Packages, which is
private. An install without a `NODE_AUTH_TOKEN` fails with a **404 that reads
as "no such package" and means "no such permission"**, and npm contacts the
registry before any `preinstall` hook could warn you — so the check runs ahead
of npm instead. Export a PAT with the `read:packages` scope as
`NODE_AUTH_TOKEN`.

The check is inert until this repo actually depends on an `@swaff-y` package.
Full setup, including electron-builder's packaging step, is in
[thunder-chat-core/docs/consuming.md](https://github.com/swaff-y/thunder-chat-core/blob/main/docs/consuming.md).

## Quick links

- [Plan](docs/thunder-desktop-plan.md)
- [Tickets index](docs/tickets/README.md)
