const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getContactAccessPolicy,
  parseContactAccessTokens,
  serializeContactAccessTokens,
  sanitizeListingContacts,
} = require('../src/services/contactAccessService');

test('contact access defaults to a paid unlock', () => {
  const policy = getContactAccessPolicy({ price: { currency: 'USD' }, monetization: {} });
  assert.equal(policy.mode, 'paid');
  assert.equal(policy.requiresPayment, true);
  assert.equal(policy.fee.amount, 5);
  assert.equal(policy.fee.currency, 'USD');
});

test('open lead access does not require payment', () => {
  const policy = getContactAccessPolicy({ monetization: { leadAccess: 'open', contactFeeAmount: 10 } });
  assert.equal(policy.mode, 'open');
  assert.equal(policy.requiresPayment, false);
});

test('sanitizeListingContacts removes public phone and email fields', () => {
  const listing = sanitizeListingContacts({
    title: 'Demo listing',
    owner: { firstName: 'Land', lastName: 'Lord', email: 'owner@example.com', phone: '+211900000001' },
    assignedAgent: { firstName: 'Field', lastName: 'Agent', email: 'agent@example.com', phone: '+211900000002' },
  });
  assert.equal(listing.owner.email, undefined);
  assert.equal(listing.owner.phone, undefined);
  assert.equal(listing.assignedAgent.email, undefined);
  assert.equal(listing.assignedAgent.phone, undefined);
});

test('contact access cookies keep unique paid guest references', () => {
  const serialized = serializeContactAccessTokens(['INQ-1', 'INQ-1', ' INQ-2 ']);
  assert.deepEqual(parseContactAccessTokens(serialized), ['INQ-1', 'INQ-2']);
});
