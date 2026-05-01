function baseTemplate({ preheader = '', heading, intro, ctaLabel, ctaUrl, body = '', footer = '' }) {
  return `
  <div style="background:#0b1220;padding:24px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#e5e7eb">
    <div style="max-width:620px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:18px;overflow:hidden">
      <div style="padding:24px 28px;background:linear-gradient(135deg,#111827,#1f2937)">
        <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8">${preheader}</div>
        <h1 style="margin:12px 0 8px;font-size:28px;line-height:1.2;color:#fff">${heading}</h1>
        <p style="margin:0;color:#cbd5e1;font-size:15px;line-height:1.6">${intro}</p>
      </div>
      <div style="padding:28px">
        ${body ? `<div style="color:#d1d5db;font-size:15px;line-height:1.7;margin-bottom:20px">${body}</div>` : ''}
        ${ctaUrl ? `<a href="${ctaUrl}" style="display:inline-block;background:#cd7700;color:#fff;text-decoration:none;padding:14px 18px;border-radius:12px;font-weight:700">${ctaLabel}</a>` : ''}
      </div>
      <div style="padding:18px 28px;border-top:1px solid #1f2937;color:#94a3b8;font-size:13px;line-height:1.6">
        ${footer || 'Classic Rentals · Premium rentals marketplace'}
      </div>
    </div>
  </div>`;
}

exports.renderVerificationEmail = ({ name, verifyUrl }) => ({
  subject: 'Verify your Classic Rentals account',
  text: `Hello ${name}, verify your email: ${verifyUrl}`,
  html: baseTemplate({
    preheader: 'Account verification',
    heading: 'Verify your email address',
    intro: `Hello ${name}, welcome to Classic Rentals. Confirm your email to secure your account and unlock trusted marketplace features.`,
    ctaLabel: 'Verify email',
    ctaUrl: verifyUrl,
    body: '<p>This link expires in 24 hours. If you did not create this account, you can ignore this message.</p>',
  }),
});

exports.renderPasswordResetEmail = ({ name, resetUrl }) => ({
  subject: 'Reset your Classic Rentals password',
  text: `Hello ${name}, reset your password: ${resetUrl}`,
  html: baseTemplate({
    preheader: 'Password reset',
    heading: 'Reset your password',
    intro: `Hello ${name}, use the button below to set a new password for your Classic Rentals account.`,
    ctaLabel: 'Reset password',
    ctaUrl: resetUrl,
    body: '<p>This link expires in 30 minutes. If you did not request it, no changes have been made.</p>',
  }),
});

exports.renderSubscriptionEmail = ({ name, planName, billingUrl, expiresAt }) => ({
  subject: `Your ${planName} plan is active`,
  text: `Hello ${name}, your ${planName} plan is active until ${expiresAt}. Manage billing: ${billingUrl}`,
  html: baseTemplate({
    preheader: 'Billing update',
    heading: `${planName} plan activated`,
    intro: `Hello ${name}, your subscription is now active.`,
    ctaLabel: 'Open billing',
    ctaUrl: billingUrl,
    body: `<p>Your current billing period runs until <strong>${expiresAt}</strong>.</p>`,
  }),
});
