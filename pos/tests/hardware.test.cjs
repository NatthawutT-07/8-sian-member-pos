const test = require('node:test');
const assert = require('node:assert/strict');
const { createHardware, normalizeSettings } = require('../desktop/hardware.cjs');
const { barcode, raster, drawerPulse, finishPrint } = require('../desktop/escpos.cjs');
const { isTrustedFrame } = require('../desktop/trusted-frame.cjs');

function fixture({ method = 'CASH', renderFails = false, writeFails = false } = {}) {
  let settings = normalizeSettings({
    deviceId: 'BluetoothLE#printer',
    deviceName: 'JP80H-test',
    autoDrawer: true,
  });
  const requests = [],
    writes = [],
    claimed = new Set();
  const sale = { id: 'sale-1', actor: 'cashier', method, receiptNumber: '2611010000001' };
  const request = async (route, body) => {
    requests.push({ route, body });
    if (route === 'me') return { id: 'cashier' };
    if (route === 'sales/sale-1') return sale;
    if (route === 'hardware/claim') {
      if (claimed.has(body.saleId)) return { claimed: false };
      claimed.add(body.saleId);
      return { claimed: true, cash: method === 'CASH' };
    }
    if (route === 'hardware/events') return { ok: true };
    throw new Error(`Unexpected route ${route}`);
  };
  const handle = createHardware({
    request,
    transport: async (input) => {
      writes.push(Buffer.from(input.base64 || '', 'base64'));
      if (writeFails) throw new Error('disconnected');
      return { ok: true };
    },
    render: async () => {
      if (renderFails) throw new Error('render failed');
      return Buffer.from('receipt-image');
    },
    readSettings: () => settings,
    saveSettings: (value) => {
      settings = value;
    },
  });
  return { handle, writes, requests };
}

