# Linear for Linux — GTK4/libadwaita prototype

An alternative to the Electron app in the repo root, built on WebKitGTK + libadwaita instead —
the same stack GNOME Web (Epiphany) uses. This gets real `Adw.TabView` tabs and a native
`Adw.HeaderBar` (so minimize/maximize/close are genuinely native, themed by your GTK theme),
instead of Chromium-rendered look-alikes.

This is a first-pass prototype, not a replacement for the Electron app yet.

## Dependencies

On Arch:

```bash
sudo pacman -S python-gobject gtk4 libadwaita webkitgtk-6.0
```

Other distros need the equivalent of `python3-gi`/`python3-gobject`, `gtk4`, `libadwaita`, and
`webkitgtk-6.0` (sometimes packaged as `webkit2gtk-4.1`/`webkitgtk6.0` depending on distro naming).

## Running

```bash
python3 gtk/main.py
```

## What works (verified)

- App launches, creates a native `Adw.ApplicationWindow` with a headerbar + tab strip, and loads
  `linear.app` in the first tab. Confirmed the WebKit network/web subprocesses spin up and the
  process runs cleanly with no errors/warnings.

## What's implemented but not click-tested

There's no way to simulate mouse clicks in the environment this was built in, so the following
is implemented by careful reading of the WebKitGTK API docs/signatures, not by clicking through it:

- Opening a `linear.app` link (middle-click, `target=_blank`, `window.open()`) in a **new tab**
  via `WebKitWebView::create`, sharing session/cookies via the `related-view` property.
- Auth/SSO redirects (`/oauth`, `/auth`, `/login`, `/signin`, `/sso`, `/saml`, `/callback` paths on
  non-`linear.app` HTTPS hosts) opening as a separate native popup window instead of a tab.
- Non-Linear, non-auth links opening in the system default browser via `Gio.AppInfo`, both for
  top-level navigation (`decide-policy`) and new-window requests (`create`).
- `Ctrl+T` new tab / `Ctrl+W` close tab via `Gtk.ShortcutController` (window-scoped, not global).
- Notification/clipboard/media permission requests granted only for `linear.app` origins.
- Fullscreen requests (e.g. viewing an attachment fullscreen) resize the actual window via
  `enter-fullscreen`/`leave-fullscreen`.
- Window size persisted to `$XDG_STATE_HOME/linear-linux/window-state.json` across restarts.

## Known gaps / things to sanity-check by hand

- `window.open()` calls that don't pass a URL upfront (i.e. set `.location` after opening) can't
  be classified before the popup is created — they currently fall through to "deny + open
  externally if we later learn the URL," which may not be right for that pattern. Worth exercising
  Linear's actual OAuth buttons for real to confirm this doesn't misfire.
- No packaging beyond a `.desktop` file skeleton — no Flatpak manifest, no AppStream metadata, no
  icon. If this prototype is adopted, Flatpak is the natural distribution path for a libadwaita
  app (see the main repo's `installer.sh`/`PKGBUILD`/`flake.nix` for the Electron app's equivalent,
  which this doesn't yet have a counterpart for).
- No app icon wired up (`Icon=linear-linux` in the `.desktop` file expects an icon that isn't
  installed anywhere yet — reuse `assets/linear-app-icon.png` from the repo root).
