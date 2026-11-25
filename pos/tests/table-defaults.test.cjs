const test = require('node:test');
const assert = require('node:assert/strict');

test('checkout uses saved defaults including unlimited time; saved pending permissions remain unchanged', async () => {
  const { setupTableOrdering } = await import('../web/table-ordering.js');
  const { saveTableDefaults } = await import('../web/table-defaults.js');
  const previous = { document: global.document, localStorage: global.localStorage, Option: global.Option };
  class Node {
    constructor() { this.children = []; this.value = ''; this.checked = false; this.disabled = false; this.dataset = {}; this.classList = { toggle() {} }; }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    querySelectorAll(selector) { return this.children.flatMap((child) => [child, ...child.querySelectorAll(selector)]).filter((child) => selector !== 'input:checked' || child.type === 'checkbox' && child.checked); }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  const nodes = new Map();
  const $ = (id) => { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); };
  const values = new Map();
  global.document = { getElementById: $, createElement: () => new Node() };
  global.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  global.Option = class extends Node { constructor(label, value) { super(); this.textContent = label; this.value = value; } };
  try {
    saveTableDefaults(global.localStorage, { zones: ['main'], qrHours: 0, printQr: true });
    let pending = null;
    const control = setupTableOrdering({
      api: async (route) => route === 'tables' ? [{ id: 't', number: 1, sessionId: null, qrDurationHours: 2 }] : ['main', 'sea'],
      run: (action) => async () => action(), editable: () => true, getPending: () => pending,
    });
    await control.refresh();
    $('table-select').value = 't';
    await $('table-select').onchange();
    assert.deepEqual(control.checkout(), { ordering: { zones: ['main'], qrHours: 0 }, printQr: true });
    assert.equal($('checkout-qr-hours').disabled, true);
    assert.match($('checkout-ordering-summary').textContent, /ไม่จำกัดเวลา/);
    $('edit-checkout-ordering').onclick();
    assert.equal($('checkout-ordering-dialog').open, true);
    control.clear();
    pending = { tableId: 't', ordering: { zones: ['sea'], qrHours: 3 }, printQr: false };
    await control.refresh();
    assert.deepEqual(control.checkout(), { ordering: { zones: ['sea'], qrHours: 3 }, printQr: false });
    assert.equal($('checkout-qr-hours').disabled, false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete global[key]; else global[key] = value;
    }
  }
});

test('table defaults preserve unlimited zero and selected zones across reopening', async () => {
  const { readTableDefaults, saveTableDefaults } = await import('../web/table-defaults.js');
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(readTableDefaults(storage), null);
  const defaults = { zones: ['หมูกระทะ', 'ทะเล'], qrHours: 0, printQr: true };
  saveTableDefaults(storage, defaults);
  assert.deepEqual(readTableDefaults(storage), defaults);
  for (const qrHours of [-1, 1.5, 169]) assert.throws(() => saveTableDefaults(storage, { ...defaults, qrHours }));
  assert.equal(readTableDefaults({ getItem: () => 'corrupt json' }), null);
});

test('unlimited table countdown uses an explicit active-round flag, never just a missing expiry', async () => {
  const { tableTiming } = await import('../web/table-time.js');
  const table = { sessionId: 'round', orderingEnabled: true, qrExpiresAt: null, qrUnlimited: true };
  assert.equal(tableTiming(table).remaining, 'ไม่จำกัดเวลา');
  assert.equal(tableTiming({ ...table, qrUnlimited: false }).state, 'expired');
  assert.equal(tableTiming({ ...table, sessionId: null }).state, 'vacant');
});

test('unchanged table cards retain their DOM nodes and order without rebuilding on each refresh', async () => {
  const { reconcileTableNodes } = await import('../web/table-ordering.js');
  const parent = { children: [], writes: 0, insertBefore(child, before) {
    this.writes++;
    this.children = this.children.filter((node) => node !== child);
    this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, child);
  } };
  const node = (id) => ({ id, remove() { parent.children = parent.children.filter((item) => item !== this); } });
  const first = node('1'), second = node('2'), next = node('3');
  parent.children = [first, second];
  reconcileTableNodes(parent, [first, second]);
  assert.equal(parent.writes, 0);
  reconcileTableNodes(parent, [first, second, next]);
  assert.equal(parent.writes, 1);
  assert.equal(parent.children[0], first);
  assert.equal(parent.children[1], second);
});
