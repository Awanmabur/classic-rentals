const Listing = require('../../models/Listing');
const Inquiry = require('../../models/Inquiry');
const Favorite = require('../../models/Favorite');
const User = require('../../models/User');
const Report = require('../../models/Report');
const Review = require('../../models/Review');
const AuditLog = require('../../models/AuditLog');
const Setting = require('../../models/Setting');
const Plan = require('../../models/Plan');
const Subscription = require('../../models/Subscription');
const bcrypt = require('bcryptjs');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { getPagination } = require('../../utils/pagination');
const { setFlash } = require('../../utils/flash');

function render(req, res, view, title, extras = {}) {
  return res.render(view, { title, currentPath: req.originalUrl, ...extras });
}

function pagify(total, page, limit) {
  return { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

function redirectBack(req, fallback) {
  return req.get('referer') || fallback;
}

function percent(part, whole) {
  if (!whole) return 0;
  return Math.round((Number(part || 0) / Number(whole || 1)) * 100);
}

function formatMoney(amount, currency = 'USD') {
  const value = Number(amount || 0);
  return `${currency} ${value.toLocaleString()}`;
}

function buildDashboardNav(role) {
  const items = [
    { label: 'Dashboard', path: '/dashboard', icon: '⌂' },
    { label: 'Analytics', path: '/dashboard/analytics', icon: '◔' },
    { label: 'Listings', path: '/dashboard/manage-listings', icon: '▣' },
    { label: 'Inquiries', path: '/dashboard/inquiries', icon: '✉' },
    { label: 'Reviews', path: '/dashboard/reviews', icon: '★' },
    { label: 'Profile', path: '/dashboard/profile', icon: '☺' },
  ];

  if (role === 'user') items.push({ label: 'Favorites', path: '/dashboard/favorites', icon: '♥' });
  if (['agent', 'admin', 'super-admin'].includes(role)) items.push({ label: 'Create Listing', path: '/listings/create', icon: '＋' });
  if (['admin', 'super-admin'].includes(role)) {
    items.push({ label: 'Users', path: '/dashboard/users', icon: '◉' });
    items.push({ label: 'Reports', path: '/dashboard/reports', icon: '⚑' });
    items.push({ label: 'Billing', path: '/dashboard/billing', icon: '🧾' });
    items.push({ label: 'Audit Logs', path: '/dashboard/audit-logs', icon: '☰' });
    items.push({ label: 'Settings', path: '/dashboard/settings', icon: '⚙' });
  } else {
    items.push({ label: 'Reports', path: '/dashboard/reports', icon: '⚑' });
    items.push({ label: 'Billing', path: '/dashboard/billing', icon: '🧾' });
  }

  items.push({ label: 'Browse Listings', path: '/listings', icon: '▤' });
  items.push({ label: 'Home', path: '/', icon: '↗' });
  return items;
}

exports.index = asyncHandler(async (req, res) => {
  const role = req.user.role;
  const adminView = ['admin', 'super-admin'].includes(role);
  const roleScope = adminView ? {} : role === 'agent' ? { $or: [{ owner: req.user._id }, { assignedAgent: req.user._id }] } : role === 'user' ? { owner: req.user._id } : {};
  const agentScope = role === 'agent' ? { assignedAgent: req.user._id } : {};
  const inquiryScope = role === 'user' ? { sender: req.user._id } : {};
  const reportScope = adminView ? {} : { reporter: req.user._id };
  const reviewScope = adminView ? {} : { user: req.user._id };
  const favoriteScope = adminView ? {} : { user: req.user._id };

  const agentListingIds = role === 'agent'
    ? await Listing.find({ assignedAgent: req.user._id }).distinct('_id')
    : [];

  const listingQueryForCards = adminView
    ? {}
    : role === 'agent'
      ? { $or: [{ owner: req.user._id }, { assignedAgent: req.user._id }] }
      : role === 'user'
        ? { owner: req.user._id }
        : {};

  const inquiryFilter = adminView
    ? {}
    : role === 'agent'
      ? { listing: { $in: agentListingIds } }
      : role === 'user'
        ? { sender: req.user._id }
        : {};

  const [
    totalListings,
    publishedListings,
    pendingListings,
    totalInquiries,
    newInquiries,
    totalFavorites,
    totalReports,
    openReports,
    totalUsers,
    activeUsers,
    totalReviews,
    publishedReviews,
    avgReviewStats,
    recentListings,
    recentInquiries,
    recentReviews,
    recentUsers,
    recentReports,
    recentLogs,
    categoryBreakdown,
    statusBreakdown,
    listingTimeline,
    inquiryTimeline,
    featuredCount,
    verifiedCount,
  ] = await Promise.all([
    Listing.countDocuments(listingQueryForCards),
    Listing.countDocuments({ ...listingQueryForCards, status: 'published' }),
    Listing.countDocuments({ ...listingQueryForCards, status: 'pending' }),
    Inquiry.countDocuments(inquiryFilter),
    Inquiry.countDocuments({ ...inquiryFilter, status: 'new' }),
    Favorite.countDocuments(favoriteScope),
    Report.countDocuments(reportScope),
    Report.countDocuments({ ...reportScope, status: { $in: ['open', 'reviewing'] } }),
    adminView ? User.countDocuments() : User.countDocuments({ _id: req.user._id }),
    adminView ? User.countDocuments({ status: 'active' }) : User.countDocuments({ _id: req.user._id, status: 'active' }),
    Review.countDocuments(reviewScope),
    Review.countDocuments({ ...reviewScope, status: 'published' }),
    Review.aggregate([
      { $match: reviewScope },
      { $group: { _id: null, average: { $avg: '$rating' } } },
    ]),
    Listing.find(listingQueryForCards).sort({ createdAt: -1 }).limit(6).lean(),
    Inquiry.find(inquiryFilter).populate('listing', 'title slug location').populate('sender', 'firstName lastName email').sort({ createdAt: -1 }).limit(6).lean(),
    Review.find(reviewScope).populate('listing', 'title slug').populate('user', 'firstName lastName').sort({ createdAt: -1 }).limit(6).lean(),
    adminView ? User.find().select('firstName lastName email role status createdAt').sort({ createdAt: -1 }).limit(6).lean() : [],
    Report.find(reportScope).populate('listing', 'title slug').populate('reporter', 'firstName lastName').sort({ createdAt: -1 }).limit(6).lean(),
    adminView ? AuditLog.find().populate('actor', 'firstName lastName').sort({ createdAt: -1 }).limit(6).lean() : [],
    Listing.aggregate([{ $match: listingQueryForCards }, { $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 5 }]),
    Listing.aggregate([{ $match: listingQueryForCards }, { $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }]),
    Listing.aggregate([{ $match: listingQueryForCards }, { $sort: { createdAt: -1 } }, { $limit: 30 }, { $project: { createdAt: 1 } }]),
    Inquiry.aggregate([{ $match: inquiryFilter }, { $sort: { createdAt: -1 } }, { $limit: 30 }, { $project: { createdAt: 1 } }]),
    Listing.countDocuments({ ...listingQueryForCards, featured: true }),
    Listing.countDocuments({ ...listingQueryForCards, verified: true }),
  ]);

  const avgRating = Number(avgReviewStats?.[0]?.average || 0).toFixed(1);
  const occupancy = percent(publishedListings, totalListings);
  const verificationRate = percent(verifiedCount, totalListings);
  const responsePressure = percent(newInquiries, totalInquiries);
  const reportRisk = percent(openReports, totalReports);

  const stats = {
    totalListings,
    publishedListings,
    pendingListings,
    totalInquiries,
    newInquiries,
    totalFavorites,
    totalReports,
    openReports,
    totalUsers,
    activeUsers,
    totalReviews,
    publishedReviews,
    featuredCount,
    verifiedCount,
    occupancy,
    verificationRate,
    responsePressure,
    reportRisk,
    avgRating,
    grossIncome: formatMoney(totalListings * 1250, 'USD'),
    collectedRent: formatMoney(publishedListings * 950, 'USD'),
    outstandingRent: formatMoney(Math.max(0, pendingListings * 350), 'USD'),
  };

  const cards = [
    {
      label: role === 'user' ? 'My listings' : 'Total listings',
      value: totalListings,
      delta: `${publishedListings} published`,
      bars: [28, 36, 22, 42, 34, 48, 30],
    },
    {
      label: 'Open inquiries',
      value: totalInquiries,
      delta: `${newInquiries} need follow-up`,
      bars: [18, 24, 20, 32, 26, 39, 28],
    },
    {
      label: adminView ? 'Active users' : 'Saved items',
      value: adminView ? activeUsers : totalFavorites,
      delta: adminView ? `${totalUsers} total accounts` : `${publishedReviews} published reviews`,
      bars: [12, 22, 18, 26, 30, 34, 24],
    },
    {
      label: 'Open reports',
      value: openReports,
      delta: `${totalReports} total reports`,
      bars: [10, 16, 14, 20, 18, 24, 19],
      warn: true,
    },
  ];

  const quickActions = [
    { label: 'Manage listings', path: '/dashboard/manage-listings' },
    { label: 'View analytics', path: '/dashboard/analytics' },
    { label: role === 'user' ? 'Edit profile' : 'Create listing', path: role === 'user' ? '/dashboard/profile' : '/listings/create' },
    { label: adminView ? 'Open users' : 'Open inquiries', path: adminView ? '/dashboard/users' : '/dashboard/inquiries' },
  ];

  return res.render('pages/dashboard/index', {
    title: 'Dashboard',
    stats,
    cards,
    quickActions,
    navItems: buildDashboardNav(role),
    recentListings,
    recentInquiries,
    recentReviews,
    recentUsers,
    recentReports,
    recentLogs,
    categoryBreakdown,
    statusBreakdown,
    listingTimeline,
    inquiryTimeline,
    adminView,
  });
});


exports.manageListings = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination({ page: req.query.page, limit: req.query.limit || 20 });
  const filter = ['admin', 'super-admin'].includes(req.user.role) ? {} : req.user.role === 'agent' ? { $or: [{ owner: req.user._id }, { assignedAgent: req.user._id }] } : { owner: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.q) filter.$or = [{ title: new RegExp(req.query.q, 'i') }, { 'location.area': new RegExp(req.query.q, 'i') }];

  const [listings, total, pendingCount, publishedCount, agents] = await Promise.all([
    Listing.find(filter).populate('owner assignedAgent', 'firstName lastName email').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Listing.countDocuments(filter),
    Listing.countDocuments({ ...filter, status: 'pending' }),
    Listing.countDocuments({ ...filter, status: 'published' }),
    ['admin', 'super-admin'].includes(req.user.role) ? User.find({ role: 'agent', status: 'active' }).select('firstName lastName email').sort({ firstName: 1 }).lean() : [],
  ]);

  return render(req, res, 'pages/dashboard/manage-listings', 'Manage listings', { listings, pendingCount, publishedCount, agents, filters: req.query, pagination: pagify(total, page, limit) });
});


