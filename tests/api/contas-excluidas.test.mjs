/*
 * Guarda da conta excluída (Termos de Uso, seções 5 e 13).
 *
 * Cobre: a cópia do estado da conta e dos projetos em `contas_excluidas` com
 * o vencimento do prazo dos Termos, a conta sumindo da Plataforma na hora, a
 * limpeza das marcas de outras pessoas que apontavam para ela, e o expurgo
 * das cópias vencidas (com os arquivos do Cloudinary).
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { emailDeTeste, iniciarAmbiente, SENHA, TERMOS_VERSAO } from '../helpers/ambiente.mjs'
import contasExcluidas from '../../contasExcluidas.js'
import termos from '../../termos.js'

const amb = await iniciarAmbiente('contas_excluidas')
test.after(() => amb.encerrar())

const { expurgarContasVencidas } = contasExcluidas
const leitor = await amb.criarConta(emailDeTeste('leitor'))

const UMA_TELA = {
  version: 2,
  elements: [{ id: 't1', type: 'screen', x: 0, y: 0, width: 300, height: 600, name: 'Início' }],
  connections: [],
  startScreen: 't1',
}

async function projeto(token, titulo, { publicar = false } = {}) {
  const { body } = await amb.api('/api/projects', { method: 'POST', token, body: { titulo, categoria: 'Aventura' } })
  const id = body.project.id
  await amb.api(`/api/projects/${id}/conteudo`, { method: 'PUT', token, body: { conteudo: UMA_TELA } })
  if (publicar) {
    await amb.api(`/api/projects/${id}/status`, { method: 'PATCH', token, body: { status: 'publicado' } })
  }
  return id
}

const excluirConta = (token, password = SENHA) =>
  amb.api('/api/users/me', { method: 'DELETE', token, body: { password } })

async function copiaDe(usuarioId) {
  const { rows } = await amb.pool.query(
    `SELECT *, expira_em = excluida_em + make_interval(months => $2) AS no_prazo
     FROM contas_excluidas WHERE usuario_id = $1`,
    [usuarioId, termos.TERMOS.retencaoContaExcluidaMeses],
  )
  return rows
}

test('excluir a conta guarda a cópia dela e dos projetos pelo prazo dos Termos', async () => {
  const email = emailDeTeste('arquivada')
  const conta = await amb.criarConta(email)
  const publicado = await projeto(conta.token, 'Publicado', { publicar: true })
  const privado = await projeto(conta.token, 'Rascunho')

  // As rotas de imagem dão 503 sem Cloudinary nos testes: os arquivos entram direto no banco.
  await amb.pool.query("UPDATE projetos SET capa = 'https://x/capa.png', capa_public_id = 'capa-1' WHERE id = $1", [publicado])
  await amb.pool.query("INSERT INTO imagens (projeto_id, url, public_id) VALUES ($1, 'https://x/img.png', 'img-1')", [privado])
  await amb.api(`/api/projects/${publicado}/like`, { method: 'PUT', token: leitor.token })
  await amb.api(`/api/users/${conta.id}/denuncia`, { method: 'POST', token: leitor.token })

  const exclusao = await excluirConta(conta.token)
  assert.equal(exclusao.status, 204)

  const copias = await copiaDe(conta.id)
  assert.equal(copias.length, 1)
  const [copia] = copias
  assert.equal(copia.email, email)
  assert.equal(copia.termos_versao, TERMOS_VERSAO)
  assert.equal(copia.denuncias, 1, 'as denúncias recebidas vão junto')
  assert.equal(copia.no_prazo, true, `vence em ${termos.TERMOS.retencaoContaExcluidaMeses} meses`)

  const porTitulo = Object.fromEntries(copia.projetos.map((p) => [p.titulo, p]))
  assert.deepEqual(Object.keys(porTitulo).sort(), ['Publicado', 'Rascunho'])
  assert.equal(porTitulo.Publicado.status, 'publicado')
  assert.equal(porTitulo.Publicado.likes, 1)
  assert.deepEqual(porTitulo.Publicado.conteudo, UMA_TELA, 'o estado do editor é guardado inteiro')
  assert.equal(porTitulo.Rascunho.status, 'privado')
  assert.deepEqual(porTitulo.Rascunho.imagens, [{ url: 'https://x/img.png', public_id: 'img-1' }])
  assert.deepEqual([...copia.arquivos].sort(), ['capa-1', 'img-1'])
})

test('a conta some da Plataforma na hora e o e-mail fica livre', async () => {
  const email = emailDeTeste('some')
  const conta = await amb.criarConta(email)
  const id = await projeto(conta.token, 'Some junto', { publicar: true })

  await excluirConta(conta.token)

  const perfil = await amb.api(`/api/users/${conta.id}/perfil`, { token: leitor.token })
  assert.equal(perfil.status, 404)
  const leitura = await amb.api(`/api/projects/${id}/leitura`, { token: leitor.token })
  assert.equal(leitura.status, 404)
  const vitrine = await amb.api('/api/projects', { token: leitor.token })
  assert.equal(vitrine.body.projects.some((p) => p.id === id), false)

  const denovo = await amb.criarConta(email)
  assert.notEqual(denovo.id, conta.id, 'o cadastro novo é outra conta, a cópia não a reativa')
})

test('as marcas de outras pessoas que apontavam para a conta são limpas', async () => {
  const conta = await amb.criarConta(emailDeTeste('marcada'))
  const id = await projeto(conta.token, 'Marcado', { publicar: true })
  await amb.api(`/api/projects/${id}/like`, { method: 'PUT', token: leitor.token })
  await amb.api(`/api/projects/${id}/salvo`, { method: 'PUT', token: leitor.token })
  await amb.api(`/api/projects/${id}/denuncia`, { method: 'POST', token: leitor.token })
  await amb.api(`/api/users/${conta.id}/denuncia`, { method: 'POST', token: leitor.token })

  await excluirConta(conta.token)

  const { rows } = await amb.pool.query(
    `SELECT likes ? $1 AS curtido, salvos ? $1 AS salvo, reportados ? $1 AS denunciado,
            criadores_reportados ? $2 AS criador_denunciado
     FROM users WHERE id = $3`,
    [id, conta.id, leitor.id],
  )
  assert.deepEqual(rows[0], { curtido: false, salvo: false, denunciado: false, criador_denunciado: false })
})

test('senha errada não exclui nem arquiva nada', async () => {
  const conta = await amb.criarConta(emailDeTeste('fica'))

  const resposta = await excluirConta(conta.token, 'senha-errada')

  assert.equal(resposta.status, 401)
  assert.equal((await copiaDe(conta.id)).length, 0)
})

test('o expurgo apaga só as cópias vencidas, com os arquivos delas', async () => {
  const vencida = await amb.criarConta(emailDeTeste('vencida'))
  const vigente = await amb.criarConta(emailDeTeste('vigente'))
  const id = await projeto(vencida.token, 'Com capa')
  await amb.pool.query("UPDATE projetos SET capa_public_id = 'capa-vencida' WHERE id = $1", [id])
  await excluirConta(vencida.token)
  await excluirConta(vigente.token)
  await amb.pool.query("UPDATE contas_excluidas SET expira_em = NOW() - INTERVAL '1 second' WHERE usuario_id = $1", [vencida.id])

  const apagados = []
  const storage = { isConfigured: true, destroyImage: async (publicId) => apagados.push(publicId) }
  const resultado = await expurgarContasVencidas({ query: (texto, params) => amb.pool.query(texto, params), storage })

  assert.equal(resultado.contas, 1)
  assert.deepEqual(apagados, ['capa-vencida'])
  assert.equal((await copiaDe(vencida.id)).length, 0)
  assert.equal((await copiaDe(vigente.id)).length, 1, 'a cópia dentro do prazo continua')
})
