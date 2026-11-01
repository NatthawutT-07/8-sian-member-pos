const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    const packageRoot = process.argv[2]
      ? path.resolve(process.argv[2])
      : path.resolve(__dirname, '../release/win-unpacked');
    const archive = path.join(packageRoot, 'resources/app.asar');
    const packed = require(path.join(archive, 'package.json'));
    assert.equal(packed.version, require('../package.json').version);
    assert.ok(fs.readFileSync(path.join(archive, 'web/images/logo.png')).length > 0);
    const { renderPrint } = require(path.join(archive, 'desktop/render.cjs'));
    const receipt = await renderPrint(BrowserWindow, { kind: 'test' });
    const label = await renderPrint(BrowserWindow, {
      kind: 'barcode',
      product: { name: 'ทดสอบไฟล์โปรแกรม', barcode: '8850123456789', priceSatang: 29900 },
    });
    const shift = await renderPrint(BrowserWindow, {
      kind: 'shift',
      report: require('./shift-report-fixture.cjs'),
    });
    assert.ok(shift.length > 1000);
    assert.ok(receipt.length > 1000 && label.length > 1000);
    assert.ok(
      fs.existsSync(path.join(packageRoot, 'resources/app.asar.unpacked/desktop/bluetooth.ps1')),
    );
    console.log(
      `PASS: packaged ${packed.version}, logo, Thai receipt (${receipt.length} bytes), CODE128 (${label.length} bytes), bundled BLE helper.`,
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
