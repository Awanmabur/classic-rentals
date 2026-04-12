exports.setFlash = (res, type, text) => {
  res.cookie('jr_flash', JSON.stringify({ type, text }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    signed: true,
    maxAge: 1000 * 20,
  });
};
