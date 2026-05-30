const Inquiry = require('../../models/Inquiry');
const Listing = require('../../models/Listing');
const Payment = require('../../models/Payment');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const pesapal = require('../../services/pesapalService');
const { getContactAccess, getContactAccessPolicy, sanitizeInquiryContact } = require('../../services/contactAccessService');
const { resolvePromotionForListing } = require('../../services/promotionService');
const { calculateFeeSplit } = require('../../services/revenueShareService');

function makeReference(prefix = 'INQ') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

exports.createInquiry = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.listingId).populate('owner');
  if (!listing || listing.status !== 'published') throw new ApiError(404, 'Listing not found');

  let requestedType = ['general', 'contact', 'viewing', 'reservation', 'booking'].includes(req.body.type) ? req.body.type : 'general';
  const monetization = listing.monetization || {};
  const contactPolicy = getContactAccessPolicy(listing);
  const contactAccess = ['general', 'contact'].includes(requestedType)
    ? await getContactAccess({ user: req.user, listing, accessTokens: req.signedCookies?.cr_contact_access })
    : { hasAccess: false };
  let feeSnapshot = { status: 'not_required' };
  if (['general', 'contact'].includes(requestedType) && contactPolicy.requiresPayment && !contactAccess.hasAccess) {
    requestedType = 'contact';
    feeSnapshot = {
      ...contactPolicy.fee,
      status: 'pending',
      reference: req.body.feeReference || '',
    };
  }
  if (requestedType === 'viewing' && monetization.viewingFeeEnabled && Number(monetization.viewingFeeAmount) > 0) {
    feeSnapshot = { label: 'Viewing fee', amount: Number(monetization.viewingFeeAmount), currency: monetization.viewingFeeCurrency || listing.price?.currency || 'USD', status: 'pending', reference: req.body.feeReference || '' };
  }
  if ((requestedType === 'reservation' || requestedType === 'booking') && monetization.reservationFeeEnabled && Number(monetization.reservationFeeAmount) > 0) {
    feeSnapshot = { label: 'Reservation fee', amount: Number(monetization.reservationFeeAmount), currency: monetization.reservationFeeCurrency || listing.price?.currency || 'USD', status: 'pending', reference: req.body.feeReference || '' };
  }

  const payload = {
    listing: listing._id,
    sender: req.user?._id,
    owner: listing.owner?._id,
    name: req.body.name || req.user?.fullName || 'Guest',
    email: req.body.email || req.user?.email,
    phone: req.body.phone || req.user?.phone,
    type: requestedType,
    feeSnapshot,
    message: req.body.message,
  };

  if (!payload.message) throw new ApiError(400, 'Message is required');

  const requiresFee = feeSnapshot.status === 'pending' && Number(feeSnapshot.amount || 0) > 0;
  const provider = String(req.body.provider || '').trim().toLowerCase() === 'pesapal' ? 'pesapal' : '';
  if (requiresFee && !payload.email) throw new ApiError(400, 'Email is required to continue with payment.');
  if (requiresFee && provider !== 'pesapal') {
    return res.status(402).json({
      success: false,
      message: `${feeSnapshot.label || 'Payment'} is required before contacts or paid requests are unlocked.`,
      code: 'PAYMENT_REQUIRED',
      data: { feeSnapshot },
    });
  }
  if (requiresFee && provider === 'pesapal' && !pesapal.isConfigured()) {
    throw new ApiError(503, 'Pesapal checkout is not configured on this server yet.');
  }

  const inquiry = await Inquiry.create(payload);

  if (requiresFee && provider === 'pesapal') {
    const merchantReference = makeReference('INQ');
    const promotionToken = req.body.promoToken || req.signedCookies?.cr_promo;
    const resolvedPromotion = await resolvePromotionForListing({ token: promotionToken, listingId: listing._id });
    const promotion = resolvedPromotion && String(resolvedPromotion.promoter) !== String(req.user?._id || '') ? resolvedPromotion : null;
    const recipient = listing.assignedAgent || listing.owner?._id;
    const split = calculateFeeSplit({
      amount: Number(feeSnapshot.amount || 0),
      currency: feeSnapshot.currency || listing.price?.currency || 'USD',
      recipient,
      promoter: promotion?.promoter,
    });
    const payment = await Payment.create({
      merchantReference,
      purpose: 'inquiry',
      provider: 'pesapal',
      status: 'pending',
      user: req.user?._id,
      payer: {
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
      },
      inquiry: inquiry._id,
      listing: listing._id,
      promotion: promotion?._id,
      amount: Number(feeSnapshot.amount || 0),
      currency: feeSnapshot.currency || listing.price?.currency || 'USD',
      description: `${feeSnapshot.label || 'Listing fee'} for ${listing.title}`.slice(0, 180),
      split,
    });

    const appUrl = (process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, '');
    const nameParts = String(payload.name || '').trim().split(/\s+/).filter(Boolean);
    const checkout = await pesapal.submitOrder({
      merchantReference,
      amount: payment.amount,
      currency: payment.currency,
      description: payment.description,
      callbackUrl: `${appUrl}/api/payments/pesapal/callback`,
      cancellationUrl: `${appUrl}/listings/${listing.slug || listing._id}`,
      billingAddress: {
        email_address: payload.email,
        phone_number: payload.phone || undefined,
        first_name: nameParts[0] || req.user?.firstName || 'Guest',
        last_name: nameParts.slice(1).join(' ') || req.user?.lastName || 'Customer',
        country_code: (process.env.DEFAULT_COUNTRY_CODE || 'UG').slice(0, 2).toUpperCase(),
      },
    });

    payment.providerMeta = {
      ...(payment.providerMeta || {}),
      notificationId: checkout.notificationId,
      orderTrackingId: checkout.orderTrackingId,
      redirectUrl: checkout.redirectUrl,
      callbackUrl: `${appUrl}/api/payments/pesapal/callback`,
      cancellationUrl: `${appUrl}/listings/${listing.slug || listing._id}`,
      ipnUrl: `${appUrl}/api/payments/pesapal/ipn`,
      payload: checkout.payload,
    };
    await payment.save();

    inquiry.feeSnapshot = {
      ...(inquiry.feeSnapshot || {}),
      reference: merchantReference,
    };
    await inquiry.save();

    return res.status(201).json({
      success: true,
      message: 'Inquiry created. Continue to payment.',
      data: inquiry,
      meta: { redirectUrl: checkout.redirectUrl, paymentId: payment._id },
    });
  }

  res.status(201).json({ success: true, message: 'Inquiry sent successfully', data: inquiry });
});

