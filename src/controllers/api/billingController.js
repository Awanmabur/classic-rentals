const Plan = require('../../models/Plan');
const Subscription = require('../../models/Subscription');
const AuditLog = require('../../models/AuditLog');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { sendMail } = require('../../services/mailerService');
const { renderSubscriptionEmail } = require('../../services/emailTemplateService');

function addInterval(start, interval) {
  const d = new Date(start);
  if (interval === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (interval === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else if (interval === 'one-time') d.setFullYear(d.getFullYear() + 10);
  else d.setMonth(d.getMonth() + 1);
  return d;
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
  const startsAt = new Date();
  const endsAt = addInterval(startsAt, plan.interval);

  await Subscription.updateMany({ user: req.user._id, status: { $in: ['trialing', 'active', 'past_due'] } }, { $set: { status: 'cancelled', cancelAtPeriodEnd: false } });
  const subscription = await Subscription.create({
    user: req.user._id,
    plan: plan._id,
    status: plan.trialDays > 0 ? 'trialing' : 'active',
    startsAt,
    endsAt,
    payment: { provider: req.body.provider || 'manual', reference: req.body.reference || '', amount: plan.amount, currency: plan.currency, status: 'paid', paidAt: new Date() },
  });

  const billingUrl = `${process.env.APP_URL || 'http://localhost:4000'}/dashboard/billing`;
  const mail = renderSubscriptionEmail({ name: req.user.firstName, planName: plan.name, billingUrl, expiresAt: endsAt.toDateString() });
  await sendMail({ to: req.user.email, ...mail });
  await AuditLog.create({ actor: req.user._id, action: 'billing.subscription.start', entityType: 'Subscription', entityId: subscription._id, meta: { plan: plan.slug } });
  res.status(201).json({ success: true, message: 'Subscription started', data: subscription });
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
