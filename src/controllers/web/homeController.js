
const Listing = require('../../models/Listing');
const Favorite = require('../../models/Favorite');
const asyncHandler = require('../../utils/asyncHandler');

const CATEGORY_LABELS = {
  house: 'House',
  apartment: 'Apartment',
  land: 'Land / Plot',
  car: 'Car Rental',
  shop: 'Shop',
  office: 'Office',
  warehouse: 'Warehouse',
  shortstay: 'Short-Stay',
};

function slugArea(value) {
  return String(value || 'other')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'other';
}

function buildTags(listing) {
  const tags = [];
  if (listing.specs?.bedrooms) tags.push(`${listing.specs.bedrooms} bedrooms`);
  if (listing.specs?.bathrooms) tags.push(`${listing.specs.bathrooms} bathrooms`);
  if (listing.specs?.sizeSqm) tags.push(`${listing.specs.sizeSqm} sqm`);
  if (listing.specs?.landSize) tags.push(`${listing.specs.landSize} plot size`);
  if (listing.specs?.seats) tags.push(`${listing.specs.seats} seats`);
  if (listing.specs?.transmission) tags.push(listing.specs.transmission);
  if (listing.specs?.fuelType) tags.push(listing.specs.fuelType);
  if (listing.specs?.year) tags.push(String(listing.specs.year));
  if (listing.specs?.furnished) tags.push('Furnished');
  (listing.amenities || []).slice(0, 5).forEach((item) => tags.push(item));
  return [...new Set(tags)].slice(0, 7);
}

function normalizeListing(listing) {
  const primary = (listing.images || []).find((img) => img.isPrimary) || (listing.images || [])[0];
  const agent = listing.assignedAgent || listing.owner || {};
  const areaLabel = listing.location?.area || 'Juba';
  const unit = listing.price?.unit === 'one-time' ? 'one-time' : `/${listing.price?.unit || 'month'}`;
  return {
    id: String(listing._id),
    dbId: String(listing._id),
    slug: listing.slug,
    title: listing.title,
    type: listing.category,
    typeLabel: CATEGORY_LABELS[listing.category] || listing.category,
    area: slugArea(areaLabel),
    areaLabel,
    city: listing.location?.city || 'Juba',
    price: Number(listing.price?.amount || 0),
    currency: listing.price?.currency || 'USD',
    unit,
    verified: Boolean(listing.verified),
    featured: Boolean(listing.featured),
    platform: listing.category === 'shortstay' ? 'airbnb' : (listing.assignedAgent ? 'agent' : 'direct'),
    purpose: listing.purpose || 'rent',
    createdAt: new Date(listing.createdAt || Date.now()).toISOString().slice(0, 10),
    tags: buildTags(listing),
    agent: {
      name: [agent.firstName, agent.lastName].filter(Boolean).join(' ') || agent.email || 'Classic Rentals Agent',
      verified: Boolean(listing.verified),
      responseMins: 8,
      email: agent.email || '',
      phone: agent.phone || '',
    },
    images: (listing.images || []).map((img) => img.url),
    desc: listing.description,
    url: `/listings/${listing.slug}`,
  };
}

exports.index = asyncHandler(async (req, res) => {
  const listingsRaw = await Listing.find({ status: 'published' })
    .populate('owner', 'firstName lastName email phone')
    .populate('assignedAgent', 'firstName lastName email phone')
    .sort({ featured: -1, createdAt: -1 })
    .limit(120)
    .lean();

  const listings = listingsRaw.map(normalizeListing);

  const counts = listings.reduce((acc, item) => {
    acc.total += 1;
    if (item.verified) acc.verified += 1;
    if (item.type === 'car') acc.car += 1;
    if (item.type === 'land') acc.land += 1;
    if (['shop', 'office', 'warehouse'].includes(item.type)) acc.commercial += 1;
    acc.byType[item.type] = (acc.byType[item.type] || 0) + 1;
    return acc;
  }, { total: 0, verified: 0, car: 0, land: 0, commercial: 0, byType: {} });

  const trendingType = Object.entries(counts.byType).sort((a, b) => b[1] - a[1])[0]?.[0] || 'shortstay';

  let favoriteIds = [];
  if (req.user) {
    const favs = await Favorite.find({ user: req.user._id }).select('listing').lean();
    favoriteIds = favs.map((item) => String(item.listing));
  }

  const areaLabels = { all: 'Any area' };
  listings.forEach((item) => { areaLabels[item.area] = item.areaLabel; });

  const heroImages = listings.filter((x) => x.images?.length).slice(0, 3).map((x) => x.images[0]);
  while (heroImages.length < 3) {
    heroImages.push([
      'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=2000&q=80',
      'https://images.unsplash.com/photo-1525609004556-c46c7d6cf023?auto=format&fit=crop&w=2000&q=80',
      'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=2000&q=80',
    ][heroImages.length]);
  }

  res.render('pages/home', {
    title: 'Classic Rentals — Premium Rentals Platform',
    homeListingsJson: JSON.stringify(listings),
    favoriteIdsJson: JSON.stringify(favoriteIds),
    areaLabelsJson: JSON.stringify(areaLabels),
    heroImages,
    currentUser: req.user || null,
    heroStats: {
      trending: CATEGORY_LABELS[trendingType] || 'Short-Stay',
      total: counts.total,
      verified: counts.verified,
      car: counts.car,
      land: counts.land,
      commercial: counts.commercial,
    },
  });
});
