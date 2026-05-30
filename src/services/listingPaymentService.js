const Payment = require('../models/Payment');
const ApiError = require('../utils/ApiError');
const pesapal = require('./pesapalService');
const { getLandlordPostingFee } = require('./revenueShareService');

function makeReference(prefix = 'LST') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function createListingPostingCheckout({ user, listing }) {
  const fee = getLandlordPostingFee();
  if (!fee.amount) return { payment: null, redirectUrl: null };
  if (!pesapal.isConfigured()) throw new ApiError(503, 'Pesapal checkout is not configured on this server yet.');

  const merchantReference = makeReference('POST');
  const payment = await Payment.create({
    merchantReference,
    purpose: 'listing_posting',
    provider: 'pesapal',
    status: 'pending',
    user: user._id,
    listing: listing._id,
    amount: fee.amount,
    currency: fee.currency,
    description: `${fee.label} for ${listing.title}`.slice(0, 180),
    split: {
      platformAmount: fee.amount,
      platformRate: 1,
      recipientAmount: 0,
      recipientRate: 0,
      promoterAmount: 0,
      promoterRate: 0,
      currency: fee.currency,
    },
  });

  const appUrl = (process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, '');
  const checkout = await pesapal.submitOrder({
    merchantReference,
    amount: payment.amount,
    currency: payment.currency,
    description: payment.description,
    callbackUrl: `${appUrl}/api/payments/pesapal/callback`,
    cancellationUrl: `${appUrl}/listings/${listing.slug}/edit`,
    billingAddress: {
      email_address: user.email,
      phone_number: user.phone || undefined,
      first_name: user.firstName,
      last_name: user.lastName,
      country_code: (process.env.DEFAULT_COUNTRY_CODE || 'UG').slice(0, 2).toUpperCase(),
    },
  });

  payment.providerMeta = {
    ...(payment.providerMeta || {}),
    notificationId: checkout.notificationId,
    orderTrackingId: checkout.orderTrackingId,
    redirectUrl: checkout.redirectUrl,
    callbackUrl: `${appUrl}/api/payments/pesapal/callback`,
    cancellationUrl: `${appUrl}/listings/${listing.slug}/edit`,
    ipnUrl: `${appUrl}/api/payments/pesapal/ipn`,
    payload: checkout.payload,
  };
  await payment.save();

  listing.monetization = {
    ...(listing.monetization || {}),
    postingFeeReference: merchantReference,
    postingFeeStatus: 'pending',
  };
  await listing.save();

  return { payment, redirectUrl: checkout.redirectUrl };
}

module.exports = {
  createListingPostingCheckout,
};
