const Listing = require('../../models/Listing');
const Favorite = require('../../models/Favorite');
const AuditLog = require('../../models/AuditLog');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { setFlash } = require('../../utils/flash');
const { validateListingPayload } = require('../../utils/validators');
const { uploadManyToCloudinary, deleteManyFromCloudinary } = require('../../services/mediaService');
const { getMonetizationContext } = require('../../services/monetizationService');


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
  if (listing.apartmentIntel?.securityRating && listing.apartmentIntel.securityRating !== 'unknown') tags.push(`${listing.apartmentIntel.securityRating} security`);
  if (listing.apartmentIntel?.trafficIndicator && listing.apartmentIntel.trafficIndicator !== 'unknown') tags.push(`${listing.apartmentIntel.trafficIndicator} traffic`);
  (listing.amenities || []).slice(0, 5).forEach((item) => tags.push(item));
  return [...new Set(tags)].slice(0, 7);
}

function normalizeListing(listing) {
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
    videos: (listing.videos || []).map((video) => video.url),
    apartmentIntel: listing.apartmentIntel || {},
    desc: listing.description,
    url: `/listings/${listing.slug}`,
  };
}

function canEditListing(user, listing) {
  return ['admin', 'super-admin'].includes(user.role) || String(listing.owner) === String(user._id) || (user.role === 'agent' && listing.assignedAgent && String(listing.assignedAgent) === String(user._id));
}

function buildListingBody(body, user, current = null) {
  const payload = {
    title: String(body.title || '').trim(),
    description: String(body.description || '').trim(),
    category: body.category,
    purpose: body.purpose || 'rent',
    price: { amount: Number(body.priceAmount), currency: body.currency || 'USD', unit: body.priceUnit || 'month', negotiable: body.negotiable === 'true' || body.negotiable === 'on' },
    location: {
      country: body.country || (current?.location?.country || 'South Sudan'),
      city: body.city || 'Juba',
      area: body.area,
      addressLine: body.addressLine,
      latitude: body.latitude ? Number(body.latitude) : undefined,
      longitude: body.longitude ? Number(body.longitude) : undefined,
    },
    specs: {
      bedrooms: body.bedrooms ? Number(body.bedrooms) : undefined,
      bathrooms: body.bathrooms ? Number(body.bathrooms) : undefined,
      sizeSqm: body.sizeSqm ? Number(body.sizeSqm) : undefined,
      landSize: body.landSize ? Number(body.landSize) : undefined,
      seats: body.seats ? Number(body.seats) : undefined,
      transmission: body.transmission || undefined,
      fuelType: body.fuelType || undefined,
      year: body.year ? Number(body.year) : undefined,
      mileage: body.mileage ? Number(body.mileage) : undefined,
      furnished: body.furnished === 'true' || body.furnished === 'on',
    },
    amenities: String(body.amenities || '').split(',').map(v => v.trim()).filter(Boolean),
    apartmentIntel: {
      surveyFeePaid: body.surveyFeePaid === 'true' || body.surveyFeePaid === 'on',
      securityRating: body.securityRating || 'unknown',
      trafficIndicator: body.trafficIndicator || 'unknown',
      availableFrom: body.availableFrom ? new Date(body.availableFrom) : undefined,
      expectedVacateAt: body.expectedVacateAt ? new Date(body.expectedVacateAt) : undefined,
    },
    monetization: {
      tier: ['free', 'standard', 'premium'].includes(String(body.tier || '').toLowerCase()) ? String(body.tier).toLowerCase() : (current?.monetization?.tier || 'free'),
      featuredRequested: body.useFeaturedSlot === 'true' || body.useFeaturedSlot === 'on',
      verificationRequested: body.verificationRequested === 'true' || body.verificationRequested === 'on',
      verificationPaid: current?.monetization?.verificationPaid || false,
      viewingFeeEnabled: body.viewingFeeEnabled === 'true' || body.viewingFeeEnabled === 'on',
      viewingFeeAmount: body.viewingFeeAmount ? Number(body.viewingFeeAmount) : 0,
      viewingFeeCurrency: body.viewingFeeCurrency || body.currency || current?.monetization?.viewingFeeCurrency || 'USD',
      reservationFeeEnabled: body.reservationFeeEnabled === 'true' || body.reservationFeeEnabled === 'on',
      reservationFeeAmount: body.reservationFeeAmount ? Number(body.reservationFeeAmount) : 0,
      reservationFeeCurrency: body.reservationFeeCurrency || body.currency || current?.monetization?.reservationFeeCurrency || 'USD',
      leadAccess: body.leadAccess === 'paid' ? 'paid' : 'open',
      planSnapshot: current?.monetization?.planSnapshot || 'free',
      lastMonetizedAt: new Date(),
    },
  };
  if (!current) {
    payload.owner = user._id;
    payload.assignedAgent = user.role === 'agent' ? user._id : undefined;
    payload.status = 'published';
    payload.verified = ['admin', 'super-admin'].includes(user.role) ? body.verified === 'true' || body.verified === 'on' : false;
    payload.featured = ['admin', 'super-admin'].includes(user.role) ? body.featured === 'true' || body.featured === 'on' : false;
    payload.publishedAt = new Date();
  }
  return payload;
}

