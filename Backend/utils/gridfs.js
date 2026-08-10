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

async function deleteFileByName(filename) {
  if (!isConnected()) return false;
  const files = await getBucket().find({ filename }).toArray();
  let deleted = false;
  for (const file of files) {
    await getBucket().delete(file._id);
    deleted = true;
  }
  return deleted;
}

async function deleteFileByNameSafe(filename) {
  try {
    await deleteFileByName(filename);
    return true;
  } catch {
    return false;
  }
}

function openDownloadStreamByName(filename) {
  return getBucket().openDownloadStreamByName(filename);
}

module.exports = {
  isConnected,
  uploadToGridFS,
  fileExists,
  deleteFileByName,
  deleteFileByNameSafe,
  openDownloadStreamByName
};
