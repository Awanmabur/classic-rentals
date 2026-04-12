const multer = require('multer');
const ApiError = require('../utils/ApiError');

const storage = multer.memoryStorage();

function fileFilter(_req, file, cb) {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new ApiError(400, 'Only image uploads are allowed'));
  }
  cb(null, true);
}

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 12 },
});