exports.listingShow = asyncHandler(async (req, res) => {
  const baseFilter = ['admin', 'super-admin'].includes(req.user.role)
    ? {}
    : req.user.role === 'agent'
      ? { $or: [{ owner: req.user._id }, { assignedAgent: req.user._id }] }
      : { owner: req.user._id };
  const listing = await Listing.findOne({ ...baseFilter, _id: req.params.id })
    .populate('owner assignedAgent', 'firstName lastName email')
    .lean();
  if (!listing) throw new ApiError(404, 'Listing not found');
  const agents = ['admin', 'super-admin'].includes(req.user.role)
    ? await User.find({ role: 'agent', status: 'active' }).select('firstName lastName email').sort({ firstName: 1 }).lean()
    : [];
  return render(req, res, 'pages/dashboard/listing-show', 'Listing details', { listing, agents });
});

exports.inquiries = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination({ page: req.query.page, limit: req.query.limit || 20 });
  let filter = {};
  if (req.user.role === 'agent') {
    const agentListingIds = await Listing.find({ assignedAgent: req.user._id }).distinct('_id');
    filter.listing = { $in: agentListingIds };
  }
  if (req.user.role === 'user') filter.sender = req.user._id;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) {
    const q = new RegExp(req.query.q, 'i');
    filter.$or = [{ name: q }, { email: q }, { message: q }];
  }

  const [inquiries, total] = await Promise.all([
    Inquiry.find(filter).populate('listing', 'title slug').populate('sender', 'firstName lastName email').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Inquiry.countDocuments(filter),
  ]);

  return render(req, res, 'pages/dashboard/inquiries', 'Inquiries', { inquiries, filters: req.query, pagination: pagify(total, page, limit) });
});

