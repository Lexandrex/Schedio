require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { query } = require('./db');
const { signToken, requireAuth } = require('./auth');

const app = express();

let mailTransport;
let mailPreviewUrl = null;
let smtpStatus = 'pending';
let smtpError = null;

function generateEmailCode() {
  return String(crypto.randomInt(100000, 1000000));
}

async function sendVerificationEmail(email, code) {
  const result = await mailTransport.sendMail({
    from: process.env.SMTP_FROM || 'no-reply@schediodrasis.local',
    to: email,
    subject: 'Confirme seu e-mail — Schedio Drasis',
    text: `Olá!\n\nUse o código ${code} para confirmar seu e-mail no Schedio Drasis. Ele expira em 15 minutos.\n\nSe você não criou esta conta, ignore esta mensagem.`,
    html: `<p>Olá!</p><p>Use o código abaixo para confirmar seu e-mail no Schedio Drasis:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>Ele expira em 15 minutos.</p><p>Se você não criou esta conta, ignore esta mensagem.</p>`,
  });
  mailPreviewUrl = nodemailer.getTestMessageUrl(result) || null;
}

async function issuePendingRegistration(email, senhaHash) {
  const code = generateEmailCode();
  const codeHash = await bcrypt.hash(code, 10);
  await query(
    `INSERT INTO pending_registrations (email, senha, verification_token_hash, verification_token_expires_at, updated_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '15 minutes', NOW())
     ON CONFLICT (email) DO UPDATE SET
       senha = EXCLUDED.senha,
       verification_token_hash = EXCLUDED.verification_token_hash,
       verification_token_expires_at = EXCLUDED.verification_token_expires_at,
       updated_at = NOW()`,
    [email, senhaHash, codeHash],
  );
  await sendVerificationEmail(email, code);
}

async function createMailTransport() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpSecure = process.env.SMTP_SECURE === 'true';
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpUser && smtpPass) {
    mailTransport = nodemailer.createTransport({
      host: smtpHost || 'smtp.mailtrap.io',
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    await mailTransport.verify();
    smtpStatus = 'configured';
    smtpError = null;
    console.log('SMTP transport configurado com sucesso.');
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SMTP_USER e SMTP_PASS não estão configurados no ambiente de produção.');
  }

  console.warn('SMTP não configurado. Confirmação de e-mail e recuperação de senha permanecerão indisponíveis até configurá-lo.');
  smtpStatus = 'not-configured';
}

const port = Number(process.env.PORT || 4173);

const clientDist = path.join(__dirname, 'client', 'dist');

app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(clientDist));

app.get('/api/health', async (_request, response, next) => {
  try {
    await query('SELECT 1');
    response.json({
      status: 'ok',
      database: 'connected',
      smtp: smtpStatus,
    });
  } catch (error) { next(error); }
});

