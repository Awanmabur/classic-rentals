const mongoose = require('mongoose');

const providerSchema = new mongoose.Schema({
  notificationId: String,
  orderTrackingId: { type: String, index: true, sparse: true },
  redirectUrl: String,
  callbackUrl: String,
  cancellationUrl: String,
  ipnUrl: String,
  paymentMethod: String,
  confirmationCode: String,
  rawStatus: String,
  statusCode: Number,
  payload: mongoose.Schema.Types.Mixed,
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  merchantReference: { type: String, required: true, unique: true, trim: true, index: true },
  purpose: { type: String, enum: ['subscription', 'inquiry'], required: true, index: true },
  provider: { type: String, enum: ['manual', 'pesapal'], default: 'manual', index: true },
  status: { type: String, enum: ['pending', 'paid', 'failed', 'cancelled', 'reversed'], default: 'pending', index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
  inquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'Inquiry' },
  listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, trim: true, uppercase: true },
  description: { type: String, trim: true, maxlength: 180 },
  paidAt: Date,
  lastCheckedAt: Date,
  statusReason: String,
  providerMeta: providerSchema,
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
