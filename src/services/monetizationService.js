const Subscription = require('../models/Subscription');
const Listing = require('../models/Listing');

const DEFAULTS = {
  'user': { listings: 5, featured: 0, verification: 0, exactMap: 0, analytics: 0 },
  'agent': { listings: 15, featured: 0, verification: 0, exactMap: 0, analytics: 1 },
  'admin': { listings: Infinity, featured: Infinity, verification: Infinity, exactMap: Infinity, analytics: Infinity },
  'super-admin': { listings: Infinity, featured: Infinity, verification: Infinity, exactMap: Infinity, analytics: Infinity },
};

function hasActiveStatus(status) {
  return ['trialing', 'active', 'past_due'].includes(status);
}

function getFeature(plan, key) {
  return (plan?.features || []).find((item) => item.key === key);
}

function getFeatureLimit(plan, key, fallback) {
  const feature = getFeature(plan, key);
  if (!feature || feature.included === false) return fallback;
  if (typeof feature.limit === 'number') return feature.limit;
  return fallback;
}

function hasIncludedFeature(plan, key, fallback = false) {
  const feature = getFeature(plan, key);
  if (!feature) return fallback;
  return feature.included !== false;
}

async function getActiveSubscription(userId) {
  if (!userId) return null;
  const now = new Date();
  return Subscription.findOne({
    user: userId,
    status: { $in: ['trialing', 'active', 'past_due'] },
    endsAt: { $gte: now },
  }).populate('plan').sort({ createdAt: -1 });
}

async function getUsage(userId, excludeListingId = null) {
  if (!userId) return { listings: 0, featured: 0 };
  const base = { owner: userId, status: { $in: ['draft', 'pending', 'published'] } };
  if (excludeListingId) base._id = { $ne: excludeListingId };
  const featuredBase = { owner: userId, featured: true, status: { $in: ['pending', 'published'] } };
  if (excludeListingId) featuredBase._id = { $ne: excludeListingId };
  const [listings, featured] = await Promise.all([
    Listing.countDocuments(base),
    Listing.countDocuments(featuredBase),
  ]);
  return { listings, featured };
}

async function getMonetizationContext(user, opts = {}) {
  const defaults = DEFAULTS[user?.role] || DEFAULTS.user;
  const privileged = ['admin', 'super-admin'].includes(user?.role);
  const activeSubscription = privileged ? null : await getActiveSubscription(user?._id);
  const plan = activeSubscription?.plan || null;
  const usage = privileged ? { listings: 0, featured: 0 } : await getUsage(user?._id, opts.excludeListingId);
  const listingsLimit = privileged ? Infinity : getFeatureLimit(plan, 'listings', defaults.listings);
  const featuredLimit = privileged ? Infinity : getFeatureLimit(plan, 'featured', defaults.featured);

  const entitlements = {
    privileged,
    planName: plan?.name || 'Free',
    planSlug: plan?.slug || 'free',
    listingsLimit,
    featuredLimit,
    canRequestVerification: privileged || hasIncludedFeature(plan, 'verification', defaults.verification > 0),
    canUseExactMapUpsell: privileged || hasIncludedFeature(plan, 'exact-map', defaults.exactMap > 0),
    hasAnalytics: privileged || hasIncludedFeature(plan, 'analytics', defaults.analytics > 0),
    canChargeViewingFee: true,
    canChargeReservationFee: true,
  };

  const remaining = {
    listings: listingsLimit === Infinity ? Infinity : Math.max(0, listingsLimit - usage.listings),
    featured: featuredLimit === Infinity ? Infinity : Math.max(0, featuredLimit - usage.featured),
  };

  return { activeSubscription, plan, usage, entitlements, remaining };
}

module.exports = {
  getActiveSubscription,
  getMonetizationContext,
};