exports.reports = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination({ page: req.query.page, limit: req.query.limit || 20 });
  const adminView = ['admin', 'super-admin'].includes(req.user.role);
  const filter = adminView ? {} : { reporter: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.reason) filter.reason = req.query.reason;
  if (req.query.q) {
    const q = new RegExp(req.query.q, 'i');
    filter.$or = [{ details: q }];
  }

  const [reports, total] = await Promise.all([
    Report.find(filter).populate('listing', 'title slug').populate('reporter', 'firstName lastName email').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Report.countDocuments(filter),
  ]);
  return render(req, res, 'pages/dashboard/reports', 'Reports', { reports, adminView, filters: req.query, pagination: pagify(total, page, limit) });
});

exports.users = asyncHandler(async (req, res) => {
  if (!['admin', 'super-admin'].includes(req.user.role)) throw new ApiError(403, 'Forbidden');
  const { page, limit, skip } = getPagination({ page: req.query.page, limit: req.query.limit || 20 });
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) filter.$or = [{ firstName: new RegExp(req.query.q, 'i') }, { lastName: new RegExp(req.query.q, 'i') }, { email: new RegExp(req.query.q, 'i') }];
  const [users, total] = await Promise.all([
    User.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  return render(req, res, 'pages/dashboard/users', 'Users', { users, filters: req.query, pagination: pagify(total, page, limit) });
});

exports.settings = asyncHandler(async (req, res) => {
  if (!['admin', 'super-admin'].includes(req.user.role)) throw new ApiError(403, 'Forbidden');
  const [settings, activePlans, totalSubscriptions, paidSubscriptions, settingCount] = await Promise.all([
    Setting.find().sort({ key: 1 }).lean(),
    Plan.countDocuments({ isActive: true }),
    Subscription.countDocuments(),
    Subscription.countDocuments({ 'payment.status': 'paid' }),
    Setting.countDocuments(),
  ]);
  return render(req, res, 'pages/dashboard/settings', 'Settings', {
    settings,
    settingsSummary: { activePlans, totalSubscriptions, paidSubscriptions, settingCount }
  });
});

exports.auditLogs = asyncHandler(async (req, res) => {
  if (!['admin', 'super-admin'].includes(req.user.role)) throw new ApiError(403, 'Forbidden');
  const { page, limit, skip } = getPagination({ page: req.query.page, limit: req.query.limit || 30 });
  const filter = {};
  if (req.query.action) filter.action = new RegExp(req.query.action, 'i');
  if (req.query.entityType) filter.entityType = req.query.entityType;
  if (req.query.q) {
    const q = new RegExp(req.query.q, 'i');
    filter.$or = [{ action: q }, { entityType: q }];
  }
  const [logs, total] = await Promise.all([
    AuditLog.find(filter).populate('actor', 'firstName lastName email').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return render(req, res, 'pages/dashboard/audit-logs', 'Audit logs', { logs, filters: req.query, pagination: pagify(total, page, limit) });
});

exports.favorites = asyncHandler(async (req, res) => {
  const favorites = await Favorite.find({ user: req.user._id }).populate({ path: 'listing', populate: { path: 'owner', select: 'firstName lastName' } }).sort({ createdAt: -1 }).lean();
  return render(req, res, 'pages/dashboard/favorites', 'Favorites', { favorites });
});

exports.profile = asyncHandler(async (req, res) => {
  const myListings = await Listing.countDocuments({ owner: req.user._id });
  const saved = await Favorite.countDocuments({ user: req.user._id });
  const inquiries = await Inquiry.countDocuments({ sender: req.user._id });
  return render(req, res, 'pages/dashboard/profile', 'Profile', { summary: { myListings, saved, inquiries } });
});

exports.reviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination({ page: req.query.page, limit: req.query.limit || 20 });
  const adminView = ['admin', 'super-admin'].includes(req.user.role);
  const filter = adminView ? {} : { user: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.rating) filter.rating = Number(req.query.rating);
  if (req.query.q) filter.comment = new RegExp(req.query.q, 'i');
  const [reviews, total] = await Promise.all([
    Review.find(filter).populate('listing', 'title slug').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Review.countDocuments(filter),
  ]);
  return render(req, res, 'pages/dashboard/reviews', 'Reviews', { reviews, adminView, filters: req.query, pagination: pagify(total, page, limit) });
});


exports.inquiryShow = asyncHandler(async (req, res) => {
  const inquiry = await Inquiry.findById(req.params.id).populate('listing', 'title slug status assignedAgent owner').populate('sender', 'firstName lastName email phone').lean();
  if (!inquiry) throw new ApiError(404, 'Inquiry not found');
  if (!['admin', 'super-admin'].includes(req.user.role)) {
    const permitted = (req.user.role === 'user' && inquiry.sender && String(inquiry.sender._id) === String(req.user._id))
      || (req.user.role === 'agent' && inquiry.listing && inquiry.listing.assignedAgent && String(inquiry.listing.assignedAgent) === String(req.user._id));
    if (!permitted) throw new ApiError(403, 'Forbidden');
  }
  return render(req, res, 'pages/dashboard/inquiry-show', 'Inquiry details', { inquiry });
});

exports.reportShow = asyncHandler(async (req, res) => {
  const report = await Report.findById(req.params.id)
    .populate({ path: 'listing', populate: [{ path: 'owner', select: 'firstName lastName email' }, { path: 'assignedAgent', select: 'firstName lastName email' }] })
    .populate('reporter', 'firstName lastName email')
    .populate('resolvedBy', 'firstName lastName email')
    .lean();
  if (!report) throw new ApiError(404, 'Report not found');
  if (!['admin', 'super-admin'].includes(req.user.role) && String(report.reporter?._id || '') !== String(req.user._id)) throw new ApiError(403, 'Forbidden');
  return render(req, res, 'pages/dashboard/report-show', 'Report details', { report, adminView: ['admin', 'super-admin'].includes(req.user.role) });
});

exports.reviewShow = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id).populate('listing', 'title slug').populate('user', 'firstName lastName email').lean();
  if (!review) throw new ApiError(404, 'Review not found');
  if (!['admin', 'super-admin'].includes(req.user.role) && String(review.user?._id || '') !== String(req.user._id)) throw new ApiError(403, 'Forbidden');
  return render(req, res, 'pages/dashboard/review-show', 'Review details', { review, adminView: ['admin', 'super-admin'].includes(req.user.role) });
});

