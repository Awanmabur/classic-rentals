const crypto = require('crypto');
const User = require('../../models/User');
const AuditLog = require('../../models/AuditLog');
const PasswordResetToken = require('../../models/PasswordResetToken');
const EmailVerificationToken = require('../../models/EmailVerificationToken');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { signAccessToken, setAuthCookie, clearAuthCookie } = require('../../utils/jwt');
const { sendMail } = require('../../services/mailerService');
const { renderVerificationEmail, renderPasswordResetEmail } = require('../../services/emailTemplateService');

function sanitizeUser(user) {
  return {
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    avatar: user.avatar,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
  };
}

function makeTokenPair() {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

async function issueEmailVerification(user) {
  await EmailVerificationToken.deleteMany({ user: user._id, usedAt: null });
  const { token, tokenHash } = makeTokenPair();
  await EmailVerificationToken.create({
    user: user._id,
    tokenHash,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
  });

  const appUrl = process.env.APP_URL || 'http://localhost:4000';
  const link = `${appUrl}/api/auth/verify-email/${token}`;
  const mail = renderVerificationEmail({ name: user.firstName, verifyUrl: link });
  await sendMail({ to: user.email, ...mail });
  return link;
}

exports.register = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phone, password } = req.body;
  if (!firstName || !lastName || !email || !password) {
    throw new ApiError(400, 'firstName, lastName, email, and password are required');
  }

  const exists = await User.findOne({ email: String(email).toLowerCase() });
  if (exists) throw new ApiError(409, 'Email already in use');

  const user = await User.create({
    firstName,
    lastName,
    email,
    phone,
    password,
    role: 'user',
  });

  const token = signAccessToken(user);
  setAuthCookie(res, token);
  const verificationLink = await issueEmailVerification(user);

  await AuditLog.create({
    actor: user._id,
    action: 'auth.register',
    entityType: 'User',
    entityId: user._id,
    meta: { email: user.email },
  });

  res.status(201).json({
    success: true,
    message: 'Account created successfully',
    data: sanitizeUser(user),
    meta: process.env.NODE_ENV === 'production' ? undefined : { verificationLink },
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+password');
  if (!user) throw new ApiError(401, 'Invalid credentials');
  if (user.status !== 'active') throw new ApiError(403, 'Account is not active');

  const ok = await user.comparePassword(password);
  if (!ok) throw new ApiError(401, 'Invalid credentials');

  user.lastLoginAt = new Date();
  await user.save();

  const token = signAccessToken(user);
  setAuthCookie(res, token);

  await AuditLog.create({
    actor: user._id,
    action: 'auth.login',
    entityType: 'User',
    entityId: user._id,
    meta: { email: user.email },
  });

  res.json({ success: true, message: 'Logged in successfully', data: sanitizeUser(user) });
});

exports.logout = asyncHandler(async (req, res) => {
  clearAuthCookie(res);
  if (req.user) {
    await AuditLog.create({ actor: req.user._id, action: 'auth.logout', entityType: 'User', entityId: req.user._id, meta: null });
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

exports.me = asyncHandler(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'Not authenticated');
  res.json({ success: true, data: sanitizeUser(req.user) });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  if (!email) throw new ApiError(400, 'Email is required');

  const user = await User.findOne({ email });
  if (user) {
    await PasswordResetToken.deleteMany({ user: user._id, usedAt: null });
    const { token, tokenHash } = makeTokenPair();
    await PasswordResetToken.create({
      user: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + 1000 * 60 * 30),
    });
    const appUrl = process.env.APP_URL || 'http://localhost:4000';
    const link = `${appUrl}/auth/reset-password/${token}`;
    const mail = renderPasswordResetEmail({ name: user.firstName, resetUrl: link });
    await sendMail({ to: user.email, ...mail });
    await AuditLog.create({ actor: user._id, action: 'auth.password.reset.request', entityType: 'User', entityId: user._id, meta: null });
    if (req.accepts('html')) return res.redirect('/auth/forgot-password?sent=1');
    return res.json({ success: true, message: 'If the email exists, a reset link has been sent.', meta: process.env.NODE_ENV === 'production' ? undefined : { resetLink: link } });
  }

  if (req.accepts('html')) return res.redirect('/auth/forgot-password?sent=1');
  res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password, confirmPassword } = req.body;
  if (!token) throw new ApiError(400, 'Token is required');
  if (!password || String(password).length < 8) throw new ApiError(400, 'Password must be at least 8 characters');
  if (password !== confirmPassword) throw new ApiError(400, 'Passwords do not match');

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const reset = await PasswordResetToken.findOne({ tokenHash, usedAt: null, expiresAt: { $gt: new Date() } });
  if (!reset) throw new ApiError(400, 'Reset token is invalid or expired');

  const user = await User.findById(reset.user).select('+password');
  if (!user) throw new ApiError(404, 'User not found');

  user.password = password;
  user.refreshTokenVersion = (user.refreshTokenVersion || 0) + 1;
  await user.save();
  reset.usedAt = new Date();
  await reset.save();

  await AuditLog.create({ actor: user._id, action: 'auth.password.reset.complete', entityType: 'User', entityId: user._id, meta: null });
  if (req.accepts('html')) return res.redirect('/auth/reset-password/' + token + '?reset=1');
  res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
});

exports.verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const verification = await EmailVerificationToken.findOne({ tokenHash, usedAt: null, expiresAt: { $gt: new Date() } });
  if (!verification) throw new ApiError(400, 'Verification token is invalid or expired');

  const user = await User.findById(verification.user);
  if (!user) throw new ApiError(404, 'User not found');

  user.emailVerifiedAt = user.emailVerifiedAt || new Date();
  await user.save();
  verification.usedAt = new Date();
  await verification.save();

  await AuditLog.create({ actor: user._id, action: 'auth.email.verify', entityType: 'User', entityId: user._id, meta: null });

  if (req.accepts('html')) {
    return res.redirect('/auth/login?verified=1');
  }
  res.json({ success: true, message: 'Email verified successfully' });
});

exports.resendVerification = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, 'User not found');
  if (user.emailVerifiedAt) return res.json({ success: true, message: 'Email already verified' });

  const verificationLink = await issueEmailVerification(user);
  await AuditLog.create({ actor: user._id, action: 'auth.email.verify.resend', entityType: 'User', entityId: user._id, meta: null });
  res.json({ success: true, message: 'Verification email sent.', meta: process.env.NODE_ENV === 'production' ? undefined : { verificationLink } });
});
