// Which IPC calls come from the game: only the main frame of the game window, showing a page of
// the local game host (desktop/main.cjs, steam.cjs). Never throws: the window's first, blank
// document (before the game page loads) has no URL and is simply not the game.

/** Is `event` (an ipcMain event) from the game page of `win`, served by `localUrl`? */
function fromGamePage(event, win, localUrl) {
  if (!win || win.isDestroyed?.() || event?.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return false;
  try {
    return new URL(event.senderFrame.url).origin === new URL(localUrl).origin;
  } catch {
    return false;
  }
}

module.exports = { fromGamePage };
