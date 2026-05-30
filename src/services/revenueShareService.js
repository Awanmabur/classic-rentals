const LANDLORD_POSTING_FEE_AMOUNT = Number(process.env.LANDLORD_POSTING_FEE_AMOUNT || 10000);
const LANDLORD_POSTING_FEE_CURRENCY = String(process.env.LANDLORD_POSTING_FEE_CURRENCY || 'UGX').trim().toUpperCase();

const PLATFORM_RATE_WITH_PROMOTER = Number(process.env.PLATFORM_RATE_WITH_PROMOTER || 0.10);
const PLATFORM_RATE_DIRECT = Number(process.env.PLATFORM_RATE_DIRECT || 0.15);
const PROMOTER_RATE = Number(process.env.PROMOTER_RATE || 0.05);

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function isLandlordPosting(user) {
  return user?.role === 'user';
}

function getLandlordPostingFee() {
  return {
    label: 'Landlord posting fee',
    amount: LANDLORD_POSTING_FEE_AMOUNT,
    currency: LANDLORD_POSTING_FEE_CURRENCY,
  };
}

function getPostingFeeSnapshot(user) {
  if (!isLandlordPosting(user)) {
    return {
      postingFeeRequired: false,
      postingFeeAmount: 0,
      postingFeeCurrency: LANDLORD_POSTING_FEE_CURRENCY,
      postingFeeStatus: 'not_required',
    };
  }

  return {
    postingFeeRequired: LANDLORD_POSTING_FEE_AMOUNT > 0,
    postingFeeAmount: LANDLORD_POSTING_FEE_AMOUNT,
    postingFeeCurrency: LANDLORD_POSTING_FEE_CURRENCY,
    postingFeeStatus: LANDLORD_POSTING_FEE_AMOUNT > 0 ? 'pending' : 'not_required',
  };
}

function calculateFeeSplit({ amount, currency, recipient, promoter = null }) {
  const value = Number(amount || 0);
  const hasPromoter = Boolean(promoter);
  const platformRate = hasPromoter ? PLATFORM_RATE_WITH_PROMOTER : PLATFORM_RATE_DIRECT;
  const promoterRate = hasPromoter ? PROMOTER_RATE : 0;
  const recipientRate = Math.max(0, 1 - platformRate - promoterRate);

  return {
    recipient,
    promoter: promoter || undefined,
    platformRate,
    promoterRate,
    recipientRate,
    platformAmount: roundMoney(value * platformRate),
    promoterAmount: roundMoney(value * promoterRate),
    recipientAmount: roundMoney(value * recipientRate),
    currency,
  };
}

module.exports = {
  getLandlordPostingFee,
  getPostingFeeSnapshot,
  calculateFeeSplit,
  isLandlordPosting,
};
