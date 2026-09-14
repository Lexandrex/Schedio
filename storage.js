const { v2: cloudinary } = require('cloudinary');

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
const FOLDER = process.env.CLOUDINARY_FOLDER || 'schedio-drasis';

const isConfigured = Boolean(CLOUD_NAME && API_KEY && API_SECRET);

if (isConfigured) {
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true,
  });
}

/** Igual ao SMTP: sem credenciais o recurso degrada com mensagem clara, não quebra o servidor. */
function storageStatus() {
  return isConfigured ? 'configured' : 'not-configured';
}

/**
 * Envia um buffer ao Cloudinary. Guardamos apenas `url` e `public_id`
 * (o `public_id` é o que permite apagar o arquivo lá depois).
 */
function uploadBuffer(buffer, { folder = FOLDER } = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        return resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
}

async function destroyImage(publicId) {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
}

module.exports = { isConfigured, storageStatus, uploadBuffer, destroyImage, FOLDER };
