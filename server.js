require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const multer = require('multer');
const { query, pool } = require('./db');
const { signToken, requireAuth } = require('./auth');
const storage = require('./storage');
const { MAX_TAGS_LENGTH, parseTags, formatTags } = require('./tags');
const { TERMOS } = require('./termos');
const { arquivarConta, restaurarConta, expurgarContasVencidas } = require('./contasExcluidas');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const PROJETO_NAO_ENCONTRADO = 'Projeto não encontrado.';
const PROJETO_NAO_PUBLICADO = 'Projeto não encontrado ou não publicado.';
const PERFIL_NAO_ENCONTRADO = 'Perfil não encontrado.';
const SESSAO_INVALIDA = 'Sessão inválida ou expirada.';

/** O que o dono vê de cada projeto nas listas (sem o `conteudo`, que é pesado). */
const CAMPOS_PROJETO = 'id, titulo, descricao, categoria, capa, status, likes, criado';

/** Erro com status HTTP: `rota` responde `{ message }` com ele em vez de 500. */
class ErroHttp extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Envolve uma rota assíncrona — o Express 4 não captura a rejeição sozinho.
 * Com `naoEncontrado`, um id que nem é UUID (22P02 do Postgres) responde 404
 * com essa mensagem, igual a um id que não existe.
 */
function rota(handler, naoEncontrado) {
  return async (request, response, next) => {
    try {
      await handler(request, response);
    } catch (error) {
      if (error instanceof ErroHttp) {
        return response.status(error.status).json({ message: error.message });
      }
      if (naoEncontrado && error.code === '22P02') {
        return response.status(404).json({ message: naoEncontrado });
      }
      return next(error);
    }
  };
}

// Arquivo fica em memória e segue direto para o Cloudinary — nada é gravado em disco.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_request, file, done) => {
    if (!file.mimetype?.startsWith('image/')) {
      return done(new Error('TIPO_INVALIDO'));
    }
    return done(null, true);
  },
});

/** Envolve o multer para transformar os erros dele em respostas JSON do app. */
function receberImagem(request, response, next) {
  upload.single('imagem')(request, response, (error) => {
    if (error?.code === 'LIMIT_FILE_SIZE') {
      return response.status(413).json({ message: 'A imagem deve ter no máximo 5 MB.' });
    }
    if (error?.message === 'TIPO_INVALIDO') {
      return response.status(415).json({ message: 'Envie um arquivo de imagem.' });
    }
    if (error) return next(error);
    if (!request.file) return response.status(400).json({ message: 'Nenhuma imagem enviada.' });
    return next();
  });
}

/** Barra as rotas de imagem antes de qualquer trabalho quando falta credencial. */
function requireStorage(_request, response, next) {
  if (!storage.isConfigured) {
    return response.status(503).json({
      message:
        'O armazenamento de imagens ainda não está configurado. Defina CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET no .env.',
    });
  }
  return next();
}

/** Rotas que recebem um arquivo: sessão, Cloudinary configurado e a imagem em si. */
const comImagem = [requireAuth, requireStorage, receberImagem];

/**
 * Sobe a imagem nova, grava com `gravar` e só então apaga a anterior: a que
 * foi substituída viraria lixo no Cloudinary, mas sai só depois do update dar certo.
 */
async function substituirImagem(arquivo, pasta, anterior, gravar) {
  const enviada = await storage.uploadBuffer(arquivo.buffer, { folder: `${storage.FOLDER}/${pasta}` });
  const gravado = await gravar(enviada);
  await storage.destroyQuietly(anterior);
  return gravado;
}

/** Só o dono troca a capa do projeto. */
async function projetoDoUsuario(projetoId, userId) {
  const result = await query(
    'SELECT id, capa, capa_public_id FROM projetos WHERE id = $1 AND usuario_id = $2',
    [projetoId, userId],
  );
  if (!result.rows[0]) throw new ErroHttp(404, PROJETO_NAO_ENCONTRADO);
  return result.rows[0];
}

/**
 * Condição SQL "quem pede pode editar o canvas": o dono ou um colaborador
 * (RN-18). `p` é o alias de `projetos` e `$n` o parâmetro com o id do usuário.
 */
const podeEditar = (n) =>
  `(p.usuario_id = $${n} OR EXISTS (
     SELECT 1 FROM projeto_colaboradores c WHERE c.projeto_id = p.id AND c.usuario_id = $${n}))`;

/** Canvas e imagens dele: dono ou colaborador. Quem não pode recebe 404, como nas rotas do dono. */
async function projetoEditavel(projetoId, userId) {
  const result = await query(`SELECT p.id FROM projetos p WHERE p.id = $1 AND ${podeEditar(2)}`, [projetoId, userId]);
  if (!result.rows[0]) throw new ErroHttp(404, PROJETO_NAO_ENCONTRADO);
  return result.rows[0];
}

const app = express();

let mailTransport;
let mailPreviewUrl = null;
let smtpStatus = 'pending';

const normalizarEmail = (email) => email?.trim().toLowerCase();

/** Código de 6 dígitos e o hash que fica no banco — o código em si só vai no e-mail. */
async function novoCodigo() {
  const codigo = String(crypto.randomInt(100000, 1000000));
  return { codigo, hash: await bcrypt.hash(codigo, 10) };
}

async function enviarEmail(mensagem) {
  const result = await mailTransport.sendMail({
    from: process.env.SMTP_FROM || 'no-reply@schediodrasis.local',
    ...mensagem,
  });
  mailPreviewUrl = nodemailer.getTestMessageUrl(result) || null;
}

/** Link para ver o último e-mail no Ethereal; só em desenvolvimento. */
function previewUrl() {
  return process.env.NODE_ENV === 'development' ? mailPreviewUrl || undefined : undefined;
}

function sendVerificationEmail(email, code) {
  return enviarEmail({
    to: email,
    subject: 'Confirme seu e-mail — Schedio Drasis',
    text: `Olá!\n\nUse o código ${code} para confirmar seu e-mail no Schedio Drasis. Ele expira em 15 minutos.\n\nSe você não criou esta conta, ignore esta mensagem.`,
    html: `<p>Olá!</p><p>Use o código abaixo para confirmar seu e-mail no Schedio Drasis:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>Ele expira em 15 minutos.</p><p>Se você não criou esta conta, ignore esta mensagem.</p>`,
  });
}

function sendRecoveryEmail(email, code) {
  const recoveryUrl = process.env.PASSWORD_RESET_URL || 'https://example.com/reset-password';
  return enviarEmail({
    to: email,
    subject: 'Recuperação de senha',
    text: `Olá,\n\nVocê solicitou a recuperação de senha. Use o código abaixo para redefinir sua senha:\n\nCódigo: ${code}\n\nSe preferir, acesse: ${recoveryUrl}\n\nEste código expira em 15 minutos.\n\nSe você não solicitou esta alteração, ignore esta mensagem.\n`,
    html:
      `<p>Olá,</p>` +
      `<p>Você solicitou a recuperação de senha. Use o código abaixo para redefinir sua senha:</p>` +
      `<p><strong>Código:</strong> ${code}</p>` +
      `<p>Se preferir, acesse: <a href="${recoveryUrl}">${recoveryUrl}</a></p>` +
      `<p>Este código expira em 15 minutos.</p>` +
      `<p>Se você não solicitou esta alteração, ignore esta mensagem.</p>`,
  });
}

