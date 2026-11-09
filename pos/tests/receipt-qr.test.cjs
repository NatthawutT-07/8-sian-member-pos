const test = require('node:test');
const assert = require('node:assert/strict');
const QRCode = require('qrcode');

test('receipt QR encodes the exact sale identifier with a four-module quiet zone', async () => {
  const { renderReceiptQr, receiptCode } = await import('../web/receipt-qr.js');
  const node = () => ({
    attributes: {}, children: [],
    setAttribute(key, value) { this.attributes[key] = value; },
    append(...children) { this.children.push(...children); },
  });
  const doc = { createElement: node, createElementNS: node };
  const sale = { id: 'c23096c1-cbe5-465d-9348-673e7b43cb1a', receiptNumber: '2611090000001', tableNumber: 8 };
  assert.equal(receiptCode(sale), `8SR-${sale.id}`);
  const block = renderReceiptQr(doc, sale);
  const svg = block.children[0];
  const { modules } = QRCode.create(receiptCode(sale), { errorCorrectionLevel: 'H' });
  assert.equal(svg.attributes.viewBox, `0 0 ${modules.size + 8} ${modules.size + 8}`);
  const width = Number(svg.attributes.width);
  assert.ok(width > 200 && width <= 264);
  assert.equal(width % (modules.size + 8), 0);
  assert.equal(svg.attributes.height, svg.attributes.width);
  assert.equal(svg.children[0].attributes.fill, '#fff');
  assert.equal(svg.children[1].attributes.fill, '#000');
  let expected = '';
  for (let y = 0; y < modules.size; y++)
    for (let x = 0; x < modules.size; x++)
      if (modules.get(y, x)) expected += `M${x + 4} ${y + 4}h1v1h-1z`;
  assert.equal(svg.children[1].attributes.d, expected);
  assert.equal(renderReceiptQr(doc, {}), null);
  assert.equal(renderReceiptQr(doc, { ...sale, tableNumber: null }), null);
  assert.equal(renderReceiptQr(doc, { ...sale, tableNumber: '' }), null);
  assert.ok(renderReceiptQr(doc, { ...sale, tableNumber: null, tableId: 'selected-table' }));
});
