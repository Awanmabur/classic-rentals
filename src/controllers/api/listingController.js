const Listing = require('../../models/Listing');
const Favorite = require('../../models/Favorite');
const Inquiry = require('../../models/Inquiry');
const Review = require('../../models/Review');
const Report = require('../../models/Report');
const Promotion = require('../../models/Promotion');
const AuditLog = require('../../models/AuditLog');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { getPagination } = require('../../utils/pagination');
const { validateListingPayload } = require('../../utils/validators');
const { uploadManyToCloudinary, deleteManyFromCloudinary } = require('../../services/mediaService');
const { getMonetizationContext } = require('../../services/monetizationService');
const { getPostingFeeSnapshot } = require('../../services/revenueShareService');
const { createListingPostingCheckout } = require('../../services/listingPaymentService');
const {
  getContactAccess,
  getContactParties,
  sanitizeListingContacts,
  isObjectId,
} = require('../../services/contactAccessService');

function buildListingFilters(query = {}) {
  const filter = {};

  if (query.status) filter.status = query.status;
  if (query.category && query.category !== 'all') filter.category = query.category;
  if (query.purpose && query.purpose !== 'all') filter.purpose = query.purpose;
  if (query.city) filter['location.city'] = new RegExp(query.city, 'i');
  if (query.area) filter['location.area'] = new RegExp(query.area, 'i');
  if (query.verified === 'true') filter.verified = true;
  if (query.featured === 'true') filter.featured = true;

  if (query.minPrice || query.maxPrice) {
    filter['price.amount'] = {};
    if (query.minPrice) filter['price.amount'].$gte = Number(query.minPrice);
    if (query.maxPrice) filter['price.amount'].$lte = Number(query.maxPrice);
  }

  if (query.q) {
    filter.$or = [
      { title: new RegExp(query.q, 'i') },
      { description: new RegExp(query.q, 'i') },
      { 'location.area': new RegExp(query.q, 'i') },
      { amenities: { $in: [new RegExp(query.q, 'i')] } },
    ];
  }

  if (query.bedrooms) filter['specs.bedrooms'] = { $gte: Number(query.bedrooms) };
  if (query.lat && query.lng && query.radiusKm) {
    filter['location.coordinates'] = {
      $near: {
        $geometry: { type: 'Point', coordinates: [Number(query.lng), Number(query.lat)] },
        $maxDistance: Number(query.radiusKm) * 1000,
      },
    };
  }
  if (query.bathrooms) filter['specs.bathrooms'] = { $gte: Number(query.bathrooms) };

  return filter;
}

function buildSort(sort) {
  switch (sort) {
    case 'price_asc':
      return { 'price.amount': 1, createdAt: -1 };
    case 'price_desc':
      return { 'price.amount': -1, createdAt: -1 };
    case 'oldest':
      return { createdAt: 1 };
    case 'popular':
      return { views: -1, createdAt: -1 };
    case 'featured':
      return { featured: -1, verified: -1, createdAt: -1 };
    case 'newest':
    default:
      return { createdAt: -1 };
  }
}

function parseAmenities(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '').split(',').map((v) => v.trim()).filter(Boolean);
}

function publicUserSelect() {
  return 'firstName lastName role avatar';
}

function privateUserSelect() {
  return 'firstName lastName phone email avatar role';
}

function applyUploadedMedia(listing, uploads = []) {
  const imageUploads = uploads.filter((item) => item.resource_type !== 'video');
  const videoUploads = uploads.filter((item) => item.resource_type === 'video');

  if (imageUploads.length) {
    listing.images.push(...imageUploads.map((item, index) => ({
      url: item.secure_url,
      publicId: item.public_id,
      width: item.width,
      height: item.height,
      isPrimary: !listing.images?.length && index === 0,
    })));
    if (!listing.images.some((i) => i.isPrimary) && listing.images[0]) listing.images[0].isPrimary = true;
  }

  if (videoUploads.length) {
    listing.videos.push(...videoUploads.map((item) => ({
      url: item.secure_url,
      publicId: item.public_id,
      duration: item.duration,
      width: item.width,
      height: item.height,
    })));
  }
}

