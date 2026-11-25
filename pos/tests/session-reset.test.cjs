const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

async function terminal(initial = {}) {
  const store = await import('../web/payment-store.js');
  const values = new Map(Object.entries(initial));
  const nodes = new Map(), timers = new Map();
  let timerId = 0, checkoutReply;
  class Node {
    constructor(id = '') {
      this.id = id; this.value = ''; this.hidden = false; this.disabled = false; this.checked = false;
      this.children = []; this.dataset = {}; this.style = {}; this.textContent = '';
      this.classList = { add() {}, remove() {}, toggle() {} };
      this.elements = new Proxy({}, { get: (target, key) => target[key] ||= new Node() });
    }
    append(...children) { this.children.push(...children); }
    prepend(...children) { this.children.unshift(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute() {}
    addEventListener() {}
    querySelector() { return this.button ||= new Node(); }
    querySelectorAll() { return []; }
    closest() { return this; }
    focus() {}
    reset() {}
    close() { this.open = false; }
    showModal() { this.open = true; }
  }
  const html = fs.readFileSync(path.join(__dirname, '../web/index.html'), 'utf8');
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) nodes.set(id, new Node(id));
  const node = (id) => { assert.ok(nodes.has(id), `missing real markup: ${id}`); return nodes.get(id); };
  const context = {
    console, URL, AbortSignal, Intl, Date, crypto: webcrypto,
    document: { body: new Node(), addEventListener() {}, getElementById: node, querySelectorAll: () => [], createElement: () => new Node() },
    localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) },
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: (id) => timers.delete(id), setInterval: () => ++timerId, clearInterval() {},
    renderReceipt() {}, formatMemberPhone: (value) => value, renderShiftReport() {}, renderTableQr() {},
    setupHardwareUI: () => ({ refreshSettings: async () => {}, printQr: () => false }),
    setupKitchen: () => ({ stop() {}, start: async () => {} }),
    setupTableOrdering: () => ({ stop() {}, start() {}, clear() {}, selected() {}, checkout: () => ({}), refresh: async () => {} }),
    setupCashCount: () => ({ reset() {}, restore() {}, counts: () => ({}) }),
    confirmAction: async () => false,
    ...store,
    posApi: { request: async (route) => {
      if (route === 'expired') return { ok: false, status: 401, data: { message: 'expired' } };
      if (route === 'checkout') return new Promise((resolve) => { checkoutReply = resolve; });
      return { ok: true, status: 200, data: route === 'products' ? [] : route === 'shift' ? { shift: { id: 'shift-a' }, summary: {} } : {} };
    } },
  };
  context.window = context;
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8').replace(/^import .*;\r?\n/gm, '');
  vm.runInContext(source, context);
  const evaluate = (code) => vm.runInContext(code, context);
  const login = (id) => evaluate(`start({ id: ${JSON.stringify(id)}, role: 'USER', expiresAt: new Date(Date.now() + 86400000).toISOString() })`);
  const state = () => JSON.parse(evaluate('JSON.stringify({ activeUserId, busy, couponBusy, pending, cart, memberSelection, paymentMethod })'));
  return { node, values, timers, evaluate, login, state, reply: (value) => checkoutReply(value) };
}

test('legacy pending payment no longer locks startup; expiration clears the entire cashier session', async () => {
  const payload = { key: 'legacy-bill', shiftId: 'old-shift', items: [], expectedTotalSatang: 10000 };
  const app = await terminal({ 'pos-pending': JSON.stringify(payload), 'pos-pending-user': 'user-a' });
  assert.equal(app.state().pending, null);
  assert.equal(app.values.has('pos-pending'), false);
  assert.equal(JSON.parse(app.values.get('pos-payment-recovery'))[0].payload.key, 'legacy-bill');
  await app.login('user-a');
  app.evaluate("cart = [{ product: { id: 'p', priceSatang: 10000 }, quantity: 1 }]; busy = true; couponBusy = true; memberSelection = { memberPhone: '0812345678' };");
  await assert.rejects(app.evaluate("api('expired')"));
  assert.deepEqual(app.state(), { activeUserId: null, busy: false, couponBusy: false, pending: null, cart: [], memberSelection: null, paymentMethod: 'CASH' });
  assert.equal(app.node('login').hidden, false);
  assert.equal(app.node('register').hidden, true);
  await app.login('user-b');
  assert.equal(app.evaluate('editable()'), true);
  assert.equal(app.state().cart.length, 0);
  const expiry = [...app.timers.values()].find((timer) => timer.delay > 23 * 3600000);
  assert.ok(expiry);
  expiry.fn();
  assert.equal(app.state().activeUserId, null);
});

test('late checkout response after reset cannot overwrite a new user or their new cart', async () => {
  const app = await terminal();
  await app.login('user-a');
  app.evaluate("cart = [{ product: { id: 'p', priceSatang: 10000 }, quantity: 1 }];");
  app.node('received').value = '100';
  const oldPayment = app.evaluate("$('pay').onclick({ preventDefault() {} })");
  assert.ok(app.state().pending);
  app.node('reset-terminal').onclick();
  await app.login('user-b');
  app.evaluate("cart = [{ product: { id: 'new', priceSatang: 20000 }, quantity: 1 }];");
  app.reply({ ok: true, status: 200, data: { id: 'paid-old-bill' } });
  await oldPayment;
  assert.equal(app.state().activeUserId, 'user-b');
  assert.equal(app.state().cart[0].product.id, 'new');
  assert.equal(app.state().busy, false);
  assert.equal(app.state().pending, null);
  assert.equal(JSON.parse(app.values.get('pos-payment-recovery')).length, 1);
});
