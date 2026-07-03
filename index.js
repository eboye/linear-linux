const { app, BrowserWindow, WebContentsView, ipcMain, session, globalShortcut, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const CHROME_HEIGHT = 40;
const SHORTCUT_NEW_TAB = 'CommandOrControl+Shift+N';
const AUTH_PATTERNS = ['/oauth', '/auth', '/login', '/signin', '/sso', '/saml', '/callback'];
const ALLOWED_LINEAR_PERMISSIONS = new Set(['notifications', 'clipboard-read', 'media', 'display-capture', 'fullscreen']);

let stateFilePath;
let mainWin = null;
let chromeView = null;
let nextTabId = 1;
let activeTabId = null;
const tabs = [];

const isLinearHost = (hostname) => hostname === 'linear.app' || hostname.endsWith('.linear.app');

const parseUrl = (rawUrl) => {
    try {
        return new URL(rawUrl);
    } catch (_) {
        return null;
    }
};

const isLinearUrl = (rawUrl) => {
    const parsed = parseUrl(rawUrl);
    return !!parsed && isLinearHost(parsed.hostname);
};

// Third-party SSO/SAML identity providers can live at arbitrary customer-controlled
// hostnames, so this can only check the path, not the host, for non-linear.app URLs.
const isAuthUrl = (rawUrl) => {
    const parsed = parseUrl(rawUrl);
    if (!parsed || parsed.protocol !== 'https:') return false;
    if (isLinearHost(parsed.hostname)) return true;
    return AUTH_PATTERNS.some((pattern) => parsed.pathname.includes(pattern));
};

const openExternally = (url) => {
    shell.openExternal(url).catch((err) => console.error('Failed to open external URL:', err));
};

const loadWindowState = () => {
    if (!stateFilePath) return {};
    try {
        const raw = fs.readFileSync(stateFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        const { width, height, x, y } = parsed;
        if (Number.isFinite(width) && Number.isFinite(height)) {
            return {
                width,
                height,
                x: Number.isFinite(x) ? x : undefined,
                y: Number.isFinite(y) ? y : undefined,
            };
        }
    } catch (_) {
        // Ignore malformed or missing state and fall back to defaults.
    }
    return {};
};

const saveWindowState = (bounds) => {
    if (!stateFilePath || !bounds) return;
    try {
        fs.mkdirSync(path.dirname(stateFilePath), { recursive: true });
        fs.writeFileSync(stateFilePath, JSON.stringify(bounds), 'utf8');
    } catch (_) {
        // Persisting state is best-effort; ignore write failures.
    }
};

const layout = () => {
    if (!mainWin) return;
    const { width, height } = mainWin.getContentBounds();
    chromeView.setBounds({ x: 0, y: 0, width, height: CHROME_HEIGHT });
    const active = tabs.find((tab) => tab.id === activeTabId);
    if (active) {
        active.view.setBounds({ x: 0, y: CHROME_HEIGHT, width, height: Math.max(height - CHROME_HEIGHT, 0) });
    }
};

const broadcastTabs = () => {
    if (!chromeView) return;
    chromeView.webContents.send('tabs-updated', {
        tabs: tabs.map((tab) => ({ id: tab.id, title: tab.title })),
        activeTabId,
    });
};

const handleTabShortcuts = (event, input) => {
    if (input.type !== 'keyDown' || input.shift || input.alt) return;
    const cmdOrCtrl = process.platform === 'darwin' ? input.meta : input.control;
    if (!cmdOrCtrl) return;
    if (input.key.toLowerCase() === 't') {
        event.preventDefault();
        createTab();
    } else if (input.key.toLowerCase() === 'w') {
        event.preventDefault();
        if (activeTabId !== null) closeTab(activeTabId);
    }
};

const switchTab = (id) => {
    const next = tabs.find((tab) => tab.id === id);
    if (!next) return;
    const current = tabs.find((tab) => tab.id === activeTabId);
    if (current && current.id !== id) {
        mainWin.contentView.removeChildView(current.view);
    }
    activeTabId = id;
    mainWin.contentView.addChildView(next.view);
    layout();
    broadcastTabs();
};

const closeTab = (id) => {
    const idx = tabs.findIndex((tab) => tab.id === id);
    if (idx === -1) return;
    const [tab] = tabs.splice(idx, 1);

    if (id === activeTabId) {
        mainWin.contentView.removeChildView(tab.view);
        activeTabId = null;
    }
    tab.view.webContents.close();

    if (tabs.length === 0) {
        mainWin.close();
        return;
    }
    if (activeTabId === null) {
        const next = tabs[Math.min(idx, tabs.length - 1)];
        switchTab(next.id);
    }
    broadcastTabs();
};

const createTab = (url = 'https://linear.app/login') => {
    const id = nextTabId++;
    const view = new WebContentsView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    const tab = { id, view, title: 'Linear' };
    tabs.push(tab);

    view.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
        if (isAuthUrl(targetUrl)) {
            return {
                action: 'allow',
                overrideBrowserWindowOptions: {
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true,
                    },
                },
            };
        }
        if (isLinearUrl(targetUrl)) {
            createTab(targetUrl);
            return { action: 'deny' };
        }
        openExternally(targetUrl);
        return { action: 'deny' };
    });

    view.webContents.on('did-create-window', (childWindow) => {
        childWindow.setMenu(null);
    });

    view.webContents.on('will-navigate', (event, navUrl) => {
        if (isAuthUrl(navUrl) || isLinearUrl(navUrl)) return;
        event.preventDefault();
        openExternally(navUrl);
    });

    view.webContents.on('page-title-updated', (_event, title) => {
        tab.title = title;
        broadcastTabs();
    });

    view.webContents.on('before-input-event', handleTabShortcuts);

    view.webContents.loadURL(url);
    switchTab(id);
    return id;
};

