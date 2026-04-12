const Listing = require('../../models/Listing');
const Favorite = require('../../models/Favorite');
const AuditLog = require('../../models/AuditLog');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { setFlash } = require('../../utils/flash');
const { validateListingPayload } = require('../../utils/validators');
const { uploadManyToCloudinary, deleteManyFromCloudinary } = require('../../services/mediaService');

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

exports.index = asyncHandler(async (req, res) => {
  const filter = { status: 'published' };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.q) filter.$or = [{ title: new RegExp(req.query.q, 'i') }, { description: new RegExp(req.query.q, 'i') }, { 'location.area': new RegExp(req.query.q, 'i') }];
  if (req.query.minPrice || req.query.maxPrice) {
    filter['price.amount'] = {};
    if (req.query.minPrice) filter['price.amount'].$gte = Number(req.query.minPrice);
    if (req.query.maxPrice) filter['price.amount'].$lte = Number(req.query.maxPrice);
  }
  if (req.query.lat && req.query.lng && req.query.radiusKm) {
    filter['location.coordinates'] = {
      $near: {
        $geometry: { type: 'Point', coordinates: [Number(req.query.lng), Number(req.query.lat)] },
        $maxDistance: Number(req.query.radiusKm) * 1000,
      },
    };
  }
  const listings = await Listing.find(filter).sort({ featured: -1, createdAt: -1 }).limit(36).lean();
  let favoriteIds = [];
  if (req.user) favoriteIds = (await Favorite.find({ user: req.user._id }).select('listing').lean()).map((item) => String(item.listing));
  res.render('pages/listings/index', { title: 'Listings', listings, favoriteIds, filters: req.query || {}, mapDefaults: { lat: process.env.MAP_DEFAULT_LAT || '4.8594', lng: process.env.MAP_DEFAULT_LNG || '31.5713' } });
});

exports.show = asyncHandler(async (req, res) => {
  const listing = await Listing.findOne({ slug: req.params.slug }).populate('owner assignedAgent').lean();
  if (!listing) return res.status(404).render('pages/errors/404', { title: 'Listing not found' });
  const canViewPrivate = req.user && (String(req.user._id) === String(listing.owner?._id) || ['admin', 'super-admin'].includes(req.user.role));
  if (listing.status !== 'published' && !canViewPrivate) throw new ApiError(403, 'You are not allowed to view this listing');
  res.render('pages/listings/show', { title: listing.title, listing, mapDefaults: { lat: process.env.MAP_DEFAULT_LAT || '4.8594', lng: process.env.MAP_DEFAULT_LNG || '31.5713' } });
});

exports.showCreate = asyncHandler(async (req, res) => {
  res.render('pages/listings/create', { title: 'Create listing', formErrors: {}, old: {} });
});

exports.createAction = asyncHandler(async (req, res) => {
  const validation = validateListingPayload(req.body);
  if (!validation.ok) {
    return res.status(422).render('pages/listings/create', { title: 'Create listing', formErrors: validation.errors, old: req.body });
  }
  const listing = await Listing.create(buildListingBody(req.body, req.user));
  if (req.files?.length) {
    const uploads = await uploadManyToCloudinary(req.files, `jubarentals/listings/${listing._id}`);
    listing.images = uploads.map((item, index) => ({ url: item.secure_url, publicId: item.public_id, width: item.width, height: item.height, isPrimary: index === 0 }));
    await listing.save();
  }
  await AuditLog.create({ actor: req.user._id, action: 'listing.create.web', entityType: 'Listing', entityId: listing._id, meta: { title: listing.title } });
  setFlash(res, 'success', 'Listing created successfully.');
  return res.redirect('/listings/manage');
});

exports.showEdit = asyncHandler(async (req, res) => {
  const listing = await Listing.findOne({ slug: req.params.slug });
  if (!listing) return res.status(404).render('pages/errors/404', { title: 'Listing not found' });
  if (!canEditListing(req.user, listing)) throw new ApiError(403, 'You are not allowed to edit this listing');
  res.render('pages/listings/edit', { title: `Edit ${listing.title}`, listing, formErrors: {}, old: null });
});

