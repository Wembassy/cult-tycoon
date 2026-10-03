const { app, BrowserWindow, Menu, ipcMain, session } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    title: `Cult Tycoon ${app.getVersion()}`,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query: { build: app.getVersion() } });
  }

  if (!isDev) Menu.setApplicationMenu(null);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.on('app-quit', () => app.quit());

app.whenReady().then(async () => {
  // Development alphas change rapidly. Clear Chromium's HTTP cache so an
  // installed build can never render stale Vite assets from a previous alpha.
  await session.defaultSession.clearCache();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
