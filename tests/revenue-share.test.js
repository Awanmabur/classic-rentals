const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateFeeSplit,
  getPostingFeeSnapshot,
} = require('../src/services/revenueShareService');

test('fee split gives platform 15 percent when no promoter is involved', () => {
  const split = calculateFeeSplit({ amount: 10000, currency: 'UGX', recipient: 'agent-id' });
  assert.equal(split.platformAmount, 1500);
  assert.equal(split.promoterAmount, 0);
  assert.equal(split.recipientAmount, 8500);
});

test('fee split gives platform 10 percent and promoter 5 percent when promoted', () => {
  const split = calculateFeeSplit({ amount: 10000, currency: 'UGX', recipient: 'agent-id', promoter: 'promoter-id' });
  assert.equal(split.platformAmount, 1000);
  assert.equal(split.promoterAmount, 500);
  assert.equal(split.recipientAmount, 8500);
});

test('landlord posting policy defaults to 10000 UGX for normal users', () => {
  const snapshot = getPostingFeeSnapshot({ role: 'user' });
  assert.equal(snapshot.postingFeeRequired, true);
  assert.equal(snapshot.postingFeeAmount, 10000);
  assert.equal(snapshot.postingFeeCurrency, 'UGX');
  assert.equal(snapshot.postingFeeStatus, 'pending');
});
