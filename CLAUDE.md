# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Linear for Linux is an unofficial Electron wrapper around linear.app (https://linear.app). The app is a
single frameless `BrowserWindow` hosting a custom tabbed browser shell: a `chrome/` HTML/CSS/JS UI
(titlebar + tab strip + window controls) rendered in one `WebContentsView`, and one `WebContentsView` per
open Linear tab. All main-process logic lives in `index.js`.

## Commands

- Install dependencies: `npm install`
- Run in development: `npm start` (launches Electron with the sandbox disabled — packaged builds use a
  real setuid `chrome-sandbox` helper instead; see below)
- Build a distributable AppImage: `npm run build` (runs `electron-builder --linux AppImage --x64 --arm64`)

There is no lint or test tooling configured in this repo.

## Architecture

`index.js` is the main process. `chrome/` is the custom shell UI (not to be confused with Google Chrome):
`index.html`/`chrome.css`/`chrome.js` render the titlebar/tab-strip, and `preload.js` exposes a
`window.chrome` API (new/close/switch tab, minimize/maximize/close) into that UI via `contextBridge` — this
preload is only attached to the chrome view, never to Linear tab content.

- **Tabs** — each tab is a `WebContentsView` added to `mainWin.contentView`; only the active tab's view is
  attached (others stay detached-but-alive). `createTab`/`closeTab`/`switchTab` in `index.js` own this
  lifecycle; `layout()` sizes the chrome view (top `CHROME_HEIGHT` px) and the active tab view (remaining
  space) on window resize.
- **Link routing** — `isAuthUrl`/`isLinearUrl` classify target URLs for both `setWindowOpenHandler` and
  `will-navigate` on every tab's `webContents`: auth-flow URLs (matched against `/oauth`, `/auth`,
  `/login`, `/signin`, `/sso`, `/saml`, `/callback`, or the `linear.app` host itself) are allowed to open
  as a native popup window (for OAuth/SSO redirects); other `linear.app` URLs open as a new tab via
  `createTab`; everything else is routed to the system browser via `shell.openExternal` and denied in-app.
  Third-party SSO/SAML providers can live at arbitrary customer-controlled hostnames, so `isAuthUrl` can
  only check the path (not the host) for non-`linear.app` URLs — a known, accepted tradeoff.
- **Notifications** — the permission handler only grants permissions in `ALLOWED_LINEAR_PERMISSIONS`
  (`notifications`, `clipboard-read`, `media`, `display-capture`, `fullscreen`) for requests whose
  `requestingUrl` starts with `https://linear.app`; everything else is denied.
- **New-tab shortcut** — `CommandOrControl+Shift+N` is a global shortcut, registered/unregistered on
  `browser-window-focus`/`browser-window-blur` so it doesn't take over the shortcut system-wide when the
  app isn't focused. `Ctrl/Cmd+T` (new tab) and `Ctrl/Cmd+W` (close tab) are handled locally via
  `before-input-event` on the chrome view and every tab's `webContents` instead of `globalShortcut`,
  since those are common shortcuts in other apps and must not be hijacked system-wide.
- **Window chrome** — `mainWin` is created with `frame: false`; minimize/maximize/close are implemented in
  `chrome/chrome.js` calling into `chrome/preload.js`'s IPC-backed API, not native window decorations.
- **Security defaults** — every `WebContentsView`/popup uses `nodeIntegration: false`,
  `contextIsolation: true`. Keep new views consistent with this.

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
