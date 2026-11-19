// PrintLedger — preload bridge. Currently the app needs no Node APIs in the
// renderer (all persistence is browser-side IndexedDB), so this just exposes a
// minimal, explicit surface for future desktop-only hooks (e.g. file dialogs).
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('printledgerDesktop', {
  platform: process.platform,
});