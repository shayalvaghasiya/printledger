// PrintLedger — Electron desktop shell.
// In dev it loads the Vite dev server; in production it loads the built files
// from ./dist so the app runs fully offline from disk.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 820,
    minHeight: 600,
    backgroundColor: '#0f1720',
    autoHideMenuBar: true,
    title: 'PrintLedger — 3D Print Cost & Production Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // macOS: re-create a window when the dock icon is clicked and none are open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});