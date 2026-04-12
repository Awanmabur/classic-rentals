const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');
const methodOverride = require('method-override');
const csrf = require('csurf');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const morgan = require('morgan');

const webRoutes = require('./routes/web');
const apiRoutes = require('./routes/api');
const attachUser = require('./middlewares/attachUser');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'no-referrer-when-downgrade' },
}));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d', etag: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(methodOverride('_method'));
app.use(mongoSanitize());
app.use(xss());
app.use(attachUser);

const csrfProtection = csrf({ cookie: true });
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  return csrfProtection(req, res, next);
});

app.get('/healthz', (_req, res) => res.status(200).json({ ok: true, service: 'classic-rentals', time: new Date().toISOString() }));

app.use((req, res, next) => {
  let flash = null;
  const rawFlash = req.signedCookies?.jr_flash;
  if (rawFlash) {
    try { flash = JSON.parse(rawFlash); } catch { flash = null; }
    res.clearCookie('jr_flash');
  }

  res.locals.currentUser = req.user || null;
  res.locals.currentPath = req.originalUrl || req.path || '';
  res.locals.csrfToken = typeof req.csrfToken === 'function' ? req.csrfToken() : null;
  res.locals.siteName = 'Classic Rentals';
  res.locals.year = new Date().getFullYear();
  res.locals.flash = flash;
  next();
});

app.use('/', webRoutes);
app.use('/api', apiRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