function applyUploadedMedia(listing, uploads = []) {
  const imageUploads = uploads.filter((item) => item.resource_type !== 'video');
  const videoUploads = uploads.filter((item) => item.resource_type === 'video');

  if (imageUploads.length) {
    const newImages = imageUploads.map((item, index) => ({
      url: item.secure_url,
      publicId: item.public_id,
      width: item.width,
      height: item.height,
      isPrimary: !listing.images?.length && index === 0,
    }));
    listing.images.push(...newImages);
    if (!listing.images.some((img) => img.isPrimary) && listing.images[0]) listing.images[0].isPrimary = true;
  }

  if (videoUploads.length) {
    const newVideos = videoUploads.map((item) => ({
      url: item.secure_url,
      publicId: item.public_id,
      duration: item.duration,
      width: item.width,
      height: item.height,
    }));
    listing.videos.push(...newVideos);
  }
}

exports.index = asyncHandler(async (req, res) => {
  const filter = { status: 'published' };
  const categoryAliases = { homes: 'house', home: 'house', houses: 'house', cars: 'car', offices: 'office', commercial: 'shop', shops: 'shop', airbnb: 'shortstay', 'short-stay': 'shortstay' };
  const requestedCategory = String(req.query.category || '').trim().toLowerCase();
  if (requestedCategory) filter.category = categoryAliases[requestedCategory] || requestedCategory;

  const area = String(req.query.area || '').trim();
  const q = String(req.query.q || '').trim();
  if (q) {
    filter.$or = [
      { title: new RegExp(q, 'i') },
      { description: new RegExp(q, 'i') },
      { 'location.area': new RegExp(q, 'i') },
      { 'location.city': new RegExp(q, 'i') },
      { amenities: new RegExp(q, 'i') },
    ];
  }
  if (area && area !== 'all') filter['location.area'] = new RegExp(area, 'i');
  if (String(req.query.verified || '') === '1') filter.verified = true;

  const priceRanges = {
    '0-500': [0, 500],
    '500-1000': [500, 1000],
    '1000-5000': [1000, 5000],
    '5000-1000000000': [5000, 1000000000],
  };
  const selectedRange = String(req.query.price || '').trim();
  if (selectedRange && priceRanges[selectedRange]) {
    const [min, max] = priceRanges[selectedRange];
    filter['price.amount'] = { $gte: min, $lte: max };
  } else if (req.query.minPrice || req.query.maxPrice) {
    filter['price.amount'] = {};
    if (req.query.minPrice) filter['price.amount'].$gte = Number(req.query.minPrice);
    if (req.query.maxPrice) filter['price.amount'].$lte = Number(req.query.maxPrice);
  }

  const sortMap = {
    featured: { featured: -1, verified: -1, createdAt: -1 },
    newest: { featured: -1, createdAt: -1 },
    oldest: { createdAt: 1 },
    'price-asc': { 'price.amount': 1, createdAt: -1 },
    'price-desc': { 'price.amount': -1, createdAt: -1 },
    title: { title: 1 },
  };
  const sort = sortMap[req.query.sort] || sortMap.featured;
  const listingsRaw = await Listing.find(filter)
    .populate('owner', 'firstName lastName email phone')
    .populate('assignedAgent', 'firstName lastName email phone')
    .sort(sort)
    .limit(120)
    .lean();

  let favoriteIds = [];
  if (req.user) favoriteIds = (await Favorite.find({ user: req.user._id }).select('listing').lean()).map((item) => String(item.listing));

  const listings = listingsRaw.map(normalizeListing);
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

  res.render('pages/listings/index', {
    title: 'Browse listings — Classic Rentals',
    homeListingsJson: JSON.stringify(listings),
    favoriteIdsJson: JSON.stringify(favoriteIds),
    areaLabelsJson: JSON.stringify(areaLabels),
    heroImages,
    currentUser: req.user || null,
    pageFilters: {
      q,
      category: requestedCategory || 'all',
      area: area ? slugArea(area) : 'all',
      verifiedOnly: String(req.query.verified || '') === '1',
      sort: String(req.query.sort || 'featured'),
      price: selectedRange || 'all',
    },
  });
});

