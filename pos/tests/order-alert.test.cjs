const test = require('node:test');
const assert = require('node:assert/strict');

async function fixture(fail = false) {
  const { createOrderAlert } = await import('../web/order-alert.js');
  let plays = 0;
  const statuses = [];
  const store = new Map();
  const audio = { currentTime: 0, pause() {}, play() { plays++; return fail ? Promise.reject(new Error('blocked')) : Promise.resolve(); } };
  const alert = createOrderAlert('test.wav', (...args) => statuses.push(args), {
    createAudio: () => audio,
    storage: { getItem: (key) => store.get(key), setItem: (key, value) => store.set(key, value) },
  });
  return { alert, statuses, plays: () => plays };
}

test('new orders chime once per batch; initial, repeated and reappearing orders stay quiet', async () => {
  const f = await fixture();
  await f.alert.enable();
  assert.equal(f.alert.enabled, true);
  assert.equal(f.plays(), 1);
  assert.equal(f.alert.observe([{ id: 'old' }]), 0);
  assert.equal(f.plays(), 1);
  assert.equal(f.alert.observe([{ id: 'old' }, { id: 'new1' }, { id: 'new2' }]), 2);
  assert.equal(f.plays(), 2);
  f.alert.observe([]);
  f.alert.observe([{ id: 'new1' }]);
  assert.equal(f.plays(), 2);
  f.alert.disable();
  f.alert.observe([{ id: 'new3' }]);
  assert.equal(f.plays(), 2);
  await f.alert.enable();
  f.alert.observe([{ id: 'new3' }]);
  assert.equal(f.plays(), 3, 'enabling previews once without replaying muted orders');
  f.alert.reset();
  f.alert.observe([{ id: 'another-session' }]);
  assert.equal(f.plays(), 3);
});

test('preview works without enabling notifications; playback failure does not break order polling', async () => {
  const f = await fixture();
  await f.alert.test();
  assert.equal(f.alert.enabled, false);
  assert.equal(f.plays(), 1);
  const blocked = await fixture(true);
  await assert.rejects(blocked.alert.enable());
  assert.equal(blocked.alert.enabled, false);
  assert.doesNotThrow(() => blocked.alert.observe([]));
});

test('an autoplay rejection reports an actionable message without retrying each poll', async () => {
  const { createOrderAlert } = await import('../web/order-alert.js');
  const messages = [];
  let plays = 0;
  const alert = createOrderAlert('test.wav', (_, message) => messages.push(message), {
    storage: { getItem: () => 'on' },
    createAudio: () => ({ pause() {}, play() { plays++; return Promise.reject(new Error('autoplay')); } }),
  });
  alert.observe([]);
  alert.observe([{ id: 'new' }]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(plays, 1);
  assert.match(messages[0], /ทดสอบเสียง/);
  alert.observe([{ id: 'new' }]);
  assert.equal(plays, 1);
});