exports.createListing = asyncHandler(async (req, res) => {
  const ownerId = req.user._id;
  const validation = validateListingPayload(req.body);
  if (!validation.ok) {
    throw new ApiError(422, 'Listing validation failed', validation.errors);
  }
  const monetizationContext = await getMonetizationContext(req.user);
  const postingFee = getPostingFeeSnapshot(req.user);
  if (monetizationContext.remaining.listings !== Infinity && monetizationContext.remaining.listings <= 0) {
    throw new ApiError(402, `Your ${monetizationContext.entitlements.planName} plan has reached its listing limit. Upgrade billing to publish more listings.`);
  }

  const payload = {
    title: req.body.title,
    description: req.body.description,
    category: req.body.category,
    purpose: req.body.purpose || 'rent',
    price: {
      amount: Number(req.body.priceAmount),
      currency: req.body.currency || 'USD',
      unit: req.body.priceUnit || 'month',
      negotiable: req.body.negotiable === 'true',
    },
    location: {
      country: req.body.country || 'South Sudan',
      city: req.body.city || 'Juba',
      area: req.body.area,
      addressLine: req.body.addressLine,
      latitude: req.body.latitude ? Number(req.body.latitude) : undefined,
      longitude: req.body.longitude ? Number(req.body.longitude) : undefined,
    },
    specs: {
      bedrooms: req.body.bedrooms ? Number(req.body.bedrooms) : undefined,
      bathrooms: req.body.bathrooms ? Number(req.body.bathrooms) : undefined,
      sizeSqm: req.body.sizeSqm ? Number(req.body.sizeSqm) : undefined,
      landSize: req.body.landSize ? Number(req.body.landSize) : undefined,
      seats: req.body.seats ? Number(req.body.seats) : undefined,
      transmission: req.body.transmission,
      fuelType: req.body.fuelType,
      year: req.body.year ? Number(req.body.year) : undefined,
      mileage: req.body.mileage ? Number(req.body.mileage) : undefined,
      furnished: req.body.furnished === 'true',
    },
    amenities: parseAmenities(req.body.amenities),
    apartmentIntel: {
      surveyFeePaid: req.body.surveyFeePaid === 'true' || req.body.surveyFeePaid === 'on',
      securityRating: req.body.securityRating || 'unknown',
      trafficIndicator: req.body.trafficIndicator || 'unknown',
      availableFrom: req.body.availableFrom ? new Date(req.body.availableFrom) : undefined,
      expectedVacateAt: req.body.expectedVacateAt ? new Date(req.body.expectedVacateAt) : undefined,
    },
    monetization: {
      tier: ['free', 'standard', 'premium'].includes(String(req.body.tier || '').toLowerCase()) ? String(req.body.tier).toLowerCase() : 'free',
      featuredRequested: req.body.useFeaturedSlot === 'true' || req.body.useFeaturedSlot === 'on',
      verificationRequested: req.body.verificationRequested === 'true' || req.body.verificationRequested === 'on',
      viewingFeeEnabled: req.body.viewingFeeEnabled === 'true' || req.body.viewingFeeEnabled === 'on',
      viewingFeeAmount: req.body.viewingFeeAmount ? Number(req.body.viewingFeeAmount) : 0,
      viewingFeeCurrency: req.body.viewingFeeCurrency || req.body.currency || 'USD',
      reservationFeeEnabled: req.body.reservationFeeEnabled === 'true' || req.body.reservationFeeEnabled === 'on',
      reservationFeeAmount: req.body.reservationFeeAmount ? Number(req.body.reservationFeeAmount) : 0,
      reservationFeeCurrency: req.body.reservationFeeCurrency || req.body.currency || 'USD',
      leadAccess: req.body.leadAccess === 'open' ? 'open' : 'paid',
      contactFeeAmount: req.body.contactFeeAmount ? Number(req.body.contactFeeAmount) : 5,
      contactFeeCurrency: req.body.contactFeeCurrency || req.body.currency || 'USD',
      ...postingFee,
      planSnapshot: monetizationContext.entitlements.planSlug || 'free',
      lastMonetizedAt: new Date(),
    },
    owner: ownerId,
    assignedAgent: req.user.role === 'agent' ? ownerId : (req.body.assignedAgent || undefined),
    status: postingFee.postingFeeRequired ? 'pending' : 'published',
    verified: ['admin', 'super-admin'].includes(req.user.role) ? req.body.verified === 'true' : false,
    featured: ['admin', 'super-admin'].includes(req.user.role) ? req.body.featured === 'true' : false,
    publishedAt: postingFee.postingFeeRequired ? undefined : new Date(),
  };

  if (!['admin', 'super-admin'].includes(req.user.role)) {
    const requestedFeatured = payload.monetization?.featuredRequested;
    payload.featured = Boolean(requestedFeatured && (monetizationContext.remaining.featured === Infinity || monetizationContext.remaining.featured > 0));
  }

  const listing = await Listing.create(payload);

  if (req.files?.length) {
    const uploads = await uploadManyToCloudinary(req.files, `jubarentals/listings/${listing._id}`);
    applyUploadedMedia(listing, uploads);
    await listing.save();
  }

  await AuditLog.create({
    actor: req.user._id,
    action: 'listing.create',
    entityType: 'Listing',
    entityId: listing._id,
    meta: { title: listing.title, category: listing.category },
  });

  if (listing.monetization?.postingFeeRequired && listing.monetization?.postingFeeStatus === 'pending') {
    try {
      const checkout = await createListingPostingCheckout({ user: req.user, listing });
      return res.status(201).json({
        success: true,
        message: 'Listing created. Continue to posting fee payment.',
        data: listing,
        meta: { paymentRequired: true, redirectUrl: checkout.redirectUrl, paymentId: checkout.payment?._id },
      });
    } catch (error) {
      return res.status(201).json({
        success: true,
        message: `${error.message} Listing saved as pending until the landlord posting fee is paid.`,
        data: listing,
        meta: { paymentRequired: true },
      });
    }
  }

  res.status(201).json({ success: true, message: 'Listing created successfully', data: listing });
});

