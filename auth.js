const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const ALGORITHM = 'HS256';

// Variável de ambiente chega como string, e o jsonwebtoken lê "3600" como 3600
// milissegundos. Só dígitos = segundos, que é o que quem configura espera.
const rawExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
const EXPIRES_IN = /^\d+$/.test(rawExpiresIn) ? Number(rawExpiresIn) : rawExpiresIn;

if (!SECRET) {
  throw new Error('JWT_SECRET não está configurado. Defina essa variável de ambiente antes de iniciar o servidor.');
}

function signToken(user) {
  return jwt.sign({ email: user.email }, SECRET, { subject: user.id, expiresIn: EXPIRES_IN, algorithm: ALGORITHM });
}

function requireAuth(request, response, next) {
  const [scheme, token] = (request.headers.authorization || '').split(' ');

  if (scheme !== 'Bearer' || !token) {
    return response.status(401).json({ message: 'Autenticação necessária.' });
  }

  try {
    const payload = jwt.verify(token, SECRET, { algorithms: [ALGORITHM] });
    request.userId = payload.sub;
    return next();
  } catch {
    return response.status(401).json({ message: 'Sessão inválida ou expirada.' });
  }
}

module.exports = { signToken, requireAuth };
