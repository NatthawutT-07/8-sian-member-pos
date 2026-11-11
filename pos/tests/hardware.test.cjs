const test = require('node:test');
const assert = require('node:assert/strict');
const { createHardware, normalizeSettings } = require('../desktop/hardware.cjs');
const { barcode, raster, rasterBands, drawerPulse, finishPrint } = require('../desktop/escpos.cjs');
const { isTrustedFrame } = require('../desktop/trusted-frame.cjs');

function fixture({
  method = 'CASH',
  renderFails = false,
  writeFails = false,
  autoDrawer = true,
  deviceId = 'BluetoothLE#printer',
} = {}) {
  let settings = normalizeSettings({
    deviceId,
    deviceName: 'JP80H-test',
    autoDrawer,
  });
  const requests = [],
    renders = [],
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
    if (route === 'tables/table-1/qr')
      return {
        tableNumber: 3,
        sessionId: 'round-1',
        url: 'https://8sianracha.com/order/c23096c1-cbe5-465d-9348-673e7b43cb1a',
        qrExpiresAt: new Date(Date.now() + 7200000).toISOString(),
      };
    throw new Error(`Unexpected route ${route}`);
  };
  const handle = createHardware({
    request,
    transport: async (input) => {
      writes.push(Buffer.from(input.base64 || '', 'base64'));
      if (writeFails) throw new Error('disconnected');
      return { ok: true };
    },
    render: async (input) => {
      renders.push(input);
      if (renderFails) throw new Error('render failed');
      return Buffer.from('receipt-image');
    },
    readSettings: () => settings,
    saveSettings: (value) => {
      settings = value;
    },
  });
  return { handle, writes, requests, renders };
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

test('basic diagnostic prints ASCII without the image renderer or a drawer pulse', async () => {
  const f = fixture({ renderFails: true });
  await f.handle('testText');
  assert.equal(f.renders.length, 0);
  assert.equal(f.writes.length, 1);
  assert.ok(f.writes[0].includes(Buffer.from('8 SIAN POS\nBASIC PRINTER TEST\n')));
  assert.equal(f.writes[0].includes(drawerPulse()), false);
  assert.deepEqual(
    f.requests.filter((x) => x.route === 'hardware/events').map((x) => x.body.status),
    ['REQUESTED', 'SENT'],
  );
});

