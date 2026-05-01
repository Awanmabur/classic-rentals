const Subscription = require('../models/Subscription');
const Inquiry = require('../models/Inquiry');
const Payment = require('../models/Payment');

function addInterval(start, interval) {
  const d = new Date(start);
  if (interval === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (interval === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else if (interval === 'one-time') d.setFullYear(d.getFullYear() + 10);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function mapPesapalStatus(rawStatus) {
  const status = String(rawStatus || '').toUpperCase();
  if (status === 'COMPLETED') return 'paid';
  if (status === 'FAILED' || status === 'INVALID') return 'failed';
  if (status === 'REVERSED') return 'reversed';
  return 'pending';
}

async function syncPaymentFromPesapal(payment, transaction = {}) {
  if (!payment) return null;
  const mappedStatus = mapPesapalStatus(transaction.payment_status_description);
  payment.status = mappedStatus;
  payment.lastCheckedAt = new Date();
  payment.statusReason = transaction.description || transaction.message || payment.statusReason;
  payment.providerMeta = {
    ...(payment.providerMeta || {}),
    paymentMethod: transaction.payment_method || payment.providerMeta?.paymentMethod,
    confirmationCode: transaction.confirmation_code || payment.providerMeta?.confirmationCode,
    rawStatus: transaction.payment_status_description || payment.providerMeta?.rawStatus,
    statusCode: Number.isFinite(Number(transaction.status_code)) ? Number(transaction.status_code) : payment.providerMeta?.statusCode,
    payload: transaction,
  };

  if (mappedStatus === 'paid') {
    payment.paidAt = payment.paidAt || new Date();
    if (payment.subscription) {
      const subscription = await Subscription.findById(payment.subscription).populate('plan');
      if (subscription) {
        const startsAt = new Date();
        subscription.startsAt = startsAt;
        subscription.endsAt = addInterval(startsAt, subscription.plan?.interval || 'monthly');
        subscription.status = subscription.plan?.trialDays > 0 ? 'trialing' : 'active';
        subscription.payment = {
          ...(subscription.payment || {}),
          provider: payment.provider,
          reference: transaction.confirmation_code || payment.merchantReference,
          amount: payment.amount,
          currency: payment.currency,
          status: 'paid',
          paidAt: payment.paidAt,
          meta: {
            ...(subscription.payment?.meta || {}),
            paymentId: payment._id,
            orderTrackingId: payment.providerMeta?.orderTrackingId,
            merchantReference: payment.merchantReference,
          },
        };
        await subscription.save();
      }
    }
    if (payment.inquiry) {
      const inquiry = await Inquiry.findById(payment.inquiry);
      if (inquiry) {
        inquiry.feeSnapshot = {
          ...(inquiry.feeSnapshot || {}),
          status: 'paid',
          reference: transaction.confirmation_code || payment.merchantReference,
        };
        await inquiry.save();
      }
    }
  } else if (mappedStatus === 'failed' || mappedStatus === 'reversed') {
    if (payment.subscription) {
      const subscription = await Subscription.findById(payment.subscription);
      if (subscription) {
        subscription.status = 'past_due';
        subscription.payment = {
          ...(subscription.payment || {}),
          provider: payment.provider,
          reference: payment.merchantReference,
          amount: payment.amount,
          currency: payment.currency,
          status: mappedStatus === 'reversed' ? 'refunded' : 'failed',
          meta: {
            ...(subscription.payment?.meta || {}),
            paymentId: payment._id,
            orderTrackingId: payment.providerMeta?.orderTrackingId,
          },
        };
        await subscription.save();
      }
    }
    if (payment.inquiry) {
      const inquiry = await Inquiry.findById(payment.inquiry);
      if (inquiry) {
        inquiry.feeSnapshot = {
          ...(inquiry.feeSnapshot || {}),
          status: 'pending',
        };
        await inquiry.save();
      }
    }
  }

  await payment.save();
  return payment;
}

module.exports = {
  addInterval,
  mapPesapalStatus,
  syncPaymentFromPesapal,
};
