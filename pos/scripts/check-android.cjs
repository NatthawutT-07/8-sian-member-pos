// Exercise the generated APK JavaScript with a simulated native bridge.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const bundle = path.join(root, 'android/app/src/main/assets/web/android-bridge.js');
const source = fs.readFileSync(bundle, 'utf8');
const routes = [],
  writes = [];
const context = {
  console,
  crypto: webcrypto,
  Uint8Array,
  Uint16Array,
  Uint32Array,
  ArrayBuffer,
  TextEncoder,
  TextDecoder,
  atob,
  btoa,
  setTimeout,
  clearTimeout,
};
context.window = context;
context.PosNative = {
  postMessage: (message) => {
    const { id, action, input } = JSON.parse(message);
    queueMicrotask(() => {
      let value = {};
      if (action === 'settings')
        value = {
          deviceId: 'printer',
          deviceName: 'JP80H',
          autoPrint: true,
          autoDrawer: true,
          cut: true,
          drawerPin: 2,
        };
      if (action === 'render') value = Buffer.from('raster-image').toString('base64');
      if (action === 'transport') {
        writes.push(input);
        value = { ok: true };
      }
      if (action === 'api') {
        routes.push(input.route);
        const data = input.route.startsWith('sales/')
          ? { id: 'sale', receiptNumber: '2611010000001', method: 'CASH' }
          : input.route === 'hardware/claim'
            ? { claimed: true, cash: true }
            : {};
        value = { ok: true, status: 200, data };
      }
      context.__posNativeResult(id, { ok: true, value });
    });
  },
};
vm.createContext(context);
vm.runInContext(source, context);
(async () => {
  await context.posHardware.afterSale({ saleId: 'sale' });
  assert.equal(writes.length, 2, 'cash sale should issue a drawer pulse and receipt');
  assert.equal(routes.filter((route) => route === 'hardware/claim').length, 1);
  assert.equal(
    routes.filter((route) => route === 'hardware/events').length,
    4,
    'both operations must have requested and sent audit events',
  );
  assert.ok(
    Buffer.from(writes[0].base64, 'base64').equals(Buffer.from([27, 64, 27, 112, 48, 100, 250])),
  );
  await context.posHardware.testText();
  assert.equal(writes.length, 3);
  assert.ok(
    Buffer.from(writes[2].base64, 'base64').includes(
      Buffer.from('8 SIAN POS\nBASIC PRINTER TEST\n'),
    ),
  );
  console.log(
    'PASS: bundled Android bridge shares checkout hardware claims, audit events, receipt and drawer behavior',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
