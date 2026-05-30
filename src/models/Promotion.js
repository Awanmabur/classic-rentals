const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema({
  listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true, index: true },
  promoter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token: { type: String, required: true, unique: true, trim: true, index: true },
  status: { type: String, enum: ['active', 'paused', 'archived'], default: 'active', index: true },
  clicks: { type: Number, default: 0 },
  conversions: { type: Number, default: 0 },
  earnedAmount: { type: Number, default: 0 },
  earnedCurrency: { type: String, default: 'UGX', uppercase: true, trim: true },
  lastClickedAt: Date,
  lastConvertedAt: Date,
}, { timestamps: true });

promotionSchema.index({ listing: 1, promoter: 1 }, { unique: true });

module.exports = mongoose.model('Promotion', promotionSchema);
