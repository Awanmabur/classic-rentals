const jwt = require('jsonwebtoken');

exports.signAccessToken = (user) => jwt.sign(
  {
    sub: user._id.toString(),
    role: user.role,
    email: user.email,
    v: user.refreshTokenVersion || 0,
  },
  process.env.JWT_ACCESS_SECRET,
  { expiresIn: process.env.JWT_ACCESS_EXPIRES || '7d' }
);

exports.verifyAccessToken = (token) => jwt.verify(token, process.env.JWT_ACCESS_SECRET);

exports.setAuthCookie = (res, token) => {
  res.cookie('jr_access', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    signed: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
};

exports.clearAuthCookie = (res) => {
  res.clearCookie('jr_access');
};
