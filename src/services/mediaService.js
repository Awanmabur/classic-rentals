const streamifier = require('streamifier');
const cloudinary = require('../config/cloudinary');

function uploadBuffer(file, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => error ? reject(error) : resolve(result)
    );
    streamifier.createReadStream(file.buffer).pipe(stream);
  });
}

exports.uploadManyToCloudinary = async (files, folder) => Promise.all(files.map((file) => uploadBuffer(file, folder)));

exports.deleteManyFromCloudinary = async (publicIds = []) => {
  if (!publicIds.length) return null;
  return cloudinary.api.delete_resources(publicIds);
};
