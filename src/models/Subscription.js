const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  provider: { type: String, default: 'manual' },
  reference: { type: String, trim: true },
  amount: Number,
  currency: String,
  status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  paidAt: Date,
  meta: mongoose.Schema.Types.Mixed,
}, { _id: false });

const subscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true, index: true },
  status: { type: String, enum: ['trialing', 'active', 'past_due', 'cancelled', 'expired'], default: 'trialing', index: true },
  startsAt: { type: Date, required: true, default: Date.now },
  endsAt: { type: Date, required: true },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  payment: paymentSchema,
}, { timestamps: true });

subscriptionSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