async function createMailTransport() {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpUser && smtpPass) {
    mailTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: smtpUser, pass: smtpPass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    await mailTransport.verify();
    smtpStatus = 'configured';
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

app.get('/api/health', rota(async (_request, response) => {
  await query('SELECT 1');
  response.json({
    status: 'ok',
    database: 'connected',
    smtp: smtpStatus,
    storage: storage.storageStatus(),
  });
}));

/** Texto vigente dos Termos de Uso; público porque é lido antes do cadastro. */
app.get('/api/termos', (_request, response) => {
  response.json(TERMOS);
});

app.post('/api/auth/register', rota(async (request, response) => {
  const { email, password, termsVersion } = request.body;
  if (!email || !password || password.length < 8) {
    return response.status(400).json({ message: 'Informe um e-mail válido e uma senha com pelo menos 8 caracteres.' });
  }
  if (!termsVersion) {
    return response.status(400).json({ message: 'É preciso aceitar os Termos de Uso para criar a conta.' });
  }
  // Aceite de uma versão antiga (página aberta antes de uma atualização)
  // não vale: a pessoa precisa ler o texto que de fato será registrado.
  if (termsVersion !== TERMOS.versao) {
    return response.status(400).json({ message: 'Os Termos de Uso foram atualizados. Leia a nova versão e aceite novamente.' });
  }
  if (!mailTransport) {
    return response.status(503).json({ message: 'O serviço de e-mail ainda não está configurado. Configure o SMTP para criar uma conta.' });
  }

  const normalizedEmail = normalizarEmail(email);
  const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rows[0]) {
    return response.status(409).json({ message: 'Este e-mail já está cadastrado.' });
  }

  const senhaHash = await bcrypt.hash(password, 12);
  const { codigo, hash } = await novoCodigo();
  // O aceite é registrado agora, no momento do cadastro; a confirmação do
  // e-mail só o copia para `users`.
  await query(
    `INSERT INTO pending_registrations
       (email, senha, verification_token_hash, verification_token_expires_at, termos_versao, termos_aceitos_em, updated_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '15 minutes', $4, NOW(), NOW())
     ON CONFLICT (email) DO UPDATE SET
       senha = EXCLUDED.senha,
       verification_token_hash = EXCLUDED.verification_token_hash,
       verification_token_expires_at = EXCLUDED.verification_token_expires_at,
       termos_versao = EXCLUDED.termos_versao,
       termos_aceitos_em = EXCLUDED.termos_aceitos_em,
       updated_at = NOW()`,
    [normalizedEmail, senhaHash, hash, TERMOS.versao],
  );
  await sendVerificationEmail(normalizedEmail, codigo);

  return response.status(201).json({
    user: { email: normalizedEmail },
    message: 'Conta criada. Enviamos um código de confirmação para seu e-mail.',
    previewUrl: previewUrl(),
  });
}));

app.post('/api/auth/login', rota(async (request, response) => {
  const { email, password } = request.body;
  const result = await query('SELECT id, email, senha FROM users WHERE email = $1', [normalizarEmail(email)]);
  const user = result.rows[0];

  if (!user) {
    return response.status(401).json({ message: 'E-mail não cadastrado.' });
  }
  if (!await bcrypt.compare(password || '', user.senha)) {
    return response.status(401).json({ message: 'Senha incorreta.' });
  }

  return response.json({ user: { id: user.id, email: user.email }, token: signToken(user) });
}));

/**
 * O dono da plataforma: administrador por configuração (`ADMIN_DONO_EMAIL`),
 * não por coluna — por isso nenhuma rota consegue tirar o acesso dele.
 */
const emailDoDono = () => normalizarEmail(process.env.ADMIN_DONO_EMAIL || '') || null;

/** `admin` e `dono` de uma linha de `users` (com `email` e `admin`). */
function papelAdmin(user) {
  const dono = Boolean(user.email && user.email === emailDoDono());
  return { admin: dono || Boolean(user.admin), dono };
}

app.get('/api/auth/me', requireAuth, rota(async (request, response) => {
  // `email_novo`: troca de e-mail esperando o código (RF-04), se ainda no prazo.
  const result = await query(
    `SELECT id, email, nome, bio, foto, cor, termos_versao, termos_aceitos_em, admin,
            CASE WHEN email_novo_expira_em > NOW() THEN email_novo END AS email_novo
     FROM users WHERE id = $1`,
    [request.userId],
  );
  const user = result.rows[0];
  if (!user) return response.status(401).json({ message: SESSAO_INVALIDA });
  return response.json({ user: { ...user, ...papelAdmin(user) } });
}));

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

app.patch('/api/users/me', requireAuth, rota(async (request, response) => {
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
    'UPDATE users SET nome = $1, bio = $2, cor = $3 WHERE id = $4 RETURNING id, email, nome, bio, foto, cor',
    [nome, bio, cor, request.userId],
  );
  return response.json({ user: result.rows[0] });
}));

/*
 * Troca do e-mail (RF-04), em duas etapas, como o cadastro: o novo endereço
 * só vale depois de confirmado pelo código enviado a ele. Até lá a conta
 * continua entrando com o e-mail atual.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/users/me/email', requireAuth, rota(async (request, response) => {
  const email = normalizarEmail(String(request.body.email || ''));
  if (!email || !EMAIL_PATTERN.test(email) || email.length > 255) {
    return response.status(400).json({ message: 'Informe um e-mail válido.' });
  }

  const result = await query('SELECT email, senha, admin FROM users WHERE id = $1', [request.userId]);
  const user = result.rows[0];
  if (!user) return response.status(401).json({ message: SESSAO_INVALIDA });
  if (!await bcrypt.compare(request.body.password || '', user.senha)) {
    return response.status(401).json({ message: 'Senha incorreta.' });
  }
  if (email === user.email) {
    return response.status(400).json({ message: 'Esse já é o e-mail da sua conta.' });
  }
  // O dono é reconhecido pelo e-mail da configuração: trocar aqui tiraria o
  // acesso de administrador dele sem aviso.
  if (papelAdmin(user).dono) {
    return response.status(400).json({
      message: 'O e-mail da conta dona da plataforma vem da configuração (ADMIN_DONO_EMAIL). Mude a configuração antes.',
    });
  }
  const emUso = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (emUso.rows[0]) return response.status(409).json({ message: 'Este e-mail já está cadastrado.' });
  if (!mailTransport) {
    return response.status(503).json({ message: 'O serviço de e-mail ainda não está configurado.' });
  }

  const { codigo, hash } = await novoCodigo();
  await query(
    `UPDATE users SET email_novo = $1, email_novo_token_hash = $2, email_novo_expira_em = NOW() + INTERVAL '15 minutes'
     WHERE id = $3`,
    [email, hash, request.userId],
  );
  await enviarEmail({
    to: email,
    subject: 'Confirme seu novo e-mail — Schedio Drasis',
    text: `Olá!\n\nUse o código ${codigo} para confirmar este endereço como o novo e-mail da sua conta no Schedio Drasis. Ele expira em 15 minutos.\n\nSe você não pediu essa troca, ignore esta mensagem.`,
    html: `<p>Olá!</p><p>Use o código abaixo para confirmar este endereço como o novo e-mail da sua conta no Schedio Drasis:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${codigo}</p><p>Ele expira em 15 minutos.</p><p>Se você não pediu essa troca, ignore esta mensagem.</p>`,
  });

  return response.json({
    email_novo: email,
    message: `Enviamos um código para ${email}. Digite-o para concluir a troca.`,
    previewUrl: previewUrl(),
  });
}));

app.post('/api/users/me/email/confirmar', requireAuth, rota(async (request, response) => {
  const result = await query(
    `SELECT email, email_novo, email_novo_token_hash FROM users
     WHERE id = $1 AND email_novo IS NOT NULL AND email_novo_expira_em > NOW()`,
    [request.userId],
  );
  const pendente = result.rows[0];
  if (!pendente || !await bcrypt.compare(String(request.body.code || ''), pendente.email_novo_token_hash)) {
    return response.status(400).json({ message: 'Código inválido ou expirado.' });
  }

  let atualizado;
  try {
    atualizado = await query(
      `UPDATE users SET email = email_novo, email_novo = NULL, email_novo_token_hash = NULL, email_novo_expira_em = NULL
       WHERE id = $1
       RETURNING id, email, nome, bio, foto, cor`,
      [request.userId],
    );
  } catch (error) {
    // Alguém confirmou um cadastro com esse e-mail no meio do caminho.
    if (error.code !== '23505') throw error;
    return response.status(409).json({ message: 'Este e-mail já está cadastrado.' });
  }

  // O endereço antigo fica sabendo: se não foi a pessoa, ela tem por onde reagir.
  if (mailTransport) {
    enviarEmail({
      to: pendente.email,
      subject: 'O e-mail da sua conta foi alterado — Schedio Drasis',
      text: `O e-mail da sua conta no Schedio Drasis foi alterado para ${pendente.email_novo}. Se não foi você, recupere o acesso pelo novo endereço ou fale com a administração da plataforma.`,
    }).catch((error) => console.error('Aviso de troca de e-mail não enviado:', error.message));
  }

  return response.json({ user: atualizado.rows[0], message: 'E-mail alterado com sucesso.' });
}));

/** Desiste da troca pendente. */
app.delete('/api/users/me/email', requireAuth, rota(async (request, response) => {
  await query(
    'UPDATE users SET email_novo = NULL, email_novo_token_hash = NULL, email_novo_expira_em = NULL WHERE id = $1',
    [request.userId],
  );
  return response.status(204).send();
}));

