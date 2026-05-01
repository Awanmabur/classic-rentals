const Inquiry = require('../../models/Inquiry');
const Listing = require('../../models/Listing');
const Payment = require('../../models/Payment');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const pesapal = require('../../services/pesapalService');

function makeReference(prefix = 'INQ') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

exports.createInquiry = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.listingId).populate('owner');
  if (!listing || listing.status !== 'published') throw new ApiError(404, 'Listing not found');

  const requestedType = ['general', 'viewing', 'reservation', 'booking'].includes(req.body.type) ? req.body.type : 'general';
  const monetization = listing.monetization || {};
  let feeSnapshot = { status: 'not_required' };
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
  if (requiresFee && provider === 'pesapal' && !req.user) throw new ApiError(401, 'Please login to continue with payment.');

  const inquiry = await Inquiry.create(payload);

  if (requiresFee && provider === 'pesapal') {
    if (!pesapal.isConfigured()) throw new ApiError(500, 'Pesapal is not configured on this server yet.');

    const merchantReference = makeReference('INQ');
    const payment = await Payment.create({
      merchantReference,
      purpose: 'inquiry',
      provider: 'pesapal',
      status: 'pending',
      user: req.user._id,
      inquiry: inquiry._id,
      listing: listing._id,
      amount: Number(feeSnapshot.amount || 0),
      currency: feeSnapshot.currency || listing.price?.currency || 'USD',
      description: `${feeSnapshot.label || 'Listing fee'} for ${listing.title}`.slice(0, 180),
    });

    const appUrl = (process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, '');
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
        first_name: String(payload.name || '').split(' ')[0] || req.user.firstName,
        last_name: String(payload.name || '').split(' ').slice(1).join(' ') || req.user.lastName,
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
  if (req.user.role === 'user') filter = { sender: req.user._id };
  if (req.user.role === 'agent') filter = { owner: req.user._id };
  if (['admin', 'super-admin'].includes(req.user.role)) filter = {};

  const inquiries = await Inquiry.find(filter)
    .populate('listing', 'title slug category status price location images')
    .populate('sender', 'firstName lastName email phone')
    .sort({ createdAt: -1 });

  res.json({ success: true, data: inquiries });
});

exports.updateInquiryStatus = asyncHandler(async (req, res) => {
  const inquiry = await Inquiry.findById(req.params.id);
  if (!inquiry) throw new ApiError(404, 'Inquiry not found');

  const canUpdate = ['admin', 'super-admin'].includes(req.user.role) || String(inquiry.owner) === String(req.user._id);
  if (!canUpdate) throw new ApiError(403, 'Forbidden');

  inquiry.status = req.body.status || inquiry.status;
  await inquiry.save();

  res.json({ success: true, message: 'Inquiry updated', data: inquiry });
});