exports.getListings = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = buildListingFilters({ ...req.query, status: req.query.status || 'published' });
  const sort = buildSort(req.query.sort);

  const [items, total] = await Promise.all([
    Listing.find(filter)
      .populate('owner', publicUserSelect())
      .populate('assignedAgent', publicUserSelect())
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Listing.countDocuments(filter),
  ]);

  let favoriteIds = new Set();
  if (req.user) {
    const favs = await Favorite.find({ user: req.user._id, listing: { $in: items.map((i) => i._id) } }).select('listing').lean();
    favoriteIds = new Set(favs.map((f) => String(f.listing)));
  }

  const data = items.map((item) => ({ ...item, isFavorite: favoriteIds.has(String(item._id)) }));

  res.json({
    success: true,
    data,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
      hasNext: skip + items.length < total,
      hasPrev: page > 1,
    },
  });
});

exports.getListingBySlug = asyncHandler(async (req, res) => {
  const lookup = isObjectId(req.params.slug)
    ? { $or: [{ slug: req.params.slug }, { _id: req.params.slug }] }
    : { slug: req.params.slug };
  const listing = await Listing.findOne(lookup)
    .populate('owner', privateUserSelect())
    .populate('assignedAgent', privateUserSelect());

  if (!listing) throw new ApiError(404, 'Listing not found');

  const canViewPrivate = req.user && (
    String(req.user._id) === String(listing.owner?._id) ||
    String(req.user._id) === String(listing.assignedAgent?._id) ||
    ['admin', 'super-admin'].includes(req.user.role)
  );

  if (listing.status !== 'published' && !canViewPrivate) {
    throw new ApiError(403, 'You are not allowed to view this listing');
  }

  listing.views += 1;
  await listing.save();

  const [inquiryCount, reviews, isFavorite] = await Promise.all([
    Inquiry.countDocuments({ listing: listing._id }),
    Review.find({ listing: listing._id, status: 'published' }).populate('user', 'firstName lastName avatar').sort({ createdAt: -1 }).limit(5).lean(),
    req.user ? Favorite.exists({ user: req.user._id, listing: listing._id }) : false,
  ]);
  const contactAccess = await getContactAccess({ user: req.user, listing, accessTokens: req.signedCookies?.cr_contact_access });
  const listingData = sanitizeListingContacts(listing.toObject());

  res.json({
    success: true,
    data: {
      ...listingData,
      inquiryCount,
      reviews,
      isFavorite: Boolean(isFavorite),
      contactAccess: {
        hasAccess: contactAccess.hasAccess,
        reason: contactAccess.reason,
        policy: contactAccess.policy,
      },
      contactParties: getContactParties(listing, contactAccess.hasAccess),
    },
  });
});

