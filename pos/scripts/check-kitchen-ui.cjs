const { app, BrowserWindow } = require('electron');
const express = require('express');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  let server, win;
  try {
    const api = express();
    api.use(express.json());
    const order = { id: 'order-test', tableId: 'table-test', sessionId: 'round-test',
      createdAt: new Date().toISOString(), table: { number: 3, sessionId: 'round-test' },
      items: [ { menuItemId: 'shrimp', name: 'กุ้งสด', quantity: 4 },
        { menuItemId: 'pork', name: 'หมูสามชั้น', quantity: 2 } ] };
    let cancelled = false, requests = 0;
    api.get('/api/pos/me', (_, res) => res.json({ id: 'chef-test', role: 'CHEF', displayName: 'พ่อครัว' }));
    api.get('/api/pos/kitchen/orders', (_, res) => res.json(cancelled ? [] : [order]));
    api.get('/api/pos/kitchen/tables', (_, res) => res.json([{ id: order.tableId, number: 3, sessionId: order.sessionId }]));
    api.post('/api/pos/kitchen/orders/:id/cancel', (req, res) => {
      assert.equal(req.params.id, order.id);
      assert.equal(req.body.sessionId, order.sessionId);
      requests++;
      if (req.body.menuItemId) order.items = order.items.filter((item) => item.menuItemId !== req.body.menuItemId);
      else cancelled = true;
      res.json({ ok: true });
    });
    api.use('/pos', express.static(path.resolve(__dirname, '../web')));
    server = await new Promise((resolve) => { const listener = api.listen(0, '127.0.0.1', () => resolve(listener)); });
    win = new BrowserWindow({ show: false, width: 1100, height: 900,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    const js = (code) => win.webContents.executeJavaScript(code);
    const wait = async (condition) => {
      for (let i = 0; i < 150; i++) {
        if (await js(condition)) return;
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      throw new Error(`UI timeout: ${condition}`);
    };
    await win.loadURL(`http://127.0.0.1:${server.address().port}/pos/`);
    await wait('document.querySelectorAll(".kitchen-cancel-item").length === 2');
    await js('window.confirm = () => { throw new Error("Native confirm unavailable"); }; document.querySelector(".kitchen-cancel-item").click()');
    await wait('document.getElementById("confirm-action-dialog")?.open');
    assert.ok((await js('document.getElementById("confirm-action-dialog").textContent')).includes('กุ้งสด × 4'));
    await js('document.getElementById("cancel-action").click()');
    await wait('!document.getElementById("confirm-action-dialog")');
    assert.equal(requests, 0);
    await js('document.querySelector(".kitchen-cancel-item").click()');
    await wait('document.getElementById("confirm-action-dialog")?.open');
    await js('document.getElementById("confirm-action").click()');
    await wait('document.querySelectorAll(".kitchen-cancel-item").length === 1');
    assert.equal(requests, 1);
    assert.ok((await js('document.getElementById("kitchen-orders").textContent')).includes('หมูสามชั้น'));
    assert.ok(!(await js('document.getElementById("kitchen-orders").textContent')).includes('กุ้งสด'));
    const preview = path.resolve(__dirname, '../../.tmp/pos-hardware/chef-cancel.png');
    fs.mkdirSync(path.dirname(preview), { recursive: true });
    await win.webContents.capturePage(undefined, { stayHidden: true });
    await new Promise((resolve) => setTimeout(resolve, 200));
    fs.writeFileSync(preview, (await win.webContents.capturePage(undefined, { stayHidden: true })).toPNG());
    await js('document.querySelector(".kitchen-cancel-order").click()');
    await wait('document.getElementById("confirm-action-dialog")?.open');
    await js('document.getElementById("confirm-action").click()');
    await wait('document.querySelectorAll(".kitchen-order").length === 0');
    assert.equal(requests, 2);
    console.log('PASS: chef confirmation dismisses safely, single-line cancellation keeps remaining food, whole-order cancellation removes card. No real orders used.');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
  finally { if (win && !win.isDestroyed()) win.destroy(); if (server) server.close(); }
});
