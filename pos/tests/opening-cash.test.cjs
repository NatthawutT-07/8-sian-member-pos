const test = require('node:test');
const assert = require('node:assert/strict');

test('opening cash sums the requested banknotes and coins in integer satang', async () => {
  const { cashDenominations, openingCashTotal } = await import('../web/opening-cash.js');
  assert.deepEqual(cashDenominations, [1000, 500, 100, 50, 10, 5, 2, 1]);
  assert.equal(openingCashTotal({}), 0);
  assert.equal(openingCashTotal({ 1000: '2', 500: '1', 100: '3', 50: '2', 10: '4', 5: '3', 2: '2', 1: '7' }), 296600);
  assert.equal(openingCashTotal({ 1000: '1000' }), 100000000);
  assert.equal(openingCashTotal({ 1000: '', 1: '3' }), 300);
});

test('opening cash rejects fractional, negative, nonnumeric and excessive counts', async () => {
  const { openingCashTotal } = await import('../web/opening-cash.js');
  for (const value of ['-1', '1.5', 'NaN', 'Infinity', '1e3', '9007199254740992'])
    assert.throws(() => openingCashTotal({ 1000: value }));
  assert.throws(() => openingCashTotal({ 1000: '1000', 1: '1' }));
});
