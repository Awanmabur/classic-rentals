const nodemailer = require('nodemailer');

function getTransport() {
  const host = process.env.SMTP_HOST || '';
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

exports.sendMail = async ({ to, subject, html, text, replyTo }) => {
  const transport = getTransport();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@jubarentals.local';

  if (!transport) {
    console.log('[mailerService] SMTP not configured. Email payload follows:');
    console.log({ to, subject, text, html, replyTo });
    return { queued: false, logged: true };
  }

  await transport.sendMail({ from, to, subject, html, text, replyTo: replyTo || process.env.SMTP_REPLY_TO || undefined });
  return { queued: true };
};