exports.userShow = asyncHandler(async (req, res) => {
  if (!['admin', 'super-admin'].includes(req.user.role)) throw new ApiError(403, 'Forbidden');
  const user = await User.findById(req.params.id).select('-password').lean();
  if (!user) throw new ApiError(404, 'User not found');
  const [listingCount, inquiryCount, favoriteCount, reviewCount] = await Promise.all([
    Listing.countDocuments({ owner: user._id }),
    Inquiry.countDocuments({ sender: user._id }),
    Favorite.countDocuments({ user: user._id }),
    Review.countDocuments({ user: user._id }),
  ]);
  return render(req, res, 'pages/dashboard/user-show', 'User details', { user, stats: { listingCount, inquiryCount, favoriteCount, reviewCount } });
});


exports.analytics = asyncHandler(async (req, res) => {
  const adminView = ['admin', 'super-admin'].includes(req.user.role);
  const scopeFilter = adminView ? {} : req.user.role === 'agent' ? { $or: [{ owner: req.user._id }, { assignedAgent: req.user._id }] } : { owner: req.user._id };
  const [totalListings, publishedListings, pendingListings, totalInquiries, totalFavorites, categories, recentListings] = await Promise.all([
    Listing.countDocuments(scopeFilter),
    Listing.countDocuments({ ...scopeFilter, status: 'published' }),
    Listing.countDocuments({ ...scopeFilter, status: 'pending' }),
    adminView ? Inquiry.countDocuments() : req.user.role === 'user' ? Inquiry.countDocuments({ sender: req.user._id }) : Inquiry.countDocuments({}),
    Favorite.countDocuments(adminView ? {} : { user: req.user._id }),
    Listing.aggregate([{ $match: scopeFilter }, { $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }]),
    Listing.find(scopeFilter).sort({ createdAt: -1 }).limit(12).lean(),
  ]);
  const timelineMap = {};
  for (const item of recentListings) {
    const d = new Date(item.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    timelineMap[key] = (timelineMap[key] || 0) + 1;
  }
  const timeline = Object.entries(timelineMap).sort((a,b)=>a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count }));
  return render(req, res, 'pages/dashboard/analytics', 'Analytics', { totals: { totalListings, publishedListings, pendingListings, totalInquiries, totalFavorites }, categories, timeline, adminView });
});

