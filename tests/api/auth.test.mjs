/*
 * A invariante central da autenticação (ver CLAUDE.md):
 * um registro em `users` só existe DEPOIS da confirmação do e-mail.
 *
 * Esses testes existem porque a consequência dela é contraintuitiva e fácil de
 * quebrar numa refatoração: login com e-mail não confirmado responde
 * "E-mail não cadastrado" — e está certo, o usuário de fato ainda não existe.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { emailDeTeste, iniciarAmbiente, CODIGO, SENHA } from '../helpers/ambiente.mjs'

const amb = await iniciarAmbiente('auth')
test.after(() => amb.encerrar())

const contar = async (tabela, email) => {
  const { rows } = await amb.pool.query(`SELECT COUNT(*)::int AS n FROM ${tabela} WHERE email = $1`, [email])
  return rows[0].n
}

test('o cadastro NÃO cria usuário — grava um registro pendente', async () => {
  const email = emailDeTeste('pendente')

  const resposta = await amb.api('/api/auth/register', { method: 'POST', body: { email, password: SENHA } })

  assert.equal(resposta.status, 201)
  assert.equal(await contar('users', email), 0, 'a invariante central')
  assert.equal(await contar('pending_registrations', email), 1)
})

test('o cadastro não emite token — JWT sai só no login', async () => {
  const email = emailDeTeste('sem-token')
  const resposta = await amb.api('/api/auth/register', { method: 'POST', body: { email, password: SENHA } })

  assert.equal(resposta.body.token, undefined)
})

test('login antes de confirmar responde "E-mail não cadastrado"', async () => {
  const email = emailDeTeste('nao-confirmado')
  await amb.api('/api/auth/register', { method: 'POST', body: { email, password: SENHA } })

  const login = await amb.api('/api/auth/login', { method: 'POST', body: { email, password: SENHA } })

  assert.equal(login.status, 401)
  assert.equal(login.body.message, 'E-mail não cadastrado.', 'não é "senha incorreta": o usuário não existe')
})

test('código errado não cria o usuário', async () => {
  const email = emailDeTeste('codigo-errado')
  await amb.api('/api/auth/register', { method: 'POST', body: { email, password: SENHA } })
  await amb.forcarCodigo(email)

  const resposta = await amb.api('/api/auth/email-verification/verify', {
    method: 'POST',
    body: { email, code: '000000' },
  })

  assert.equal(resposta.status, 400)
  assert.equal(await contar('users', email), 0)
  assert.equal(await contar('pending_registrations', email), 1, 'a pendência sobrevive para nova tentativa')
})

test('o código certo cria o usuário e apaga a pendência', async () => {
  const email = emailDeTeste('confirma')
  await amb.api('/api/auth/register', { method: 'POST', body: { email, password: SENHA } })
  await amb.forcarCodigo(email)

  const resposta = await amb.api('/api/auth/email-verification/verify', {
    method: 'POST',
    body: { email, code: CODIGO },
  })

  assert.equal(resposta.status, 200)
  assert.equal(await contar('users', email), 1)
  assert.equal(await contar('pending_registrations', email), 0, 'a linha pendente não fica para trás')
})

test('o usuário nasce com o e-mail já verificado', async () => {
  const conta = await amb.criarConta(emailDeTeste('verificado'))
  const { rows } = await amb.pool.query('SELECT email_verified_at FROM users WHERE id = $1', [conta.id])

  // É por isso que o índice users_email_verification_pending_idx vive vazio.
  assert.ok(rows[0].email_verified_at, 'todo usuário existente já confirmou')
})

test('confirmado, o login devolve token e a sessão se restaura', async () => {
  const conta = await amb.criarConta(emailDeTeste('login'))

  assert.ok(conta.token, 'token emitido no login')
  const me = await amb.api('/api/auth/me', { token: conta.token })
  assert.equal(me.status, 200)
  assert.equal(me.body.user.email, conta.email)
})

test('senha errada é recusada sem revelar que o e-mail existe como inválido', async () => {
  const conta = await amb.criarConta(emailDeTeste('senha-errada'))

  const login = await amb.api('/api/auth/login', {
    method: 'POST',
    body: { email: conta.email, password: 'outra-senha-qualquer' },
  })

  assert.equal(login.status, 401)
  assert.equal(login.body.message, 'Senha incorreta.')
})

test('e-mail já cadastrado é recusado com 409', async () => {
  const conta = await amb.criarConta(emailDeTeste('duplicado'))

  const resposta = await amb.api('/api/auth/register', {
    method: 'POST',
    body: { email: conta.email, password: SENHA },
  })

  assert.equal(resposta.status, 409)
})

test('senha curta é recusada e nada é gravado', async () => {
  const email = emailDeTeste('senha-curta')

  const resposta = await amb.api('/api/auth/register', { method: 'POST', body: { email, password: '1234' } })

  assert.equal(resposta.status, 400)
  assert.equal(await contar('pending_registrations', email), 0)
})

test('o e-mail é normalizado — caixa e espaços não criam conta diferente', async () => {
  const email = emailDeTeste('normaliza')
  await amb.api('/api/auth/register', { method: 'POST', body: { email: `  ${email.toUpperCase()} `, password: SENHA } })
  await amb.forcarCodigo(email)
  await amb.api('/api/auth/email-verification/verify', { method: 'POST', body: { email, code: CODIGO } })

  const login = await amb.api('/api/auth/login', { method: 'POST', body: { email, password: SENHA } })
  assert.equal(login.status, 200, 'entra com a forma minúscula do que foi digitado em maiúsculas')
})

test('rota protegida exige Bearer válido', async () => {
  for (const cabecalho of [undefined, 'lixo', 'Bearer', 'Bearer token-invalido']) {
    const resposta = await fetch(`${amb.base}/api/projects`, {
      headers: cabecalho ? { Authorization: cabecalho } : {},
    })
    assert.equal(resposta.status, 401, `recusa "${cabecalho}"`)
  }
})
