const crypto = require('crypto');
const User = require('../../models/User');
const AuditLog = require('../../models/AuditLog');
const PasswordResetToken = require('../../models/PasswordResetToken');
const EmailVerificationToken = require('../../models/EmailVerificationToken');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { signAccessToken, setAuthCookie, clearAuthCookie } = require('../../utils/jwt');
const { sendMail } = require('../../services/mailerService');
const { setFlash } = require('../../utils/flash');
const { normalizeEmail, validateEmail, validatePassword, validateRegistrationPayload, validateLoginPayload } = require('../../utils/validators');
const { renderVerificationEmail, renderPasswordResetEmail } = require('../../services/emailTemplateService');

function makeTokenPair() {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

function renderForm(res, view, title, extras = {}, status = 200) {
  return res.status(status).render(view, { title, formErrors: {}, old: {}, ...extras });
}

async function issueEmailVerification(user) {
  await EmailVerificationToken.deleteMany({ user: user._id, usedAt: null });
  const { token, tokenHash } = makeTokenPair();
  await EmailVerificationToken.create({ user: user._id, tokenHash, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) });
  const appUrl = process.env.APP_URL || 'http://localhost:4000';
  const verifyUrl = `${appUrl}/api/auth/verify-email/${token}`;
  const mail = renderVerificationEmail({ name: user.firstName, verifyUrl });
  await sendMail({ to: user.email, ...mail });
  return verifyUrl;
}

exports.showLogin = asyncHandler(async (req, res) => renderForm(res, 'pages/auth/login', 'Login', { verified: req.query.verified === '1' }));

exports.loginAction = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const validation = validateLoginPayload({ email, password });
  if (!validation.ok) {
    return res.status(422).render('pages/auth/login', { title: 'Login', verified: false, formErrors: validation.errors, old: { email } });
  }
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    return res.status(422).render('pages/auth/login', { title: 'Login', verified: false, formErrors: { email: 'Invalid credentials.', password: 'Invalid credentials.' }, old: { email } });
  }
  if (user.status !== 'active') {
    return res.status(403).render('pages/auth/login', { title: 'Login', verified: false, formErrors: { email: 'Your account is not active.' }, old: { email } });
  }
  user.lastLoginAt = new Date();
  await user.save();
  setAuthCookie(res, signAccessToken(user));
  await AuditLog.create({ actor: user._id, action: 'auth.login.web', entityType: 'User', entityId: user._id, meta: { email: user.email } });
  setFlash(res, 'success', `Welcome back, ${user.firstName}.`);
  return res.redirect('/dashboard');
});

exports.showRegister = asyncHandler(async (req, res) => renderForm(res, 'pages/auth/register', 'Create account'));

exports.registerAction = asyncHandler(async (req, res) => {
  const payload = {
    firstName: String(req.body.firstName || '').trim(),
    lastName: String(req.body.lastName || '').trim(),
    email: normalizeEmail(req.body.email),
    phone: String(req.body.phone || '').trim(),
    role: 'agent',
    password: String(req.body.password || ''),
    confirmPassword: String(req.body.confirmPassword || ''),
  };
  const validation = validateRegistrationPayload(payload);
  if (!validation.ok) {
    return res.status(422).render('pages/auth/register', { title: 'Create account', formErrors: validation.errors, old: { ...payload, password: '', confirmPassword: '' } });
  }
  const exists = await User.findOne({ email: payload.email });
  if (exists) {
    return res.status(409).render('pages/auth/register', { title: 'Create account', formErrors: { email: 'An account with that email already exists.' }, old: { ...payload, password: '', confirmPassword: '' } });
  }
  const user = await User.create({ firstName: payload.firstName, lastName: payload.lastName, email: payload.email, phone: payload.phone, password: payload.password, role: 'agent' });
  setAuthCookie(res, signAccessToken(user));
  await issueEmailVerification(user);
  await AuditLog.create({ actor: user._id, action: 'auth.register.web', entityType: 'User', entityId: user._id, meta: { email: user.email } });
  setFlash(res, 'success', 'Account created successfully. Check your email for verification.');
  return res.redirect('/dashboard');
});

exports.logoutAction = asyncHandler(async (req, res) => {
  clearAuthCookie(res);
  if (req.user) await AuditLog.create({ actor: req.user._id, action: 'auth.logout.web', entityType: 'User', entityId: req.user._id, meta: null });
  setFlash(res, 'success', 'You have been logged out.');
  return res.redirect('/');
});

exports.showForgotPassword = asyncHandler(async (req, res) => renderForm(res, 'pages/auth/forgot-password', 'Forgot password', { sent: req.query.sent === '1' }));

exports.forgotPasswordAction = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!validateEmail(email)) {
    return res.status(422).render('pages/auth/forgot-password', { title: 'Forgot password', sent: false, formErrors: { email: 'Enter a valid email address.' }, old: { email } });
  }
  const user = await User.findOne({ email });
  if (user) {
    await PasswordResetToken.deleteMany({ user: user._id, usedAt: null });
    const { token, tokenHash } = makeTokenPair();
    await PasswordResetToken.create({ user: user._id, tokenHash, expiresAt: new Date(Date.now() + 1000 * 60 * 30) });
    const appUrl = process.env.APP_URL || 'http://localhost:4000';
    const resetUrl = `${appUrl}/auth/reset-password/${token}`;
    const mail = renderPasswordResetEmail({ name: user.firstName, resetUrl });
    await sendMail({ to: user.email, ...mail });
    await AuditLog.create({ actor: user._id, action: 'auth.password.reset.request.web', entityType: 'User', entityId: user._id, meta: null });
  }
  setFlash(res, 'success', 'If the email exists, a reset link has been sent.');
  return res.redirect('/auth/forgot-password?sent=1');
});

exports.showResetPassword = asyncHandler(async (req, res) => {
  const token = req.params.token || '';
  let valid = false;
  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    valid = Boolean(await PasswordResetToken.exists({ tokenHash, usedAt: null, expiresAt: { $gt: new Date() } }));
  }
  return renderForm(res, 'pages/auth/reset-password', 'Reset password', { token, valid, reset: req.query.reset === '1' });
});

exports.resetPasswordAction = asyncHandler(async (req, res) => {
  const token = req.params.token || '';
  const password = String(req.body.password || '');
  const confirmPassword = String(req.body.confirmPassword || '');
  const formErrors = {};
  const passwordError = validatePassword(password);
  if (passwordError) formErrors.password = passwordError;
  if (password !== confirmPassword) formErrors.confirmPassword = 'Passwords do not match.';
  if (Object.keys(formErrors).length) {
    return res.status(422).render('pages/auth/reset-password', { title: 'Reset password', token, valid: true, reset: false, formErrors, old: {} });
  }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const reset = await PasswordResetToken.findOne({ tokenHash, usedAt: null, expiresAt: { $gt: new Date() } });
  if (!reset) {
    return res.status(400).render('pages/auth/reset-password', { title: 'Reset password', token, valid: false, reset: false, formErrors: { password: 'This reset link is invalid or expired.' }, old: {} });
  }
  const user = await User.findById(reset.user).select('+password');
  if (!user) throw new ApiError(404, 'User not found');
  user.password = password;
  user.refreshTokenVersion = (user.refreshTokenVersion || 0) + 1;
  await user.save();
  reset.usedAt = new Date();
  await reset.save();
  await AuditLog.create({ actor: user._id, action: 'auth.password.reset.complete.web', entityType: 'User', entityId: user._id, meta: null });
  setFlash(res, 'success', 'Password reset successfully. You can now log in.');
  return res.redirect(`/auth/reset-password/${token}?reset=1`);
});
