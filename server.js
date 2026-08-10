require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('./db');

const app = express();
const port = Number(process.env.PORT || 4173);

app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/api/health', async (_request, response, next) => {
  try {
    await query('SELECT 1');
    response.json({ status: 'ok', database: 'connected' });
  } catch (error) { next(error); }
});

app.post('/api/auth/register', async (request, response, next) => {
  try {
    const { email, password } = request.body;
    if (!email || !password || password.length < 8) {
      return response.status(400).json({ message: 'Informe um e-mail válido e uma senha com pelo menos 8 caracteres.' });
    }

    const senhaHash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO users (email, senha) VALUES ($1, $2) RETURNING id, email, created_at',
      [email.trim().toLowerCase(), senhaHash],
    );
    return response.status(201).json({ user: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ message: 'Este e-mail já está cadastrado.' });
    return next(error);
  }
});

app.post('/api/auth/login', async (request, response, next) => {
  try {
    const { email, password } = request.body;
    const result = await query('SELECT id, email, senha FROM users WHERE email = $1', [email?.trim().toLowerCase()]);
    const user = result.rows[0];
    const validPassword = user && await bcrypt.compare(password || '', user.senha);
    if (!validPassword) return response.status(401).json({ message: 'E-mail ou senha incorretos.' });
    return response.json({ user: { id: user.id, email: user.email } });
  } catch (error) { return next(error); }
});

app.post('/api/auth/password-recovery', async (request, response, next) => {
  try {
    const email = request.body.email?.trim().toLowerCase();
    const userResult = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (!userResult.rows[0]) return response.json({ message: 'Se existir uma conta, um código será enviado para o e-mail informado.' });

    const code = String(crypto.randomInt(10000, 100000));
    const codeHash = await bcrypt.hash(code, 10);
    await query(
      "UPDATE users SET password_reset_token_hash = $1, password_reset_token_expires_at = NOW() + INTERVAL '15 minutes' WHERE id = $2",
      [codeHash, userResult.rows[0].id],
    );
    // O envio de e-mail será conectado em uma etapa posterior. Nunca retorne o código em produção.
    return response.json({ message: 'Código de recuperação criado.', developmentCode: process.env.NODE_ENV === 'development' ? code : undefined });
  } catch (error) { return next(error); }
});

app.post('/api/auth/password-recovery/verify', async (request, response, next) => {
  try {
    const email = request.body.email?.trim().toLowerCase();
    const token = request.body.code;
    const result = await query(
      'SELECT password_reset_token_hash FROM users WHERE email = $1 AND password_reset_token_hash IS NOT NULL AND password_reset_token_expires_at > NOW() LIMIT 1',
      [email],
    );
    const reset = result.rows[0];
    if (!reset || !await bcrypt.compare(token || '', reset.password_reset_token_hash)) return response.status(400).json({ message: 'Código inválido ou expirado.' });
    return response.json({ message: 'Código validado.' });
  } catch (error) { return next(error); }
});

app.post('/api/auth/password-recovery/reset', async (request, response, next) => {
  try {
    const email = request.body.email?.trim().toLowerCase();
    const { code, password } = request.body;
    if (!password || password.length < 8) return response.status(400).json({ message: 'A senha deve ter pelo menos 8 caracteres.' });
    const result = await query(
      'SELECT id, password_reset_token_hash FROM users WHERE email = $1 AND password_reset_token_hash IS NOT NULL AND password_reset_token_expires_at > NOW() LIMIT 1',
      [email],
    );
    const user = result.rows[0];
    if (!user || !await bcrypt.compare(code || '', user.password_reset_token_hash)) return response.status(400).json({ message: 'Código inválido ou expirado.' });
    await query(
      'UPDATE users SET senha = $1, password_reset_token_hash = NULL, password_reset_token_expires_at = NULL, updated_at = NOW() WHERE id = $2',
      [await bcrypt.hash(password, 12), user.id],
    );
    return response.json({ message: 'Senha atualizada com sucesso.' });
  } catch (error) { return next(error); }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ message: 'Não foi possível concluir a operação. Tente novamente.' });
});

app.listen(port, () => console.log(`Schedio Drasis em http://127.0.0.1:${port}`));
