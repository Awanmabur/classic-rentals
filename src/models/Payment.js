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

const splitSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  promoter: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  platformAmount: { type: Number, min: 0, default: 0 },
  recipientAmount: { type: Number, min: 0, default: 0 },
  promoterAmount: { type: Number, min: 0, default: 0 },
  platformRate: { type: Number, min: 0, default: 0 },
  recipientRate: { type: Number, min: 0, default: 0 },
  promoterRate: { type: Number, min: 0, default: 0 },
  currency: { type: String, trim: true, uppercase: true },
}, { _id: false });

const payerSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  merchantReference: { type: String, required: true, unique: true, trim: true, index: true },
  purpose: { type: String, enum: ['subscription', 'inquiry', 'listing_posting'], required: true, index: true },
  provider: { type: String, enum: ['manual', 'pesapal'], default: 'manual', index: true },
  status: { type: String, enum: ['pending', 'paid', 'failed', 'cancelled', 'reversed'], default: 'pending', index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  payer: payerSchema,
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
  inquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'Inquiry' },
  listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
  promotion: { type: mongoose.Schema.Types.ObjectId, ref: 'Promotion' },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, trim: true, uppercase: true },
  description: { type: String, trim: true, maxlength: 180 },
  split: splitSchema,
  paidAt: Date,
  lastCheckedAt: Date,
  statusReason: String,
  providerMeta: providerSchema,
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