exports.bulkListingAction = asyncHandler(async (req, res) => {
  if (!['admin', 'super-admin'].includes(req.user.role)) throw new ApiError(403, 'Forbidden');
  const ids = Array.isArray(req.body.listingIds) ? req.body.listingIds : [req.body.listingIds].filter(Boolean);
  if (!ids.length) {
    setFlash(res, 'error', 'Select at least one listing.');
    return res.redirect(redirectBack(req, '/dashboard/manage-listings'));
  }
  const action = String(req.body.action || '');
  const patch = {};
  if (action === 'publish') patch.status = 'published';
  else if (action === 'reject') patch.status = 'rejected';
  else if (action === 'archive') patch.status = 'archived';
  else if (action === 'feature') patch.featured = true;
  else if (action === 'unfeature') patch.featured = false;
  else if (action === 'verify') patch.verified = true;
  else if (action === 'unverify') patch.verified = false;
  else {
    setFlash(res, 'error', 'Invalid bulk action.');
    return res.redirect(redirectBack(req, '/dashboard/manage-listings'));
  }
  if (patch.status === 'published') patch.publishedAt = new Date();
  await Listing.updateMany({ _id: { $in: ids } }, { $set: patch });
  await AuditLog.create({ actor: req.user._id, action: 'dashboard.listing.bulk', entityType: 'Listing', entityId: ids[0], meta: { action, count: ids.length } });
  setFlash(res, 'success', `Bulk action applied to ${ids.length} listing(s).`);
  return res.redirect(redirectBack(req, '/dashboard/manage-listings'));
});