exports.getListingContact = asyncHandler(async (req, res) => {
  const lookup = isObjectId(req.params.id)
    ? { $or: [{ _id: req.params.id }, { slug: req.params.id }] }
    : { slug: req.params.id };
  const listing = await Listing.findOne(lookup)
    .populate('owner', privateUserSelect())
    .populate('assignedAgent', privateUserSelect());

  if (!listing || listing.status !== 'published') throw new ApiError(404, 'Listing not found');

  const contactAccess = await getContactAccess({ user: req.user, listing, accessTokens: req.signedCookies?.cr_contact_access });
  if (!contactAccess.hasAccess) {
    return res.status(402).json({
      success: false,
      message: 'Payment is required to unlock contact details.',
      code: 'PAYMENT_REQUIRED',
      data: { policy: contactAccess.policy },
    });
  }

  return res.json({
    success: true,
    data: {
      listing: { _id: listing._id, slug: listing.slug, title: listing.title },
      contactParties: getContactParties(listing, true),
      contactAccess: {
        hasAccess: true,
        reason: contactAccess.reason,
        policy: contactAccess.policy,
      },
    },
  });
});

exports.updateListing = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new ApiError(404, 'Listing not found');

  const canEdit = ['admin', 'super-admin'].includes(req.user.role)
    || String(listing.owner) === String(req.user._id)
    || (req.user.role === 'agent' && listing.assignedAgent && String(listing.assignedAgent) === String(req.user._id));

  if (!canEdit) throw new ApiError(403, 'You are not allowed to update this listing');

  const scalarFields = ['title', 'description', 'category', 'purpose'];
  scalarFields.forEach((field) => {
    if (typeof req.body[field] !== 'undefined') listing[field] = req.body[field];
  });

  if (req.body.priceAmount) listing.price.amount = Number(req.body.priceAmount);
  if (req.body.currency) listing.price.currency = req.body.currency;
  if (req.body.priceUnit) listing.price.unit = req.body.priceUnit;
  if (typeof req.body.negotiable !== 'undefined') listing.price.negotiable = req.body.negotiable === 'true';

  if (req.body.country) listing.location.country = req.body.country;
  if (req.body.city) listing.location.city = req.body.city;
  if (req.body.area) listing.location.area = req.body.area;
  if (req.body.addressLine) listing.location.addressLine = req.body.addressLine;
  if (typeof req.body.latitude !== 'undefined') listing.location.latitude = req.body.latitude ? Number(req.body.latitude) : undefined;
  if (typeof req.body.longitude !== 'undefined') listing.location.longitude = req.body.longitude ? Number(req.body.longitude) : undefined;

  if (typeof req.body.bedrooms !== 'undefined') listing.specs.bedrooms = req.body.bedrooms ? Number(req.body.bedrooms) : undefined;
  if (typeof req.body.bathrooms !== 'undefined') listing.specs.bathrooms = req.body.bathrooms ? Number(req.body.bathrooms) : undefined;
  if (typeof req.body.sizeSqm !== 'undefined') listing.specs.sizeSqm = req.body.sizeSqm ? Number(req.body.sizeSqm) : undefined;
  if (typeof req.body.landSize !== 'undefined') listing.specs.landSize = req.body.landSize ? Number(req.body.landSize) : undefined;
  if (typeof req.body.seats !== 'undefined') listing.specs.seats = req.body.seats ? Number(req.body.seats) : undefined;
  if (typeof req.body.transmission !== 'undefined') listing.specs.transmission = req.body.transmission;
  if (typeof req.body.fuelType !== 'undefined') listing.specs.fuelType = req.body.fuelType;
  if (typeof req.body.year !== 'undefined') listing.specs.year = req.body.year ? Number(req.body.year) : undefined;
  if (typeof req.body.mileage !== 'undefined') listing.specs.mileage = req.body.mileage ? Number(req.body.mileage) : undefined;
  if (typeof req.body.furnished !== 'undefined') listing.specs.furnished = req.body.furnished === 'true';

  if (typeof req.body.amenities !== 'undefined') listing.amenities = parseAmenities(req.body.amenities);
  if (!listing.apartmentIntel) listing.apartmentIntel = {};
  if (typeof req.body.surveyFeePaid !== 'undefined') listing.apartmentIntel.surveyFeePaid = req.body.surveyFeePaid === 'true' || req.body.surveyFeePaid === 'on';
  if (typeof req.body.securityRating !== 'undefined') listing.apartmentIntel.securityRating = req.body.securityRating || 'unknown';
  if (typeof req.body.trafficIndicator !== 'undefined') listing.apartmentIntel.trafficIndicator = req.body.trafficIndicator || 'unknown';
  if (typeof req.body.availableFrom !== 'undefined') listing.apartmentIntel.availableFrom = req.body.availableFrom ? new Date(req.body.availableFrom) : undefined;
  if (typeof req.body.expectedVacateAt !== 'undefined') listing.apartmentIntel.expectedVacateAt = req.body.expectedVacateAt ? new Date(req.body.expectedVacateAt) : undefined;

  if (!listing.monetization) listing.monetization = {};
  if (typeof req.body.tier !== 'undefined') {
    listing.monetization.tier = ['free', 'standard', 'premium'].includes(String(req.body.tier).toLowerCase()) ? String(req.body.tier).toLowerCase() : listing.monetization.tier;
  }
  if (typeof req.body.useFeaturedSlot !== 'undefined') listing.monetization.featuredRequested = req.body.useFeaturedSlot === 'true' || req.body.useFeaturedSlot === 'on';
  if (typeof req.body.verificationRequested !== 'undefined') listing.monetization.verificationRequested = req.body.verificationRequested === 'true' || req.body.verificationRequested === 'on';
  if (typeof req.body.viewingFeeEnabled !== 'undefined') listing.monetization.viewingFeeEnabled = req.body.viewingFeeEnabled === 'true' || req.body.viewingFeeEnabled === 'on';
  if (typeof req.body.viewingFeeAmount !== 'undefined') listing.monetization.viewingFeeAmount = req.body.viewingFeeAmount ? Number(req.body.viewingFeeAmount) : 0;
  if (typeof req.body.viewingFeeCurrency !== 'undefined') listing.monetization.viewingFeeCurrency = req.body.viewingFeeCurrency || listing.price?.currency || 'USD';
  if (typeof req.body.reservationFeeEnabled !== 'undefined') listing.monetization.reservationFeeEnabled = req.body.reservationFeeEnabled === 'true' || req.body.reservationFeeEnabled === 'on';
  if (typeof req.body.reservationFeeAmount !== 'undefined') listing.monetization.reservationFeeAmount = req.body.reservationFeeAmount ? Number(req.body.reservationFeeAmount) : 0;
  if (typeof req.body.reservationFeeCurrency !== 'undefined') listing.monetization.reservationFeeCurrency = req.body.reservationFeeCurrency || listing.price?.currency || 'USD';
  if (typeof req.body.leadAccess !== 'undefined') listing.monetization.leadAccess = req.body.leadAccess === 'open' ? 'open' : 'paid';
  if (typeof req.body.contactFeeAmount !== 'undefined') listing.monetization.contactFeeAmount = req.body.contactFeeAmount ? Number(req.body.contactFeeAmount) : 5;
  if (typeof req.body.contactFeeCurrency !== 'undefined') listing.monetization.contactFeeCurrency = req.body.contactFeeCurrency || listing.price?.currency || 'USD';
  listing.monetization.lastMonetizedAt = new Date();

  if (['admin', 'super-admin'].includes(req.user.role)) {
    if (typeof req.body.featured !== 'undefined') listing.featured = req.body.featured === 'true';
    if (typeof req.body.verified !== 'undefined') listing.verified = req.body.verified === 'true';
    if (req.body.status) listing.status = req.body.status;
    if (req.body.assignedAgent) listing.assignedAgent = req.body.assignedAgent || undefined;
    if (listing.status === 'published' && !listing.publishedAt) listing.publishedAt = new Date();
  }

  if (req.files?.length) {
    const uploads = await uploadManyToCloudinary(req.files, `jubarentals/listings/${listing._id}`);
    applyUploadedMedia(listing, uploads);
  }

  await listing.save();

  await AuditLog.create({
    actor: req.user._id,
    action: 'listing.update',
    entityType: 'Listing',
    entityId: listing._id,
    meta: { title: listing.title },
  });

  res.json({ success: true, message: 'Listing updated successfully', data: listing });
});