app.delete('/api/users/me', requireAuth, rota(async (request, response) => {
  const result = await query('SELECT senha FROM users WHERE id = $1', [request.userId]);
  const user = result.rows[0];
  if (!user) return response.status(401).json({ message: SESSAO_INVALIDA });

  if (!await bcrypt.compare(request.body.password || '', user.senha)) {
    return response.status(401).json({ message: 'Senha incorreta.' });
  }

  await excluirConta(request.userId);
  return response.status(204).send();
}));

/** Roda `trabalho(client)` numa transação: tudo ou nada. */
async function emTransacao(trabalho) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await trabalho(client);
    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Exclui a conta: pela própria pessoa (/conta) ou por um administrador
 * (`excluidaPor`, com `motivo`). Nos dois casos a cópia vai para
 * `contas_excluidas` pelo prazo dos Termos; só a do administrador guarda o
 * necessário para restaurar (ver contasExcluidas.js).
 */
async function excluirConta(userId, { excluidaPor = null, motivo = null } = {}) {
  const foto = await query('SELECT foto_public_id FROM users WHERE id = $1', [userId]);

  // Tudo numa transação: a cópia para `contas_excluidas` (prazo dos Termos)
  // e a exclusão acontecem juntas ou nenhuma.
  await emTransacao(async (client) => {
    await arquivarConta(client, userId, { excluidaPor, motivo });

    // Os likes da conta saem junto com ela. Os projetos do próprio usuário
    // ficam de fora porque o cascade já os apaga. As denúncias, não: o
    // contador só cresce e serve à avaliação (RN-15).
    await client.query(
      `UPDATE projetos SET likes = GREATEST(likes - 1, 0)
       WHERE usuario_id <> $1
         AND id::text IN (SELECT jsonb_array_elements_text(likes) FROM users WHERE id = $1)`,
      [userId],
    );

    // Os arrays de `users` não têm FK: o cascade não tira deles os projetos
    // desta conta nem a própria conta, como acontece ao excluir um projeto.
    await client.query(
      `WITH sumidos AS (SELECT ARRAY(SELECT id::text FROM projetos WHERE usuario_id = $1) AS ids)
       UPDATE users
       SET likes = likes - sumidos.ids,
           salvos = salvos - sumidos.ids,
           reportados = reportados - sumidos.ids,
           criadores_reportados = criadores_reportados - $1::uuid::text
       FROM sumidos
       WHERE users.id <> $1
         AND (likes ?| sumidos.ids OR salvos ?| sumidos.ids OR reportados ?| sumidos.ids
           OR criadores_reportados ? $1::uuid::text)`,
      [userId],
    );

    await client.query('DELETE FROM users WHERE id = $1', [userId]);
  });

  // Como na exclusão de projeto: a conta já se foi.
  await storage.destroyQuietly(foto.rows[0]?.foto_public_id);
}

/**
 * Perfil público de um criador: dados de apresentação e as obras dele.
 *
 * Quem visita vê só as obras publicadas. O próprio dono vê todas, com o
 * status, porque para ele a lista também é um atalho para as que estão em
 * andamento.
 */
app.get('/api/users/:id/perfil', requireAuth, rota(async (request, response) => {
  // `denunciado` é de quem visita: o botão de denunciar já abre no estado certo.
  const userResult = await query(
    `SELECT u.id, u.nome, u.email, u.bio, u.foto,
            COALESCE(eu.criadores_reportados ? u.id::text, false) AS denunciado
     FROM users u
     LEFT JOIN users eu ON eu.id = $2
     WHERE u.id = $1`,
    [request.params.id, request.userId],
  );
  const user = userResult.rows[0];
  if (!user) return response.status(404).json({ message: PERFIL_NAO_ENCONTRADO });

  const isOwner = user.id === request.userId;
  const projectsResult = await query(
    `SELECT ${CAMPOS_PROJETO}
     FROM projetos
     WHERE usuario_id = $1 AND ($2 OR status = 'publicado')
     ORDER BY criado DESC`,
    [user.id, isOwner],
  );
  return response.json({ user, isOwner, projects: projectsResult.rows });
}, PERFIL_NAO_ENCONTRADO));

app.post('/api/auth/email-verification/resend', rota(async (request, response) => {
  if (!mailTransport) return response.status(503).json({ message: 'O serviço de e-mail ainda não está configurado.' });
  const email = normalizarEmail(request.body.email);

  const { codigo, hash } = await novoCodigo();
  const result = await query(
    "UPDATE pending_registrations SET verification_token_hash = $1, verification_token_expires_at = NOW() + INTERVAL '15 minutes', updated_at = NOW() WHERE email = $2",
    [hash, email],
  );
  if (!result.rowCount) return response.json({ message: 'Se necessário, enviaremos um novo código de confirmação.' });
  await sendVerificationEmail(email, codigo);

  return response.json({
    message: 'Enviamos um novo código de confirmação para seu e-mail.',
    previewUrl: previewUrl(),
  });
}));

app.post('/api/auth/email-verification/verify', rota(async (request, response) => {
  const email = normalizarEmail(request.body.email);
  const result = await query(
    `SELECT senha, verification_token_hash, termos_versao, termos_aceitos_em
     FROM pending_registrations
     WHERE email = $1 AND verification_token_expires_at > NOW()`,
    [email],
  );
  const pending = result.rows[0];
  if (!pending || !await bcrypt.compare(request.body.code || '', pending.verification_token_hash)) {
    return response.status(400).json({ message: 'Código inválido ou expirado.' });
  }

  const inserido = await query(
    `INSERT INTO users (email, senha, email_verified_at, termos_versao, termos_aceitos_em)
     VALUES ($1, $2, NOW(), $3, $4)
     ON CONFLICT (email) DO NOTHING`,
    [email, pending.senha, pending.termos_versao, pending.termos_aceitos_em],
  );
  if (!inserido.rowCount) return response.status(409).json({ message: 'Este e-mail já está cadastrado.' });
  await query('DELETE FROM pending_registrations WHERE email = $1', [email]);

  return response.json({ message: 'E-mail confirmado. Agora você já pode entrar.' });
}));

app.get('/api/projects', requireAuth, rota(async (request, response) => {
  // `salvo` diz se quem pede guardou o projeto: a tela inicial os põe em destaque.
  const result = await query(
    `SELECT p.id, p.titulo, p.categoria, p.capa, p.criado, p.likes,
            u.id AS autor_id, u.nome AS autor_nome, u.email AS autor_email,
            COALESCE(eu.salvos ? p.id::text, false) AS salvo
     FROM projetos p
     JOIN users u ON u.id = p.usuario_id
     LEFT JOIN users eu ON eu.id = $1
     WHERE p.status = 'publicado'
     ORDER BY p.criado DESC`,
    [request.userId],
  );
  return response.json({ projects: result.rows });
}));

app.get('/api/projects/mine', requireAuth, rota(async (request, response) => {
  const result = await query(
    `SELECT ${CAMPOS_PROJETO} FROM projetos WHERE usuario_id = $1 ORDER BY criado DESC`,
    [request.userId],
  );
  return response.json({ projects: result.rows });
}));

/**
 * Campos que o dono informa sobre o projeto, validados igual na criação e na
 * edição. Devolve `[titulo, descricao, categoria]`, nessa ordem, com os
 * vazios já como `null`.
 */
function dadosDoProjeto(body) {
  const titulo = (body.titulo || '').trim();
  const descricao = (body.descricao || '').trim();
  // O usuário digita várias tags num campo só; gravamos a forma canônica,
  // com as repetidas já descartadas (ver tags.js).
  const categoria = formatTags(parseTags(body.categoria));

  if (!titulo || titulo.length > 160) {
    throw new ErroHttp(400, 'Informe um título de até 160 caracteres.');
  }
  if (categoria.length > MAX_TAGS_LENGTH) {
    throw new ErroHttp(
      400,
      `As tags devem somar até ${MAX_TAGS_LENGTH} caracteres. Use menos tags ou tags mais curtas.`,
    );
  }

  return [titulo, descricao || null, categoria || null];
}

