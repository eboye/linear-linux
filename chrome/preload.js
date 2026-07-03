const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chrome', {
    newTab: () => ipcRenderer.send('chrome:new-tab'),
    closeTab: (id) => ipcRenderer.send('chrome:close-tab', id),
    switchTab: (id) => ipcRenderer.send('chrome:switch-tab', id),
    minimize: () => ipcRenderer.send('chrome:window-minimize'),
    maximize: () => ipcRenderer.send('chrome:window-maximize'),
    close: () => ipcRenderer.send('chrome:window-close'),
    onTabsUpdated: (callback) => {
        ipcRenderer.on('tabs-updated', (_event, state) => callback(state));
    },
});
