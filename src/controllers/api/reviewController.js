const Review = require('../../models/Review');
const Listing = require('../../models/Listing');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');

exports.createReview = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.listingId);
  if (!listing || listing.status !== 'published') throw new ApiError(404, 'Listing not found');

  const review = await Review.create({
    listing: listing._id,
    user: req.user._id,
    rating: Number(req.body.rating),
    comment: req.body.comment,
    status: ['admin', 'super-admin'].includes(req.user.role) ? 'published' : 'pending',
  });

  res.status(201).json({ success: true, message: 'Review submitted', data: review });
});

exports.getListingReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ listing: req.params.listingId, status: 'published' })
    .populate('user', 'firstName lastName avatar')
    .sort({ createdAt: -1 });

  res.json({ success: true, data: reviews });
});

exports.moderateReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError(404, 'Review not found');

  review.status = req.body.status || review.status;
  await review.save();

  res.json({ success: true, message: 'Review moderated', data: review });
});
