const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { isTrustedFrame } = require('../desktop/trusted-frame.cjs');
app.setPath('userData', path.resolve(__dirname, '../../.tmp/pos-desktop-check'));
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  let win;
  try {
    const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
    const page = pathToFileURL(path.join(root, 'web/index.html'));
    const routes = [];
    win = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(root, 'desktop/preload.cjs'),
      },
    });
    ipcMain.handle('pos:api', (event, route) => {
      assert.ok(isTrustedFrame(event, win, page));
      routes.push(route);
      if (route === 'me') return { ok: false, status: 401, data: { message: 'Login required' } };
      const data =
        route === 'login'
          ? { id: 'test', username: 'cashier', role: 'USER' }
          : route === 'products'
            ? []
            : { shift: null };
      return { ok: true, status: 200, data };
    });
    await win.loadFile(path.join(root, 'web/index.html'));
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.ok(routes.includes('me'), 'local ES modules must load and invoke the preload API');
    await win.webContents.executeJavaScript(
      `document.querySelector('[name=username]').value = 'cashier'; document.querySelector('[name=password]').value = 'test-password'; document.getElementById('login-form').requestSubmit();`,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.ok(routes.includes('login') && routes.includes('products') && routes.includes('shift'));
    assert.equal(
      await win.webContents.executeJavaScript('document.getElementById("login").hidden'),
      true,
    );
    console.log(
      'PASS: bundled local UI loads modules, authenticates through preload and opens the POS without hosted UI',
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
