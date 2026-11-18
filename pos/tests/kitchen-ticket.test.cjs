const test = require('node:test');
const assert = require('node:assert/strict');

test('kitchen ticket renders only the table, even with a long order', async () => {
  const { renderKitchenTicket } = await import('../web/kitchen-ticket.js');
  const root = {
    ownerDocument: { createElement: (tag) => ({ tag, textContent: '' }) },
    classList: { add() {} },
    replaceChildren(...children) { this.children = children; },
  };
  renderKitchenTicket(root, { tableNumber: 27, items: [{ name: 'FOOD MUST NOT PRINT', quantity: 99 }] });
  assert.deepEqual(root.children, [{ tag: 'h2', textContent: 'โต๊ะ 27' }]);
});