exports.deleteListing = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new ApiError(404, 'Listing not found');

  const canDelete = ['admin', 'super-admin'].includes(req.user.role) || String(listing.owner) === String(req.user._id);
  if (!canDelete) throw new ApiError(403, 'You are not allowed to delete this listing');

  const publicIds = [
    ...listing.images.map((img) => img.publicId),
    ...(listing.videos || []).map((video) => video.publicId),
  ].filter(Boolean);
  if (publicIds.length) await deleteManyFromCloudinary(publicIds);

  await Promise.all([
    Favorite.deleteMany({ listing: listing._id }),
    Inquiry.deleteMany({ listing: listing._id }),
    Review.deleteMany({ listing: listing._id }),
    Report.deleteMany({ listing: listing._id }),
    Promotion.deleteMany({ listing: listing._id }),
    listing.deleteOne(),
    AuditLog.create({
      actor: req.user._id,
      action: 'listing.delete',
      entityType: 'Listing',
      entityId: listing._id,
      meta: { title: listing.title },
    }),
  ]);

  res.json({ success: true, message: 'Listing deleted successfully' });
});

exports.setPrimaryImage = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new ApiError(404, 'Listing not found');

  const canEdit = ['admin', 'super-admin'].includes(req.user.role) || String(listing.owner) === String(req.user._id);
  if (!canEdit) throw new ApiError(403, 'You are not allowed to edit this listing');

  const image = listing.images.find((i) => i.publicId === req.params.publicId);
  if (!image) throw new ApiError(404, 'Image not found');

  listing.images.forEach((i) => { i.isPrimary = i.publicId === req.params.publicId; });
  await listing.save();

  res.json({ success: true, message: 'Primary image updated', data: listing.images });
});

