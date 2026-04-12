const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/jwt');

async function resolveUser(req) {
  const signedCookie = req.signedCookies?.jr_access;
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const token = bearer || signedCookie;
  if (!token) return null;

  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'active') return null;
  if ((user.refreshTokenVersion || 0) !== (payload.v || 0)) return null;
  return user;
}

exports.authenticateOptional = async (req, _res, next) => {
  try {
    req.user = await resolveUser(req);
    next();
  } catch {
    req.user = null;
    next();
  }
};

exports.authenticateRequired = async (req, _res, next) => {
  try {
    const user = await resolveUser(req);
    if (!user) throw new ApiError(401, 'Authentication required');
    req.user = user;
    next();
  } catch (error) {
    next(error.statusCode ? error : new ApiError(401, 'Invalid or expired session'));
  }
};
