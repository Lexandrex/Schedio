/*
 * Ambiente dos testes de API: um banco descartável e um servidor próprio.
 *
 * Nada aqui toca o banco de desenvolvimento. O banco de teste é criado do zero
 * a cada execução pelo runner de migrations de verdade (`scripts/migrate.js`),
 * o que faz cada rodada provar também que `db/migrations/` gera um schema que o
 * app consegue usar.
 *
 * Três detalhes que fazem o isolamento funcionar:
 *
 * 1. `dotenv` NÃO sobrescreve variável já presente no ambiente. Por isso basta
 *    passar `DB_NAME` ao filho: o `.env` do projeto não a desfaz.
 * 2. O Cloudinary é apagado com string vazia, não com `delete` — a chave
 *    precisa continuar existindo em `process.env`, senão o `dotenv` do filho a
 *    repovoa a partir do `.env` e as rotas de imagem deixariam de dar 503.
 * 3. O SMTP recebe credenciais de fachada e o `nodemailer` é trocado pelo stub
 *    no preload; sem isso o cadastro responderia 503.
 */
import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import pg from 'pg'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
dotenv.config({ path: path.join(RAIZ, '.env') })

const PREFIXO_BANCO = process.env.TEST_DB_NAME || 'schedio_teste'
const STUB_EMAIL = path.join(RAIZ, 'tests', 'helpers', 'stub-email.cjs')

/** O código de verificação é forçado no banco — o e-mail de verdade não é lido. */
export const CODIGO = '111111'
export const SENHA = 'Senha#Teste1'

function conexao(database) {
  if (process.env.DB_PASSWORD) {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      database,
    }
  }
  const url = new URL(process.env.DATABASE_URL)
  url.pathname = `/${database}`
  return { connectionString: url.toString() }
}

function urlDoBanco(database) {
  if (!process.env.DATABASE_URL) return undefined
  const url = new URL(process.env.DATABASE_URL)
  url.pathname = `/${database}`
  return url.toString()
}

function portaLivre() {
  return new Promise((resolve, reject) => {
    const sonda = net.createServer()
    sonda.unref()
    sonda.on('error', reject)
    sonda.listen(0, '127.0.0.1', () => {
      const { port } = sonda.address()
      sonda.close(() => resolve(port))
    })
  })
}

async function recriarBanco(banco) {
  const admin = new pg.Client(conexao('postgres'))
  await admin.connect()
  try {
    // FORCE derruba conexões penduradas de uma execução interrompida.
    await admin.query(`DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`)
    await admin.query(`CREATE DATABASE ${banco}`)
  } finally {
    await admin.end()
  }
}