exports.show = asyncHandler(async (req, res) => {
  const listing = await Listing.findOne({ slug: req.params.slug }).populate('owner assignedAgent').lean();
  if (!listing) return res.status(404).render('pages/errors/404', { title: 'Listing not found' });
  const canViewPrivate = req.user && (String(req.user._id) === String(listing.owner?._id) || ['admin', 'super-admin'].includes(req.user.role));
  if (listing.status !== 'published' && !canViewPrivate) throw new ApiError(403, 'You are not allowed to view this listing');
  res.render('pages/listings/show', {
    title: listing.title,
    listing,
    currentUser: req.user || null,
    mapDefaults: { lat: process.env.MAP_DEFAULT_LAT || '4.8594', lng: process.env.MAP_DEFAULT_LNG || '31.5713' },
  });
});

exports.showCreate = asyncHandler(async (req, res) => {
  const monetization = await getMonetizationContext(req.user);
  res.render('pages/listings/create', { title: 'Create listing', formErrors: {}, old: {}, monetization });
});

exports.createAction = asyncHandler(async (req, res) => {
  const monetization = await getMonetizationContext(req.user);
  const validation = validateListingPayload(req.body);
  if (!validation.ok) {
    return res.status(422).render('pages/listings/create', { title: 'Create listing', formErrors: validation.errors, old: req.body, monetization });
  }
  if (monetization.remaining.listings !== Infinity && monetization.remaining.listings <= 0) {
    setFlash(res, 'error', `Your ${monetization.entitlements.planName} plan has reached its listing limit. Upgrade in billing to publish more listings.`);
    return res.redirect('/dashboard/billing');
  }
  const payload = buildListingBody(req.body, req.user);
  payload.monetization.planSnapshot = monetization.entitlements.planSlug || 'free';
  if (!['admin', 'super-admin'].includes(req.user.role)) {
    const requestedFeatured = payload.monetization?.featuredRequested;
    if (requestedFeatured && (monetization.remaining.featured === Infinity || monetization.remaining.featured > 0)) payload.featured = true;
    else payload.featured = false;
  }
  const listing = await Listing.create(payload);
  if (req.files?.length) {
    const uploads = await uploadManyToCloudinary(req.files, `jubarentals/listings/${listing._id}`);
    applyUploadedMedia(listing, uploads);
    await listing.save();
  }
  await AuditLog.create({ actor: req.user._id, action: 'listing.create.web', entityType: 'Listing', entityId: listing._id, meta: { title: listing.title, tier: listing.monetization?.tier || 'free' } });
  const featureMsg = listing.monetization?.featuredRequested && !listing.featured ? ' Your current plan has no free featured slots left, so the listing was saved as standard.' : '';
  setFlash(res, 'success', `Listing created successfully.${featureMsg}`);
  return res.redirect(`/listings/${listing.slug}/edit`);
});

exports.showEdit = asyncHandler(async (req, res) => {
  const listing = await Listing.findOne({ slug: req.params.slug });
  if (!listing) return res.status(404).render('pages/errors/404', { title: 'Listing not found' });
  if (!canEditListing(req.user, listing)) throw new ApiError(403, 'You are not allowed to edit this listing');
  const monetization = await getMonetizationContext(req.user, { excludeListingId: listing._id });
  res.render('pages/listings/edit', { title: `Edit ${listing.title}`, listing, formErrors: {}, old: null, monetization });
});

