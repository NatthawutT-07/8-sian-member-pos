const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const assert = require('node:assert/strict');
const { testSale } = require('../desktop/render.cjs');
const { barcode } = require('../desktop/escpos.cjs');

app.setPath('userData', path.resolve(__dirname, '../../.tmp/receipt-options-profile'));
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const timeout = setTimeout(() => {
    console.error('Receipt render check timeout');
    app.exit(1);
  }, 20000);
  let win;
  try {
    win = new BrowserWindow({
      show: false,
      width: 576,
      height: 1000,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    await win.loadFile(path.resolve(__dirname, '../desktop/print.html'));
    const prepare = async (data) => {
      await win.webContents.executeJavaScript(`window.preparePrint(${JSON.stringify(data)})`);
      return win.webContents.executeJavaScript(
        `({ qr: document.querySelectorAll('.receipt-qr').length, barcode: !document.getElementById('barcode').hidden, barcodeDisplay: getComputedStyle(document.getElementById('barcode')).display })`,
      );
    };
    const sale = {
      ...testSale(),
      tableNumber: 3,
      orderingUrl: 'https://8sianracha.com/order/c23096c1-cbe5-465d-9348-673e7b43cb1a',
      orderingExpiresAt: new Date(Date.now() + 7200000).toISOString(),
    };
    let state = await prepare({ kind: 'receipt', sale });
    assert.equal(state.qr, 0);
    assert.equal(state.barcode, false);
    assert.equal(state.barcodeDisplay, 'none');
    state = await prepare({ kind: 'receipt', sale, printQr: true });
    assert.equal(state.qr, 1);
    assert.equal(state.barcode, false);
    state = await prepare({
      kind: 'table-qr',
      tableQr: { tableNumber: 3, url: sale.orderingUrl, qrExpiresAt: sale.orderingExpiresAt },
    });
    assert.equal(state.qr, 1);
    assert.equal(state.barcode, false);
    await assert.rejects(
      prepare({
        kind: 'table-qr',
        tableQr: { tableNumber: 3, url: sale.orderingUrl, qrExpiresAt: new Date(0).toISOString() },
      }),
      /หมดอายุ/,
    );
    state = await prepare({ kind: 'receipt', sale: { ...sale, tableNumber: null }, printQr: true });
    assert.equal(state.qr, 0);
    state = await prepare({
      kind: 'barcode',
      product: { name: 'สินค้าทดสอบ', priceSatang: 10000 },
      code: barcode('8851234567890'),
    });
    assert.equal(state.qr, 0);
    assert.equal(state.barcode, true);
    assert.notEqual(state.barcodeDisplay, 'none');
    state = await prepare({ kind: 'test', sale, printQr: false });
    assert.equal(state.barcode, false);
    assert.equal(state.qr, 0);
    console.log(
      'PASS: receipts never include a barcode; QR is opt-in and table-only; product barcode labels still render',
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    clearTimeout(timeout);
    if (win && !win.isDestroyed()) win.destroy();
  }
});
