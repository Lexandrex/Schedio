/*
 * Curtir, salvar e denunciar (RF-38, RF-40, RF-39).
 *
 * Cobre: RN-14 (um like por usuário, inclusive em cliques simultâneos), o
 * contador de likes visível para todos e preservado quando o dono torna o
 * projeto privado, a marca de salvo na vitrine, a denúncia que só cresce e a
 * lista de denunciados da conta, e a limpeza das marcas ao excluir projeto ou
 * conta.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { emailDeTeste, iniciarAmbiente, SENHA } from '../helpers/ambiente.mjs'

const amb = await iniciarAmbiente('interacoes')
test.after(() => amb.encerrar())

const autor = await amb.criarConta(emailDeTeste('autor'))
const leitor = await amb.criarConta(emailDeTeste('leitor'))
const outro = await amb.criarConta(emailDeTeste('outro'))

const UMA_TELA = {
  version: 2,
  elements: [{ id: 't1', type: 'screen', x: 0, y: 0, width: 300, height: 600, name: 'Início' }],
  connections: [],
  startScreen: 't1',
}

async function obraPublicada(titulo = 'Obra de teste') {
  const { body } = await amb.api('/api/projects', { method: 'POST', token: autor.token, body: { titulo } })
  const id = body.project.id
  await amb.api(`/api/projects/${id}/conteudo`, { method: 'PUT', token: autor.token, body: { conteudo: UMA_TELA } })
  const publicado = await amb.api(`/api/projects/${id}/status`, {
    method: 'PATCH',
    token: autor.token,
    body: { status: 'publicado' },
  })
  assert.equal(publicado.status, 200, JSON.stringify(publicado.body))
  return id
}

const tornarPrivado = (id) =>
  amb.api(`/api/projects/${id}/status`, { method: 'PATCH', token: autor.token, body: { status: 'privado' } })

const marcar = (id, marca, token, method = 'PUT') => amb.api(`/api/projects/${id}/${marca}`, { method, token })

async function contadores(id) {
  const { rows } = await amb.pool.query('SELECT likes, denuncias FROM projetos WHERE id = $1', [id])
  return rows[0]
}

test('like conta uma vez por usuário e aparece para todos', async () => {
  const id = await obraPublicada()

  const primeiro = await marcar(id, 'like', leitor.token)
  assert.equal(primeiro.status, 200)
  assert.deepEqual(primeiro.body, { curtido: true, likes: 1 })

  const repetido = await marcar(id, 'like', leitor.token)
  assert.deepEqual(repetido.body, { curtido: true, likes: 1 }, 'RN-14: o segundo like não soma')

  await marcar(id, 'like', outro.token)

  const leitura = await amb.api(`/api/projects/${id}/leitura`, { token: autor.token })
  assert.equal(leitura.body.project.likes, 2, 'o autor vê os likes dos outros')
  assert.equal(leitura.body.project.curtido, false, 'o autor não curtiu')

  const doLeitor = await amb.api(`/api/projects/${id}/leitura`, { token: leitor.token })
  assert.equal(doLeitor.body.project.curtido, true)

  const vitrine = await amb.api('/api/projects', { token: outro.token })
  assert.equal(vitrine.body.projects.find((p) => p.id === id).likes, 2)
})

test('RN-14 vale mesmo com cliques simultâneos', async () => {
  const id = await obraPublicada()

  await Promise.all(Array.from({ length: 6 }, () => marcar(id, 'like', leitor.token)))

  assert.equal((await contadores(id)).likes, 1)
})

test('desfazer o like desconta, e desfazer de novo não fica negativo', async () => {
  const id = await obraPublicada()
  await marcar(id, 'like', leitor.token)

  const desfeito = await marcar(id, 'like', leitor.token, 'DELETE')
  assert.deepEqual(desfeito.body, { curtido: false, likes: 0 })

  const deNovo = await marcar(id, 'like', leitor.token, 'DELETE')
  assert.deepEqual(deNovo.body, { curtido: false, likes: 0 })
})

test('o dono continua vendo os likes depois de tornar o projeto privado', async () => {
  const id = await obraPublicada()
  await marcar(id, 'like', leitor.token)
  await marcar(id, 'like', outro.token)

  await tornarPrivado(id)

  const meus = await amb.api('/api/projects/mine', { token: autor.token })
  assert.equal(meus.body.projects.find((p) => p.id === id).likes, 2)

  const perfil = await amb.api(`/api/users/${autor.id}/perfil`, { token: autor.token })
  assert.equal(perfil.body.projects.find((p) => p.id === id).likes, 2)
})

test('não curte projeto privado, mas desfaz um like antigo nele', async () => {
  const id = await obraPublicada()
  await marcar(id, 'like', leitor.token)
  await tornarPrivado(id)

  const novo = await marcar(id, 'like', outro.token)
  assert.equal(novo.status, 404)

  const desfeito = await marcar(id, 'like', leitor.token, 'DELETE')
  assert.equal(desfeito.status, 200)
  assert.equal(desfeito.body.likes, 0)
})

test('id inválido responde 404 em JSON', async () => {
  const resposta = await marcar('nao-e-uuid', 'like', leitor.token)
  assert.equal(resposta.status, 404)
  assert.match(resposta.body.message, /não encontrado/)
})

test('salvo vem marcado na vitrine só para quem salvou', async () => {
  const id = await obraPublicada()

  const salvo = await marcar(id, 'salvo', leitor.token)
  assert.deepEqual(salvo.body, { salvo: true })

  const doLeitor = await amb.api('/api/projects', { token: leitor.token })
  assert.equal(doLeitor.body.projects.find((p) => p.id === id).salvo, true)

  const deOutro = await amb.api('/api/projects', { token: outro.token })
  assert.equal(deOutro.body.projects.find((p) => p.id === id).salvo, false)

  const leitura = await amb.api(`/api/projects/${id}/leitura`, { token: leitor.token })
  assert.equal(leitura.body.project.salvo, true)

  await marcar(id, 'salvo', leitor.token, 'DELETE')
  const depois = await amb.api('/api/projects', { token: leitor.token })
  assert.equal(depois.body.projects.find((p) => p.id === id).salvo, false)
})

test('denúncia soma uma vez por usuário e entra na lista da conta', async () => {
  const id = await obraPublicada('Denunciada')

  const primeira = await amb.api(`/api/projects/${id}/denuncia`, { method: 'POST', token: leitor.token })
  assert.equal(primeira.status, 200)
  assert.deepEqual(primeira.body, { denunciado: true }, 'quem denuncia não vê o total')

  await amb.api(`/api/projects/${id}/denuncia`, { method: 'POST', token: leitor.token })
  await amb.api(`/api/projects/${id}/denuncia`, { method: 'POST', token: outro.token })
  assert.equal((await contadores(id)).denuncias, 2)

  const leitura = await amb.api(`/api/projects/${id}/leitura`, { token: leitor.token })
  assert.equal(leitura.body.project.denunciado, true)
  assert.equal('denuncias' in leitura.body.project, false, 'o total não vaza para a leitura')

  const lista = await amb.api('/api/users/me/denuncias', { token: leitor.token })
  assert.equal(lista.status, 200)
  assert.equal(lista.body.projects[0].id, id, 'a mais recente vem primeiro')
  assert.equal(lista.body.projects[0].titulo, 'Denunciada')
})

test('denunciado e depois privado continua na lista, com o status', async () => {
  const id = await obraPublicada()
  await amb.api(`/api/projects/${id}/denuncia`, { method: 'POST', token: outro.token })
  await tornarPrivado(id)

  const lista = await amb.api('/api/users/me/denuncias', { token: outro.token })
  assert.equal(lista.body.projects.find((p) => p.id === id).status, 'privado')
})

test('o autor não denuncia o próprio projeto', async () => {
  const id = await obraPublicada()

  const resposta = await amb.api(`/api/projects/${id}/denuncia`, { method: 'POST', token: autor.token })

  assert.equal(resposta.status, 400)
  assert.equal((await contadores(id)).denuncias, 0)
})

test('excluir o projeto tira o id das marcas de todo mundo', async () => {
  const id = await obraPublicada()
  await marcar(id, 'like', leitor.token)
  await marcar(id, 'salvo', leitor.token)
  await amb.api(`/api/projects/${id}/denuncia`, { method: 'POST', token: leitor.token })

  const exclusao = await amb.api(`/api/projects/${id}`, { method: 'DELETE', token: autor.token })
  assert.equal(exclusao.status, 204)

  const { rows } = await amb.pool.query(
    `SELECT likes ? $1 AS curtido, salvos ? $1 AS salvo, reportados ? $1 AS denunciado
     FROM users WHERE id = $2`,
    [id, leitor.id],
  )
  assert.deepEqual(rows[0], { curtido: false, salvo: false, denunciado: false })
})

test('excluir a conta devolve os likes dela, mas não as denúncias', async () => {
  const id = await obraPublicada()
  const passageiro = await amb.criarConta(emailDeTeste('passageiro'))
  await marcar(id, 'like', passageiro.token)
  await amb.api(`/api/projects/${id}/denuncia`, { method: 'POST', token: passageiro.token })

  const exclusao = await amb.api('/api/users/me', {
    method: 'DELETE',
    token: passageiro.token,
    body: { password: SENHA },
  })
  assert.equal(exclusao.status, 204)

  assert.deepEqual(await contadores(id), { likes: 0, denuncias: 1 })
})
