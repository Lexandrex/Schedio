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
const { arquivarConta, expurgarContasVencidas } = require('./contasExcluidas');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return response.status(413).json({ message: 'A imagem deve ter no máximo 5 MB.' });
    }
    if (error.message === 'TIPO_INVALIDO') {
      return response.status(415).json({ message: 'Envie um arquivo de imagem.' });
    }
    return next(error);
  });
}

/** Só o dono mexe nas imagens do projeto. */
async function projetoDoUsuario(projetoId, userId) {
  const result = await query(
    'SELECT id, capa, capa_public_id FROM projetos WHERE id = $1 AND usuario_id = $2',
    [projetoId, userId],
  );
  return result.rows[0] || null;
}

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

async function issuePendingRegistration(email, senhaHash, termosVersao) {
  const code = generateEmailCode();
  const codeHash = await bcrypt.hash(code, 10);
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
    [email, senhaHash, codeHash, termosVersao],
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
      storage: storage.storageStatus(),
    });
  } catch (error) { next(error); }
});

/** Texto vigente dos Termos de Uso; público porque é lido antes do cadastro. */
app.get('/api/termos', (_request, response) => {
  response.json(TERMOS);
});

app.post('/api/auth/register', async (request, response, next) => {
  try {
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

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows[0]) {
      return response.status(409).json({ message: 'Este e-mail já está cadastrado.' });
    }

    const senhaHash = await bcrypt.hash(password, 12);
    await issuePendingRegistration(normalizedEmail, senhaHash, TERMOS.versao);

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
    const result = await query(
      'SELECT id, email, nome, bio, foto, cor, termos_versao, termos_aceitos_em FROM users WHERE id = $1',
      [request.userId],
    );
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
      'UPDATE users SET nome = $1, bio = $2, cor = $3 WHERE id = $4 RETURNING id, email, nome, bio, foto, cor',
      [nome, bio, cor, request.userId],
    );
    return response.json({ user: result.rows[0] });
  } catch (error) { return next(error); }
});

app.delete('/api/users/me', requireAuth, async (request, response, next) => {
  try {
    const result = await query('SELECT senha, foto_public_id FROM users WHERE id = $1', [request.userId]);
    const user = result.rows[0];
    if (!user) return response.status(401).json({ message: 'Sessão inválida ou expirada.' });

    const validPassword = await bcrypt.compare(request.body.password || '', user.senha);
    if (!validPassword) {
      return response.status(401).json({ message: 'Senha incorreta.' });
    }

    // Tudo numa transação: a cópia para `contas_excluidas` (prazo dos Termos)
    // e a exclusão acontecem juntas ou nenhuma. Ver contasExcluidas.js.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await arquivarConta(client, request.userId);

      // Os likes da conta saem junto com ela. Os projetos do próprio usuário
      // ficam de fora porque o cascade já os apaga. As denúncias, não: o
      // contador só cresce e serve à avaliação (RN-15).
      await client.query(
        `UPDATE projetos SET likes = GREATEST(likes - 1, 0)
         WHERE usuario_id <> $1
           AND id::text IN (SELECT jsonb_array_elements_text(likes) FROM users WHERE id = $1)`,
        [request.userId],
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
        [request.userId],
      );

      await client.query('DELETE FROM users WHERE id = $1', [request.userId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // Best-effort, como na exclusão de projeto: a conta já se foi.
    if (storage.isConfigured && user.foto_public_id) {
      await storage.destroyImage(user.foto_public_id).catch(() => {});
    }
    return response.status(204).send();
  } catch (error) { return next(error); }
});

/**
 * Perfil público de um criador: dados de apresentação e as obras dele.
 *
 * Quem visita vê só as obras publicadas. O próprio dono vê todas, com o
 * status, porque para ele a lista também é um atalho para as que estão em
 * andamento.
 */
app.get('/api/users/:id/perfil', requireAuth, async (request, response, next) => {
  try {
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
    if (!user) return response.status(404).json({ message: 'Perfil não encontrado.' });

    const isOwner = user.id === request.userId;
    const projectsResult = await query(
      `SELECT id, titulo, descricao, categoria, capa, status, likes, criado
       FROM projetos
       WHERE usuario_id = $1 AND ($2 OR status = 'publicado')
       ORDER BY criado DESC`,
      [user.id, isOwner],
    );
    return response.json({ user, isOwner, projects: projectsResult.rows });
  } catch (error) {
    if (error.code === '22P02') return response.status(404).json({ message: 'Perfil não encontrado.' });
    return next(error);
  }
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
      `SELECT senha, verification_token_hash, termos_versao, termos_aceitos_em
       FROM pending_registrations
       WHERE email = $1 AND verification_token_expires_at > NOW() LIMIT 1`,
      [email],
    );
    const pending = result.rows[0];
    if (!pending || !await bcrypt.compare(code || '', pending.verification_token_hash)) {
      return response.status(400).json({ message: 'Código inválido ou expirado.' });
    }

    await query(
      `INSERT INTO users (email, senha, email_verified_at, termos_versao, termos_aceitos_em)
       VALUES ($1, $2, NOW(), $3, $4)`,
      [email, pending.senha, pending.termos_versao, pending.termos_aceitos_em],
    );
    await query('DELETE FROM pending_registrations WHERE email = $1', [email]);

    return response.json({ message: 'E-mail confirmado. Agora você já pode entrar.' });
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ message: 'Este e-mail já está cadastrado.' });
    return next(error);
  }
});

