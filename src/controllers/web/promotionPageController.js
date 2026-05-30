const Promotion = require('../../models/Promotion');
const asyncHandler = require('../../utils/asyncHandler');
const { markPromotionClick } = require('../../services/promotionService');

exports.redirectPromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findOne({ token: req.params.token, status: 'active' })
    .populate('listing', 'slug status')
    .populate('promoter', '_id')
    .exec();

  if (!promotion || !promotion.listing || promotion.listing.status !== 'published') {
    return res.redirect('/listings');
  }

  await markPromotionClick(promotion).catch(() => null);
  res.cookie('cr_promo', promotion.token, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
  return res.redirect(`/listings/${promotion.listing.slug}`);
});
