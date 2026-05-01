const streamifier = require('streamifier');
const cloudinary = require('../config/cloudinary');

function uploadBuffer(file, folder) {
  const resourceType = file.mimetype?.startsWith('video/') ? 'video' : 'image';
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => error ? reject(error) : resolve({ ...result, resource_type: resourceType })
    );
    streamifier.createReadStream(file.buffer).pipe(stream);
  });
}

exports.uploadManyToCloudinary = async (files, folder) => Promise.all(files.map((file) => uploadBuffer(file, folder)));

exports.deleteManyFromCloudinary = async (publicIds = []) => {
  if (!publicIds.length) return null;
  return Promise.all([
    cloudinary.api.delete_resources(publicIds, { resource_type: 'image' }),
    cloudinary.api.delete_resources(publicIds, { resource_type: 'video' }),
  ]);
};
