const { app, BrowserWindow, ipcMain } = require('electron');
const express = require('express');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHardware, normalizeSettings } = require('../desktop/hardware.cjs');
const { isTrustedFrame } = require('../desktop/trusted-frame.cjs');
const { drawerPulse } = require('../desktop/escpos.cjs');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  let server, win;
  try {
    const api = express();
    api.use(express.json());
    const user = {
      id: 'cashier-test',
      username: 'fixture',
      displayName: 'พนักงานทดสอบ',
      role: 'USER',
    };
    const product = {
      id: 'product-test',
      name: 'บุฟเฟต์หมูกระทะ',
      barcode: '8850123456789',
      priceSatang: 29900,
      active: true,
      group: 'MAIN',
    };
    const sales = [],
      events = [],
      claimed = new Set(),
      writes = [];
    const shift = {
      id: 'shift-test',
      businessDate: '2026-11-01',
      openingCashSatang: 10000,
      openedAt: '2026-11-01T01:00:00Z',
    };
    let closeRequests = 0,
      failShiftPrint = true;
    const getShiftReport = () => ({
      shift: { ...shift, openedByName: user.displayName, closedByName: user.displayName },
      summary: {
        billCount: 2,
        cashBillCount: 1,
        transferBillCount: 1,
        cashSatang: 29900,
        transferSatang: 29900,
        totalSatang: 59800,
        subtotalSatang: 59800,
        discountSatang: 0,
      },
      items: [{ ...product, quantity: 2, totalSatang: 59800 }],
    });
    api.use('/api/pos', (req, res, next) =>
      req.headers.cookie?.includes('pos_session=fixture') ? next() : res.sendStatus(401),
    );
    api.get('/api/pos/me', (_, res) => res.json(user));
    api.get('/api/pos/products', (_, res) => res.json([product]));
    const table = { id: 'table-test', number: 8, sessionId: 'round-test', orderingEnabled: true, zones: ['อาหาร'] };
    let tableCloses = 0, failOrders = true;
    api.get('/api/pos/tables', (_, res) => res.json([table,
      { id: 'table-free', number: 9, sessionId: null, orderingEnabled: false, zones: [] },
    ]));
    api.get('/api/pos/table-orders', (_, res) => failOrders
      ? res.status(503).json({ message: 'โหลดออเดอร์ไม่สำเร็จ (ทดสอบ)' }) : res.json([]));
    api.post('/api/pos/tables/:id/close', (req, res) => {
      assert.equal(user.role, 'USER');
      assert.equal(req.params.id, table.id);
      assert.equal(req.body.sessionId, table.sessionId);
      tableCloses++;
      table.sessionId = null;
      res.json({ ok: true });
    });
    api.get('/api/pos/shift', (_, res) =>
      res.json({
        shift: shift.closedAt ? null : shift,
        summary: {
          billCount: sales.length,
          totalSatang: 29900 * sales.length,
          cashSatang: 29900,
          transferSatang: 0,
        },
      }),
    );
    api.post('/api/pos/shift/close', (req, res) => {
      closeRequests++;
      shift.closedAt = new Date().toISOString();
      shift.countedCashSatang = req.body.countedCashSatang;
      shift.expectedCashSatang = 39900;
      shift.cashDifferenceSatang = shift.countedCashSatang - 39900;
      res.json(getShiftReport());
    });
    api.get('/api/pos/shifts/closed', (_, res) => res.json(shift.closedAt ? [shift] : []));
    api.get('/api/pos/shifts/:id/report', (_, res) => res.json(getShiftReport()));
    api.post('/api/pos/hardware/shift-claim', (_, res) => {
      const key = `shift:${shift.id}`;
      const result = { claimed: !claimed.has(key) };
      claimed.add(key);
      res.json(result);
    });
    api.post('/api/pos/scan', (req, res) => res.json({ type: 'PRODUCT', product }));
    api.post('/api/pos/checkout', (req, res) => {
      const sale = {
        ...req.body,
        id: `sale-${sales.length + 1}`,
        receiptNumber: `261101000000${sales.length + 1}`,
        actor: user.id,
        createdAt: new Date().toISOString(),
        cashierDisplayName: user.displayName,
        items: [{ ...product, quantity: 1 }],
        totalSatang: 29900,
        changeSatang: req.body.receivedSatang - 29900,
      };
      sales.push(sale);
      res.json(sale);
    });
    api.get('/api/pos/sales/:id', (req, res) =>
      res.json(sales.find((sale) => sale.id === req.params.id)),
    );
    api.get('/api/pos/sales', (_, res) => res.json(sales));
    api.post('/api/pos/hardware/claim', (req, res) => {
      const sale = sales.find((sale) => sale.id === req.body.saleId);
      const isNew = !claimed.has(sale.id);
      claimed.add(sale.id);
      res.json({ claimed: isNew, cash: sale.method === 'CASH' });
    });
    api.post('/api/pos/hardware/events', (req, res) => {
      events.push(req.body);
      res.json({ ok: true });
    });
    api.use('/pos', express.static(path.resolve(__dirname, '../web')));
    server = api.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 950,
      webPreferences: {
        preload: path.resolve(__dirname, '../desktop/preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: `test-hardware-${Date.now()}`,
        backgroundThrottling: false,
      },
    });
    await win.webContents.session.cookies.set({
      url: base,
      name: 'pos_session',
      value: 'fixture',
      httpOnly: true,
      sameSite: 'strict',
    });
    let config = normalizeSettings();
    const handler = createHardware({
      request: async (route, body) => {
        const response = await win.webContents.session.fetch(`${base}/api/pos/${route}`, {
          credentials: 'include',
          method: body === undefined ? 'GET' : 'POST',
          headers: { Origin: base, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        assert.equal(response.status, 200, route);
        return response.json();
      },
      readSettings: () => config,
      saveSettings: (value) => {
        config = value;
      },
      render: async (input) => Buffer.from(input.kind === 'shift' ? 'SHIFT-RASTER' : 'TEST-RASTER'),
      transport: async (request) => {
        if (request.action === 'list')
          return { devices: [{ id: 'BluetoothLE#test', name: 'JP80H-test' }] };
        if (request.action === 'probe') return { connected: true };
        writes.push(Buffer.from(request.base64, 'base64'));
        if (
          failShiftPrint &&
          Buffer.from(request.base64, 'base64').subarray(0, 12).toString() === 'SHIFT-RASTER'
        ) {
          failShiftPrint = false;
          throw new Error('ทดสอบเครื่องพิมพ์หลุด');
        }
        return { ok: true };
      },
    });
    ipcMain.handle('pos:hardware', async (event, action, input) => {
      if (!isTrustedFrame(event, win, new URL(`${base}/pos/`)))
        return { ok: false, error: 'forbidden' };
      try {
        return { ok: true, value: await handler(action, input) };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    });
    ipcMain.handle('pos:api', async (event, route, body) => {
      assert.ok(isTrustedFrame(event, win, new URL(`${base}/pos/`)));
      const response = await win.webContents.session.fetch(`${base}/api/pos/${route}`, {
        credentials: 'include',
        method: body === undefined ? 'GET' : 'POST',
        headers: { Origin: base, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { ok: response.ok, status: response.status, data: await response.json() };
    });
    const js = (code) => win.webContents.executeJavaScript(code);
    const wait = async (condition) => {
      for (let i = 0; i < 150; i++) {
        if (await js(condition)) return;
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      throw new Error(`UI timeout: ${condition}`);
    };
    await win.loadURL(`${base}/pos/`);
    await wait('document.querySelector(".product") !== null');
    await js('window.confirm = () => { throw new Error("Native confirm unavailable in WebView"); }; document.getElementById("tables").click()');
    await wait('document.getElementById("tables-dialog").open && document.querySelector("#table-list button") !== null && document.querySelector("#tables-dialog [data-dialog-notice]").textContent.includes("โหลดออเดอร์")');
    const cards = await js(`Array.from(document.querySelectorAll('#table-list .dining-table')).map(el => {
      const box = el.getBoundingClientRect();
      return { width: box.width, height: box.height, color: getComputedStyle(el).backgroundColor, text: el.textContent };
    })`);
    assert.equal(cards.length, 2);
    assert.ok(Math.abs(cards[0].width - cards[0].height) < 1);
    assert.ok(Math.abs(cards[0].height - cards[1].height) < 1);
    assert.notEqual(cards[0].color, cards[1].color);
    assert.ok(cards[0].text.includes('ไม่ว่าง') && cards[1].text.includes('ว่าง'));
    const tablePreview = path.resolve(__dirname, '../../.tmp/pos-hardware/table-grid.png');
    fs.mkdirSync(path.dirname(tablePreview), { recursive: true });
    await win.webContents.capturePage(undefined, { stayHidden: true });
    await new Promise((resolve) => setTimeout(resolve, 200));
    fs.writeFileSync(tablePreview, (await win.webContents.capturePage(undefined, { stayHidden: true })).toPNG());
    await js('document.querySelector("#table-list button").click()');
    await wait('document.getElementById("confirm-action-dialog")?.open');
    await js('document.getElementById("cancel-action").click()');
    await wait('!document.getElementById("confirm-action-dialog")');
    assert.equal(tableCloses, 0);
    failOrders = false;
    await js('document.querySelector("#table-list button").click()');
    await wait('document.getElementById("confirm-action-dialog")?.open');
    await js('document.getElementById("confirm-action").click()');
    await wait('document.querySelectorAll("#table-list .table-vacant").length === 2 && !document.querySelector("#table-list button")');
    assert.equal(tableCloses, 1);
    await js('document.getElementById("close-tables").click()');
    await js('document.getElementById("hardware").click()');
    await wait('!document.getElementById("find-printers").disabled');
    await js('document.getElementById("find-printers").click()');
    await wait(
      'document.getElementById("printer-device").options.length === 1 && !document.getElementById("connect-printer").disabled',
    );
    await js('document.getElementById("connect-printer").click()');
    await wait('document.getElementById("hardware-device").textContent === "JP80H-test"');
    await wait('!document.getElementById("test-printer").disabled');
    assert.equal(await js('document.getElementById("auto-drawer").checked'), false);
    await js(
      'document.getElementById("auto-drawer").checked=true;document.getElementById("save-hardware").click()',
    );
    await wait('!document.getElementById("save-hardware").disabled');
    await js('document.getElementById("test-printer").click()');
    await wait('!document.getElementById("test-printer").disabled');
    assert.equal(writes.length, 1);
    await js('document.getElementById("print-barcode").click()');
    await wait('!document.getElementById("print-barcode").disabled');
    assert.equal(writes.length, 2);
    const output = path.resolve(__dirname, '../../.tmp/pos-hardware');
    fs.mkdirSync(output, { recursive: true });
    await new Promise((resolve) => setTimeout(resolve, 250));
    fs.writeFileSync(
      path.join(output, 'devices-ui.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js(
      'document.getElementById("drawer-reason").value="แลกเงินทอน"; document.getElementById("open-drawer").click()',
    );
    await wait('!document.getElementById("open-drawer").disabled');
    assert.deepEqual(writes[2], drawerPulse());
    await js(
      'document.getElementById("close-hardware").click();document.getElementById("scan").value="8850123456789";document.getElementById("scan-form").requestSubmit()',
    );
    await wait('document.querySelector(".cart-row") !== null');
    await js(
      'document.getElementById("received").value="300";document.getElementById("received").dispatchEvent(new Event("input"));document.getElementById("pay").click()',
    );
    await wait(
      'document.getElementById("receipt-dialog").open && !document.getElementById("print").disabled && document.getElementById("receipt-notice").textContent.includes("ส่งคำสั่ง")',
    );
    assert.equal(sales.length, 1);
    assert.deepEqual(writes[3], drawerPulse());
    assert.equal(writes.length, 5);
    await js('document.getElementById("print").click()');
    await wait('!document.getElementById("print").disabled');
    assert.equal(writes.length, 6);
    assert.equal(writes.filter((bytes) => bytes.equals(drawerPulse())).length, 2);
    await js(
      'document.getElementById("close-receipt").click();document.querySelector(".product").click();document.querySelector("[data-payment-method=TRANSFER]").click();document.getElementById("pay").click()',
    );
    await wait(
      'document.getElementById("receipt-dialog").open && !document.getElementById("print").disabled && document.getElementById("receipt-notice").textContent.includes("เงินโอน")',
    );
    assert.equal(sales.length, 2);
    await wait('!document.getElementById("table-select").disabled');
    assert.equal(writes.length, 7);
    assert.equal(writes.filter((bytes) => bytes.equals(drawerPulse())).length, 2);
    assert.ok(
      events.some((event) => event.operation === 'OPEN_DRAWER' && event.reason === 'แลกเงินทอน'),
    );
    await js(
      'document.getElementById("close-receipt").click();document.getElementById("close-store").click()',
    );
    await wait('document.getElementById("close-dialog").open');
    await js(
      'document.querySelector("[name=countedCash]").value="399";document.getElementById("close-form").requestSubmit()',
    );
    await wait(
      'document.getElementById("receipt-dialog").open && !document.getElementById("print").disabled && document.getElementById("receipt-notice").textContent.includes("พิมพ์ไม่สำเร็จ")',
    );
    const reportText = await js('document.getElementById("receipt").textContent');
    assert.ok(
      reportText.includes('ใบสรุปรายได้ปิดกะ') &&
        reportText.includes('เงินสด (1 บิล)') &&
        reportText.includes('เงินโอน (1 บิล)'),
    );
    assert.ok(reportText.includes('598.00') && reportText.includes(product.name));
    assert.equal(closeRequests, 1);
    assert.equal(sales.length, 2);
    assert.equal(writes.length, 8);
    await js('document.getElementById("print").click()');
    await wait('!document.getElementById("print").disabled');
    assert.equal(writes.length, 9);
    await js(
      'document.getElementById("close-receipt").click();document.getElementById("shift-reports").click()',
    );
    await wait(
      'document.getElementById("history-dialog").open && document.querySelector("#sales button") !== null',
    );
    await js('document.querySelector("#sales button").click()');
    await wait(
      'document.getElementById("receipt-dialog").open && document.getElementById("receipt").textContent.includes("ใบสรุปรายได้ปิดกะ")',
    );
    await js('document.getElementById("print").click()');
    await wait('!document.getElementById("print").disabled');
    assert.equal(writes.length, 10);
    assert.equal(closeRequests, 1);
    assert.equal(writes.filter((bytes) => bytes.equals(drawerPulse())).length, 2);
    console.log(
      'PASS: POS hardware, cash/transfer checkout, close-shift report, print failure recovery and shift-history reprint without duplicate close/drawer. No real sales or hardware used.',
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    if (server) server.close();
  }
});