app.post('/api/auth/register', async (request, response, next) => {
  try {
    const { email, password } = request.body;
    if (!email || !password || password.length < 8) {
      return response.status(400).json({ message: 'Informe um e-mail válido e uma senha com pelo menos 8 caracteres.' });
    }
    if (!mailTransport) {
      return response.status(503).json({ message: 'O serviço de e-mail ainda não está configurado. Configure o SMTP para criar uma conta.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows[0]) {
      return response.status(409).json({ message: 'Este e-mail já está cadastrado.' });
    }

    const senhaHash = await bcrypt.hash(password, 12);
    await issuePendingRegistration(normalizedEmail, senhaHash);

    return response.status(201).json({
      user: { email: normalizedEmail },
      message: 'Conta criada. Enviamos um código de confirmação para seu e-mail.',
      previewUrl: process.env.NODE_ENV === 'development' ? mailPreviewUrl || undefined : undefined,
    });
  } catch (error) { return next(error); }
});

app.post('/api/auth/login', async (request, response, next) => {
  try {
    const { email, password } = request.body;
    const result = await query('SELECT id, email, senha FROM users WHERE email = $1', [email?.trim().toLowerCase()]);
    const user = result.rows[0];

    if (!user) {
      return response.status(401).json({ message: 'E-mail não cadastrado.' });
    }

    const validPassword = await bcrypt.compare(password || '', user.senha);
    if (!validPassword) {
      return response.status(401).json({ message: 'Senha incorreta.' });
    }

    const token = signToken(user);
    return response.json({ user: { id: user.id, email: user.email }, token });
  } catch (error) { return next(error); }
});

app.get('/api/auth/me', requireAuth, async (request, response, next) => {
  try {
    const result = await query('SELECT id, email, nome, bio, cor FROM users WHERE id = $1', [request.userId]);
    const user = result.rows[0];
    if (!user) return response.status(401).json({ message: 'Sessão inválida ou expirada.' });
    return response.json({ user });
  } catch (error) { return next(error); }
});

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

app.patch('/api/users/me', requireAuth, async (request, response, next) => {
  try {
    const nome = (request.body.nome || '').trim();
    const bio = (request.body.bio || '').trim();
    const cor = request.body.cor || null;

    if (!nome || nome.length > 80) {
      return response.status(400).json({ message: 'Informe um nome de até 80 caracteres.' });
    }
    if (bio.length > 280) {
      return response.status(400).json({ message: 'A descrição deve ter até 280 caracteres.' });
    }
    if (cor && !HEX_COLOR_PATTERN.test(cor)) {
      return response.status(400).json({ message: 'Informe uma cor válida no formato #RRGGBB.' });
    }

    const result = await query(
      'UPDATE users SET nome = $1, bio = $2, cor = $3 WHERE id = $4 RETURNING id, email, nome, bio, cor',
      [nome, bio, cor, request.userId],
    );
    return response.json({ user: result.rows[0] });
  } catch (error) { return next(error); }
});

app.delete('/api/users/me', requireAuth, async (request, response, next) => {
  try {
    const result = await query('SELECT senha FROM users WHERE id = $1', [request.userId]);
    const user = result.rows[0];
    if (!user) return response.status(401).json({ message: 'Sessão inválida ou expirada.' });

    const validPassword = await bcrypt.compare(request.body.password || '', user.senha);
    if (!validPassword) {
      return response.status(401).json({ message: 'Senha incorreta.' });
    }

    await query('DELETE FROM users WHERE id = $1', [request.userId]);
    return response.status(204).send();
  } catch (error) { return next(error); }
});

app.post('/api/auth/email-verification/resend', async (request, response, next) => {
  try {
    if (!mailTransport) return response.status(503).json({ message: 'O serviço de e-mail ainda não está configurado.' });
    const email = request.body.email?.trim().toLowerCase();
    const pending = await query('SELECT email FROM pending_registrations WHERE email = $1', [email]);
    if (!pending.rows[0]) return response.json({ message: 'Se necessário, enviaremos um novo código de confirmação.' });

    const code = generateEmailCode();
    const codeHash = await bcrypt.hash(code, 10);
    await query(
      "UPDATE pending_registrations SET verification_token_hash = $1, verification_token_expires_at = NOW() + INTERVAL '15 minutes', updated_at = NOW() WHERE email = $2",
      [codeHash, email],
    );
    await sendVerificationEmail(email, code);

    return response.json({
      message: 'Enviamos um novo código de confirmação para seu e-mail.',
      previewUrl: process.env.NODE_ENV === 'development' ? mailPreviewUrl || undefined : undefined,
    });
  } catch (error) { return next(error); }
});

app.post('/api/auth/email-verification/verify', async (request, response, next) => {
  try {
    const email = request.body.email?.trim().toLowerCase();
    const code = request.body.code;
    const result = await query(
      'SELECT senha, verification_token_hash FROM pending_registrations WHERE email = $1 AND verification_token_expires_at > NOW() LIMIT 1',
      [email],
    );
    const pending = result.rows[0];
    if (!pending || !await bcrypt.compare(code || '', pending.verification_token_hash)) {
      return response.status(400).json({ message: 'Código inválido ou expirado.' });
    }

    await query('INSERT INTO users (email, senha, email_verified_at) VALUES ($1, $2, NOW())', [email, pending.senha]);
    await query('DELETE FROM pending_registrations WHERE email = $1', [email]);

    return response.json({ message: 'E-mail confirmado. Agora você já pode entrar.' });
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ message: 'Este e-mail já está cadastrado.' });
    return next(error);
  }
});

