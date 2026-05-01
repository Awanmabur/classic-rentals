const Payment = require('../../models/Payment');
const AuditLog = require('../../models/AuditLog');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { getTransactionStatus } = require('../../services/pesapalService');
const { syncPaymentFromPesapal } = require('../../services/paymentLifecycleService');

async function syncUsingReference({ merchantReference, orderTrackingId }) {
  const payment = await Payment.findOne({
    $or: [
      ...(merchantReference ? [{ merchantReference }] : []),
      ...(orderTrackingId ? [{ 'providerMeta.orderTrackingId': orderTrackingId }] : []),
    ],
  });
  if (!payment) throw new ApiError(404, 'Payment not found');
  const trackingId = orderTrackingId || payment.providerMeta?.orderTrackingId;
  if (!trackingId) throw new ApiError(400, 'Missing order tracking id');
  const transaction = await getTransactionStatus(trackingId);
  payment.providerMeta = { ...(payment.providerMeta || {}), orderTrackingId: trackingId };
  const synced = await syncPaymentFromPesapal(payment, transaction);
  await AuditLog.create({
    actor: payment.user,
    action: 'payment.pesapal.sync',
    entityType: 'Payment',
    entityId: payment._id,
    meta: { merchantReference: payment.merchantReference, status: synced.status },
  }).catch(() => null);
  return synced;
}

exports.pesapalCallback = asyncHandler(async (req, res) => {
  const merchantReference = req.query.OrderMerchantReference || req.query.orderMerchantReference;
  const orderTrackingId = req.query.OrderTrackingId || req.query.orderTrackingId;
  const payment = await syncUsingReference({ merchantReference, orderTrackingId });

  const redirectPath = payment.purpose === 'subscription'
    ? '/dashboard/billing'
    : payment.listing ? `/listings/${payment.listing}` : '/listings';

  if (req.accepts('html')) {
    const { setFlash } = require('../../utils/flash');
    setFlash(res, payment.status === 'paid' ? 'success' : 'error', payment.status === 'paid' ? 'Payment confirmed successfully.' : 'Payment was not completed successfully.');
    return res.redirect(redirectPath);
  }
  res.json({ success: true, data: payment });
});

exports.pesapalIpn = asyncHandler(async (req, res) => {
  const merchantReference = req.query.OrderMerchantReference || req.body?.OrderMerchantReference;
  const orderTrackingId = req.query.OrderTrackingId || req.body?.OrderTrackingId;
  const payment = await syncUsingReference({ merchantReference, orderTrackingId });
  res.status(200).json({ success: true, status: payment.status });
});

exports.getMine = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: payments });
});