app.post('/api/projects', requireAuth, rota(async (request, response) => {
  const result = await query(
    `INSERT INTO projetos (titulo, descricao, categoria, usuario_id)
     VALUES ($1, $2, $3, $4)
     RETURNING ${CAMPOS_PROJETO}`,
    [...dadosDoProjeto(request.body), request.userId],
  );
  return response.status(201).json({ project: result.rows[0] });
}));

/** Projetos em que quem pede entrou como colaborador, com o dono de cada um. */
app.get('/api/projects/compartilhados', requireAuth, rota(async (request, response) => {
  const result = await query(
    `SELECT p.id, p.titulo, p.descricao, p.categoria, p.capa, p.status, p.likes, p.criado,
            u.id AS autor_id, u.nome AS autor_nome, u.email AS autor_email
     FROM projeto_colaboradores c
     JOIN projetos p ON p.id = c.projeto_id
     JOIN users u ON u.id = p.usuario_id
     WHERE c.usuario_id = $1
     ORDER BY c.adicionado_em DESC`,
    [request.userId],
  );
  return response.json({ projects: result.rows });
}));

/**
 * O projeto para o editor: dono ou colaborador. `papel` diz qual dos dois,
 * porque o colaborador edita o canvas mas não publica, não troca a capa nem
 * compartilha. `versao` é o que ele devolve ao gravar (ver PUT .../conteudo).
 */
app.get('/api/projects/:id', requireAuth, rota(async (request, response) => {
  const result = await query(
    `SELECT p.id, p.titulo, p.descricao, p.categoria, p.capa, p.status, p.likes, p.criado,
            p.conteudo, p.conteudo_versao AS versao,
            CASE WHEN p.usuario_id = $2 THEN 'dono' ELSE 'colaborador' END AS papel,
            u.nome AS autor_nome, u.email AS autor_email
     FROM projetos p
     JOIN users u ON u.id = p.usuario_id
     WHERE p.id = $1 AND ${podeEditar(2)}`,
    [request.params.id, request.userId],
  );
  if (!result.rows[0]) return response.status(404).json({ message: PROJETO_NAO_ENCONTRADO });
  return response.json({ project: result.rows[0] });
}, PROJETO_NAO_ENCONTRADO));

/**
 * Só a versão do canvas: o editor consulta a cada poucos segundos para trazer o
 * que outra pessoa salvou sem baixar o documento inteiro à toa.
 */
app.get('/api/projects/:id/versao', requireAuth, rota(async (request, response) => {
  const result = await query(
    `SELECT p.conteudo_versao AS versao FROM projetos p WHERE p.id = $1 AND ${podeEditar(2)}`,
    [request.params.id, request.userId],
  );
  if (!result.rows[0]) return response.status(404).json({ message: PROJETO_NAO_ENCONTRADO });
  return response.json(result.rows[0]);
}, PROJETO_NAO_ENCONTRADO));

/**
 * Edição dos dados do projeto (título, descrição e tags).
 *
 * Só vale com o projeto privado: publicado, ele já está na tela inicial e na
 * leitura de outras pessoas, então mudar os dados por baixo mudaria o que elas
 * estão vendo. Para editar, o dono torna privado primeiro.
 */
app.patch('/api/projects/:id', requireAuth, rota(async (request, response) => {
  // O status vem antes da validação dos campos: com o projeto publicado a
  // resposta precisa ser sempre a mesma, e não depender do que foi digitado.
  const atual = await query(
    'SELECT status FROM projetos WHERE id = $1 AND usuario_id = $2',
    [request.params.id, request.userId],
  );
  if (!atual.rows[0]) {
    return response.status(404).json({ message: PROJETO_NAO_ENCONTRADO });
  }
  if (atual.rows[0].status === 'publicado') {
    return response.status(409).json({ message: 'Torne o projeto privado para editar os dados dele.' });
  }

  const result = await query(
    `UPDATE projetos SET titulo = $1, descricao = $2, categoria = $3
     WHERE id = $4 AND usuario_id = $5
     RETURNING ${CAMPOS_PROJETO}`,
    [...dadosDoProjeto(request.body), request.params.id, request.userId],
  );
  return response.json({ project: result.rows[0] });
}, PROJETO_NAO_ENCONTRADO));

/**
 * Leitura pública de um projeto publicado (RN-07). Diferente de
 * `GET /api/projects/:id`, que é exclusivo do dono para edição: aqui qualquer
 * usuário autenticado lê, mas só se o projeto estiver publicado.
 */
app.get('/api/projects/:id/leitura', requireAuth, rota(async (request, response) => {
  // `curtido`, `salvo` e `denunciado` são de quem lê, para a apresentação
  // mostrar os botões já no estado certo.
  const result = await query(
    `SELECT p.id, p.titulo, p.descricao, p.categoria, p.capa, p.criado, p.likes, p.conteudo,
            u.id AS autor_id, u.nome AS autor_nome, u.email AS autor_email, u.bio AS autor_bio,
            COALESCE(eu.likes ? p.id::text, false) AS curtido,
            COALESCE(eu.salvos ? p.id::text, false) AS salvo,
            COALESCE(eu.reportados ? p.id::text, false) AS denunciado
     FROM projetos p
     JOIN users u ON u.id = p.usuario_id
     LEFT JOIN users eu ON eu.id = $2
     WHERE p.id = $1 AND (p.status = 'publicado' OR eu.admin OR eu.email = $3)`,
    // Administrador lê também o privado: uma obra denunciada pode ter sido
    // tornada privada, e a avaliação (RN-15) precisa vê-la.
    [request.params.id, request.userId, emailDoDono()],
  );
  if (!result.rows[0]) return response.status(404).json({ message: PROJETO_NAO_PUBLICADO });
  return response.json({ project: result.rows[0] });
}, PROJETO_NAO_PUBLICADO));

/**
 * Curtir, salvar e denunciar (RF-38, RF-40, RF-39).
 *
 * A marca mora no array de `users` (`likes`, `salvos`, `reportados`, com o id
 * do projeto em texto) e o contador, quando há, em `projetos`. Marcar e
 * contar vão num único comando: o UPDATE em `users` só acontece se o id ainda
 * não estava (ou ainda estava) no array, e o contador anda pelo número de
 * linhas que ele de fato mudou. Dois cliques simultâneos do mesmo usuário
 * esbarram na trava da linha dele, e o segundo já não muda nada — RN-14, um
 * like por usuário, sem depender de checagem antes do UPDATE.
 *
 * Marcar exige projeto publicado (é o que o leitor alcança); desmarcar só
 * exige que ele exista, para quem curtiu não ficar preso se o dono o tornou
 * privado.
 */
const MARCAS = {
  like: { lista: 'likes', contador: 'likes' },
  salvo: { lista: 'salvos', contador: null },
  denuncia: { lista: 'reportados', contador: 'denuncias' },
};

async function alterarMarca(tipo, projectId, userId, marcar) {
  const { lista, contador } = MARCAS[tipo];

  const projeto = await query('SELECT usuario_id, status FROM projetos WHERE id = $1', [projectId]);
  const alvo = projeto.rows[0];
  if (!alvo || (marcar && alvo.status !== 'publicado')) {
    throw new ErroHttp(404, PROJETO_NAO_PUBLICADO);
  }
  if (tipo === 'denuncia' && alvo.usuario_id === userId) {
    throw new ErroHttp(400, 'Você não pode denunciar o próprio projeto.');
  }

  const mudanca = marcar
    ? `${lista} = ${lista} || to_jsonb($1::uuid::text) WHERE id = $2 AND NOT ${lista} ? $1::uuid::text`
    : `${lista} = ${lista} - $1::uuid::text WHERE id = $2 AND ${lista} ? $1::uuid::text`;
  const passo = marcar ? '+' : '-';

  const result = await query(
    `WITH mudou AS (UPDATE users SET ${mudanca} RETURNING id)
     ${contador
       ? `UPDATE projetos SET ${contador} = GREATEST(${contador} ${passo} (SELECT COUNT(*) FROM mudou)::int, 0)
          WHERE id = $1::uuid RETURNING ${contador} AS total`
       : 'SELECT COUNT(*)::int AS total FROM mudou'}`,
    [projectId, userId],
  );
  return result.rows[0] || { total: 0 };
}

function rotaDeMarca(tipo, marcar, responder) {
  return rota(async (request, response) => {
    const resultado = await alterarMarca(tipo, request.params.id, request.userId, marcar);
    response.json(responder(resultado));
  }, PROJETO_NAO_PUBLICADO);
}