exports.updateAction = asyncHandler(async (req, res) => {
  const listingId = req.body.listingId || req.params.id;
  const listing = await Listing.findById(listingId);
  if (!listing) throw new ApiError(404, 'Listing not found');
  if (!canEditListing(req.user, listing)) throw new ApiError(403, 'You are not allowed to edit this listing');
  const monetization = await getMonetizationContext(req.user, { excludeListingId: listing._id });
  const validation = validateListingPayload(req.body);
  if (!validation.ok) {
    const merged = { ...listing.toObject(), ...buildListingBody(req.body, req.user, listing), location: { ...listing.location.toObject?.() || listing.location, ...buildListingBody(req.body, req.user, listing).location }, price: buildListingBody(req.body, req.user, listing).price, specs: buildListingBody(req.body, req.user, listing).specs, amenities: buildListingBody(req.body, req.user, listing).amenities };
    return res.status(422).render('pages/listings/edit', { title: `Edit ${listing.title}`, listing: merged, formErrors: validation.errors, old: req.body, monetization });
  }
  const payload = buildListingBody(req.body, req.user, listing);
  Object.assign(listing, payload);
  if (!['admin', 'super-admin'].includes(req.user.role)) {
    const requestedFeatured = listing.monetization?.featuredRequested;
    const alreadyFeatured = Boolean(listing.featured);
    const canKeepOrUse = alreadyFeatured || monetization.remaining.featured === Infinity || monetization.remaining.featured > 0;
    listing.featured = Boolean(requestedFeatured && canKeepOrUse);
    listing.monetization.planSnapshot = monetization.entitlements.planSlug || listing.monetization?.planSnapshot || 'free';
  }
  if (['admin', 'super-admin'].includes(req.user.role)) {
    listing.featured = req.body.featured === 'true' || req.body.featured === 'on';
    listing.verified = req.body.verified === 'true' || req.body.verified === 'on';
    if (req.body.status) listing.status = req.body.status;
    if (listing.status === 'published' && !listing.publishedAt) listing.publishedAt = new Date();
  }
  if (req.files?.length) {
    const uploads = await uploadManyToCloudinary(req.files, `jubarentals/listings/${listing._id}`);
    applyUploadedMedia(listing, uploads);
  }
  await listing.save();
  await AuditLog.create({ actor: req.user._id, action: 'listing.update.web', entityType: 'Listing', entityId: listing._id, meta: { title: listing.title } });
  const featureMsg = listing.monetization?.featuredRequested && !listing.featured ? ' Featured placement was requested but no featured slot is available on your plan right now.' : '';
  setFlash(res, 'success', `Listing updated successfully.${featureMsg}`);
  return res.redirect(`/listings/${listing.slug}/edit`);
});

exports.deleteAction = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new ApiError(404, 'Listing not found');
  const canDelete = ['admin', 'super-admin'].includes(req.user.role) || String(listing.owner) === String(req.user._id);
  if (!canDelete) throw new ApiError(403, 'You are not allowed to delete this listing');
  const publicIds = [
    ...(listing.images || []).map(img => img.publicId),
    ...(listing.videos || []).map(video => video.publicId),
  ].filter(Boolean);
  if (publicIds.length) await deleteManyFromCloudinary(publicIds);
  await Favorite.deleteMany({ listing: listing._id });
  await listing.deleteOne();
  await AuditLog.create({ actor: req.user._id, action: 'listing.delete.web', entityType: 'Listing', entityId: listing._id, meta: { title: listing.title } });
  setFlash(res, 'success', 'Listing deleted successfully.');
  return res.redirect('/listings/manage');
});

exports.setPrimaryImageAction = asyncHandler(async (req, res) => {
  const listingId = req.body.listingId || req.params.id;
  const listing = await Listing.findById(listingId);
  if (!listing) throw new ApiError(404, 'Listing not found');
  if (!canEditListing(req.user, listing)) throw new ApiError(403, 'You are not allowed to edit this listing');
  const targetPublicId = req.body.publicId || req.params.publicId;
  listing.images.forEach((img) => { img.isPrimary = img.publicId === targetPublicId; });
  await listing.save();
  setFlash(res, 'success', 'Primary image updated.');
  return res.redirect(req.get('referer') || `/listings/${listing.slug}/edit`);
});