async function apagarBanco(banco) {
  const admin = new pg.Client(conexao('postgres'))
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`)
  } finally {
    await admin.end()
  }
}

function ambienteDoFilho(banco, porta) {
  return {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(porta),
    DB_NAME: banco,
    DATABASE_URL: urlDoBanco(banco),
    JWT_SECRET: process.env.JWT_SECRET || 'segredo-de-teste',
    JWT_EXPIRES_IN: '1h',
    SMTP_HOST: 'smtp.invalido.teste',
    SMTP_USER: 'teste',
    SMTP_PASS: 'teste',
    // Vazio (e não removido) para o dotenv do filho não repovoar pelo .env.
    CLOUDINARY_CLOUD_NAME: '',
    CLOUDINARY_API_KEY: '',
    CLOUDINARY_API_SECRET: '',
  }
}

async function esperarServidor(base, processo, log) {
  for (let tentativa = 0; tentativa < 100; tentativa += 1) {
    if (processo.exitCode !== null) {
      throw new Error(`o servidor de teste morreu ao subir:\n${log.join('')}`)
    }
    try {
      const resposta = await fetch(`${base}/api/health`)
      if (resposta.ok) return await resposta.json()
    } catch {
      /* ainda subindo */
    }
    await new Promise((pronto) => setTimeout(pronto, 100))
  }
  throw new Error(`o servidor de teste não respondeu em 10s:\n${log.join('')}`)
}

/**
 * Sobe banco + servidor e devolve os utilitários de requisição.
 * Chame `encerrar()` no fim (via `test.after`).
 *
 * `sufixo` dá a cada arquivo de teste o seu próprio banco: o `node --test`
 * roda os arquivos em paralelo, e sem isso um apagaria o banco do outro no
 * meio da execução.
 */
export async function iniciarAmbiente(sufixo = '') {
  const banco = sufixo ? `${PREFIXO_BANCO}_${sufixo}` : PREFIXO_BANCO
  await recriarBanco(banco)

  const migracao = spawnSync(process.execPath, [path.join('scripts', 'migrate.js')], {
    cwd: RAIZ,
    env: ambienteDoFilho(banco, 0),
    encoding: 'utf8',
  })
  if (migracao.status !== 0) {
    await apagarBanco(banco)
    throw new Error(`migrations falharam no banco de teste:\n${migracao.stdout}${migracao.stderr}`)
  }

  const porta = await portaLivre()
  const base = `http://127.0.0.1:${porta}`
  const log = []

  const processo = spawn(process.execPath, ['--require', STUB_EMAIL, 'server.js'], {
    cwd: RAIZ,
    env: ambienteDoFilho(banco, porta),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  processo.stdout.on('data', (parte) => log.push(String(parte)))
  processo.stderr.on('data', (parte) => log.push(String(parte)))

  let saude
  try {
    saude = await esperarServidor(base, processo, log)
  } catch (erro) {
    processo.kill()
    await apagarBanco(banco)
    throw erro
  }

  const pool = new pg.Pool(conexao(banco))

  /** Requisição ao servidor de teste; devolve status e corpo já lido. */
  async function api(caminho, { method = 'GET', body, token } = {}) {
    const resposta = await fetch(`${base}${caminho}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const texto = await resposta.text()
    let corpo = null
    try {
      corpo = texto ? JSON.parse(texto) : null
    } catch {
      corpo = texto // 404 do Express vem em HTML — ver CLAUDE.md
    }
    return { status: resposta.status, body: corpo }
  }

  /** Troca o hash do código pendente por um que conhecemos. */
  async function forcarCodigo(email, codigo = CODIGO) {
    const hash = await bcrypt.hash(codigo, 10)
    await pool.query(
      'UPDATE pending_registrations SET verification_token_hash = $1 WHERE email = $2',
      [hash, email],
    )
  }

  /**
   * Conta pronta para usar: cadastra, força um código conhecido na linha
   * pendente, confirma e faz login. É a técnica documentada no CLAUDE.md —
   * o código real sai por e-mail e não volta na resposta.
   */
  async function criarConta(email, senha = SENHA) {
    const registro = await api('/api/auth/register', { method: 'POST', body: { email, password: senha } })
    if (registro.status !== 201 && registro.status !== 200) {
      throw new Error(`cadastro de ${email} falhou: ${registro.status} ${JSON.stringify(registro.body)}`)
    }
    await forcarCodigo(email)
    const confirmacao = await api('/api/auth/email-verification/verify', {
      method: 'POST',
      body: { email, code: CODIGO },
    })
    if (confirmacao.status !== 200 && confirmacao.status !== 201) {
      throw new Error(`confirmação de ${email} falhou: ${confirmacao.status} ${JSON.stringify(confirmacao.body)}`)
    }
    const login = await api('/api/auth/login', { method: 'POST', body: { email, password: senha } })
    if (login.status !== 200) {
      throw new Error(`login de ${email} falhou: ${login.status} ${JSON.stringify(login.body)}`)
    }
    return { email, senha, token: login.body.token, id: login.body.user?.id }
  }

  async function encerrar() {
    await pool.end()
    processo.kill()
    await new Promise((pronto) => processo.once("exit", pronto))
    await apagarBanco(banco)
  }

  return { api, criarConta, forcarCodigo, pool, base, saude, log, encerrar }
}

/** E-mail único por teste, sempre em @example.com (descartável por convenção). */
let contador = 0
export function emailDeTeste(rotulo = 'teste') {
  contador += 1
  return `${rotulo}-${Date.now()}-${contador}@example.com`
}
