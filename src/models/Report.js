const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true, index: true },
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  reason: {
    type: String,
    enum: ['spam', 'fraud', 'duplicate', 'wrong-price', 'wrong-location', 'abuse', 'other'],
    required: true,
  },
  details: { type: String, trim: true, maxlength: 1500 },
  status: { type: String, enum: ['open', 'reviewing', 'resolved'], default: 'open', index: true },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('Report', schema);
