# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Linear for Linux is an unofficial Electron wrapper that loads linear.app (https://linear.app) directly
in a BrowserWindow — there is no custom UI beyond window/OS-integration behavior. The entire application
logic lives in a single file, `index.js`.

## Commands

- Install dependencies: `npm install`
- Run in development: `npm start` (launches Electron with the sandbox disabled — packaged builds use a
  real setuid `chrome-sandbox` helper instead; see below)
- Build a distributable AppImage: `npm run build` (runs `electron-builder --linux AppImage --x64 --arm64`)

There is no lint or test tooling configured in this repo.

## Architecture

Everything happens in `index.js` (~120 lines):

- **Window state persistence** — window size/position is saved to
  `<userData>/window-state.json` on close and restored on next launch (`loadWindowState`/`saveWindowState`).
- **External link handling** — `setWindowOpenHandler` only allows in-app navigation for auth-flow URLs
  (matched against `/oauth`, `/auth`, `/login`, `/signin`, `/sso`, `/saml`, `/callback`); every other
  URL is routed to the system browser via `shell.openExternal` and denied in-app. When changing link
  behavior, update the `authPatterns` list rather than adding ad hoc checks elsewhere.
- **Notifications** — the permission handler only grants `notifications` for requests whose
  `requestingUrl` starts with `https://linear.app`; all other permission requests are denied.
- **New-window shortcut** — `CommandOrControl+Shift+N` is registered/unregistered dynamically on
  `browser-window-focus`/`browser-window-blur` rather than globally at startup, so it doesn't take over
  the shortcut system-wide when the app isn't focused.
- **Security defaults** — `nodeIntegration: false`, `contextIsolation: true`, no preload script. Keep
  new BrowserWindow instances consistent with these defaults.

## Packaging / distribution

Releases are cut via `.github/workflows/release.yml` (manual `workflow_dispatch` with a patch/minor/major
`bump` input, or a push to a `release` branch). It bumps the version, runs `npm run build`, publishes a
GitHub Release with the AppImage artifacts, then computes SRI hashes and patches `flake.nix`'s `version`
and per-arch `hash` fields automatically — **don't hand-edit `flake.nix`'s version/hashes**, they're
overwritten by CI on every release.

Three separate, hand-maintained consumers install from that released AppImage:

- `installer.sh` — end-user installer; downloads the release AppImage, extracts it under
  `/opt/linear-linux-<version>`, and fixes up the `chrome-sandbox` helper (must be root-owned and
  mode 4755 for Electron's sandbox to work).
- `PKGBUILD` — Arch Linux AUR package definition, also built from the released AppImage.
- `flake.nix` — Nix flake that wraps the released AppImage by pinned per-arch hash (auto-updated by CI,
  as above).

Note: the release workflow attaches `dist/*.deb`/`dist/*.rpm` glob patterns to the GitHub Release, but
`package.json`'s electron-builder config currently only targets `AppImage` — those globs may not
currently match anything.
