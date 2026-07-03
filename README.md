<p align="center">
<img alt="GH-rel ver" src="icon.png" width="100px">
<h1 align="center">Linear for linux</h1>

<p align="center">
A linux port of <a href="https://linear.app/">linear.app</a>
</p>

<p align="center">
<img alt="GH-rel ver" src="https://img.shields.io/github/v/release/eboye/linear-linux?color=%23f5304c">
</p>

This repo currently has two implementations:

- **Electron** (repo root) — the original, stable app. Chromium-rendered, custom tab strip and
  titlebar.
- **GTK4/libadwaita** (`gtk/`) — a newer prototype using WebKitGTK, the same stack GNOME Web
  (Epiphany) uses. Gets real `Adw.TabView` tabs and a native, GTK-themed header bar/window
  controls instead of Chromium-rendered look-alikes. Not yet a full replacement for the Electron
  app — see [`gtk/README.md`](gtk/README.md) for what's implemented vs. still rough.

# Electron app

## Install
Requires `sudo` (for sandbox helper, desktop entry, and icons).

```bash
git clone git@github.com:eboye/linear-linux.git
cd linear-linux
./installer.sh
```

The installer:
- Downloads the AppImage, extracts it under `/opt/linear-linux-<version>`, and wires up the `chrome-sandbox` helper correctly.
- Installs a wrapper at `/usr/local/bin/linear`, a desktop entry, and the Linear icon into the system icon cache.
- Accepts overrides: `VERSION=0.2.5 APPIMAGE_URL=<url> INSTALL_ROOT=/opt ./installer.sh`

## Development

```bash
npm install
npm start   # launches Electron with sandbox disabled for local runs
            # (packaged builds use the proper setuid helper instead)
npm run build   # produces an AppImage bundling the Linear brand assets for the desktop icon
```

Structure: `index.js` is the whole Electron main process; `chrome/` is the custom
titlebar/tab-strip UI it renders (see [`CLAUDE.md`](CLAUDE.md) for details).

# GTK4/libadwaita prototype

```bash
# Arch:
sudo pacman -S python-gobject gtk4 libadwaita webkitgtk-6.0

python3 gtk/main.py
```

See [`gtk/README.md`](gtk/README.md) for dependencies on other distros, what's been verified to
work, and known gaps (no packaging yet, a couple of untested interactive paths).

# Having an issue?
Describe your issue [here](https://github.com/eboye/linear-linux/issues)
