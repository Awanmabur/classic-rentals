module.exports = (err, req, res, _next) => {
  const status = err.statusCode || 500;
  const message = err.message || 'Something went wrong';

  if (req.path.startsWith('/api')) {
    return res.status(status).json({
      success: false,
      message,
      errors: err.errors || null,
    });
  }

  return res.status(status).render('pages/errors/error', {
    title: 'Error',
    status,
    message,
  });
};
