const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { renderPrint } = require('../desktop/render.cjs');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const output = path.resolve(__dirname, '../../.tmp/pos-hardware');
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const [name, input] of [
      ['receipt', { kind: 'test' }],
      [
        'kitchen',
        {
          kind: 'kitchen',
          ticket: {
            id: 'kitchen-test-001',
            tableNumber: 8,
            createdAt: '2026-11-02T12:00:00Z',
            items: [
              { name: 'หมูสามชั้น', quantity: 2 },
              { name: 'กุ้งสด', quantity: 10 },
            ],
          },
        },
      ],
      ['shift-report', { kind: 'shift', report: require('./shift-report-fixture.cjs') }],
      [
        'barcode',
        {
          kind: 'barcode',
          product: { name: 'บุฟเฟต์หมูกระทะ', barcode: '8850123456789', priceSatang: 29900 },
        },
      ],
    ]) {
      const bytes = await renderPrint(BrowserWindow, input, {
        previewPath: path.join(output, `${name}.png`),
      });
      assert.ok(bytes.length > 1000);
      assert.deepEqual([...bytes.subarray(0, 5)], [27, 64, 27, 97, 0]);
      fs.writeFileSync(path.join(output, `${name}.bin`), bytes);
      console.log(`${name}: ${bytes.length} bytes, 576-dot raster rendered`);
    }
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
