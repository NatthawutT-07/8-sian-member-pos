const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('chefWindowsPrint', (ticket) => ipcRenderer.invoke('chef-print', ticket));
