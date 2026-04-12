const mongoose = require('mongoose');
const slugify = require('../utils/slugify');

const imageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  width: Number,
  height: Number,
  isPrimary: { type: Boolean, default: false },
}, { _id: false });

const pointSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Point'],
    required: true,
  },
  coordinates: {
    type: [Number],
    required: true,
    validate: {
      validator: (arr) => Array.isArray(arr) && arr.length === 2 && arr.every((n) => Number.isFinite(n)),
      message: 'Point must be [lng, lat]',
    },
  },
}, { _id: false });

const locationSchema = new mongoose.Schema({
  country: { type: String, default: 'South Sudan' },
  city: { type: String, default: 'Juba', index: true },
  area: { type: String, required: true, index: true },
  addressLine: String,
  latitude: Number,
  longitude: Number,
  coordinates: {
    type: pointSchema,
    default: undefined,
  },
}, { _id: false });

const priceSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 0, index: true },
  currency: { type: String, default: 'USD' },
  unit: { type: String, enum: ['day', 'week', 'month', 'year', 'one-time'], default: 'month' },
  negotiable: { type: Boolean, default: false },
}, { _id: false });

const listingSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 180 },
  slug: { type: String, unique: true, index: true },
  description: { type: String, required: true, maxlength: 5000 },
  category: {
    type: String,
    enum: ['house', 'apartment', 'land', 'car', 'shop', 'office', 'warehouse', 'shortstay'],
    required: true,
    index: true,
  },
  purpose: { type: String, enum: ['rent', 'sale'], default: 'rent', index: true },
  status: {
    type: String,
    enum: ['draft', 'pending', 'published', 'rejected', 'archived'],
    default: 'pending',
    index: true,
  },
  featured: { type: Boolean, default: false, index: true },
  verified: { type: Boolean, default: false, index: true },
  views: { type: Number, default: 0 },
  price: { type: priceSchema, required: true },
  location: { type: locationSchema, required: true },
  specs: {
    bedrooms: Number,
    bathrooms: Number,
    sizeSqm: Number,
    landSize: Number,
    seats: Number,
    transmission: String,
    fuelType: String,
    year: Number,
    mileage: Number,
    furnished: Boolean,
  },
  amenities: [{ type: String, trim: true }],
  images: { type: [imageSchema], default: [] },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  moderation: {
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    moderatedAt: Date,
    moderationNote: String,
  },
  publishedAt: Date,
}, { timestamps: true });

listingSchema.index({ category: 1, status: 1, featured: 1, createdAt: -1 });
listingSchema.index({ 'location.city': 1, 'location.area': 1, category: 1, status: 1 });
listingSchema.index({ title: 'text', description: 'text', 'location.area': 'text', amenities: 'text' });
listingSchema.index({ 'location.coordinates': '2dsphere' });

listingSchema.pre('validate', function (next) {
  const lng = Number(this.location?.longitude);
  const lat = Number(this.location?.latitude);
  const hasLng = Number.isFinite(lng);
  const hasLat = Number.isFinite(lat);

  if (hasLng && hasLat) {
    this.location.coordinates = {
      type: 'Point',
      coordinates: [lng, lat],
    };
  } else if (this.location) {
    this.location.coordinates = undefined;
  }

  if (!this.slug && this.title) {
    this.slug = `${slugify(this.title)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  next();
});

module.exports = mongoose.model('Listing', listingSchema);
