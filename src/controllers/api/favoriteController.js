const Favorite = require('../../models/Favorite');
const Listing = require('../../models/Listing');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { sanitizeListingContacts } = require('../../services/contactAccessService');

exports.toggleFavorite = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.listingId);
  if (!listing || listing.status !== 'published') throw new ApiError(404, 'Listing not found');

  const existing = await Favorite.findOne({ user: req.user._id, listing: listing._id });
  if (existing) {
    await existing.deleteOne();
    return res.json({ success: true, message: 'Removed from favorites', active: false });
  }

  await Favorite.create({ user: req.user._id, listing: listing._id });
  res.json({ success: true, message: 'Added to favorites', active: true });
});

exports.getMyFavorites = asyncHandler(async (req, res) => {
  const favorites = await Favorite.find({ user: req.user._id })
    .populate({
      path: 'listing',
      populate: [
        { path: 'owner', select: 'firstName lastName avatar role' },
        { path: 'assignedAgent', select: 'firstName lastName avatar role' },
      ],
    })
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    data: favorites.map((fav) => fav.listing).filter(Boolean).map(sanitizeListingContacts),
  });
});