test('table QR prints the live round URL as a separate slip without opening the drawer', async () => {
  const f = fixture();
  await f.handle('printTableQr', { tableId: 'table-1', sessionId: 'round-1' });
  assert.equal(f.renders.at(-1).kind, 'table-qr');
  assert.match(f.renders.at(-1).tableQr.url, /\/order\//);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].includes(drawerPulse()), false);
  assert.ok(
    f.requests.some((x) => x.route === 'hardware/events' && x.body.operation === 'PRINT_TABLE_QR'),
  );
});

test('automatic output explains why no cash drawer command was sent', async () => {
  const disabled = fixture({ autoDrawer: false });
  const result = await disabled.handle('afterSale', { saleId: 'sale-1' });
  assert.equal(result.drawerSent, false);
  assert.match(result.warning, /ปิดตัวเลือก/);
  assert.equal(disabled.writes.filter((bytes) => bytes.equals(drawerPulse())).length, 0);
  assert.equal(
    (await fixture({ deviceId: '' }).handle('afterSale', { saleId: 'sale-1' })).skipped,
    true,
  );
  const transfer = await fixture({ method: 'TRANSFER' }).handle('afterSale', { saleId: 'sale-1' });
  assert.match(transfer.warning, /เงินโอน/);
});

test('chef prints a compact kitchen ticket with one feed line and cannot open the drawer', async () => {
  const writes = [],
    events = [],
    renders = [];
  const handle = createHardware({
    request: async (route, body) => {
      if (route === 'me') return { id: 'chef', role: 'CHEF' };
      if (route === 'kitchen/orders/order-1/ticket')
        return { id: 'order-1', tableNumber: 8, items: [{ name: 'กุ้ง', quantity: 2 }] };
      if (route === 'hardware/events') {
        events.push(body);
        return { ok: true };
      }
      throw new Error(`Unexpected route ${route}`);
    },
    transport: async (input) => {
      writes.push(Buffer.from(input.base64, 'base64'));
      return { ok: true };
    },
    render: async (input) => {
      renders.push(input);
      return Buffer.from('ticket-image');
    },
    readSettings: () => ({ deviceId: 'printer', deviceName: 'QA' }),
    saveSettings: () => {},
  });
  await handle('printKitchenTicket', { orderId: 'order-1' });
  assert.equal(renders[0].kind, 'kitchen');
  assert.equal(renders[0].ticket.tableNumber, 8);
  assert.deepEqual(writes[0], finishPrint(Buffer.from('ticket-image'), true, 1));
  assert.equal(events[0].operation, 'PRINT_KITCHEN');
  assert.equal(events[0].orderId, 'order-1');
  await assert.rejects(handle('openDrawer', { reason: 'test' }), /ไม่มีสิทธิ์/);
  await assert.rejects(handle('afterSale', { saleId: 'sale-1' }), /ไม่มีสิทธิ์/);
  assert.equal(writes.length, 1);
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
  const decoded = decodeRaster(data.subarray(5));
  assert.equal(decoded.length, 72 * 129);
  assert.equal(decoded[0], 128);
  assert.ok(decoded.subarray(1).every((value) => value === 0));
  assert.ok(data.length < 300, 'white rows must not consume full-width image data');
  assert.throws(() => raster(pixels, 575, 129));
  assert.deepEqual([...finishPrint(Buffer.alloc(0), false)], [27, 100, 4]);
});

function decodeRaster(data) {
  const rows = [];
  for (let offset = 0; offset < data.length;) {
    assert.deepEqual([...data.subarray(offset, offset + 4)], [29, 118, 48, 0]);
    const width = data.readUInt16LE(offset + 4),
      height = data.readUInt16LE(offset + 6);
    assert.ok(width >= 1 && width <= 72 && height >= 1 && height <= 128);
    offset += 8;
    for (let y = 0; y < height; y++) {
      const row = Buffer.alloc(72);
      data.copy(row, 0, offset, offset + width);
      rows.push(row);
      offset += width;
    }
  }
  return Buffer.concat(rows);
}

test('compact raster retains all dots and row positions across dense, narrow and blank bands', () => {
  for (const height of [1, 31, 128]) {
    const pixels = Buffer.alloc(72 * height);
    for (let y = 0; y < height; y++) {
      const width = y % 9 === 0 ? 72 : y % 3 === 0 ? 0 : 18;
      for (let x = 0; x < width; x++) pixels[y * 72 + x] = (x * 17 + y * 11) & 255;
    }
    const encoded = rasterBands(pixels, height);
    assert.deepEqual(decodeRaster(encoded), pixels);
    assert.ok(encoded.length <= 8 + pixels.length);
  }
  assert.throws(() => rasterBands(Buffer.alloc(0), 0));
});

test('receipt QR defaults off, saved preference applies automatically, manual override is per receipt', async () => {
  assert.equal(normalizeSettings().printQr, false);
  const f = fixture();
  await f.handle('afterSale', { saleId: 'sale-1' });
  assert.equal(f.renders[0].printQr, false);
  await f.handle('configure', {
    autoPrint: true,
    autoDrawer: true,
    cut: true,
    drawerPin: 2,
    printQr: true,
  });
  await f.handle('printReceipt', { saleId: 'sale-1' });
  assert.equal(f.renders.at(-1).printQr, true);
  await f.handle('printReceipt', { saleId: 'sale-1', printQr: false });
  assert.equal(f.renders.at(-1).printQr, false);
  assert.equal((await f.handle('status')).settings.printQr, true);
  await assert.rejects(f.handle('printReceipt', { saleId: 'sale-1', printQr: 'yes' }), /QR/);
  assert.equal(f.writes.filter((bytes) => bytes.equals(drawerPulse())).length, 1);
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

test('thermal raster retains light glyph edges but keeps white gaps and barcode bars exact', () => {
  const pixels = Buffer.alloc(576 * 4, 255);
  for (const [x, gray] of [
    [0, 190],
    [1, 200],
    [2, 0],
    [3, 0],
    [4, 255],
  ]) {
    pixels[x * 4] = pixels[x * 4 + 1] = pixels[x * 4 + 2] = gray;
  }
  assert.equal(raster(pixels, 576, 1)[13], 0b10110000);
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
