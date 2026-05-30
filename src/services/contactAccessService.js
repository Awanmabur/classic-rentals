const mongoose = require('mongoose');
const Inquiry = require('../models/Inquiry');
const Payment = require('../models/Payment');

const CONTACT_UNLOCK_TYPES = ['contact', 'general', 'viewing', 'reservation', 'booking'];
const CONTACT_ACCESS_COOKIE = 'cr_contact_access';
const DEFAULT_CONTACT_FEE_AMOUNT = Number(process.env.CONTACT_ACCESS_FEE_AMOUNT || 5);
const DEFAULT_CONTACT_FEE_CURRENCY = String(process.env.CONTACT_ACCESS_FEE_CURRENCY || 'USD').trim().toUpperCase();

function idOf(value) {
  if (!value) return '';
  return String(value._id || value);
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function isPrivileged(user) {
  return ['admin', 'super-admin'].includes(user?.role);
}

function isListingStakeholder(user, listing) {
  if (!user || !listing) return false;
  const userId = idOf(user);
  return Boolean(
    userId &&
    (idOf(listing.owner) === userId || idOf(listing.assignedAgent) === userId || isPrivileged(user))
  );
}

function moneyAmount(value, fallback) {
  const amount = Number(value);
  if (Number.isFinite(amount) && amount > 0) return amount;
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

function getContactAccessPolicy(listing) {
  const monetization = listing?.monetization || {};
  const mode = monetization.leadAccess === 'open' ? 'open' : 'paid';
  const amount = moneyAmount(monetization.contactFeeAmount, DEFAULT_CONTACT_FEE_AMOUNT);
  const currency = String(
    monetization.contactFeeCurrency ||
    listing?.price?.currency ||
    DEFAULT_CONTACT_FEE_CURRENCY ||
    'USD'
  ).trim().toUpperCase();

  return {
    mode,
    requiresPayment: mode === 'paid' && amount > 0,
    fee: {
      label: 'Contact access fee',
      amount,
      currency,
    },
  };
}

function maskEmail(value = '') {
  const email = String(value || '').trim();
  if (!email || !email.includes('@')) return email ? 'Hidden until payment' : '';
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskPhone(value = '') {
  const phone = String(value || '').trim();
  if (!phone) return '';
  const suffix = phone.slice(-3);
  return `*** *** ${suffix}`;
}

function whatsappUrl(value = '') {
  const digits = String(value || '').replace(/[^\d]/g, '');
  return digits ? `https://wa.me/${digits}` : '';
}

function displayName(user, fallback = 'Contact') {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || fallback;
}

function parseContactAccessTokens(value) {
  const source = Array.isArray(value)
    ? value
    : (() => {
      if (!value) return [];
      if (typeof value !== 'string') return [];
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch (_) {
        // Fall back to comma-separated values for older cookies.
      }
      return value.split(',');
    })();
  return [...new Set(source.map((item) => String(item || '').trim()).filter(Boolean))].slice(-30);
}

function serializeContactAccessTokens(tokens) {
  return JSON.stringify(parseContactAccessTokens(tokens));
}

function getContactParties(listing, includeSensitive = false) {
  const parties = [];
  const seen = new Set();
  const addParty = (role, user) => {
    if (!user) return;
    const key = idOf(user) || user.email || `${role}:${displayName(user)}`;
    if (seen.has(key)) return;
    seen.add(key);
    parties.push({
      role,
      name: displayName(user, role === 'agent' ? 'Agent' : 'Landlord'),
      email: includeSensitive ? (user.email || '') : maskEmail(user.email),
      phone: includeSensitive ? (user.phone || '') : maskPhone(user.phone),
      whatsappUrl: includeSensitive ? whatsappUrl(user.phone) : '',
      unlocked: includeSensitive,
    });
  };

  addParty('agent', listing?.assignedAgent);
  addParty('landlord', listing?.owner);
  return parties;
}

function stripUserContact(user) {
  if (!user || typeof user !== 'object') return user;
  const copy = { ...user };
  delete copy.email;
  delete copy.phone;
  return copy;
}

function sanitizeListingContacts(listing) {
  if (!listing || typeof listing !== 'object') return listing;
  return {
    ...listing,
    owner: stripUserContact(listing.owner),
    assignedAgent: stripUserContact(listing.assignedAgent),
  };
}

async function getContactAccess({ user, listing, accessTokens = [] }) {
  const policy = getContactAccessPolicy(listing);

  if (!policy.requiresPayment || isListingStakeholder(user, listing)) {
    return { hasAccess: true, reason: policy.requiresPayment ? 'stakeholder' : 'open', policy };
  }

  const listingId = idOf(listing);
  if (!isObjectId(listingId)) {
    return { hasAccess: false, reason: 'invalid_listing', policy };
  }

  const tokenList = parseContactAccessTokens(accessTokens);
  const checks = [];

  if (user) {
    checks.push(Inquiry.exists({
      listing: listingId,
      sender: user._id,
      type: { $in: CONTACT_UNLOCK_TYPES },
      'feeSnapshot.status': 'paid',
    }));
    checks.push(Payment.exists({
      listing: listingId,
      user: user._id,
      purpose: 'inquiry',
      status: 'paid',
    }));
  }

  if (tokenList.length) {
    checks.push(Payment.exists({
      listing: listingId,
      merchantReference: { $in: tokenList },
      purpose: 'inquiry',
      status: 'paid',
    }));
  }

  const paidChecks = checks.length ? await Promise.all(checks) : [];
  const hasPaidAccess = paidChecks.some(Boolean);

  return {
    hasAccess: hasPaidAccess,
    reason: hasPaidAccess ? 'paid' : 'payment_required',
    policy,
  };
}

function canViewInquiryContact(inquiry, viewer) {
  if (!inquiry) return false;
  if (isPrivileged(viewer)) return true;
  if (viewer && idOf(inquiry.sender) === idOf(viewer)) return true;
  return inquiry.feeSnapshot?.status !== 'pending';
}

function sanitizeInquiryContact(inquiry, viewer) {
  if (!inquiry || canViewInquiryContact(inquiry, viewer)) return inquiry;
  return {
    ...inquiry,
    email: '',
    phone: '',
    contactLocked: true,
    sender: inquiry.sender ? stripUserContact(inquiry.sender) : inquiry.sender,
  };
}

module.exports = {
  CONTACT_UNLOCK_TYPES,
  CONTACT_ACCESS_COOKIE,
  getContactAccessPolicy,
  getContactAccess,
  getContactParties,
  sanitizeListingContacts,
  sanitizeInquiryContact,
  isListingStakeholder,
  isObjectId,
  parseContactAccessTokens,
  serializeContactAccessTokens,
};
