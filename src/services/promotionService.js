const crypto = require('crypto');
const Promotion = require('../models/Promotion');

function makePromotionToken() {
  return crypto.randomBytes(9).toString('base64url');
}

async function createOrGetPromotion({ listing, promoter }) {
  let promotion = await Promotion.findOne({ listing, promoter });
  if (promotion) return promotion;

  for (let i = 0; i < 4; i += 1) {
    try {
      promotion = await Promotion.create({
        listing,
        promoter,
        token: makePromotionToken(),
      });
      return promotion;
    } catch (error) {
      if (error.code !== 11000 || i === 3) throw error;
    }
  }
  return promotion;
}

async function resolvePromotionForListing({ token, listingId }) {
  if (!token || !listingId) return null;
  const promotion = await Promotion.findOne({
    token: String(token).trim(),
    listing: listingId,
    status: 'active',
  });
  return promotion || null;
}

async function markPromotionClick(promotion) {
  if (!promotion) return null;
  promotion.clicks = (promotion.clicks || 0) + 1;
  promotion.lastClickedAt = new Date();
  await promotion.save();
  return promotion;
}

async function markPromotionConversion({ promotionId, amount = 0, currency = 'UGX' }) {
  if (!promotionId) return null;
  return Promotion.findByIdAndUpdate(
    promotionId,
    {
      $inc: { conversions: 1, earnedAmount: Number(amount || 0) },
      $set: { earnedCurrency: currency, lastConvertedAt: new Date() },
    },
    { new: true }
  );
}

function promotionUrl(req, token) {
  const base = `${req.protocol}://${req.get('host')}`;
  return `${base}/p/${encodeURIComponent(token)}`;
}

module.exports = {
  createOrGetPromotion,
  resolvePromotionForListing,
  markPromotionClick,
  markPromotionConversion,
  promotionUrl,
};
