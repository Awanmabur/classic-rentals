const DEFAULT_TIMEOUT_MS = 15000;

function getBaseUrl() {
  return (process.env.PESAPAL_ENV || 'sandbox').toLowerCase() === 'production'
    ? 'https://pay.pesapal.com/v3/api'
    : 'https://cybqa.pesapal.com/pesapalv3/api';
}

function isConfigured() {
  return Boolean(process.env.PESAPAL_CONSUMER_KEY && process.env.PESAPAL_CONSUMER_SECRET && process.env.APP_URL);
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${getBaseUrl()}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.message || data?.error?.message || `Pesapal request failed with status ${response.status}`;
      const error = new Error(message);
      error.details = data;
      error.statusCode = response.status;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function getAccessToken() {
  if (!isConfigured()) throw new Error('Pesapal is not configured. Set PESAPAL_CONSUMER_KEY, PESAPAL_CONSUMER_SECRET, and APP_URL.');
  const data = await request('/Auth/RequestToken', {
    method: 'POST',
    body: JSON.stringify({
      consumer_key: process.env.PESAPAL_CONSUMER_KEY,
      consumer_secret: process.env.PESAPAL_CONSUMER_SECRET,
    }),
  });
  if (!data.token) throw new Error(data.message || 'Pesapal token missing');
  return data.token;
}

async function registerIpnUrl(token, ipnUrl) {
  const data = await request('/URLSetup/RegisterIPN', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url: ipnUrl, ipn_notification_type: 'GET' }),
  });
  return data.ipn_id;
}

async function ensureNotificationId(token) {
  if (process.env.PESAPAL_NOTIFICATION_ID) return process.env.PESAPAL_NOTIFICATION_ID;
  const ipnUrl = `${process.env.APP_URL.replace(/\/$/, '')}/api/payments/pesapal/ipn`;
  return registerIpnUrl(token, ipnUrl);
}

async function submitOrder({ merchantReference, amount, currency, description, callbackUrl, cancellationUrl, billingAddress }) {
  const token = await getAccessToken();
  const notificationId = await ensureNotificationId(token);
  const payload = {
    id: merchantReference,
    currency,
    amount,
    description: String(description || 'Classic Rentals payment').slice(0, 100),
    callback_url: callbackUrl,
    cancellation_url: cancellationUrl,
    notification_id: notificationId,
    billing_address: billingAddress,
  };

  const data = await request('/Transactions/SubmitOrderRequest', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

  return {
    notificationId,
    orderTrackingId: data.order_tracking_id,
    redirectUrl: data.redirect_url,
    merchantReference: data.merchant_reference,
    payload: data,
  };
}

async function getTransactionStatus(orderTrackingId) {
  const token = await getAccessToken();
  return request(`/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

module.exports = {
  getBaseUrl,
  isConfigured,
  getAccessToken,
  ensureNotificationId,
  submitOrder,
  getTransactionStatus,
};
