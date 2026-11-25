const test = require('node:test');
const assert = require('node:assert/strict');
const payload = { key: 'original-key', shiftId: 'old-shift', items: [{ productId: 'p', quantity: 1 }], expectedTotalSatang: 10000 };
const storage = () => {
  const values = new Map([['pos-pending', JSON.stringify(payload)], ['pos-pending-user', 'original-user'], ['pos-print-qr', 'true']]);
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};
test('session reset moves the exact original payment to recovery and survives restart without locking a new bill', async () => {
  const { archivePayment, recoveryPayments, forgetRecovery } = await import('../web/payment-store.js');
  const store = storage();
  archivePayment(store, payload, 'original-user');
  assert.equal(store.getItem('pos-pending'), null);
  assert.equal(store.getItem('pos-pending-user'), null);
  assert.equal(store.getItem('pos-print-qr'), 'true');
  archivePayment(store, payload, 'original-user');
  assert.equal(recoveryPayments(store).length, 1);
  assert.deepEqual(recoveryPayments(store)[0].payload, payload);
  assert.equal(recoveryPayments(store)[0].userId, 'original-user');
  forgetRecovery(store, payload.key);
  assert.equal(recoveryPayments(store).length, 0);
});
test('storage failure must never erase an uncertain payment', async () => {
  const { archivePayment } = await import('../web/payment-store.js');
  const store = storage();
  store.setItem = () => { throw new Error('storage full'); };
  assert.throws(() => archivePayment(store, payload, 'original-user'));
  assert.equal(store.getItem('pos-pending'), JSON.stringify(payload));
});
test('an unresponsive bridge times out and a late reply cannot change the result', async () => {
  const { withDeadline } = await import('../web/payment-store.js');
  let reply;
  const request = new Promise((resolve) => { reply = resolve; });
  await assert.rejects(withDeadline(request, 5), { code: 'POS_TIMEOUT' });
  reply({ status: 'PAID' });
});
