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

If that fails with `ModuleNotFoundError: No module named 'gi'`, your `python3` is probably a
pyenv/conda/venv interpreter rather than your system one — PyGObject is installed against the
system Python via your distro's package manager (the `pacman -S` above), not pip, so an isolated
interpreter won't see it. Check with `which python3`; if it points outside `/usr/bin`, run the
system interpreter explicitly instead:

```bash
/usr/bin/python3 gtk/main.py
```

## What works (verified live)

This was tested by actually launching the app against a real display (`GDK_BACKEND=x11`, driven
with `xdotool` for input and ImageMagick's `import -window <id>` for screenshots), not just by
reading API docs:

- App launches; headerbar + tab strip render as one merged row (not two stacked bars); the WebKit
  network/web subprocesses spin up cleanly with no errors.
- Left-clicking a `linear.app` link navigates normally within the tab (confirmed: clicking "Sign
  up" on the login page correctly loaded the signup page).
- `on_create()`'s ordering bug (auth-pattern check running before the linear.app check, which
  would wrongly treat `linear.app/login`'s own path as an auth popup target) is fixed.

## What's implemented but not fully confirmed

- **Right-click → "Open Link in New Tab"**: replaces the stock "Open in New Window" context menu
  action. Implemented against verified APIs (`WebKitContextMenu.remove`/`prepend`,
  `WebKitContextMenuItem.new_from_gaction`), but the popup menu itself renders as a separate
  overlay surface that the screenshot tooling available couldn't capture — the code should be
  correct but hasn't been visually confirmed. Please test this by hand.
- **Middle-click on a link**: this took a lot of investigation. WebKitGTK does **not** treat
  middle-click as a new-window request the way Chromium does — confirmed by tracing
  `decide-policy`/`create` live, neither fires for a middle-click. Generic GTK gesture controllers
  (`Gtk.GestureClick`) attached to the WebView also never see *any* pointer button event, of any
  button — WebKit's rendering surface owns pointer input completely. The working approach: inject
  a script via `WebKitUserContentManager` that listens for the DOM's `auxclick` event and relays
  the clicked link's `href` back to the UI process via `postMessage`.
  - This was verified end-to-end on a **minimal test page** (both JS-dispatched and real
    `xdotool`-simulated clicks correctly triggered the listener and the message round-trip).
  - On the **actual linear.app page**, the identical mechanism did not fire for a simulated
    `xdotool` click, despite ruling out: iframes (confirmed zero iframes, top-level frame), script
    injection failure (confirmed via an unconditional message on load), message-passing failure
    (same channel used elsewhere and known to work), and page/script liveness (a `setInterval`
    heartbeat kept firing throughout). Not even `mousedown`, `click`, or `pointerdown` fired for a
    real `xdotool` click on Linear's actual login page, while the exact same listeners fired
    correctly for the same kind of synthetic click on a trivial static HTML page in the same
    session.
  - Best guess: `xdotool`'s XTest-via-XWayland synthetic clicks may be delivered differently to
    Linear's GPU-composited layers (lots of CSS transforms/animations) than genuine hardware input
    would be, in this specific sandboxed environment. **This needs testing with a real mouse** —
    if it still doesn't work with real hardware input, the `auxclick` approach itself needs
    rethinking; if it does work, this was purely a sandbox/synthetic-input artifact.
- Auth/SSO redirects (paths matching `/oauth`, `/auth`, `/login`, `/signin`, `/sso`, `/saml`,
  `/callback` on non-`linear.app` HTTPS hosts) opening as a separate native popup window.
- Non-Linear, non-auth links opening in the system default browser via `Gio.AppInfo`.
- `Ctrl+T` new tab / `Ctrl+W` close tab via `Gtk.ShortcutController` (window-scoped, not global).
- Notification/clipboard/media permission requests granted only for `linear.app` origins.
- Fullscreen requests resize the actual window via `enter-fullscreen`/`leave-fullscreen`.
- Window size persisted to `$XDG_STATE_HOME/linear-linux/window-state.json` across restarts.

## Known gaps / things to sanity-check by hand

- The middle-click mystery above — please test with a real mouse and report back.
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
