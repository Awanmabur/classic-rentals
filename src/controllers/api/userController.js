const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const AuditLog = require('../../models/AuditLog');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { uploadManyToCloudinary, deleteManyFromCloudinary } = require('../../services/mediaService');

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
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

exports.getProfile = asyncHandler(async (req, res) => {
  res.json({ success: true, data: sanitizeUser(req.user) });
});

exports.updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, 'User not found');

  const fields = ['firstName', 'lastName', 'phone'];
  fields.forEach((field) => {
    if (typeof req.body[field] !== 'undefined') user[field] = String(req.body[field]).trim();
  });

  if (req.body.email && req.body.email !== user.email) {
    const exists = await User.findOne({ email: String(req.body.email).toLowerCase(), _id: { $ne: user._id } });
    if (exists) throw new ApiError(409, 'Email already in use');
    user.email = String(req.body.email).toLowerCase().trim();
  }

  if (req.files?.length) {
    const upload = (await uploadManyToCloudinary(req.files.slice(0, 1), `jubarentals/avatars/${user._id}`))[0];
    if (user.avatar?.publicId) await deleteManyFromCloudinary([user.avatar.publicId]);
    user.avatar = { url: upload.secure_url, publicId: upload.public_id };
  }

  await user.save();
  await AuditLog.create({
    actor: user._id,
    action: 'user.profile.update',
    entityType: 'User',
    entityId: user._id,
    meta: { email: user.email },
  });

  res.json({ success: true, message: 'Profile updated successfully', data: sanitizeUser(user) });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) throw new ApiError(400, 'currentPassword and newPassword are required');
  if (String(newPassword).length < 8) throw new ApiError(400, 'New password must be at least 8 characters');

  const user = await User.findById(req.user._id).select('+password');
  if (!user) throw new ApiError(404, 'User not found');

  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) throw new ApiError(400, 'Current password is incorrect');

  user.password = newPassword;
  user.refreshTokenVersion = (user.refreshTokenVersion || 0) + 1;
  await user.save();

  await AuditLog.create({
    actor: user._id,
    action: 'user.password.change',
    entityType: 'User',
    entityId: user._id,
    meta: null,
  });

  res.json({ success: true, message: 'Password changed successfully. Please log in again.' });
});
