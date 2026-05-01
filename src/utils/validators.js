const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.normalizeEmail = (value = '') => String(value).trim().toLowerCase();
exports.validateEmail = (value = '') => EMAIL_RE.test(String(value).trim());
exports.validatePassword = (value = '') => {
  const password = String(value);
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include at least one number.';
  return null;
};

exports.validateRegistrationPayload = (body = {}) => {
  const errors = {};
  const firstName = String(body.firstName || '').trim();
  const lastName = String(body.lastName || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const confirmPassword = String(body.confirmPassword || '');
  const role = 'agent';
  if (firstName.length < 2) errors.firstName = 'First name must be at least 2 characters.';
  if (lastName.length < 2) errors.lastName = 'Last name must be at least 2 characters.';
  if (!exports.validateEmail(email)) errors.email = 'Enter a valid email address.';
  if (role !== 'agent') errors.role = 'Only agent signup is available.';
  const passwordError = exports.validatePassword(password);
  if (passwordError) errors.password = passwordError;
  if (confirmPassword && password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';
  return { ok: Object.keys(errors).length === 0, errors };
};

exports.validateLoginPayload = (body = {}) => {
  const errors = {};
  if (!exports.validateEmail(body.email || '')) errors.email = 'Enter a valid email address.';
  if (!String(body.password || '')) errors.password = 'Password is required.';
  return { ok: Object.keys(errors).length === 0, errors };
};

exports.validateListingPayload = (body = {}) => {
  const errors = {};
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const area = String(body.area || '').trim();
  const category = String(body.category || '').trim();
  const amount = Number(body.priceAmount);
  if (title.length < 6) errors.title = 'Title must be at least 6 characters.';
  if (description.length < 20) errors.description = 'Description must be at least 20 characters.';
  if (!area) errors.area = 'Area is required.';
  if (!category) errors.category = 'Category is required.';
  if (!Number.isFinite(amount) || amount < 0) errors.priceAmount = 'Price amount must be a valid number.';
  if (body.latitude && !Number.isFinite(Number(body.latitude))) errors.latitude = 'Latitude must be a valid number.';
  if (body.longitude && !Number.isFinite(Number(body.longitude))) errors.longitude = 'Longitude must be a valid number.';
  return { ok: Object.keys(errors).length === 0, errors };
};
