const test = require('node:test');
const assert = require('node:assert/strict');

test('table QR slip requires a current URL and expiry and includes the round deadline', async () => {
  const { renderTableQr } = await import('../web/table-qr.js');
  const node = () => ({
    attributes: {},
    children: [],
    setAttribute(key, value) {
      this.attributes[key] = value;
    },
    append(...children) {
      this.children.push(...children);
    },
  });
  const root = {
    ownerDocument: { createElement: node, createElementNS: node },
    replaceChildren(...children) {
      this.children = children;
    },
  };
  const qr = {
    tableNumber: 3,
    url: 'https://8sianracha.com/order/c23096c1-cbe5-465d-9348-673e7b43cb1a',
    qrExpiresAt: new Date(Date.now() + 7200000).toISOString(),
  };
  renderTableQr(root, qr);
  assert.match(root.children[0].textContent, /โต๊ะ 3/);
  assert.equal(root.children[1].children[0].attributes.role, 'img');
  assert.match(root.children[2].textContent, /ใช้ได้ถึง/);
  for (const invalid of [
    { ...qr, qrExpiresAt: null },
    { ...qr, qrExpiresAt: new Date(0).toISOString() },
    { ...qr, url: null },
  ])
    assert.throws(() => renderTableQr(root, invalid), /หมดอายุ/);
});
