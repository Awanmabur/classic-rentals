module.exports = (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'Route not found' });
  }
  return res.status(404).render('pages/errors/404', { title: 'Page not found' });
};