const createMainWindow = () => {
    const state = loadWindowState();

    mainWin = new BrowserWindow({
        width: state.width || 1000,
        height: state.height || 700,
        x: state.x,
        y: state.y,
        frame: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    chromeView = new WebContentsView({
        webPreferences: {
            preload: path.join(__dirname, 'chrome', 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    mainWin.contentView.addChildView(chromeView);
    chromeView.webContents.loadFile(path.join(__dirname, 'chrome', 'index.html'));
    chromeView.webContents.on('before-input-event', handleTabShortcuts);

    mainWin.on('resize', layout);
    mainWin.on('close', () => {
        saveWindowState(mainWin.getBounds());
    });
    mainWin.on('closed', () => {
        mainWin = null;
        chromeView = null;
        tabs.length = 0;
        activeTabId = null;
    });

    createTab();
};

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWin) {
            if (mainWin.isMinimized()) mainWin.restore();
            mainWin.focus();
        } else {
            createMainWindow();
        }
    });

    app.whenReady().then(() => {
        stateFilePath = path.join(app.getPath('userData'), 'window-state.json');

        session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
            const origin = details?.requestingUrl || '';
            const isLinear = origin.startsWith('https://linear.app');
            callback(isLinear && ALLOWED_LINEAR_PERMISSIONS.has(permission));
        });

        ipcMain.on('chrome:new-tab', () => createTab());
        ipcMain.on('chrome:close-tab', (_event, id) => closeTab(id));
        ipcMain.on('chrome:switch-tab', (_event, id) => switchTab(id));
        ipcMain.on('chrome:window-minimize', () => mainWin?.minimize());
        ipcMain.on('chrome:window-maximize', () => {
            if (!mainWin) return;
            if (mainWin.isMaximized()) mainWin.unmaximize();
            else mainWin.maximize();
        });
        ipcMain.on('chrome:window-close', () => mainWin?.close());

        createMainWindow();

        app.on('browser-window-focus', () => {
            if (!globalShortcut.isRegistered(SHORTCUT_NEW_TAB)) {
                globalShortcut.register(SHORTCUT_NEW_TAB, () => createTab());
            }
        });
        app.on('browser-window-blur', () => {
            setImmediate(() => {
                const hasFocusedWindow = BrowserWindow.getAllWindows().some((w) => w.isFocused());
                if (!hasFocusedWindow && globalShortcut.isRegistered(SHORTCUT_NEW_TAB)) {
                    globalShortcut.unregister(SHORTCUT_NEW_TAB);
                }
            });
        });

        app.on('activate', () => {
            if (!mainWin) {
                createMainWindow();
            }
        });
    });

    app.on('will-quit', () => {
        globalShortcut.unregisterAll();
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
}
