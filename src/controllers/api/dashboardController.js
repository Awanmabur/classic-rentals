const Listing = require('../../models/Listing');
const Inquiry = require('../../models/Inquiry');
const Favorite = require('../../models/Favorite');
const User = require('../../models/User');
const Report = require('../../models/Report');
const AuditLog = require('../../models/AuditLog');
const asyncHandler = require('../../utils/asyncHandler');

exports.getDashboardSummary = asyncHandler(async (req, res) => {
  const role = req.user.role;
  let data = {};

  if (role === 'super-admin') {
    const [users, listings, published, pending, inquiries, reports, logs] = await Promise.all([
      User.countDocuments(),
      Listing.countDocuments(),
      Listing.countDocuments({ status: 'published' }),
      Listing.countDocuments({ status: 'pending' }),
      Inquiry.countDocuments(),
      Report.countDocuments({ status: { $ne: 'resolved' } }),
      AuditLog.countDocuments(),
    ]);
    data = { users, listings, published, pending, inquiries, reports, logs };
  }

  if (role === 'admin') {
    const [listings, pending, published, inquiries, reports, agents] = await Promise.all([
      Listing.countDocuments(),
      Listing.countDocuments({ status: 'pending' }),
      Listing.countDocuments({ status: 'published' }),
      Inquiry.countDocuments(),
      Report.countDocuments({ status: { $ne: 'resolved' } }),
      User.countDocuments({ role: 'agent' }),
    ]);
    data = { listings, pending, published, inquiries, reports, agents };
  }

  if (role === 'agent') {
    const [myListings, myPublished, myPending, myLeads] = await Promise.all([
      Listing.countDocuments({ assignedAgent: req.user._id }),
      Listing.countDocuments({ assignedAgent: req.user._id, status: 'published' }),
      Listing.countDocuments({ assignedAgent: req.user._id, status: 'pending' }),
      Inquiry.countDocuments({ owner: req.user._id }),
    ]);
    data = { myListings, myPublished, myPending, myLeads };
  }

  if (role === 'user') {
    const [favorites, inquiries, myListings] = await Promise.all([
      Favorite.countDocuments({ user: req.user._id }),
      Inquiry.countDocuments({ sender: req.user._id }),
      Listing.countDocuments({ owner: req.user._id }),
    ]);
    data = { favorites, inquiries, myListings };
  }

  res.json({ success: true, data });
});