exports.updateAction = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new ApiError(404, 'Listing not found');
  if (!canEditListing(req.user, listing)) throw new ApiError(403, 'You are not allowed to edit this listing');
  const validation = validateListingPayload(req.body);
  if (!validation.ok) {
    const merged = { ...listing.toObject(), ...buildListingBody(req.body, req.user, listing), location: { ...listing.location.toObject?.() || listing.location, ...buildListingBody(req.body, req.user, listing).location }, price: buildListingBody(req.body, req.user, listing).price, specs: buildListingBody(req.body, req.user, listing).specs, amenities: buildListingBody(req.body, req.user, listing).amenities };
    return res.status(422).render('pages/listings/edit', { title: `Edit ${listing.title}`, listing: merged, formErrors: validation.errors, old: req.body });
  }
  const payload = buildListingBody(req.body, req.user, listing);
  Object.assign(listing, payload);
  if (['admin', 'super-admin'].includes(req.user.role)) {
    listing.featured = req.body.featured === 'true' || req.body.featured === 'on';
    listing.verified = req.body.verified === 'true' || req.body.verified === 'on';
    if (req.body.status) listing.status = req.body.status;
    if (listing.status === 'published' && !listing.publishedAt) listing.publishedAt = new Date();
  }
  if (req.files?.length) {
    const uploads = await uploadManyToCloudinary(req.files, `jubarentals/listings/${listing._id}`);
    const newImages = uploads.map((item) => ({ url: item.secure_url, publicId: item.public_id, width: item.width, height: item.height, isPrimary: false }));
    listing.images.push(...newImages);
    if (!listing.images.some(i => i.isPrimary) && listing.images[0]) listing.images[0].isPrimary = true;
  }
  await listing.save();
  await AuditLog.create({ actor: req.user._id, action: 'listing.update.web', entityType: 'Listing', entityId: listing._id, meta: { title: listing.title } });
  setFlash(res, 'success', 'Listing updated successfully.');
  return res.redirect('/listings/manage');
});

exports.deleteAction = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new ApiError(404, 'Listing not found');
  const canDelete = ['admin', 'super-admin'].includes(req.user.role) || String(listing.owner) === String(req.user._id);
  if (!canDelete) throw new ApiError(403, 'You are not allowed to delete this listing');
  const publicIds = (listing.images || []).map(img => img.publicId).filter(Boolean);
  if (publicIds.length) await deleteManyFromCloudinary(publicIds);
  await Favorite.deleteMany({ listing: listing._id });
  await listing.deleteOne();
  await AuditLog.create({ actor: req.user._id, action: 'listing.delete.web', entityType: 'Listing', entityId: listing._id, meta: { title: listing.title } });
  setFlash(res, 'success', 'Listing deleted successfully.');
  return res.redirect('/listings/manage');
});

exports.setPrimaryImageAction = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new ApiError(404, 'Listing not found');
  if (!canEditListing(req.user, listing)) throw new ApiError(403, 'You are not allowed to edit this listing');
  listing.images.forEach((img) => { img.isPrimary = img.publicId === req.params.publicId; });
  await listing.save();
  setFlash(res, 'success', 'Primary image updated.');
  return res.redirect(req.get('referer') || `/listings/${listing.slug}/edit`);
});

exports.removeImageAction = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new ApiError(404, 'Listing not found');
  if (!canEditListing(req.user, listing)) throw new ApiError(403, 'You are not allowed to edit this listing');
  const image = listing.images.find((img) => img.publicId === req.params.publicId);
  if (!image) throw new ApiError(404, 'Image not found');
  await deleteManyFromCloudinary([image.publicId]);
  listing.images = listing.images.filter((img) => img.publicId !== req.params.publicId);
  if (!listing.images.some((img) => img.isPrimary) && listing.images[0]) listing.images[0].isPrimary = true;
  await listing.save();
  setFlash(res, 'success', 'Image removed.');
  return res.redirect(req.get('referer') || `/listings/${listing.slug}/edit`);
});

exports.manageMine = asyncHandler(async (req, res) => {
  const filter = ['admin', 'super-admin'].includes(req.user.role) ? {} : req.user.role === 'agent' ? { $or: [{ owner: req.user._id }, { assignedAgent: req.user._id }] } : { owner: req.user._id };
  const listings = await Listing.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  res.render('pages/listings/manage', { title: 'Manage listings', listings });
});
