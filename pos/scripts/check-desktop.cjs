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
    let role = 'USER',
      hasOrder = true;
    const order = {
      id: 'order-1',
      tableId: 'table-1',
      sessionId: 'round-1',
      table: { number: 8, sessionId: 'round-1' },
      createdAt: '2026-11-02T12:00:00Z',
      items: [
        { name: 'หมูสามชั้น', quantity: 2 },
        { name: 'กุ้งสด', quantity: 10 },
      ],
    };
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
      if (route === 'kitchen/orders/order-1/complete') hasOrder = false;
      const data =
        route === 'login'
          ? { id: 'test', username: role === 'CHEF' ? 'chef' : 'cashier', role }
          : route === 'kitchen/orders'
            ? hasOrder
              ? [order]
              : []
            : route === 'kitchen/tables'
              ? [{ id: 'table-1', number: 8, sessionId: 'round-1' }]
              : route === 'kitchen/tables/table-1/round-1/summary'
                ? {
                    tableNumber: 8,
                    receiptNumber: 'QA-001',
                    orderCount: 1,
                    quantity: 12,
                    items: [
                      { name: 'หมูสามชั้น', quantity: 2, pending: 2, completed: 0 },
                      { name: 'กุ้งสด', quantity: 10, pending: 10, completed: 0 },
                    ],
                  }
                : route === 'products'
                  ? []
                  : route === 'tables'
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
    role = 'CHEF';
    const start = routes.length;
    await win.reload();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await win.webContents.executeJavaScript(
      `document.querySelector('[name=username]').value = 'chef'; document.querySelector('[name=password]').value = 'test-password'; document.getElementById('login-form').requestSubmit();`,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.ok(routes.slice(start).includes('kitchen/orders'));
    assert.ok(!routes.slice(start).includes('products'));
    assert.equal(
      await win.webContents.executeJavaScript('document.getElementById("kitchen").hidden'),
      false,
    );
    assert.equal(
      await win.webContents.executeJavaScript('document.getElementById("register").hidden'),
      true,
    );
    assert.equal(
      await win.webContents.executeJavaScript('document.querySelectorAll(".kitchen-order").length'),
      1,
    );
    require('node:fs').writeFileSync(
      path.resolve(__dirname, '../../.tmp/pos-kitchen.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await win.webContents.executeJavaScript(
      'document.querySelector(".kitchen-order-actions button").click()',
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(
      await win.webContents.executeJavaScript(
        'document.getElementById("kitchen-summary-dialog").open',
      ),
      true,
    );
    assert.ok(
      await win.webContents.executeJavaScript(
        'document.getElementById("kitchen-summary-meta").textContent.includes("12")',
      ),
    );
    await win.webContents.executeJavaScript(
      'document.getElementById("close-kitchen-summary").click(); document.querySelector(".kitchen-order-actions .primary").click()',
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(
      await win.webContents.executeJavaScript('document.querySelectorAll(".kitchen-order").length'),
      0,
    );
    console.log(
      'PASS: chef login opens kitchen directly, loads current queue and table totals, and completion removes the card',
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