app.get('/api/projects', requireAuth, async (request, response, next) => {
  try {
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

/**
 * Campos que o dono informa sobre o projeto, validados igual na criação e na
 * edição. Devolve `{ erro }` com a mensagem pronta quando algo não passa.
 */
function dadosDoProjeto(body) {
  const titulo = (body.titulo || '').trim();
  const descricao = (body.descricao || '').trim();
  // O usuário digita várias tags num campo só; gravamos a forma canônica,
  // com as repetidas já descartadas (ver tags.js).
  const categoria = formatTags(parseTags(body.categoria));

  if (!titulo || titulo.length > 160) {
    return { erro: 'Informe um título de até 160 caracteres.' };
  }
  if (categoria.length > MAX_TAGS_LENGTH) {
    return {
      erro: `As tags devem somar até ${MAX_TAGS_LENGTH} caracteres. Use menos tags ou tags mais curtas.`,
    };
  }

  return { titulo, descricao, categoria };
}

app.post('/api/projects', requireAuth, async (request, response, next) => {
  try {
    const dados = dadosDoProjeto(request.body);
    if (dados.erro) return response.status(400).json({ message: dados.erro });
    const { titulo, descricao, categoria } = dados;

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

/**
 * Edição dos dados do projeto (título, descrição e tags).
 *
 * Só vale com o projeto privado: publicado, ele já está na tela inicial e na
 * leitura de outras pessoas, então mudar os dados por baixo mudaria o que elas
 * estão vendo. Para editar, o dono torna privado primeiro.
 */
app.patch('/api/projects/:id', requireAuth, async (request, response, next) => {
  try {
    // O status vem antes da validação dos campos: com o projeto publicado a
    // resposta precisa ser sempre a mesma, e não depender do que foi digitado.
    const atual = await query(
      'SELECT status FROM projetos WHERE id = $1 AND usuario_id = $2',
      [request.params.id, request.userId],
    );
    if (!atual.rows[0]) {
      return response.status(404).json({ message: 'Projeto não encontrado.' });
    }
    if (atual.rows[0].status === 'publicado') {
      return response.status(409).json({
        message: 'Torne o projeto privado para editar os dados dele.',
      });
    }

    const dados = dadosDoProjeto(request.body);
    if (dados.erro) return response.status(400).json({ message: dados.erro });
    const { titulo, descricao, categoria } = dados;

    const result = await query(
      `UPDATE projetos SET titulo = $1, descricao = $2, categoria = $3
       WHERE id = $4 AND usuario_id = $5
       RETURNING id, titulo, descricao, categoria, capa, status, likes, criado`,
      [titulo, descricao || null, categoria || null, request.params.id, request.userId],
    );
    return response.json({ project: result.rows[0] });
  } catch (error) {
    if (error.code === '22P02') return response.status(404).json({ message: 'Projeto não encontrado.' });
    return next(error);
  }
});

/**
 * Leitura pública de um projeto publicado (RN-07). Diferente de
 * `GET /api/projects/:id`, que é exclusivo do dono para edição: aqui qualquer
 * usuário autenticado lê, mas só se o projeto estiver publicado.
 */
app.get('/api/projects/:id/leitura', requireAuth, async (request, response, next) => {
  try {
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
       WHERE p.id = $1 AND p.status = 'publicado'`,
      [request.params.id, request.userId],
    );
    if (!result.rows[0]) {
      return response.status(404).json({ message: 'Projeto não encontrado ou não publicado.' });
    }
    return response.json({ project: result.rows[0] });
  } catch (error) {
    if (error.code === '22P02') return response.status(404).json({ message: 'Projeto não encontrado ou não publicado.' });
    return next(error);
  }
});

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

async function alterarMarca(tipo, request, response, marcar) {
  const { lista, contador } = MARCAS[tipo];
  const projectId = request.params.id;

  const projeto = await query('SELECT usuario_id, status FROM projetos WHERE id = $1', [projectId]);
  const alvo = projeto.rows[0];
  if (!alvo || (marcar && alvo.status !== 'publicado')) {
    response.status(404).json({ message: 'Projeto não encontrado ou não publicado.' });
    return null;
  }
  if (tipo === 'denuncia' && alvo.usuario_id === request.userId) {
    response.status(400).json({ message: 'Você não pode denunciar o próprio projeto.' });
    return null;
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
    [projectId, request.userId],
  );
  return result.rows[0] || { total: 0 };
}

/** Rota de marca: trata o UUID inválido como 404, igual às demais rotas de projeto. */
function rotaDeMarca(tipo, marcar, responder) {
  return async (request, response, next) => {
    try {
      const resultado = await alterarMarca(tipo, request, response, marcar);
      if (resultado) response.json(responder(resultado));
    } catch (error) {
      if (error.code === '22P02') return response.status(404).json({ message: 'Projeto não encontrado ou não publicado.' });
      return next(error);
    }
  };
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

app.post('/api/users/:id/denuncia', requireAuth, async (request, response, next) => {
  try {
    if (request.params.id === request.userId) {
      return response.status(400).json({ message: 'Você não pode denunciar a si mesmo.' });
    }

    let result;
    try {
      result = await denunciarCriador(request.userId, request.params.id);
    } catch (error) {
      if (error.code !== '40P01') throw error;
      result = await denunciarCriador(request.userId, request.params.id);
    }

    if (!result.rowCount) return response.status(404).json({ message: 'Perfil não encontrado.' });
    // Como na denúncia de projeto, o total não volta para quem denuncia.
    return response.json({ denunciado: true });
  } catch (error) {
    if (error.code === '22P02') return response.status(404).json({ message: 'Perfil não encontrado.' });
    return next(error);
  }
});

/**
 * O que o usuário denunciou, do mais recente para o mais antigo (a ordem dos
 * arrays): projetos e criadores. Os projetos que voltaram a ser privados
 * continuam na lista, com o status, mas a interface não os abre — a leitura
 * não alcança projeto privado. Criadores que excluíram a conta somem: a
 * exclusão os tira dos arrays.
 */
app.get('/api/users/me/denuncias', requireAuth, async (request, response, next) => {
  try {
    const creators = await query(
      `SELECT u.id, u.nome, u.email, u.foto
       FROM users eu
       CROSS JOIN LATERAL jsonb_array_elements_text(eu.criadores_reportados) WITH ORDINALITY AS r(criador_id, ordem)
       JOIN users u ON u.id::text = r.criador_id
       WHERE eu.id = $1
       ORDER BY r.ordem DESC`,
      [request.userId],
    );
    const result = await query(
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
    return response.json({ projects: result.rows, creators: creators.rows });
  } catch (error) { return next(error); }
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

app.get('/api/projects/:id/imagens', requireAuth, async (request, response, next) => {
  try {
    const projeto = await projetoDoUsuario(request.params.id, request.userId);
    if (!projeto) return response.status(404).json({ message: 'Projeto não encontrado.' });

    const result = await query(
      'SELECT id, url, public_id FROM imagens WHERE projeto_id = $1 ORDER BY id',
      [request.params.id],
    );
    return response.json({ images: result.rows });
  } catch (error) {
    if (error.code === '22P02') return response.status(404).json({ message: 'Projeto não encontrado.' });
    return next(error);
  }
});

app.post(
  '/api/projects/:id/imagens',
  requireAuth,
  requireStorage,
  receberImagem,
  async (request, response, next) => {
    try {
      if (!request.file) return response.status(400).json({ message: 'Nenhuma imagem enviada.' });

      const projeto = await projetoDoUsuario(request.params.id, request.userId);
      if (!projeto) return response.status(404).json({ message: 'Projeto não encontrado.' });

      const enviada = await storage.uploadBuffer(request.file.buffer);
      const result = await query(
        'INSERT INTO imagens (projeto_id, url, public_id) VALUES ($1, $2, $3) RETURNING id, url, public_id',
        [request.params.id, enviada.url, enviada.publicId],
      );
      return response.status(201).json({ image: result.rows[0] });
    } catch (error) {
      if (error.code === '22P02') return response.status(404).json({ message: 'Projeto não encontrado.' });
      return next(error);
    }
  },
);

app.delete('/api/imagens/:id', requireAuth, requireStorage, async (request, response, next) => {
  try {
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
  } catch (error) {
    if (error.code === '22P02') return response.status(404).json({ message: 'Imagem não encontrada.' });
    return next(error);
  }
});

app.post(
  '/api/projects/:id/capa',
  requireAuth,
  requireStorage,
  receberImagem,
  async (request, response, next) => {
    try {
      if (!request.file) return response.status(400).json({ message: 'Nenhuma imagem enviada.' });

      const projeto = await projetoDoUsuario(request.params.id, request.userId);
      if (!projeto) return response.status(404).json({ message: 'Projeto não encontrado.' });

      const capaAnterior = projeto.capa_public_id;

      const enviada = await storage.uploadBuffer(request.file.buffer, {
        folder: `${storage.FOLDER}/capas`,
      });
      const result = await query(
        'UPDATE projetos SET capa = $1, capa_public_id = $2 WHERE id = $3 RETURNING capa',
        [enviada.url, enviada.publicId, request.params.id],
      );

      // A capa substituída viraria lixo no Cloudinary; removida depois do update dar certo.
      if (capaAnterior) {
        await storage.destroyImage(capaAnterior).catch(() => {})
      }

      return response.json({ capa: result.rows[0].capa });
    } catch (error) {
      if (error.code === '22P02') return response.status(404).json({ message: 'Projeto não encontrado.' });
      return next(error);
    }
  },
);

app.post(
  '/api/users/me/foto',
  requireAuth,
  requireStorage,
  receberImagem,
  async (request, response, next) => {
    try {
      if (!request.file) return response.status(400).json({ message: 'Nenhuma imagem enviada.' });

      const atual = await query('SELECT foto_public_id FROM users WHERE id = $1', [request.userId]);
      if (!atual.rows[0]) return response.status(401).json({ message: 'Sessão inválida ou expirada.' });
      const fotoAnterior = atual.rows[0].foto_public_id;

      const enviada = await storage.uploadBuffer(request.file.buffer, {
        folder: `${storage.FOLDER}/fotos`,
      });
      const result = await query(
        'UPDATE users SET foto = $1, foto_public_id = $2 WHERE id = $3 RETURNING foto',
        [enviada.url, enviada.publicId, request.userId],
      );

      // Igual à capa: a foto substituída só sai depois do update dar certo.
      if (fotoAnterior) {
        await storage.destroyImage(fotoAnterior).catch(() => {});
      }

      return response.json({ foto: result.rows[0].foto });
    } catch (error) { return next(error); }
  },
);

app.delete('/api/users/me/foto', requireAuth, requireStorage, async (request, response, next) => {
  try {
    const result = await query(
      `UPDATE users u SET foto = NULL, foto_public_id = NULL
       FROM (SELECT foto_public_id FROM users WHERE id = $1) anterior
       WHERE u.id = $1
       RETURNING anterior.foto_public_id`,
      [request.userId],
    );
    if (!result.rowCount) return response.status(401).json({ message: 'Sessão inválida ou expirada.' });

    const fotoAnterior = result.rows[0].foto_public_id;
    if (fotoAnterior) {
      await storage.destroyImage(fotoAnterior).catch(() => {});
    }
    return response.status(204).send();
  } catch (error) { return next(error); }
});

app.delete('/api/projects/:id', requireAuth, async (request, response, next) => {
  try {
    // Os arquivos precisam ser coletados antes: o DELETE leva junto as linhas de `imagens`.
    const aRemover = await query(
      `SELECT p.capa_public_id, ARRAY_REMOVE(ARRAY_AGG(i.public_id), NULL) AS imagens
       FROM projetos p
       LEFT JOIN imagens i ON i.projeto_id = p.id
       WHERE p.id = $1 AND p.usuario_id = $2
       GROUP BY p.capa_public_id`,
      [request.params.id, request.userId],
    );

    const result = await query(
      'DELETE FROM projetos WHERE id = $1 AND usuario_id = $2',
      [request.params.id, request.userId],
    );
    if (!result.rowCount) {
      return response.status(404).json({ message: 'Projeto não encontrado.' });
    }

    // Os arrays de `users` guardam o id em texto, sem FK: o cascade não os alcança.
    await query(
      `UPDATE users
       SET likes = likes - $1::uuid::text, salvos = salvos - $1::uuid::text, reportados = reportados - $1::uuid::text
       WHERE likes ? $1::uuid::text OR salvos ? $1::uuid::text OR reportados ? $1::uuid::text`,
      [request.params.id],
    );

    // Best-effort: o projeto já foi excluído, uma falha aqui não deve virar erro para o usuário.
    if (storage.isConfigured && aRemover.rows[0]) {
      const { capa_public_id: capa, imagens } = aRemover.rows[0];
      const ids = [...(imagens || []), ...(capa ? [capa] : [])];
      await Promise.all(ids.map((publicId) => storage.destroyImage(publicId).catch(() => {})));
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
}

expurgar();
setInterval(expurgar, UM_DIA_MS).unref();

app.listen(port, () => console.log(`Schedio Drasis em http://127.0.0.1:${port}`));

createMailTransport().catch((error) => {
  mailTransport = null;
  smtpStatus = 'error';
  smtpError = error.message;
  console.error('Falha ao conectar ao SMTP:', error.message);
});
