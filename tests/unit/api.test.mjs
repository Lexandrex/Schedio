import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'

/*
 * `api.js` usa `localStorage` e `fetch` do navegador. Os dois são simulados
 * aqui: o armazenamento é um Map, e o fetch só grava a chamada e devolve a
 * resposta preparada pelo teste — nenhuma requisição sai da máquina.
 */
const guardado = new Map()
globalThis.localStorage = {
  getItem: (chave) => (guardado.has(chave) ? guardado.get(chave) : null),
  setItem: (chave, valor) => guardado.set(chave, String(valor)),
  removeItem: (chave) => guardado.delete(chave),
}

let chamadas = []
let proximaResposta = null
globalThis.fetch = async (url, opcoes) => {
  chamadas.push({ url, opcoes })
  return proximaResposta
}

function responder(status, corpo, { statusText = '', json = true } = {}) {
  proximaResposta = new Response(json ? JSON.stringify(corpo) : corpo, {
    status,
    statusText,
    headers: json ? { 'Content-Type': 'application/json; charset=utf-8' } : {},
  })
}

const { apiRequest, authRequest, clearToken, getToken, setToken, uploadImage } = await import(
  '../../client/src/api.js'
)

beforeEach(() => {
  guardado.clear()
  chamadas = []
  responder(200, { ok: true })
})

test('o token fica no armazenamento do navegador até sair', () => {
  assert.equal(getToken(), null)
  setToken('abc')
  assert.equal(getToken(), 'abc')
  clearToken()
  assert.equal(getToken(), null)
})

test('sem token, a chamada vai sem Authorization', async () => {
  const dados = await apiRequest('/api/projects')

  assert.deepEqual(dados, { ok: true })
  assert.equal(chamadas[0].url, '/api/projects')
  assert.equal(chamadas[0].opcoes.headers.Authorization, undefined)
})

test('com token, toda chamada leva o Bearer', async () => {
  setToken('token-de-teste')

  await apiRequest('/api/auth/me')

  assert.equal(chamadas[0].opcoes.headers.Authorization, 'Bearer token-de-teste')
})

test('`json` vira o corpo com o Content-Type certo, sem perder outros cabeçalhos', async () => {
  await apiRequest('/api/projects', { method: 'POST', json: { titulo: 'Novo' }, headers: { 'X-Teste': '1' } })

  const { opcoes } = chamadas[0]
  assert.equal(opcoes.method, 'POST')
  assert.equal(opcoes.body, '{"titulo":"Novo"}')
  assert.equal(opcoes.headers['Content-Type'], 'application/json')
  assert.equal(opcoes.headers['X-Teste'], '1')
})

test('erro da API vira exceção com a mensagem do servidor', async () => {
  responder(400, { message: 'E-mail ou senha inválidos.' })

  await assert.rejects(apiRequest('/api/auth/login'), { message: 'E-mail ou senha inválidos.' })
})

test('erro sem mensagem usa o statusText e, sem ele, uma frase padrão', async () => {
  responder(503, 'fora do ar', { statusText: 'Service Unavailable', json: false })
  await assert.rejects(apiRequest('/api/x'), { message: 'Service Unavailable' })

  responder(500, {})
  await assert.rejects(apiRequest('/api/x'), { message: 'Não foi possível concluir a operação.' })
})

test('resposta que não é JSON devolve null', async () => {
  responder(204, null, { json: false })

  assert.equal(await apiRequest('/api/projects/1', { method: 'DELETE' }), null)
})

test('authRequest faz POST em /api/auth/<rota> com o corpo em JSON', async () => {
  await authRequest('login', { email: 'ana@example.com', password: 'segredo123' })

  assert.equal(chamadas[0].url, '/api/auth/login')
  assert.equal(chamadas[0].opcoes.method, 'POST')
  assert.deepEqual(JSON.parse(chamadas[0].opcoes.body), { email: 'ana@example.com', password: 'segredo123' })
})

test('uploadImage manda o arquivo no campo `imagem`, sem Content-Type manual', async () => {
  const arquivo = new Blob(['png'], { type: 'image/png' })

  await uploadImage('/api/users/me/foto', arquivo)

  const { url, opcoes } = chamadas[0]
  assert.equal(url, '/api/users/me/foto')
  assert.equal(opcoes.method, 'POST')
  assert.ok(opcoes.body instanceof FormData)
  assert.ok(opcoes.body.get('imagem'), 'o arquivo vai no campo que o multer espera')
  assert.equal(opcoes.headers['Content-Type'], undefined, 'o boundary fica por conta do navegador')
})
