const Plan = require('../../models/Plan');
const Subscription = require('../../models/Subscription');
const Payment = require('../../models/Payment');
const AuditLog = require('../../models/AuditLog');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { sendMail } = require('../../services/mailerService');
const { renderSubscriptionEmail } = require('../../services/emailTemplateService');
const pesapal = require('../../services/pesapalService');
const { addInterval } = require('../../services/paymentLifecycleService');

function normalizeProvider(value = '') {
  return String(value || 'manual').trim().toLowerCase() === 'pesapal' ? 'pesapal' : 'manual';
}

function makeReference(prefix = 'SUB') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function createSubscriptionCheckout({ user, plan, provider = 'manual', reference = '' }) {
  const startsAt = new Date();
  const endsAt = addInterval(startsAt, plan.interval);

  await Subscription.updateMany(
    { user: user._id, status: { $in: ['trialing', 'active', 'past_due'] } },
    { $set: { status: 'cancelled', cancelAtPeriodEnd: false } }
  );

  const subscription = await Subscription.create({
    user: user._id,
    plan: plan._id,
    status: provider === 'manual' ? (plan.trialDays > 0 ? 'trialing' : 'active') : 'past_due',
    startsAt,
    endsAt,
    payment: {
      provider,
      reference: provider === 'manual' ? String(reference || '').trim() : '',
      amount: plan.amount,
      currency: plan.currency,
      status: provider === 'manual' ? 'paid' : 'pending',
      paidAt: provider === 'manual' ? new Date() : undefined,
    },
  });

  if (provider === 'manual') {
    const billingUrl = `${process.env.APP_URL || 'http://localhost:4000'}/dashboard/billing`;
    const mail = renderSubscriptionEmail({ name: user.firstName, planName: plan.name, billingUrl, expiresAt: endsAt.toDateString() });
    await sendMail({ to: user.email, ...mail }).catch(() => null);
    return { subscription, payment: null, redirectUrl: null, pending: false };
  }

  if (!pesapal.isConfigured()) throw new ApiError(500, 'Pesapal is not configured on this server yet.');

  const merchantReference = makeReference('SUB');
  const payment = await Payment.create({
    merchantReference,
    purpose: 'subscription',
    provider,
    status: 'pending',
    user: user._id,
    plan: plan._id,
    subscription: subscription._id,
    amount: plan.amount,
    currency: plan.currency,
    description: `${plan.name} subscription`,
  });

  const appUrl = (process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, '');
  const checkout = await pesapal.submitOrder({
    merchantReference,
    amount: plan.amount,
    currency: plan.currency,
    description: `${plan.name} subscription`,
    callbackUrl: `${appUrl}/api/payments/pesapal/callback`,
    cancellationUrl: `${appUrl}/dashboard/billing`,
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
    cancellationUrl: `${appUrl}/dashboard/billing`,
    ipnUrl: `${appUrl}/api/payments/pesapal/ipn`,
    payload: checkout.payload,
  };
  await payment.save();

  subscription.payment = {
    provider,
    reference: merchantReference,
    amount: plan.amount,
    currency: plan.currency,
    status: 'pending',
    meta: { paymentId: payment._id, orderTrackingId: checkout.orderTrackingId },
  };
  await subscription.save();

  return { subscription, payment, redirectUrl: checkout.redirectUrl, pending: true };
}

exports.getPlans = asyncHandler(async (_req, res) => {
  const plans = await Plan.find({ isActive: true }).sort({ amount: 1, createdAt: 1 }).lean();
  res.json({ success: true, data: plans });
});

exports.getMySubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findOne({ user: req.user._id }).populate('plan').sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: subscription });
});

exports.startSubscription = asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.body.planId);
  if (!plan || !plan.isActive) throw new ApiError(404, 'Plan not found');

  const provider = normalizeProvider(req.body.provider);
  const result = await createSubscriptionCheckout({ user: req.user, plan, provider, reference: req.body.reference });

  await AuditLog.create({
    actor: req.user._id,
    action: provider === 'pesapal' ? 'billing.subscription.checkout' : 'billing.subscription.start',
    entityType: 'Subscription',
    entityId: result.subscription._id,
    meta: { plan: plan.slug, provider, paymentId: result.payment?._id },
  });

  res.status(201).json({
    success: true,
    message: provider === 'pesapal' ? 'Checkout started successfully' : 'Subscription started',
    data: result.subscription,
    meta: result.redirectUrl ? { redirectUrl: result.redirectUrl, paymentId: result.payment._id } : undefined,
  });
});

exports.cancelMySubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findOne({ user: req.user._id, status: { $in: ['trialing', 'active', 'past_due'] } }).sort({ createdAt: -1 });
  if (!subscription) throw new ApiError(404, 'No active subscription found');
  subscription.cancelAtPeriodEnd = true;
  subscription.status = 'cancelled';
  await subscription.save();
  await AuditLog.create({ actor: req.user._id, action: 'billing.subscription.cancel', entityType: 'Subscription', entityId: subscription._id, meta: null });
  res.json({ success: true, message: 'Subscription cancelled', data: subscription });
});

exports.createSubscriptionCheckout = createSubscriptionCheckout;