exports.updateProfileAction = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, 'User not found');

  ['firstName', 'lastName', 'phone'].forEach((field) => {
    if (typeof req.body[field] !== 'undefined') user[field] = String(req.body[field]).trim();
  });

  if (req.body.email && req.body.email !== user.email) {
    const exists = await User.findOne({ email: String(req.body.email).toLowerCase().trim(), _id: { $ne: user._id } });
    if (exists) {
      setFlash(res, 'error', 'That email is already in use by another account.');
      return res.redirect('/dashboard/profile');
    }
    user.email = String(req.body.email).toLowerCase().trim();
  }

  await user.save();
  await AuditLog.create({ actor: user._id, action: 'dashboard.profile.update', entityType: 'User', entityId: user._id, meta: { email: user.email } });
  setFlash(res, 'success', 'Profile updated successfully.');
  return res.redirect('/dashboard/profile');
});

exports.changePasswordAction = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  if (!currentPassword || !newPassword) {
    setFlash(res, 'error', 'Current password and new password are required.');
    return res.redirect('/dashboard/profile');
  }
  if (newPassword.length < 8) {
    setFlash(res, 'error', 'New password must be at least 8 characters.');
    return res.redirect('/dashboard/profile');
  }
  if (confirmPassword !== undefined && newPassword !== confirmPassword) {
    setFlash(res, 'error', 'New password and confirmation do not match.');
    return res.redirect('/dashboard/profile');
  }

  const user = await User.findById(req.user._id).select('+password');
  if (!user) throw new ApiError(404, 'User not found');
  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) {
    setFlash(res, 'error', 'Current password is incorrect.');
    return res.redirect('/dashboard/profile');
  }

  user.password = newPassword;
  user.refreshTokenVersion = (user.refreshTokenVersion || 0) + 1;
  await user.save();
  await AuditLog.create({ actor: user._id, action: 'dashboard.profile.password-change', entityType: 'User', entityId: user._id, meta: null });
  setFlash(res, 'success', 'Password changed successfully. Please sign in again on your next login.');
  return res.redirect('/dashboard/profile');
});

