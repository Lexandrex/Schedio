/*
 * Proteção do login contra força bruta (tentativasLogin.js): cinco senhas
 * erradas seguidas bloqueiam o e-mail por cinco minutos.
 *
 * O tempo não é esperado de verdade: para "passar" os minutos, os testes
 * empurram as datas de `login_tentativas` para trás direto no banco.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { emailDeTeste, iniciarAmbiente, SENHA } from '../helpers/ambiente.mjs'

const amb = await iniciarAmbiente('tentativas')
test.after(() => amb.encerrar())

const BLOQUEADO = /^Muitas tentativas de login sem sucesso\. Tente novamente em \d+ minutos?\.$/

const entrar = (email, password) => amb.api('/api/auth/login', { method: 'POST', body: { email, password } })

/** Erra a senha `n` vezes e devolve a última resposta. */
async function errar(email, n) {
  let resposta
  for (let i = 0; i < n; i += 1) resposta = await entrar(email, 'senha-errada')
  return resposta
}

/** Faz o tempo andar `minutos` para o e-mail. */
const voltarNoTempo = (email, minutos) => amb.pool.query(
  `UPDATE login_tentativas
   SET ultima_falha_em = ultima_falha_em - make_interval(mins => $2),
       bloqueado_ate = bloqueado_ate - make_interval(mins => $2)
   WHERE email = $1`,
  [email, minutos],
)

test('quatro senhas erradas ainda respondem "Senha incorreta."', async () => {
  const conta = await amb.criarConta(emailDeTeste('quatro'))

  const resposta = await errar(conta.email, 4)

  assert.equal(resposta.status, 401)
  assert.equal(resposta.body.message, 'Senha incorreta.')
})

test('a quinta senha errada bloqueia, com 429 e Retry-After de 5 minutos', async () => {
  const conta = await amb.criarConta(emailDeTeste('quinta'))

  const resposta = await errar(conta.email, 5)

  assert.equal(resposta.status, 429)
  assert.match(resposta.body.message, BLOQUEADO)
  assert.match(resposta.body.message, /5 minutos/)
  const retry = Number(resposta.headers.get('retry-after'))
  assert.ok(retry > 290 && retry <= 300, `Retry-After = ${retry}`)
})

test('bloqueado, nem a senha certa entra', async () => {
  const conta = await amb.criarConta(emailDeTeste('certa-bloqueada'))
  await errar(conta.email, 5)

  const resposta = await entrar(conta.email, SENHA)

  assert.equal(resposta.status, 429)
  assert.equal(resposta.body.token, undefined)
})

test('o bloqueio vale para o e-mail com outra caixa e espaços', async () => {
  const conta = await amb.criarConta(emailDeTeste('caixa'))
  await errar(conta.email, 5)

  const resposta = await entrar(`  ${conta.email.toUpperCase()} `, SENHA)

  assert.equal(resposta.status, 429)
})

test('vencidos os 5 minutos, a senha certa entra e a contagem zera', async () => {
  const conta = await amb.criarConta(emailDeTeste('vence'))
  await errar(conta.email, 5)
  await voltarNoTempo(conta.email, 5)

  const login = await entrar(conta.email, SENHA)
  assert.equal(login.status, 200)
  assert.ok(login.body.token)

  // Zerou: mais quatro erros não bloqueiam.
  const depois = await errar(conta.email, 4)
  assert.equal(depois.status, 401)
})

test('vencido o bloqueio, uma senha errada não bloqueia de novo na hora', async () => {
  const conta = await amb.criarConta(emailDeTeste('recomeca'))
  await errar(conta.email, 5)
  await voltarNoTempo(conta.email, 5)

  const resposta = await entrar(conta.email, 'senha-errada')

  assert.equal(resposta.status, 401, 'a contagem recomeça em 1')
  assert.equal(resposta.body.message, 'Senha incorreta.')
})

test('acertar a senha antes do limite zera as falhas', async () => {
  const conta = await amb.criarConta(emailDeTeste('zera'))
  await errar(conta.email, 4)
  assert.equal((await entrar(conta.email, SENHA)).status, 200)

  const resposta = await errar(conta.email, 4)

  assert.equal(resposta.status, 401, 'são quatro de novo, não oito')
})

test('falhas espaçadas além da janela não se acumulam', async () => {
  const conta = await amb.criarConta(emailDeTeste('janela'))
  await errar(conta.email, 4)
  await voltarNoTempo(conta.email, 16)

  const resposta = await entrar(conta.email, 'senha-errada')

  assert.equal(resposta.status, 401)
})

test('o bloqueio de um e-mail não atinge outra conta', async () => {
  const bloqueada = await amb.criarConta(emailDeTeste('vizinha-a'))
  const outra = await amb.criarConta(emailDeTeste('vizinha-b'))
  await errar(bloqueada.email, 5)

  assert.equal((await entrar(outra.email, SENHA)).status, 200)
})

test('e-mail que não existe também é bloqueado depois de cinco tentativas', async () => {
  const email = emailDeTeste('inexistente')

  assert.equal((await errar(email, 4)).body.message, 'E-mail não cadastrado.')
  assert.equal((await entrar(email, 'senha-errada')).status, 429)
})

test('tentativas simultâneas não se perdem na contagem', async () => {
  const conta = await amb.criarConta(emailDeTeste('simultaneas'))

  await Promise.all(Array.from({ length: 5 }, () => entrar(conta.email, 'senha-errada')))

  assert.equal((await entrar(conta.email, SENHA)).status, 429)
})

test('login sem e-mail continua um 401 comum, sem gravar nada', async () => {
  const resposta = await entrar(undefined, 'qualquer')

  assert.equal(resposta.status, 401)
  const { rows } = await amb.pool.query('SELECT COUNT(*)::int AS n FROM login_tentativas WHERE email IS NULL OR email = \'\'')
  assert.equal(rows[0].n, 0)
})
