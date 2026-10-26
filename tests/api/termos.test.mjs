/*
 * Aceite dos Termos de Uso no cadastro (ver `termos.js`).
 *
 * O aceite acontece antes de o usuário existir, então ele precisa atravessar
 * `pending_registrations` e chegar a `users` na confirmação do e-mail. Os
 * testes cobrem as duas pontas: o cadastro recusa sem aceite (ou com versão
 * velha) e o usuário confirmado guarda a versão e a data aceitas.
 *
 * Os 5 segundos de leitura são regra da interface (`TermsDialog.jsx`) e não
 * aparecem aqui.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { emailDeTeste, iniciarAmbiente, CODIGO, SENHA, TERMOS_VERSAO } from '../helpers/ambiente.mjs'

const amb = await iniciarAmbiente('termos')
test.after(() => amb.encerrar())

const pendentes = async (email) => {
  const { rows } = await amb.pool.query('SELECT COUNT(*)::int AS n FROM pending_registrations WHERE email = $1', [email])
  return rows[0].n
}

test('GET /api/termos é público e traz versão e texto', async () => {
  const resposta = await amb.api('/api/termos')

  assert.equal(resposta.status, 200)
  assert.equal(resposta.body.versao, TERMOS_VERSAO)
  assert.equal(resposta.body.versao, '1.1', 'a versão com o prazo de guarda da conta excluída')
  assert.equal(resposta.body.retencaoContaExcluidaMeses, 6)
  assert.ok(resposta.body.secoes.length > 0)
  for (const secao of resposta.body.secoes) {
    assert.ok(secao.titulo && secao.paragrafos.length > 0, `seção "${secao.titulo}" tem texto`)
  }
})

test('cadastro sem aceite dos termos é recusado e nada é gravado', async () => {
  const email = emailDeTeste('sem-termos')

  const resposta = await amb.api('/api/auth/register', { method: 'POST', body: { email, password: SENHA } })

  assert.equal(resposta.status, 400)
  assert.match(resposta.body.message, /Termos de Uso/)
  assert.equal(await pendentes(email), 0)
})

test('aceite de versão desatualizada é recusado', async () => {
  const email = emailDeTeste('termos-velhos')

  const resposta = await amb.api('/api/auth/register', {
    method: 'POST',
    body: { email, password: SENHA, termsVersion: '0.9' },
  })

  assert.equal(resposta.status, 400)
  assert.match(resposta.body.message, /atualizados/)
  assert.equal(await pendentes(email), 0)
})

test('o aceite fica na pendência e passa para users na confirmação', async () => {
  const email = emailDeTeste('aceite')
  const antes = new Date()
  await amb.api('/api/auth/register', {
    method: 'POST',
    body: { email, password: SENHA, termsVersion: TERMOS_VERSAO },
  })

  const pendente = await amb.pool.query(
    'SELECT termos_versao, termos_aceitos_em FROM pending_registrations WHERE email = $1',
    [email],
  )
  assert.equal(pendente.rows[0].termos_versao, TERMOS_VERSAO)
  const aceitoEm = pendente.rows[0].termos_aceitos_em

  await amb.forcarCodigo(email)
  await amb.api('/api/auth/email-verification/verify', { method: 'POST', body: { email, code: CODIGO } })

  const { rows } = await amb.pool.query(
    'SELECT termos_versao, termos_aceitos_em, email_verified_at FROM users WHERE email = $1',
    [email],
  )
  assert.equal(rows[0].termos_versao, TERMOS_VERSAO)
  assert.equal(
    rows[0].termos_aceitos_em.getTime(),
    aceitoEm.getTime(),
    'a data é a do aceite (no cadastro), não a da confirmação do e-mail',
  )
  // Tolerância para relógio do Postgres e do Node não serem idênticos.
  assert.ok(rows[0].termos_aceitos_em.getTime() >= antes.getTime() - 5000)
})

test('/api/auth/me devolve a versão e a data aceitas', async () => {
  const conta = await amb.criarConta(emailDeTeste('me-termos'))

  const me = await amb.api('/api/auth/me', { token: conta.token })

  assert.equal(me.status, 200)
  assert.equal(me.body.user.termos_versao, TERMOS_VERSAO)
  assert.ok(!Number.isNaN(Date.parse(me.body.user.termos_aceitos_em)))
})

test('recadastrar antes de confirmar renova o aceite', async () => {
  const email = emailDeTeste('reaceite')
  await amb.api('/api/auth/register', { method: 'POST', body: { email, password: SENHA, termsVersion: TERMOS_VERSAO } })
  await amb.pool.query(
    "UPDATE pending_registrations SET termos_aceitos_em = NOW() - INTERVAL '1 day' WHERE email = $1",
    [email],
  )

  await amb.api('/api/auth/register', { method: 'POST', body: { email, password: SENHA, termsVersion: TERMOS_VERSAO } })

  const { rows } = await amb.pool.query(
    'SELECT termos_aceitos_em > NOW() - INTERVAL \'1 hour\' AS recente FROM pending_registrations WHERE email = $1',
    [email],
  )
  assert.equal(rows[0].recente, true, 'vale o aceite mais recente')
})