exports.getMyInquiries = asyncHandler(async (req, res) => {
  let filter = {};
  if (req.user.role === 'user') {
    const ownedListingIds = await Listing.find({ owner: req.user._id }).distinct('_id');
    filter = { $or: [{ sender: req.user._id }, { owner: req.user._id }, { listing: { $in: ownedListingIds } }] };
  }
  if (req.user.role === 'agent') {
    const agentListingIds = await Listing.find({
      $or: [{ owner: req.user._id }, { assignedAgent: req.user._id }],
    }).distinct('_id');
    filter = {
      $or: [
        { sender: req.user._id },
        { owner: req.user._id },
        { listing: { $in: agentListingIds } },
      ],
    };
  }
  if (['admin', 'super-admin'].includes(req.user.role)) filter = {};

  const inquiries = await Inquiry.find(filter)
    .populate('listing', 'title slug category status price location images')
    .populate('sender', 'firstName lastName email phone')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, data: inquiries.map((item) => sanitizeInquiryContact(item, req.user)) });
});

exports.updateInquiryStatus = asyncHandler(async (req, res) => {
  const inquiry = await Inquiry.findById(req.params.id);
  if (!inquiry) throw new ApiError(404, 'Inquiry not found');

  const canUpdate = ['admin', 'super-admin'].includes(req.user.role)
    || String(inquiry.owner) === String(req.user._id)
    || await Listing.exists({ _id: inquiry.listing, $or: [{ owner: req.user._id }, { assignedAgent: req.user._id }] });
  if (!canUpdate) throw new ApiError(403, 'Forbidden');

  inquiry.status = req.body.status || inquiry.status;
  await inquiry.save();

  res.json({ success: true, message: 'Inquiry updated', data: inquiry });
});