app.put('/api/projects/:id/like', requireAuth, rotaDeMarca('like', true, ({ total }) => ({ curtido: true, likes: total })));
app.delete('/api/projects/:id/like', requireAuth, rotaDeMarca('like', false, ({ total }) => ({ curtido: false, likes: total })));
app.put('/api/projects/:id/salvo', requireAuth, rotaDeMarca('salvo', true, () => ({ salvo: true })));
app.delete('/api/projects/:id/salvo', requireAuth, rotaDeMarca('salvo', false, () => ({ salvo: false })));
// Denúncia não se desfaz: o contador só cresce e fica para a avaliação (RN-15).
// Por isso também não devolvemos o total a quem denuncia.
app.post('/api/projects/:id/denuncia', requireAuth, rotaDeMarca('denuncia', true, () => ({ denunciado: true })));

/**
 * Denúncia de criador, no mesmo molde da de projeto: a marca vai para
 * `criadores_reportados` de quem denuncia e o total, que só cresce, para a
 * conta denunciada — num comando só, pelo número de linhas que a marca mudou.
 *
 * Os dois UPDATEs travam duas linhas de `users`. Se A denuncia B enquanto B
 * denuncia A, cada comando pega uma trava e espera a outra; o Postgres desfaz
 * um deles (40P01) e ele é repetido uma vez.
 */
async function denunciarCriador(reporterId, creatorId) {
  return query(
    `WITH mudou AS (
       UPDATE users SET criadores_reportados = criadores_reportados || to_jsonb($1::uuid::text)
       WHERE id = $2 AND NOT criadores_reportados ? $1::uuid::text
         AND EXISTS (SELECT 1 FROM users WHERE id = $1::uuid)
       RETURNING id
     )
     UPDATE users SET denuncias = denuncias + (SELECT COUNT(*) FROM mudou)::int
     WHERE id = $1::uuid
     RETURNING id`,
    [creatorId, reporterId],
  );
}

app.post('/api/users/:id/denuncia', requireAuth, rota(async (request, response) => {
  if (request.params.id === request.userId) {
    return response.status(400).json({ message: 'Você não pode denunciar a si mesmo.' });
  }

  const result = await denunciarCriador(request.userId, request.params.id).catch((error) => {
    if (error.code !== '40P01') throw error;
    return denunciarCriador(request.userId, request.params.id);
  });

  if (!result.rowCount) return response.status(404).json({ message: PERFIL_NAO_ENCONTRADO });
  // Como na denúncia de projeto, o total não volta para quem denuncia.
  return response.json({ denunciado: true });
}, PERFIL_NAO_ENCONTRADO));

/**
 * O que o usuário denunciou, do mais recente para o mais antigo (a ordem dos
 * arrays): projetos e criadores. Os projetos que voltaram a ser privados
 * continuam na lista, com o status, mas a interface não os abre — a leitura
 * não alcança projeto privado. Criadores que excluíram a conta somem: a
 * exclusão os tira dos arrays.
 */
app.get('/api/users/me/denuncias', requireAuth, rota(async (request, response) => {
  const creators = await query(
    `SELECT u.id, u.nome, u.email, u.foto
     FROM users eu
     CROSS JOIN LATERAL jsonb_array_elements_text(eu.criadores_reportados) WITH ORDINALITY AS r(criador_id, ordem)
     JOIN users u ON u.id::text = r.criador_id
     WHERE eu.id = $1
     ORDER BY r.ordem DESC`,
    [request.userId],
  );
  const projects = await query(
    `SELECT p.id, p.titulo, p.capa, p.status, p.criado,
            u.id AS autor_id, u.nome AS autor_nome, u.email AS autor_email
     FROM users eu
     CROSS JOIN LATERAL jsonb_array_elements_text(eu.reportados) WITH ORDINALITY AS r(projeto_id, ordem)
     JOIN projetos p ON p.id::text = r.projeto_id
     JOIN users u ON u.id = p.usuario_id
     WHERE eu.id = $1
     ORDER BY r.ordem DESC`,
    [request.userId],
  );
  return response.json({ projects: projects.rows, creators: creators.rows });
}));

