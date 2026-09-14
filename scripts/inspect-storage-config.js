require('dotenv').config();

const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
const apiKey = process.env.CLOUDINARY_API_KEY || '';
const apiSecret = process.env.CLOUDINARY_API_SECRET || '';

const faltando = [
  !cloudName && 'CLOUDINARY_CLOUD_NAME',
  !apiKey && 'CLOUDINARY_API_KEY',
  !apiSecret && 'CLOUDINARY_API_SECRET',
].filter(Boolean);

// Nunca imprime os valores — só o suficiente para diagnosticar.
console.log(JSON.stringify({
  configurado: faltando.length === 0,
  faltando,
  cloudName: cloudName || null,
  apiKeyDigitos: apiKey.length,
  apiSecretDigitos: apiSecret.length,
  temEspacoAcidental: /\s/.test(cloudName + apiKey + apiSecret),
  pasta: process.env.CLOUDINARY_FOLDER || 'schedio-drasis (padrão)',
}, null, 2));

if (faltando.length === 0) {
  const { v2: cloudinary } = require('cloudinary');
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  cloudinary.api
    .ping()
    .then((resultado) => console.log('Conexão com o Cloudinary:', resultado.status))
    .catch((erro) => {
      console.error('Falha ao conectar no Cloudinary:', erro.error?.message || erro.message);
      process.exitCode = 1;
    });
}
