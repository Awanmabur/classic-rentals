const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true, maxlength: 1200 },
  status: { type: String, enum: ['pending', 'published', 'rejected'], default: 'pending', index: true },
}, { timestamps: true });

schema.index({ listing: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('Review', schema);
