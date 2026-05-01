const multer = require('multer');
const ApiError = require('../utils/ApiError');

const storage = multer.memoryStorage();

function fileFilter(_req, file, cb) {
  const isImage = file.mimetype.startsWith('image/');
  const isVideo = file.mimetype.startsWith('video/');
  if (!isImage && !isVideo) {
    return cb(new ApiError(400, 'Only image and video uploads are allowed'));
  }
  cb(null, true);
}

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024, files: 16 },
});
