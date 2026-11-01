function isTrustedFrame(event, win, page) {
  if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
    return false;
  try {
    return new URL(event.senderFrame.url).href === page.href;
  } catch {
    return false;
  }
}
module.exports = { isTrustedFrame };