test('cash checkout opens once, prints once; retry and reprint never open again', async () => {
  const f = fixture();
  await f.handle('afterSale', { saleId: 'sale-1' });
  assert.deepEqual(f.writes[0], drawerPulse());
  assert.equal(f.writes.length, 2);
  assert.equal((await f.handle('afterSale', { saleId: 'sale-1' })).skipped, true);
  await f.handle('printReceipt', { saleId: 'sale-1' });
  assert.equal(f.writes.length, 3);
  assert.equal(f.writes.filter((bytes) => bytes.equals(drawerPulse())).length, 1);
  assert.equal(f.requests.filter(({ route }) => route === 'checkout').length, 0);
});
test('transfer prints without a drawer pulse', async () => {
  const f = fixture({ method: 'TRANSFER' });
  await f.handle('afterSale', { saleId: 'sale-1' });
  assert.equal(f.writes.length, 1);
  assert.notDeepEqual(f.writes[0], drawerPulse());
});
test('print failure preserves cash drawer outcome and prevents automatic retry', async () => {
  const f = fixture({ renderFails: true });
  const result = await f.handle('afterSale', { saleId: 'sale-1' });
  assert.equal(result.errors.length, 1);
  assert.deepEqual(f.writes, [drawerPulse()]);
  await f.handle('afterSale', { saleId: 'sale-1' });
  assert.equal(f.writes.length, 1);
});
test('failed transmission is audited as uncertain; manual drawer requires reason', async () => {
  const f = fixture({ writeFails: true });
  await assert.rejects(f.handle('openDrawer', { reason: '' }));
  assert.equal(f.writes.length, 0);
  await assert.rejects(f.handle('openDrawer', { reason: 'ทดสอบ' }), /disconnected/);
  assert.deepEqual(
    f.requests.filter(({ route }) => route === 'hardware/events').map(({ body }) => body.status),
    ['REQUESTED', 'FAILED_OR_UNKNOWN'],
  );
});
test('authentication fails before any physical operation', async () => {
  let writes = 0;
  const handle = createHardware({
    request: async () => {
      throw new Error('unauthorized');
    },
    transport: async () => writes++,
    readSettings: () => ({}),
  });
  await assert.rejects(handle('openDrawer', { reason: 'test' }), /unauthorized/);
  assert.equal(writes, 0);
});
test('shift print is at most once automatically; manual reprint never opens drawer or closes again', async () => {
  let claimed = false;
  const writes = [],
    routes = [],
    renders = [];
  const handle = createHardware({
    request: async (route) => {
      routes.push(route);
      if (route === 'me') return { id: 'cashier' };
      if (route === 'shifts/s1/report')
        return { shift: { id: 's1', closedAt: '2026-11-01T01:00:00Z' } };
      if (route === 'hardware/shift-claim') {
        const result = { claimed: !claimed };
        claimed = true;
        return result;
      }
      if (route === 'hardware/events') return { ok: true };
      throw new Error(route);
    },
    transport: async (input) => {
      writes.push(Buffer.from(input.base64, 'base64'));
      return { ok: true };
    },
    render: async (input) => {
      renders.push(input.kind);
      return Buffer.from('shift-image');
    },
    readSettings: () => ({
      deviceId: 'BluetoothLE#printer',
      deviceName: 'JP80H',
      autoDrawer: true,
    }),
  });
  await handle('printShiftReport', { shiftId: 's1', automatic: true });
  assert.equal(
    (await handle('printShiftReport', { shiftId: 's1', automatic: true })).skipped,
    true,
  );
  await handle('printShiftReport', { shiftId: 's1' });
  assert.equal(writes.length, 2);
  assert.deepEqual(renders, ['shift', 'shift']);
  assert.equal(
    writes.some((bytes) => bytes.equals(drawerPulse())),
    false,
  );
  assert.equal(routes.includes('shift/close'), false);
});
test('raster packs leftmost black pixel as MSB and transparent pixels as white', () => {
  const pixels = Buffer.alloc(576 * 129 * 4, 255);
  pixels[0] = pixels[1] = pixels[2] = 0;
  pixels[4] = pixels[5] = pixels[6] = pixels[7] = 0;
  const data = raster(pixels, 576, 129);
  assert.deepEqual([...data.subarray(5, 13)], [29, 118, 48, 0, 72, 0, 128, 0]);
  assert.equal(data[13], 128);
  assert.deepEqual([...data.subarray(13 + 72 * 128, 21 + 72 * 128)], [29, 118, 48, 0, 72, 0, 1, 0]);
  assert.throws(() => raster(pixels, 575, 129));
  assert.deepEqual([...finishPrint(Buffer.alloc(0), false)], [27, 100, 4]);
});
test('CODE128 maintains two-dot bars and quiet zones within paper; oversized codes reject', () => {
  const code = barcode('2611010000001');
  assert.match(code.bits, /^[01]+$/);
  assert.equal(code.moduleWidth, 2);
  assert.ok((code.bits.length + 20) * 2 <= 544);
  assert.throws(() => barcode('X'.repeat(100)), /ยาว/);
  assert.throws(() => barcode('\x1bp'));
  assert.deepEqual([...drawerPulse(5)], [27, 64, 27, 112, 49, 100, 250]);
});
test('IPC accepts only the configured POS top-level frame', () => {
  const frame = { url: 'file:///app/web/index.html' };
  const contents = { mainFrame: frame };
  const win = { webContents: contents };
  const event = { sender: contents, senderFrame: frame };
  const server = new URL('file:///app/web/index.html');
  assert.equal(isTrustedFrame(event, win, server), true);
  assert.equal(isTrustedFrame({ ...event, senderFrame: { ...frame } }, win, server), false);
  frame.url = 'https://shop.example/member/';
  assert.equal(isTrustedFrame(event, win, server), false);
  frame.url = 'https://evil.example/pos/';
  assert.equal(isTrustedFrame(event, win, server), false);
  frame.url = 'file:///app/web/other.html';
  assert.equal(isTrustedFrame(event, win, server), false);
});
