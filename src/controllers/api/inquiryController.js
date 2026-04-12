const Inquiry = require('../../models/Inquiry');
const Listing = require('../../models/Listing');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');

exports.createInquiry = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.listingId).populate('owner');
  if (!listing || listing.status !== 'published') throw new ApiError(404, 'Listing not found');

  const payload = {
    listing: listing._id,
    sender: req.user?._id,
    owner: listing.owner?._id,
    name: req.body.name || req.user?.fullName || 'Guest',
    email: req.body.email || req.user?.email,
    phone: req.body.phone || req.user?.phone,
    message: req.body.message,
  };

  if (!payload.message) throw new ApiError(400, 'Message is required');

  const inquiry = await Inquiry.create(payload);
  res.status(201).json({ success: true, message: 'Inquiry sent successfully', data: inquiry });
});

exports.getMyInquiries = asyncHandler(async (req, res) => {
  let filter = {};
  if (req.user.role === 'user') filter = { sender: req.user._id };
  if (req.user.role === 'agent') filter = { owner: req.user._id };
  if (['admin', 'super-admin'].includes(req.user.role)) filter = {};

  const inquiries = await Inquiry.find(filter)
    .populate('listing', 'title slug category status price location images')
    .populate('sender', 'firstName lastName email phone')
    .sort({ createdAt: -1 });

  res.json({ success: true, data: inquiries });
});

exports.updateInquiryStatus = asyncHandler(async (req, res) => {
  const inquiry = await Inquiry.findById(req.params.id);
  if (!inquiry) throw new ApiError(404, 'Inquiry not found');

  const canUpdate = ['admin', 'super-admin'].includes(req.user.role) || String(inquiry.owner) === String(req.user._id);
  if (!canUpdate) throw new ApiError(403, 'Forbidden');

  inquiry.status = req.body.status || inquiry.status;
  await inquiry.save();

  res.json({ success: true, message: 'Inquiry updated', data: inquiry });
});
