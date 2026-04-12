const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePassword, validateListingPayload, validateRegistrationPayload } = require('../src/utils/validators');

test('validatePassword rejects weak passwords', () => {
  assert.equal(validatePassword('short'), 'Password must be at least 8 characters.');
  assert.equal(validatePassword('lowercase123'), 'Password must include at least one uppercase letter.');
});

test('validateRegistrationPayload returns field errors', () => {
  const result = validateRegistrationPayload({ firstName: 'J', lastName: '', email: 'bad', password: 'weak', confirmPassword: 'other' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.firstName);
  assert.ok(result.errors.lastName);
  assert.ok(result.errors.email);
  assert.ok(result.errors.password);
  assert.ok(result.errors.confirmPassword);
});

test('validateListingPayload requires core fields', () => {
  const result = validateListingPayload({ title: 'abc', description: 'too short', priceAmount: '-1' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.title);
  assert.ok(result.errors.description);
  assert.ok(result.errors.area);
  assert.ok(result.errors.category);
  assert.ok(result.errors.priceAmount);
});
