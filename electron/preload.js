const { contextBridge } = require('electron');

// Expose a minimal API to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: process.versions,
});