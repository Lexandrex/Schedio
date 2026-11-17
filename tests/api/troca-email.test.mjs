/*
 * Troca do e-mail da conta (RF-04). Segue a invariante do cadastro: o novo
 * e-mail só vale depois de confirmado pelo código enviado a ele, e até lá a
 * conta continua entrando com o atual.
 *
 * O código vai por e-mail (stub nos testes), então, como em `criarConta`, o
 * hash é forçado no banco com um código conhecido.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import bcrypt from 'bcryptjs'

import { CODIGO, SENHA, emailDeTeste, iniciarAmbiente } from '../helpers/ambiente.mjs'

const EMAIL_DONO = emailDeTeste('dono')
const amb = await iniciarAmbiente('troca_email', { donoEmail: EMAIL_DONO })
test.after(() => amb.encerrar())

const pedir = (token, email, password = SENHA) =>
  amb.api('/api/users/me/email', { method: 'POST', token, body: { email, password } })

const confirmar = (token, code = CODIGO) =>
  amb.api('/api/users/me/email/confirmar', { method: 'POST', token, body: { code } })

async function forcarCodigoDaTroca(userId) {
  await amb.pool.query('UPDATE users SET email_novo_token_hash = $1 WHERE id = $2', [
    await bcrypt.hash(CODIGO, 10),
    userId,
  ])
}

const login = (email) => amb.api('/api/auth/login', { method: 'POST', body: { email, password: SENHA } })

test('troca em duas etapas: o novo e-mail só vale depois do código', async () => {
  const conta = await amb.criarConta(emailDeTeste('antes'))
  const novo = emailDeTeste('depois')

  const pedido = await pedir(conta.token, novo.toUpperCase())
  assert.equal(pedido.status, 200, JSON.stringify(pedido.body))
  assert.equal(pedido.body.email_novo, novo, 'normalizado para minúsculas')

  const eu = await amb.api('/api/auth/me', { token: conta.token })
  assert.equal(eu.body.user.email, conta.email, 'nada muda antes do código')
  assert.equal(eu.body.user.email_novo, novo)
  assert.equal((await login(novo)).status, 401)

  await forcarCodigoDaTroca(conta.id)
  assert.equal((await confirmar(conta.token, '000000')).status, 400, 'código errado')

  const confirmado = await confirmar(conta.token)
  assert.equal(confirmado.status, 200)
  assert.equal(confirmado.body.user.email, novo)

  assert.equal((await login(novo)).status, 200, 'entra com o novo')
  assert.equal((await login(conta.email)).status, 401, 'o antigo deixou de valer')
  const depois = await amb.api('/api/auth/me', { token: conta.token })
  assert.equal(depois.body.user.email_novo, null, 'a sessão aberta continua valendo, sem pendência')
})

test('pede a senha atual, recusa e-mail inválido, igual ao atual ou já usado', async () => {
  const conta = await amb.criarConta(emailDeTeste('recusas'))
  const outra = await amb.criarConta(emailDeTeste('ocupado'))

  const casos = [
    [emailDeTeste('x'), 'senha-errada', 401, 'Senha incorreta.'],
    ['sem-arroba', SENHA, 400, 'Informe um e-mail válido.'],
    [conta.email, SENHA, 400, 'Esse já é o e-mail da sua conta.'],
    [outra.email, SENHA, 409, 'Este e-mail já está cadastrado.'],
  ]
  for (const [email, senha, status, mensagem] of casos) {
    const resposta = await pedir(conta.token, email, senha)
    assert.equal(resposta.status, status, mensagem)
    assert.equal(resposta.body.message, mensagem)
  }

  const { rows } = await amb.pool.query('SELECT email_novo FROM users WHERE id = $1', [conta.id])
  assert.equal(rows[0].email_novo, null, 'nada ficou pendente')
})

test('código vencido não confirma, e cancelar desfaz a pendência', async () => {
  const conta = await amb.criarConta(emailDeTeste('vence'))
  await pedir(conta.token, emailDeTeste('vencido'))
  await forcarCodigoDaTroca(conta.id)
  await amb.pool.query("UPDATE users SET email_novo_expira_em = NOW() - INTERVAL '1 second' WHERE id = $1", [conta.id])

  assert.equal((await confirmar(conta.token)).status, 400)
  const eu = await amb.api('/api/auth/me', { token: conta.token })
  assert.equal(eu.body.user.email_novo, null, 'pendência vencida nem aparece')

  await pedir(conta.token, emailDeTeste('cancelado'))
  assert.equal((await amb.api('/api/users/me/email', { method: 'DELETE', token: conta.token })).status, 204)
  await forcarCodigoDaTroca(conta.id)
  assert.equal((await confirmar(conta.token)).status, 400, 'cancelada, não há o que confirmar')
})

test('se o e-mail foi cadastrado por outra pessoa no meio do caminho, 409', async () => {
  const conta = await amb.criarConta(emailDeTeste('corrida'))
  const disputado = emailDeTeste('disputado')
  await pedir(conta.token, disputado)
  await amb.criarConta(disputado)
  await forcarCodigoDaTroca(conta.id)

  const resposta = await confirmar(conta.token)
  assert.equal(resposta.status, 409)
  assert.equal(resposta.body.message, 'Este e-mail já está cadastrado.')
})

test('a conta dona da plataforma não troca o e-mail por aqui', async () => {
  const dono = await amb.criarConta(EMAIL_DONO)
  const resposta = await pedir(dono.token, emailDeTeste('novo-dono'))
  assert.equal(resposta.status, 400)
  assert.match(resposta.body.message, /ADMIN_DONO_EMAIL/)
})