app.get('/api/projects', requireAuth, async (_request, response, next) => {
  try {
    const result = await query(
      `SELECT p.id, p.titulo, p.categoria, p.capa, p.criado, p.likes, u.nome AS autor_nome, u.email AS autor_email
       FROM projetos p
       JOIN users u ON u.id = p.usuario_id
       WHERE p.status = 'publicado'
       ORDER BY p.criado DESC`,
    );
    return response.json({ projects: result.rows });
  } catch (error) { return next(error); }
});

app.get('/api/projects/mine', requireAuth, async (request, response, next) => {
  try {
    const result = await query(
      `SELECT id, titulo, descricao, categoria, capa, status, likes, criado
       FROM projetos
       WHERE usuario_id = $1
       ORDER BY criado DESC`,
      [request.userId],
    );
    return response.json({ projects: result.rows });
  } catch (error) { return next(error); }
});

app.post('/api/projects', requireAuth, async (request, response, next) => {
  try {
    const titulo = (request.body.titulo || '').trim();
    const descricao = (request.body.descricao || '').trim();
    const categoria = (request.body.categoria || '').trim();

    if (!titulo || titulo.length > 160) {
      return response.status(400).json({ message: 'Informe um título de até 160 caracteres.' });
    }
    if (categoria.length > 60) {
      return response.status(400).json({ message: 'A categoria deve ter até 60 caracteres.' });
    }

    const result = await query(
      `INSERT INTO projetos (usuario_id, titulo, descricao, categoria)
       VALUES ($1, $2, $3, $4)
       RETURNING id, titulo, descricao, categoria, capa, status, likes, criado`,
      [request.userId, titulo, descricao || null, categoria || null],
    );
    return response.status(201).json({ project: result.rows[0] });
  } catch (error) { return next(error); }
});

app.get('/api/projects/:id', requireAuth, async (request, response, next) => {
  try {
    const result = await query(
      `SELECT id, titulo, descricao, categoria, capa, status, likes, criado, conteudo
       FROM projetos
       WHERE id = $1 AND usuario_id = $2`,
      [request.params.id, request.userId],
    );
    if (!result.rows[0]) {
      return response.status(404).json({ message: 'Projeto não encontrado.' });
    }
    return response.json({ project: result.rows[0] });
  } catch (error) {
    if (error.code === '22P02') return response.status(404).json({ message: 'Projeto não encontrado.' });
    return next(error);
  }
});

app.patch('/api/projects/:id/status', requireAuth, async (request, response, next) => {
  try {
    const { status } = request.body;
    if (status !== 'privado' && status !== 'publicado') {
      return response.status(400).json({ message: 'Status inválido.' });
    }

    const current = await query(
      'SELECT conteudo FROM projetos WHERE id = $1 AND usuario_id = $2',
      [request.params.id, request.userId],
    );
    if (!current.rows[0]) {
      return response.status(404).json({ message: 'Projeto não encontrado.' });
    }

    // RN-08: um projeto precisa ter conteúdo para ser publicado.
    if (status === 'publicado' && !current.rows[0].conteudo?.elements?.length) {
      return response.status(400).json({
        message: 'Adicione ao menos um elemento ao projeto antes de publicá-lo.',
      });
    }

    const result = await query(
      'UPDATE projetos SET status = $1 WHERE id = $2 AND usuario_id = $3 RETURNING id, titulo, status',
      [status, request.params.id, request.userId],
    );
    return response.json({ project: result.rows[0] });
  } catch (error) {
    if (error.code === '22P02') return response.status(404).json({ message: 'Projeto não encontrado.' });
    return next(error);
  }
});

app.put('/api/projects/:id/conteudo', requireAuth, async (request, response, next) => {
  try {
    const { conteudo } = request.body;
    if (!conteudo || typeof conteudo !== 'object' || !Array.isArray(conteudo.elements)) {
      return response.status(400).json({ message: 'Conteúdo do projeto inválido.' });
    }

    const result = await query(
      'UPDATE projetos SET conteudo = $1 WHERE id = $2 AND usuario_id = $3',
      [conteudo, request.params.id, request.userId],
    );
    if (!result.rowCount) {
      return response.status(404).json({ message: 'Projeto não encontrado.' });
    }
    return response.status(204).send();
  } catch (error) {
    if (error.code === '22P02') return response.status(404).json({ message: 'Projeto não encontrado.' });
    return next(error);
  }
});