exports.moderateListingAction = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new ApiError(404, 'Listing not found');
  if (!['admin', 'super-admin'].includes(req.user.role)) throw new ApiError(403, 'Forbidden');
  if (req.body.status) listing.status = req.body.status;
  if (typeof req.body.verified !== 'undefined') listing.verified = req.body.verified === 'true';
  if (typeof req.body.featured !== 'undefined') listing.featured = req.body.featured === 'true';
  if (listing.status === 'published' && !listing.publishedAt) listing.publishedAt = new Date();
  await listing.save();
  await AuditLog.create({ actor: req.user._id, action: 'dashboard.listing.moderate', entityType: 'Listing', entityId: listing._id, meta: { status: listing.status, verified: listing.verified, featured: listing.featured } });
  setFlash(res, 'success', 'Listing moderation saved.');
  res.redirect(redirectBack(req, '/dashboard/manage-listings'));
});

exports.assignAgentAction = asyncHandler(async (req, res) => {
  if (!['admin', 'super-admin'].includes(req.user.role)) throw new ApiError(403, 'Forbidden');
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new ApiError(404, 'Listing not found');
  listing.assignedAgent = req.body.agentId || undefined;
  await listing.save();
  await AuditLog.create({ actor: req.user._id, action: 'dashboard.listing.assign-agent', entityType: 'Listing', entityId: listing._id, meta: { agentId: req.body.agentId || null } });
  setFlash(res, 'success', req.body.agentId ? 'Agent assigned successfully.' : 'Agent unassigned successfully.');
  res.redirect(redirectBack(req, '/dashboard/manage-listings'));
});

exports.updateInquiryStatusAction = asyncHandler(async (req, res) => {
  const inquiry = await Inquiry.findById(req.params.id);
  if (!inquiry) throw new ApiError(404, 'Inquiry not found');
  if (!['admin', 'super-admin'].includes(req.user.role)) {
    const ownedListing = await Listing.exists({ _id: inquiry.listing, assignedAgent: req.user._id });
    if (!(ownedListing || String(inquiry.sender) === String(req.user._id))) throw new ApiError(403, 'Forbidden');
  }
  inquiry.status = req.body.status || inquiry.status;
  await inquiry.save();
  await AuditLog.create({ actor: req.user._id, action: 'dashboard.inquiry.update', entityType: 'Inquiry', entityId: inquiry._id, meta: { status: inquiry.status } });
  setFlash(res, 'success', 'Inquiry status updated.');
  res.redirect(redirectBack(req, '/dashboard/inquiries'));
});

exports.resolveReportAction = asyncHandler(async (req, res) => {
  if (!['admin', 'super-admin'].includes(req.user.role)) throw new ApiError(403, 'Forbidden');
  const report = await Report.findById(req.params.id);
  if (!report) throw new ApiError(404, 'Report not found');
  report.status = req.body.status || 'resolved';
  report.resolutionNote = req.body.resolutionNote || '';
  report.resolvedBy = req.user._id;
  report.resolvedAt = new Date();
  await report.save();
  await AuditLog.create({ actor: req.user._id, action: 'dashboard.report.resolve', entityType: 'Report', entityId: report._id, meta: { status: report.status } });
  setFlash(res, 'success', 'Report updated successfully.');
  res.redirect(redirectBack(req, '/dashboard/reports'));
});

exports.moderateReviewAction = asyncHandler(async (req, res) => {
  if (!['admin', 'super-admin'].includes(req.user.role)) throw new ApiError(403, 'Forbidden');
  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError(404, 'Review not found');
  review.status = req.body.status || review.status;
  await review.save();
  await AuditLog.create({ actor: req.user._id, action: 'dashboard.review.moderate', entityType: 'Review', entityId: review._id, meta: { status: review.status } });
  setFlash(res, 'success', 'Review moderation saved.');
  res.redirect(redirectBack(req, '/dashboard/reviews'));
});

