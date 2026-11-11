const test = require('node:test');
const assert = require('node:assert/strict');

test('table countdown reaches zero at expiry without freeing or closing the paid round', async () => {
  const { tableTiming } = await import('../web/table-time.js');
  const end = Date.parse('2026-11-11T12:00:00Z');
  const table = {
    sessionId: 'paid-round',
    orderingEnabled: true,
    qrExpiresAt: new Date(end).toISOString(),
  };
  const original = { ...table };
  assert.equal(tableTiming(table, end - 7200000).remaining, '02:00:00');
  assert.equal(tableTiming(table, end - 1).remaining, '00:00:01');
  for (const now of [end, end + 1000]) {
    assert.deepEqual(tableTiming(table, now), {
      state: 'expired',
      label: 'หมดเวลา • รอปิดโต๊ะ',
      remaining: '00:00:00',
    });
    assert.deepEqual(table, original);
  }
  assert.equal(tableTiming({ ...table, sessionId: null }, end).state, 'vacant');
  assert.equal(
    tableTiming({ sessionId: 'paid-round', orderingEnabled: false }, end).state,
    'pending',
  );
  assert.equal(tableTiming({ ...table, qrExpiresAt: null }, end).state, 'expired');
});