app.delete('/api/projects/:id', requireAuth, async (request, response, next) => {
  try {
    const result = await query(
      'DELETE FROM projetos WHERE id = $1 AND usuario_id = $2',
      [request.params.id, request.userId],
    );
    if (!result.rowCount) {
      return response.status(404).json({ message: 'Projeto não encontrado.' });
    }
    return response.status(204).send();
  } catch (error) {
    if (error.code === '22P02') return response.status(404).json({ message: 'Projeto não encontrado.' });
    return next(error);
  }
});

app.post('/api/auth/password-recovery', async (request, response, next) => {
  try {
    const email = request.body.email?.trim().toLowerCase();
    if (!email) {
      return response.status(400).json({ message: 'Informe um e-mail válido.' });
    }

    const userResult = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (!userResult.rows[0]) {
      return response.status(404).json({ message: 'E-mail não cadastrado.' });
    }
    if (!mailTransport) {
      return response.status(503).json({ message: 'O serviço de e-mail ainda não está configurado.' });
    }

    const code = generateEmailCode();
    const codeHash = await bcrypt.hash(code, 10);

    await query(
      "UPDATE users SET password_reset_token_hash = $1, password_reset_token_expires_at = NOW() + INTERVAL '15 minutes' WHERE id = $2",
      [codeHash, userResult.rows[0].id],
    );

    const recoveryUrl = process.env.PASSWORD_RESET_URL || 'https://example.com/reset-password';
    const mailOptions = {
      from: process.env.SMTP_FROM || 'no-reply@scheddio.com',
      to: email,
      subject: 'Recuperação de senha',
      text:
        `Olá,

` +
        `Você solicitou a recuperação de senha. Use o código abaixo para redefinir sua senha:

` +
        `Código: ${code}

` +
        `Se preferir, acesse: ${recoveryUrl}

` +
        `Este código expira em 15 minutos.

` +
        `Se você não solicitou esta alteração, ignore esta mensagem.
`,
      html:
        `<p>Olá,</p>` +
        `<p>Você solicitou a recuperação de senha. Use o código abaixo para redefinir sua senha:</p>` +
        `<p><strong>Código:</strong> ${code}</p>` +
        `<p>Se preferir, acesse: <a href="${recoveryUrl}">${recoveryUrl}</a></p>` +
        `<p>Este código expira em 15 minutos.</p>` +
        `<p>Se você não solicitou esta alteração, ignore esta mensagem.</p>`,
    };

    const mailResult = await mailTransport.sendMail(mailOptions);

    if (mailPreviewUrl === null && nodemailer.getTestMessageUrl) {
      mailPreviewUrl = nodemailer.getTestMessageUrl(mailResult) || null;
    }

    return response.json({
      message: 'Código de recuperação enviado por e-mail.',
      previewUrl: mailPreviewUrl || undefined,
    });
  } catch (error) {
    console.error('Erro ao enviar e-mail de recuperação:', error);

    if (error.code === 'EAUTH' || error.code === 'ECONNECTION') {
      return response.status(502).json({ message: 'Falha ao enviar e-mail. Verifique a configuração do servidor de SMTP.' });
    }

    return next(error);
  }
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
      'UPDATE users SET senha = $1, password_reset_token_hash = NULL, password_reset_token_expires_at = NULL WHERE id = $2',
      [await bcrypt.hash(password, 12), user.id],
    );
    return response.json({ message: 'Senha atualizada com sucesso.' });
  } catch (error) { return next(error); }
});

app.get(/^(?!\/api\/).*/, (_request, response) => {
  response.sendFile(path.join(clientDist, 'index.html'));
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ message: 'Não foi possível concluir a operação. Tente novamente.' });
});

app.listen(port, () => console.log(`Schedio Drasis em http://127.0.0.1:${port}`));

createMailTransport().catch((error) => {
  mailTransport = null;
  smtpStatus = 'error';
  smtpError = error.message;
  console.error('Falha ao conectar ao SMTP:', error.message);
});