exports.removeImage = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new ApiError(404, 'Listing not found');

  const canEdit = ['admin', 'super-admin'].includes(req.user.role) || String(listing.owner) === String(req.user._id);
  if (!canEdit) throw new ApiError(403, 'You are not allowed to edit this listing');

  const image = listing.images.find((i) => i.publicId === req.params.publicId);
  if (!image) throw new ApiError(404, 'Image not found');

  await deleteManyFromCloudinary([image.publicId]);
  listing.images = listing.images.filter((i) => i.publicId !== req.params.publicId);
  if (!listing.images.some((i) => i.isPrimary) && listing.images[0]) listing.images[0].isPrimary = true;
  await listing.save();

  res.json({ success: true, message: 'Image removed', data: listing.images });
});

exports.adminModerateListing = asyncHandler(async (req, res) => {
  if (!['admin', 'super-admin'].includes(req.user.role)) throw new ApiError(403, 'Forbidden');

  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new ApiError(404, 'Listing not found');

  const allowedStatuses = ['pending', 'published', 'rejected', 'archived'];
  if (req.body.status && !allowedStatuses.includes(req.body.status)) {
    throw new ApiError(400, 'Invalid status');
  }

  if (req.body.status) listing.status = req.body.status;
  if (typeof req.body.verified !== 'undefined') listing.verified = req.body.verified === 'true';
  if (typeof req.body.featured !== 'undefined') listing.featured = req.body.featured === 'true';

  listing.moderation = {
    moderatedBy: req.user._id,
    moderatedAt: new Date(),
    moderationNote: req.body.moderationNote || '',
  };

  if (listing.status === 'published' && !listing.publishedAt) listing.publishedAt = new Date();

  await listing.save();

  await AuditLog.create({
    actor: req.user._id,
    action: 'listing.moderate',
    entityType: 'Listing',
    entityId: listing._id,
    meta: { status: listing.status, verified: listing.verified, featured: listing.featured },
  });

  res.json({ success: true, message: 'Listing moderated successfully', data: listing });
});
