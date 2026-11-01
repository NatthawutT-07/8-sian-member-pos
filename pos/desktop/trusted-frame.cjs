function isTrustedFrame(event, win, server) {
  if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
    return false;
  try {
    const url = new URL(event.senderFrame.url);
    return url.origin === server.origin && ['/pos/', '/pos/index.html'].includes(url.pathname);
  } catch {
    return false;
  }
}
module.exports = { isTrustedFrame };
