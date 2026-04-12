const User = require('../../models/User');
const Listing = require('../../models/Listing');
const Inquiry = require('../../models/Inquiry');
const Report = require('../../models/Report');
const Review = require('../../models/Review');
const AuditLog = require('../../models/AuditLog');
const Setting = require('../../models/Setting');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');

exports.getPlatformStats = asyncHandler(async (_req, res) => {
  const [users, listings, pendingListings, publishedListings, inquiries, reports, reviews] = await Promise.all([
    User.countDocuments(),
    Listing.countDocuments(),
    Listing.countDocuments({ status: 'pending' }),
    Listing.countDocuments({ status: 'published' }),
    Inquiry.countDocuments(),
    Report.countDocuments({ status: { $ne: 'resolved' } }),
    Review.countDocuments({ status: 'pending' }),
  ]);

  res.json({ success: true, data: { users, listings, pendingListings, publishedListings, inquiries, reports, reviews } });
});

exports.getUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.status) filter.status = req.query.status;

  const users = await User.find(filter).select('-password').sort({ createdAt: -1 }).limit(200);
  res.json({ success: true, data: users });
});

exports.updateUserRole = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');

  if (req.body.role) user.role = req.body.role;
  if (req.body.status) user.status = req.body.status;
  await user.save();

  await AuditLog.create({
    actor: req.user._id,
    action: 'admin.user.update',
    entityType: 'User',
    entityId: user._id,
    meta: { role: user.role, status: user.status },
  });

  res.json({ success: true, message: 'User updated', data: user });
});

exports.getListingsForAdmin = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;

  const listings = await Listing.find(filter)
    .populate('owner', 'firstName lastName email')
    .populate('assignedAgent', 'firstName lastName email')
    .sort({ createdAt: -1 })
    .limit(200);

  res.json({ success: true, data: listings });
});

exports.assignAgent = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new ApiError(404, 'Listing not found');

  const agent = await User.findById(req.body.agentId);
  if (!agent || !['agent', 'admin', 'super-admin'].includes(agent.role)) throw new ApiError(400, 'Valid agent not found');

  listing.assignedAgent = agent._id;
  await listing.save();

  await AuditLog.create({
    actor: req.user._id,
    action: 'admin.listing.assign-agent',
    entityType: 'Listing',
    entityId: listing._id,
    meta: { agentId: agent._id.toString() },
  });

  res.json({ success: true, message: 'Agent assigned successfully', data: listing });
});

exports.getAuditLogs = asyncHandler(async (_req, res) => {
  const logs = await AuditLog.find().populate('actor', 'firstName lastName email').sort({ createdAt: -1 }).limit(100);
  res.json({ success: true, data: logs });
});

exports.getSettings = asyncHandler(async (_req, res) => {
  const settings = await Setting.find().sort({ key: 1 });
  res.json({ success: true, data: settings });
});

exports.upsertSetting = asyncHandler(async (req, res) => {
  if (!req.body.key) throw new ApiError(400, 'Setting key is required');
  const setting = await Setting.findOneAndUpdate(
    { key: req.body.key },
    { value: req.body.value },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  await AuditLog.create({
    actor: req.user._id,
    action: 'admin.setting.upsert',
    entityType: 'Setting',
    entityId: setting._id,
    meta: { key: setting.key },
  });

  res.json({ success: true, message: 'Setting saved', data: setting });
});
