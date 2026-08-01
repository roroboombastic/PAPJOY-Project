const mongoose = require('mongoose');
const { Readable } = require('stream');

let bucket = null;

function getBucket() {
  if (!bucket) {
    bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  }
  return bucket;
}

function isConnected() {
  return mongoose.connection.readyState === 1;
}

function uploadToGridFS(filename, buffer, contentType) {
  return new Promise((resolve, reject) => {
    if (!isConnected()) return reject(new Error('Database not connected'));
    const stream = getBucket().openUploadStream(filename, { contentType: contentType || 'application/octet-stream' });
    stream.on('finish', () => resolve({ id: stream.id, filename }));
    stream.on('error', reject);
    Readable.from(buffer).pipe(stream);
  });
}

function fileExists(filename) {
  return getBucket().find({ filename }).limit(1).toArray();
}

function openDownloadStreamByName(filename) {
  return getBucket().openDownloadStreamByName(filename);
}

module.exports = {
  isConnected,
  uploadToGridFS,
  fileExists,
  openDownloadStreamByName
};
