const Report = require('../../models/Report');
const Listing = require('../../models/Listing');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');

exports.createReport = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.listingId);
  if (!listing) throw new ApiError(404, 'Listing not found');

  const report = await Report.create({
    listing: listing._id,
    reporter: req.user?._id,
    reason: req.body.reason,
    details: req.body.details,
  });

  res.status(201).json({ success: true, message: 'Report submitted', data: report });
});

exports.getReports = asyncHandler(async (req, res) => {
  const reports = await Report.find()
    .populate('listing', 'title slug status category')
    .populate('reporter', 'firstName lastName email')
    .populate('resolvedBy', 'firstName lastName email')
    .sort({ createdAt: -1 });

  res.json({ success: true, data: reports });
});

exports.resolveReport = asyncHandler(async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) throw new ApiError(404, 'Report not found');

  report.status = req.body.status || 'resolved';
  report.resolvedBy = req.user._id;
  report.resolvedAt = new Date();
  await report.save();

  res.json({ success: true, message: 'Report updated', data: report });
});
