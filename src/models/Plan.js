const mongoose = require('mongoose');

const featureSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  included: { type: Boolean, default: true },
  limit: Number,
}, { _id: false });

const planSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
  audience: { type: String, enum: ['user', 'agent', 'admin'], default: 'agent', index: true },
  currency: { type: String, default: 'USD' },
  amount: { type: Number, required: true, min: 0 },
  interval: { type: String, enum: ['monthly', 'quarterly', 'yearly', 'one-time'], default: 'monthly' },
  trialDays: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true, index: true },
  features: { type: [featureSchema], default: [] },
  description: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Plan', planSchema);
