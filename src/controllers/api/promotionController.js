const Listing = require('../../models/Listing');
const Promotion = require('../../models/Promotion');
const AuditLog = require('../../models/AuditLog');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const {
  createOrGetPromotion,
  promotionUrl,
} = require('../../services/promotionService');

exports.promoteListing = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.listingId).select('title slug status owner assignedAgent');
  if (!listing || listing.status !== 'published') throw new ApiError(404, 'Listing not found');
  if (String(listing.owner) === String(req.user._id) || String(listing.assignedAgent || '') === String(req.user._id)) {
    throw new ApiError(400, 'You cannot promote your own listing for commission.');
  }

  const promotion = await createOrGetPromotion({ listing: listing._id, promoter: req.user._id });
  await AuditLog.create({
    actor: req.user._id,
    action: 'promotion.create',
    entityType: 'Promotion',
    entityId: promotion._id,
    meta: { listing: listing._id },
  }).catch(() => null);

  res.status(201).json({
    success: true,
    message: 'Promotion link ready.',
    data: {
      promotion,
      url: promotionUrl(req, promotion.token),
    },
  });
});

exports.getMine = asyncHandler(async (req, res) => {
  const promotions = await Promotion.find({ promoter: req.user._id })
    .populate('listing', 'title slug status category price location images')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, data: promotions });
});
