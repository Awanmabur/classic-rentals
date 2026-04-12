const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true, maxlength: 60 },
  lastName: { type: String, required: true, trim: true, maxlength: 60 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  phone: { type: String, trim: true, maxlength: 30 },
  password: { type: String, required: true, minlength: 8, select: false },
  role: {
    type: String,
    enum: ['super-admin', 'admin', 'agent', 'user'],
    default: 'user',
    index: true,
  },
  avatar: {
    url: String,
    publicId: String,
  },
  bio: { type: String, maxlength: 500 },
  status: {
    type: String,
    enum: ['active', 'suspended', 'pending'],
    default: 'active',
    index: true,
  },
  emailVerifiedAt: Date,
  lastLoginAt: Date,
  refreshTokenVersion: { type: Number, default: 0 },
}, { timestamps: true });

userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`.trim();
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);