exports.updateUserAction = asyncHandler(async (req, res) => {
  if (!['admin', 'super-admin'].includes(req.user.role)) throw new ApiError(403, 'Forbidden');
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  if (req.body.role) user.role = req.body.role;
  if (req.body.status) user.status = req.body.status;
  await user.save();
  await AuditLog.create({ actor: req.user._id, action: 'dashboard.user.update', entityType: 'User', entityId: user._id, meta: { role: user.role, status: user.status } });
  setFlash(res, 'success', 'User account updated successfully.');
  res.redirect(redirectBack(req, '/dashboard/users'));
});

exports.upsertSettingAction = asyncHandler(async (req, res) => {
  if (!['admin', 'super-admin'].includes(req.user.role)) throw new ApiError(403, 'Forbidden');
  const setting = await Setting.findOneAndUpdate({ key: req.body.key }, { value: req.body.value }, { upsert: true, new: true, setDefaultsOnInsert: true });
  await AuditLog.create({ actor: req.user._id, action: 'dashboard.setting.upsert', entityType: 'Setting', entityId: setting._id, meta: { key: setting.key } });
  setFlash(res, 'success', `Setting ${setting.key} saved successfully.`);
  res.redirect('/dashboard/settings');
});


exports.billing = asyncHandler(async (req, res) => {
  const [plans, subscription, billingSummary] = await Promise.all([
    Plan.find({ isActive: true }).sort({ amount: 1 }).lean(),
    Subscription.findOne({ user: req.user._id }).populate('plan').sort({ createdAt: -1 }).lean(),
    Subscription.aggregate([
      { $match: { user: req.user._id } },
      { $group: {
          _id: null,
          totalSpent: { $sum: { $cond: [{ $eq: ['$payment.status', 'paid'] }, { $ifNull: ['$payment.amount', 0] }, 0] } },
          paidInvoices: { $sum: { $cond: [{ $eq: ['$payment.status', 'paid'] }, 1, 0] } },
          subscriptions: { $sum: 1 }
      } }
    ])
  ]);
  return render(req, res, 'pages/dashboard/billing', 'Billing', {
    plans,
    subscription,
    billingSummary: billingSummary[0] || { totalSpent: 0, paidInvoices: 0, subscriptions: 0 }
  });
});

exports.startSubscriptionAction = asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.body.planId);
  if (!plan) {
    setFlash(res, 'error', 'Selected plan was not found.');
    return res.redirect('/dashboard/billing');
  }
  const startsAt = new Date();
  const endsAt = new Date(startsAt);
  if (plan.interval === 'quarterly') endsAt.setMonth(endsAt.getMonth() + 3);
  else if (plan.interval === 'yearly') endsAt.setFullYear(endsAt.getFullYear() + 1);
  else if (plan.interval === 'one-time') endsAt.setFullYear(endsAt.getFullYear() + 10);
  else endsAt.setMonth(endsAt.getMonth() + 1);
  await Subscription.updateMany({ user: req.user._id, status: { $in: ['trialing', 'active', 'past_due'] } }, { $set: { status: 'cancelled' } });
  const status = plan.trialDays > 0 ? 'trialing' : 'active';
  const subscription = await Subscription.create({ user: req.user._id, plan: plan._id, status, startsAt, endsAt, payment: { provider: req.body.provider || 'manual', reference: req.body.reference || '', amount: plan.amount, currency: plan.currency, status: 'paid', paidAt: new Date() } });
  await AuditLog.create({ actor: req.user._id, action: 'dashboard.billing.start', entityType: 'Subscription', entityId: subscription._id, meta: { plan: plan.slug } });
  setFlash(res, 'success', `${plan.name} plan activated successfully.`);
  return res.redirect('/dashboard/billing');
});

exports.cancelSubscriptionAction = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findOne({ user: req.user._id, status: { $in: ['trialing', 'active', 'past_due'] } }).sort({ createdAt: -1 });
  if (!subscription) {
    setFlash(res, 'error', 'No active subscription found.');
    return res.redirect('/dashboard/billing');
  }
  subscription.status = 'cancelled';
  subscription.cancelAtPeriodEnd = true;
  await subscription.save();
  await AuditLog.create({ actor: req.user._id, action: 'dashboard.billing.cancel', entityType: 'Subscription', entityId: subscription._id, meta: null });
  setFlash(res, 'success', 'Subscription cancelled.');
  return res.redirect('/dashboard/billing');
});