exports.removeImageAction = asyncHandler(async (req, res) => {
  const listingId = req.body.listingId || req.params.id;
  const listing = await Listing.findById(listingId);
  if (!listing) throw new ApiError(404, 'Listing not found');
  if (!canEditListing(req.user, listing)) throw new ApiError(403, 'You are not allowed to edit this listing');
  const targetPublicId = req.body.publicId || req.params.publicId;
  const image = listing.images.find((img) => img.publicId === targetPublicId);
  if (!image) throw new ApiError(404, 'Image not found');
  await deleteManyFromCloudinary([image.publicId]);
  listing.images = listing.images.filter((img) => img.publicId !== targetPublicId);
  if (!listing.images.some((img) => img.isPrimary) && listing.images[0]) listing.images[0].isPrimary = true;
  await listing.save();
  setFlash(res, 'success', 'Image removed.');
  return res.redirect(req.get('referer') || `/listings/${listing.slug}/edit`);
});

exports.manageMine = asyncHandler(async (req, res) => {
  const filter = ['admin', 'super-admin'].includes(req.user.role)
    ? {}
    : req.user.role === 'agent'
      ? { $or: [{ owner: req.user._id }, { assignedAgent: req.user._id }] }
      : { owner: req.user._id };

  const categoryAliases = { homes: 'house', home: 'house', houses: 'house', cars: 'car', offices: 'office', commercial: 'shop', shops: 'shop', airbnb: 'shortstay', 'short-stay': 'shortstay' };
  const requestedCategory = String(req.query.category || '').trim().toLowerCase();
  if (requestedCategory) filter.category = categoryAliases[requestedCategory] || requestedCategory;

  const area = String(req.query.area || '').trim();
  const q = String(req.query.q || '').trim();
  if (q) {
    filter.$or = [
      { title: new RegExp(q, 'i') },
      { description: new RegExp(q, 'i') },
      { 'location.area': new RegExp(q, 'i') },
      { 'location.city': new RegExp(q, 'i') },
      { amenities: new RegExp(q, 'i') },
    ];
  }
  if (area && area !== 'all') filter['location.area'] = new RegExp(area, 'i');
  if (String(req.query.verified || '') === '1') filter.verified = true;

  const priceRanges = {
    '0-500': [0, 500],
    '500-1000': [500, 1000],
    '1000-5000': [1000, 5000],
    '5000-1000000000': [5000, 1000000000],
  };
  const selectedRange = String(req.query.price || '').trim();
  if (selectedRange && priceRanges[selectedRange]) {
    const [min, max] = priceRanges[selectedRange];
    filter['price.amount'] = { $gte: min, $lte: max };
  } else if (req.query.minPrice || req.query.maxPrice) {
    filter['price.amount'] = {};
    if (req.query.minPrice) filter['price.amount'].$gte = Number(req.query.minPrice);
    if (req.query.maxPrice) filter['price.amount'].$lte = Number(req.query.maxPrice);
  }

  const sortMap = {
    featured: { featured: -1, verified: -1, createdAt: -1 },
    newest: { featured: -1, createdAt: -1 },
    oldest: { createdAt: 1 },
    'price-asc': { 'price.amount': 1, createdAt: -1 },
    'price-desc': { 'price.amount': -1, createdAt: -1 },
    title: { title: 1 },
  };
  const sort = sortMap[req.query.sort] || sortMap.featured;

  const listingsRaw = await Listing.find(filter)
    .populate('owner', 'firstName lastName email phone')
    .populate('assignedAgent', 'firstName lastName email phone')
    .sort(sort)
    .limit(120)
    .lean();

  let favoriteIds = [];
  if (req.user) {
    favoriteIds = (await Favorite.find({ user: req.user._id }).select('listing').lean()).map((item) => String(item.listing));
  }

  const listings = listingsRaw.map(normalizeListing);
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

  res.render('pages/listings/index', {
    title: 'Browse listings — Classic Rentals',
    homeListingsJson: JSON.stringify(listings),
    favoriteIdsJson: JSON.stringify(favoriteIds),
    areaLabelsJson: JSON.stringify(areaLabels),
    heroImages,
    currentUser: req.user || null,
    pageFilters: {
      q,
      category: requestedCategory || 'all',
      area: area ? slugArea(area) : 'all',
      verifiedOnly: String(req.query.verified || '') === '1',
      sort: String(req.query.sort || 'featured'),
      price: selectedRange || 'all',
    },
  });
});