app.patch('/api/projects/:id/status', requireAuth, rota(async (request, response) => {
  const { status } = request.body;
  if (status !== 'privado' && status !== 'publicado') {
    return response.status(400).json({ message: 'Status inválido.' });
  }

  const current = await query(
    'SELECT conteudo FROM projetos WHERE id = $1 AND usuario_id = $2',
    [request.params.id, request.userId],
  );
  if (!current.rows[0]) {
    return response.status(404).json({ message: PROJETO_NAO_ENCONTRADO });
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
}, PROJETO_NAO_ENCONTRADO));

/**
 * Grava o canvas (dono ou colaborador). Com `versao`, só grava se ninguém
 * salvou desde que o editor abriu aquela versão — senão 409, e o editor
 * pergunta se recarrega ou sobrescreve. Sem `versao` grava de qualquer jeito:
 * é o "sobrescrever" e também o que clientes antigos mandam.
 */
app.put('/api/projects/:id/conteudo', requireAuth, rota(async (request, response) => {
  const { conteudo, versao } = request.body;
  if (!conteudo || typeof conteudo !== 'object' || !Array.isArray(conteudo.elements)) {
    return response.status(400).json({ message: 'Conteúdo do projeto inválido.' });
  }
  if (versao !== undefined && versao !== null && !Number.isInteger(versao)) {
    return response.status(400).json({ message: 'Versão do conteúdo inválida.' });
  }

  const result = await query(
    `UPDATE projetos p SET conteudo = $1, conteudo_versao = p.conteudo_versao + 1
     WHERE p.id = $2 AND ${podeEditar(3)} AND ($4::int IS NULL OR p.conteudo_versao = $4::int)
     RETURNING p.conteudo_versao AS versao`,
    [conteudo, request.params.id, request.userId, versao ?? null],
  );
  if (result.rows[0]) return response.json(result.rows[0]);

  // Nada gravado: ou não há acesso (404), ou a versão ficou para trás (409).
  await projetoEditavel(request.params.id, request.userId);
  return response.status(409).json({
    message: 'Outra pessoa salvou este projeto enquanto você editava.',
  });
}, PROJETO_NAO_ENCONTRADO));

/*
 * Compartilhamento (RF-18, RN-17 a RN-20).
 *
 * - Link de visualização: quem o abre, logado, vê o canvas como está e pode
 *   simular, mas não grava nada (RN-19). Vale só enquanto o link vale.
 * - Link de colaboração: quem o aceita entra em `projeto_colaboradores` e passa
 *   a editar o canvas (RN-18). O link vence; o acesso fica até o dono remover.
 *
 * RN-17: o link não publica nada. Projeto privado continua fora da vitrine,
 * do perfil e da leitura pública; o link só alcança aquele projeto, e só para
 * quem está com ele em mãos.
 */
const TIPOS_DE_LINK = ['visualizacao', 'colaboracao'];
/** Prazos que o dono pode escolher, em horas (RN-20: curtos). */
const VALIDADES_DE_LINK = [1, 24, 72];
const LINK_INVALIDO = 'Link inválido ou expirado.';

const hashDoToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/** O projeto, se quem pede for o dono — só ele gerencia os links. */
async function exigirDono(projetoId, userId) {
  const result = await query('SELECT id FROM projetos WHERE id = $1 AND usuario_id = $2', [projetoId, userId]);
  if (!result.rows[0]) throw new ErroHttp(404, PROJETO_NAO_ENCONTRADO);
}

app.get('/api/projects/:id/compartilhamento', requireAuth, rota(async (request, response) => {
  await exigirDono(request.params.id, request.userId);
  const links = await query(
    `SELECT id, tipo, criado_em, expira_em FROM projeto_links
     WHERE projeto_id = $1 AND expira_em > NOW()
     ORDER BY criado_em DESC`,
    [request.params.id],
  );
  const colaboradores = await query(
    `SELECT u.id, u.nome, u.email, u.foto, c.adicionado_em
     FROM projeto_colaboradores c JOIN users u ON u.id = c.usuario_id
     WHERE c.projeto_id = $1
     ORDER BY c.adicionado_em`,
    [request.params.id],
  );
  return response.json({ links: links.rows, colaboradores: colaboradores.rows });
}, PROJETO_NAO_ENCONTRADO));

/** Gera um link. O segredo volta só nesta resposta; o banco guarda o hash. */
app.post('/api/projects/:id/links', requireAuth, rota(async (request, response) => {
  const { tipo } = request.body;
  const horas = request.body.horas ?? 24;
  if (!TIPOS_DE_LINK.includes(tipo)) {
    return response.status(400).json({ message: 'Tipo de link inválido.' });
  }
  if (!VALIDADES_DE_LINK.includes(horas)) {
    return response.status(400).json({ message: 'Escolha uma validade de 1 hora, 24 horas ou 3 dias.' });
  }
  await exigirDono(request.params.id, request.userId);

  const token = crypto.randomBytes(24).toString('base64url');
  const result = await query(
    `INSERT INTO projeto_links (projeto_id, tipo, token_hash, expira_em)
     VALUES ($1, $2, $3, NOW() + make_interval(hours => $4))
     RETURNING id, tipo, criado_em, expira_em`,
    [request.params.id, tipo, hashDoToken(token), horas],
  );
  return response.status(201).json({ link: { ...result.rows[0], token } });
}, PROJETO_NAO_ENCONTRADO));

/** Revogar: o link deixa de funcionar na hora. Colaboradores que já entraram ficam. */
app.delete('/api/projects/:id/links/:linkId', requireAuth, rota(async (request, response) => {
  await exigirDono(request.params.id, request.userId);
  const result = await query(
    'DELETE FROM projeto_links WHERE id = $1 AND projeto_id = $2',
    [request.params.linkId, request.params.id],
  );
  if (!result.rowCount) return response.status(404).json({ message: 'Link não encontrado.' });
  return response.status(204).send();
}, 'Link não encontrado.'));

/**
 * Tira um colaborador: o dono tira qualquer um, e o próprio colaborador pode
 * sair. Para os outros a resposta é 404, sem confirmar quem colabora.
 */
app.delete('/api/projects/:id/colaboradores/:userId', requireAuth, rota(async (request, response) => {
  const result = await query(
    `DELETE FROM projeto_colaboradores c
     USING projetos p
     WHERE p.id = c.projeto_id AND c.projeto_id = $1 AND c.usuario_id = $2
       AND (p.usuario_id = $3 OR c.usuario_id = $3)`,
    [request.params.id, request.params.userId, request.userId],
  );
  if (!result.rowCount) return response.status(404).json({ message: 'Colaborador não encontrado.' });
  return response.status(204).send();
}, 'Colaborador não encontrado.'));

/** Link válido (existe e não venceu), com o projeto e o dono dele. */
async function linkValido(token) {
  const result = await query(
    `SELECT l.tipo, l.expira_em, p.id AS projeto_id, p.titulo, p.usuario_id AS dono_id, u.nome AS autor_nome
     FROM projeto_links l
     JOIN projetos p ON p.id = l.projeto_id
     JOIN users u ON u.id = p.usuario_id
     WHERE l.token_hash = $1 AND l.expira_em > NOW()`,
    [hashDoToken(token)],
  );
  if (!result.rows[0]) throw new ErroHttp(404, LINK_INVALIDO);
  return result.rows[0];
}

/**
 * Abre um link. O de visualização já traz o canvas (só leitura); o de
 * colaboração traz o convite, que a pessoa aceita no POST abaixo. O e-mail do
 * dono não vai junto: quem tem o link não ganha mais do que o projeto.
 */
app.get('/api/convites/:token', requireAuth, rota(async (request, response) => {
  const link = await linkValido(request.params.token);
  const convite = {
    tipo: link.tipo,
    expira_em: link.expira_em,
    projeto: { id: link.projeto_id, titulo: link.titulo, autor_nome: link.autor_nome },
  };

  if (link.tipo === 'colaboracao') {
    const membro = await query(
      `SELECT 1 FROM projetos p WHERE p.id = $1 AND ${podeEditar(2)}`,
      [link.projeto_id, request.userId],
    );
    convite.jaPodeEditar = Boolean(membro.rows[0]);
    return response.json({ convite });
  }

  const conteudo = await query(
    'SELECT conteudo, conteudo_versao AS versao FROM projetos WHERE id = $1',
    [link.projeto_id],
  );
  Object.assign(convite.projeto, conteudo.rows[0]);
  return response.json({ convite });
}));

app.post('/api/convites/:token/aceitar', requireAuth, rota(async (request, response) => {
  const link = await linkValido(request.params.token);
  if (link.tipo !== 'colaboracao') {
    return response.status(400).json({ message: 'Este link é só de visualização.' });
  }
  if (link.dono_id === request.userId) {
    return response.status(400).json({ message: 'Você já é o dono deste projeto.' });
  }
  // Aceitar duas vezes não duplica nem falha: a pessoa só vai para o editor.
  await query(
    `INSERT INTO projeto_colaboradores (projeto_id, usuario_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [link.projeto_id, request.userId],
  );
  return response.json({ projeto: { id: link.projeto_id } });
}));

app.get('/api/projects/:id/imagens', requireAuth, rota(async (request, response) => {
  await projetoEditavel(request.params.id, request.userId);
  const result = await query(
    'SELECT id, url, public_id FROM imagens WHERE projeto_id = $1 ORDER BY id',
    [request.params.id],
  );
  return response.json({ images: result.rows });
}, PROJETO_NAO_ENCONTRADO));

app.post('/api/projects/:id/imagens', comImagem, rota(async (request, response) => {
  await projetoEditavel(request.params.id, request.userId);
  const enviada = await storage.uploadBuffer(request.file.buffer);
  const result = await query(
    'INSERT INTO imagens (projeto_id, url, public_id) VALUES ($1, $2, $3) RETURNING id, url, public_id',
    [request.params.id, enviada.url, enviada.publicId],
  );
  return response.status(201).json({ image: result.rows[0] });
}, PROJETO_NAO_ENCONTRADO));

app.delete('/api/imagens/:id', requireAuth, requireStorage, rota(async (request, response) => {
  const result = await query(
    `SELECT i.id, i.public_id FROM imagens i
     JOIN projetos p ON p.id = i.projeto_id
     WHERE i.id = $1 AND p.usuario_id = $2`,
    [request.params.id, request.userId],
  );
  const imagem = result.rows[0];
  if (!imagem) return response.status(404).json({ message: 'Imagem não encontrada.' });

  await storage.destroyImage(imagem.public_id);
  await query('DELETE FROM imagens WHERE id = $1', [imagem.id]);
  return response.status(204).send();
}, 'Imagem não encontrada.'));

app.post('/api/projects/:id/capa', comImagem, rota(async (request, response) => {
  const projeto = await projetoDoUsuario(request.params.id, request.userId);
  const capa = await substituirImagem(request.file, 'capas', projeto.capa_public_id, async (enviada) => {
    const result = await query(
      'UPDATE projetos SET capa = $1, capa_public_id = $2 WHERE id = $3 RETURNING capa',
      [enviada.url, enviada.publicId, projeto.id],
    );
    return result.rows[0].capa;
  });
  return response.json({ capa });
}, PROJETO_NAO_ENCONTRADO));

app.post('/api/users/me/foto', comImagem, rota(async (request, response) => {
  const atual = await query('SELECT foto_public_id FROM users WHERE id = $1', [request.userId]);
  if (!atual.rows[0]) return response.status(401).json({ message: SESSAO_INVALIDA });

  const foto = await substituirImagem(request.file, 'fotos', atual.rows[0].foto_public_id, async (enviada) => {
    const result = await query(
      'UPDATE users SET foto = $1, foto_public_id = $2 WHERE id = $3 RETURNING foto',
      [enviada.url, enviada.publicId, request.userId],
    );
    return result.rows[0].foto;
  });
  return response.json({ foto });
}));

app.delete('/api/users/me/foto', requireAuth, requireStorage, rota(async (request, response) => {
  const result = await query(
    `UPDATE users u SET foto = NULL, foto_public_id = NULL
     FROM (SELECT foto_public_id FROM users WHERE id = $1) anterior
     WHERE u.id = $1
     RETURNING anterior.foto_public_id`,
    [request.userId],
  );
  if (!result.rowCount) return response.status(401).json({ message: SESSAO_INVALIDA });

  await storage.destroyQuietly(result.rows[0].foto_public_id);
  return response.status(204).send();
}));

/**
 * Exclui um projeto: o dono pelo /editor (`donoId` filtra) ou um
 * administrador (`donoId` null). Devolve `{ id, titulo, usuario_id }` do que
 * saiu, ou null se não havia o que excluir.
 */
async function apagarProjeto(projectId, donoId = null) {
  // Os arquivos precisam ser coletados antes: o DELETE leva junto as linhas de `imagens`.
  const alvo = await query(
    `SELECT p.id, p.titulo, p.usuario_id, p.capa_public_id,
            ARRAY_REMOVE(ARRAY_AGG(i.public_id), NULL) AS imagens
     FROM projetos p
     LEFT JOIN imagens i ON i.projeto_id = p.id
     WHERE p.id = $1 AND ($2::uuid IS NULL OR p.usuario_id = $2::uuid)
     GROUP BY p.id`,
    [projectId, donoId],
  );
  const projeto = alvo.rows[0];
  if (!projeto) return null;

  const result = await query('DELETE FROM projetos WHERE id = $1', [projeto.id]);
  if (!result.rowCount) return null;

  // Os arrays de `users` guardam o id em texto, sem FK: o cascade não os alcança.
  await query(
    `UPDATE users
     SET likes = likes - $1::uuid::text, salvos = salvos - $1::uuid::text, reportados = reportados - $1::uuid::text
     WHERE likes ? $1::uuid::text OR salvos ? $1::uuid::text OR reportados ? $1::uuid::text`,
    [projeto.id],
  );

  // O projeto já foi excluído: uma falha aqui não deve virar erro para o usuário.
  await storage.destroyQuietly(projeto.capa_public_id, ...(projeto.imagens || []));
  return { id: projeto.id, titulo: projeto.titulo, usuario_id: projeto.usuario_id };
}

app.delete('/api/projects/:id', requireAuth, rota(async (request, response) => {
  if (!await apagarProjeto(request.params.id, request.userId)) {
    return response.status(404).json({ message: PROJETO_NAO_ENCONTRADO });
  }
  return response.status(204).send();
}, PROJETO_NAO_ENCONTRADO));

app.post('/api/auth/password-recovery', rota(async (request, response) => {
  const email = normalizarEmail(request.body.email);
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

  const { codigo, hash } = await novoCodigo();
  await query(
    "UPDATE users SET password_reset_token_hash = $1, password_reset_token_expires_at = NOW() + INTERVAL '15 minutes' WHERE id = $2",
    [hash, userResult.rows[0].id],
  );

  try {
    await sendRecoveryEmail(email, codigo);
  } catch (error) {
    if (error.code !== 'EAUTH' && error.code !== 'ECONNECTION') throw error;
    console.error('Erro ao enviar e-mail de recuperação:', error);
    return response.status(502).json({ message: 'Falha ao enviar e-mail. Verifique a configuração do servidor de SMTP.' });
  }

  return response.json({ message: 'Código de recuperação enviado por e-mail.', previewUrl: previewUrl() });
}));

/** Usuário com um código de redefinição de senha válido, ou null. */
async function redefinicaoValida(email, code) {
  const result = await query(
    `SELECT id, password_reset_token_hash FROM users
     WHERE email = $1 AND password_reset_token_hash IS NOT NULL AND password_reset_token_expires_at > NOW()`,
    [normalizarEmail(email)],
  );
  const user = result.rows[0];
  return user && await bcrypt.compare(code || '', user.password_reset_token_hash) ? user : null;
}

app.post('/api/auth/password-recovery/verify', rota(async (request, response) => {
  if (!await redefinicaoValida(request.body.email, request.body.code)) {
    return response.status(400).json({ message: 'Código inválido ou expirado.' });
  }
  return response.json({ message: 'Código validado.' });
}));

app.post('/api/auth/password-recovery/reset', rota(async (request, response) => {
  const { email, code, password } = request.body;
  if (!password || password.length < 8) {
    return response.status(400).json({ message: 'A senha deve ter pelo menos 8 caracteres.' });
  }

  const user = await redefinicaoValida(email, code);
  if (!user) return response.status(400).json({ message: 'Código inválido ou expirado.' });

  await query(
    'UPDATE users SET senha = $1, password_reset_token_hash = NULL, password_reset_token_expires_at = NULL WHERE id = $2',
    [await bcrypt.hash(password, 12), user.id],
  );
  return response.json({ message: 'Senha atualizada com sucesso.' });
}));

/*
 * Avisos à própria pessoa (ex.: uma história dela excluída por má conduta).
 * A tela inicial e o /editor mostram os não lidos.
 */
app.get('/api/avisos', requireAuth, rota(async (request, response) => {
  const result = await query(
    'SELECT id, mensagem, criado_em FROM avisos WHERE usuario_id = $1 AND lido_em IS NULL ORDER BY criado_em',
    [request.userId],
  );
  return response.json({ avisos: result.rows });
}));

app.post('/api/avisos/:id/lido', requireAuth, rota(async (request, response) => {
  const result = await query(
    'UPDATE avisos SET lido_em = COALESCE(lido_em, NOW()) WHERE id = $1 AND usuario_id = $2',
    [request.params.id, request.userId],
  );
  if (!result.rowCount) return response.status(404).json({ message: 'Aviso não encontrado.' });
  return response.status(204).send();
}, 'Aviso não encontrado.'));

/*
 * Administração (RN-15): avaliar denúncias, excluir obras e contas por má
 * conduta, restaurar contas encerradas pela moderação e gerenciar quem
 * administra. Tudo exige `requireAdmin`; quem não é recebe 403.
 */
const SO_ADMIN = 'Acesso restrito a administradores.';
const USUARIO_NAO_ENCONTRADO = 'Usuário não encontrado.';
const NENHUMA_CONTA_COM_EMAIL = 'Nenhuma conta com esse e-mail.';
const MAX_MOTIVO = 500;

async function requireAdmin(request, response, next) {
  try {
    const result = await query('SELECT email, admin FROM users WHERE id = $1', [request.userId]);
    const papel = result.rows[0] && papelAdmin(result.rows[0]);
    if (!papel?.admin) return response.status(403).json({ message: SO_ADMIN });
    request.ehDono = papel.dono;
    return next();
  } catch (error) {
    return next(error);
  }
}

const comAdmin = [requireAuth, requireAdmin];

/** Motivo opcional que o administrador escreve; vai no aviso e no e-mail. */
function motivoDe(body) {
  const motivo = String(body?.motivo || '').trim();
  if (motivo.length > MAX_MOTIVO) throw new ErroHttp(400, `Escreva o motivo em até ${MAX_MOTIVO} caracteres.`);
  return motivo || null;
}

const comMotivo = (texto, motivo) => (motivo ? `${texto} Motivo: ${motivo}` : texto);

/** E-mail de aviso que não pode atrasar nem derrubar a ação: sem SMTP, só não vai. */
function avisarPorEmail(mensagem) {
  if (!mailTransport) return;
  enviarEmail(mensagem).catch((error) => console.error('Aviso por e-mail não enviado:', error.message));
}

/** Obras e criadores denunciados, dos mais denunciados para os menos. */
app.get('/api/admin/denuncias', comAdmin, rota(async (_request, response) => {
  const projects = await query(
    `SELECT p.id, p.titulo, p.status, p.capa, p.denuncias, p.criado,
            u.id AS autor_id, u.nome AS autor_nome, u.email AS autor_email
     FROM projetos p JOIN users u ON u.id = p.usuario_id
     WHERE p.denuncias > 0
     ORDER BY p.denuncias DESC, p.criado DESC`,
  );
  const creators = await query(
    `SELECT u.id, u.nome, u.email, u.denuncias, u.admin,
            (SELECT COUNT(*)::int FROM projetos p WHERE p.usuario_id = u.id) AS projetos
     FROM users u
     WHERE u.denuncias > 0
     ORDER BY u.denuncias DESC`,
  );
  return response.json({
    projects: projects.rows,
    creators: creators.rows.map((user) => ({ ...user, ...papelAdmin(user) })),
  });
}));

/**
 * Exclui uma obra por má conduta. O autor recebe um aviso na plataforma (e
 * por e-mail, se houver SMTP) dizendo qual história saiu e por quê.
 */
app.delete('/api/admin/projetos/:id', comAdmin, rota(async (request, response) => {
  const motivo = motivoDe(request.body);
  const projeto = await apagarProjeto(request.params.id);
  if (!projeto) return response.status(404).json({ message: PROJETO_NAO_ENCONTRADO });

  const mensagem = comMotivo(
    `Sua história "${projeto.titulo}" foi excluída por um administrador por má conduta (violação dos Termos de Uso).`,
    motivo,
  );
  await query('INSERT INTO avisos (usuario_id, mensagem) VALUES ($1, $2)', [projeto.usuario_id, mensagem]);
  const autor = await query('SELECT email FROM users WHERE id = $1', [projeto.usuario_id]);
  avisarPorEmail({ to: autor.rows[0].email, subject: 'Uma história sua foi excluída — Schedio Drasis', text: mensagem });
  return response.status(204).send();
}, PROJETO_NAO_ENCONTRADO));

/** Acha uma conta pelo e-mail, para excluir ou conferir. */
app.get('/api/admin/usuarios', comAdmin, rota(async (request, response) => {
  const email = normalizarEmail(String(request.query.email || ''));
  if (!email) return response.status(400).json({ message: 'Informe o e-mail da conta.' });
  const result = await query(
    `SELECT u.id, u.nome, u.email, u.denuncias, u.admin,
            (SELECT COUNT(*)::int FROM projetos p WHERE p.usuario_id = u.id) AS projetos
     FROM users u WHERE u.email = $1`,
    [email],
  );
  const user = result.rows[0];
  if (!user) return response.status(404).json({ message: NENHUMA_CONTA_COM_EMAIL });
  return response.json({ usuario: { ...user, ...papelAdmin(user) } });
}));

/**
 * Encerra uma conta por má conduta. Segue os Termos como a autoexclusão — a
 * cópia fica em `contas_excluidas` pelo prazo —, mas guarda também o
 * necessário para restaurá-la. Ninguém exclui o dono nem a si mesmo por aqui,
 * e só o dono exclui outro administrador.
 */
app.delete('/api/admin/usuarios/:id', comAdmin, rota(async (request, response) => {
  const motivo = motivoDe(request.body);
  if (request.params.id === request.userId) {
    return response.status(400).json({ message: 'Para excluir a sua própria conta, use a página da conta.' });
  }
  const result = await query('SELECT id, email, admin FROM users WHERE id = $1', [request.params.id]);
  const alvo = result.rows[0];
  if (!alvo) return response.status(404).json({ message: USUARIO_NAO_ENCONTRADO });

  const papel = papelAdmin(alvo);
  if (papel.dono) {
    return response.status(400).json({ message: 'A conta do dono da plataforma não pode ser excluída.' });
  }
  if (papel.admin && !request.ehDono) {
    return response.status(403).json({ message: 'Só o dono da plataforma exclui a conta de outro administrador.' });
  }

  await excluirConta(alvo.id, { excluidaPor: request.userId, motivo });

  avisarPorEmail({
    to: alvo.email,
    subject: 'Sua conta foi encerrada — Schedio Drasis',
    text: comMotivo(
      `Sua conta no Schedio Drasis foi encerrada por um administrador por má conduta (violação dos Termos de Uso). Conforme os Termos, uma cópia dela fica guardada por ${TERMOS.retencaoContaExcluidaMeses} meses, e a conta pode ser restaurada nesse prazo se a avaliação concluir que o encerramento foi indevido.`,
      motivo,
    ),
  });
  return response.status(204).send();
}, USUARIO_NAO_ENCONTRADO));

/** Cópias de contas excluídas ainda no prazo, das mais recentes para as mais antigas. */
app.get('/api/admin/contas-excluidas', comAdmin, rota(async (_request, response) => {
  const result = await query(
    `SELECT c.id, c.usuario_id, c.email, c.nome, c.denuncias, c.excluida_em, c.expira_em, c.motivo,
            jsonb_array_length(c.projetos) AS projetos,
            c.restauracao IS NOT NULL AS restauravel,
            c.excluida_por, a.nome AS excluida_por_nome, a.email AS excluida_por_email
     FROM contas_excluidas c
     LEFT JOIN users a ON a.id = c.excluida_por
     WHERE c.expira_em > NOW()
     ORDER BY c.excluida_em DESC`,
  );
  return response.json({ contas: result.rows });
}));

app.post('/api/admin/contas-excluidas/:id/restaurar', comAdmin, rota(async (request, response) => {
  const resultado = await emTransacao((client) => restaurarConta(client, request.params.id));
  if (resultado.recusa) {
    return response.status(resultado.recusa.status).json({ message: resultado.recusa.message });
  }

  const { usuario } = resultado;
  await query('INSERT INTO avisos (usuario_id, mensagem) VALUES ($1, $2)', [
    usuario.id,
    'Sua conta foi restaurada por um administrador. Seus projetos voltaram como estavam; a foto de perfil precisa ser enviada de novo.',
  ]);
  avisarPorEmail({
    to: usuario.email,
    subject: 'Sua conta foi restaurada — Schedio Drasis',
    text: 'Sua conta no Schedio Drasis foi restaurada por um administrador. Você já pode entrar com o mesmo e-mail e a mesma senha.',
  });
  return response.json(resultado);
}, 'Conta excluída não encontrada ou já expirada.'));

/** Quem administra: o dono primeiro, depois na ordem em que receberam o acesso. */
app.get('/api/admin/admins', comAdmin, rota(async (_request, response) => {
  const result = await query(
    `SELECT id, nome, email, admin, admin_desde FROM users
     WHERE admin OR email = $1
     ORDER BY (email = $1) DESC NULLS LAST, admin_desde`,
    [emailDoDono()],
  );
  return response.json({ admins: result.rows.map((user) => ({ ...user, ...papelAdmin(user) })) });
}));

/** Concede o acesso pelo e-mail. Conceder de novo a quem já tem não muda nada. */
app.post('/api/admin/admins', comAdmin, rota(async (request, response) => {
  const email = normalizarEmail(String(request.body.email || ''));
  if (!email) return response.status(400).json({ message: 'Informe o e-mail da conta.' });
  const result = await query(
    `UPDATE users SET admin = true, admin_desde = COALESCE(admin_desde, NOW())
     WHERE email = $1
     RETURNING id, nome, email, admin, admin_desde`,
    [email],
  );
  const user = result.rows[0];
  if (!user) return response.status(404).json({ message: NENHUMA_CONTA_COM_EMAIL });
  return response.json({ admin: { ...user, ...papelAdmin(user) } });
}));

/** Revoga o acesso. O dono não perde: ele é administrador pela configuração. */
app.delete('/api/admin/admins/:id', comAdmin, rota(async (request, response) => {
  const result = await query('SELECT email, admin FROM users WHERE id = $1', [request.params.id]);
  const alvo = result.rows[0];
  if (alvo && papelAdmin(alvo).dono) {
    return response.status(400).json({ message: 'O dono da plataforma não perde o acesso de administrador.' });
  }
  if (!alvo?.admin) return response.status(404).json({ message: 'Administrador não encontrado.' });

  await query('UPDATE users SET admin = false, admin_desde = NULL WHERE id = $1', [request.params.id]);
  return response.status(204).send();
}, 'Administrador não encontrado.'));

app.get(/^(?!\/api\/).*/, (_request, response) => {
  response.sendFile(path.join(clientDist, 'index.html'));
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ message: 'Não foi possível concluir a operação. Tente novamente.' });
});

/**
 * Expurgo das contas excluídas vencidas: na subida e uma vez por dia. O
 * `unref` não deixa o timer segurar o processo de pé. Também roda à mão com
 * `npm run contas:expurgar`.
 */
const UM_DIA_MS = 24 * 60 * 60 * 1000;

function expurgar() {
  expurgarContasVencidas({ query, storage })
    .then(({ contas }) => contas && console.log(`Expurgo: ${contas} conta(s) excluída(s) vencida(s) apagada(s).`))
    .catch((error) => console.error('Expurgo de contas excluídas falhou:', error.message));
  // Link vencido já não abre nada (as rotas filtram por `expira_em`); aqui só
  // some da tabela.
  query('DELETE FROM projeto_links WHERE expira_em <= NOW()')
    .catch((error) => console.error('Limpeza de links vencidos falhou:', error.message));
}

expurgar();
setInterval(expurgar, UM_DIA_MS).unref();

app.listen(port, () => console.log(`Schedio Drasis em http://127.0.0.1:${port}`));

createMailTransport().catch((error) => {
  mailTransport = null;
  smtpStatus = 'error';
  console.error('Falha ao conectar ao SMTP:', error.message);
});
