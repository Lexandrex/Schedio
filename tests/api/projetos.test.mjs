/*
 * Regras do projeto que a API precisa sustentar sozinha — o frontend
 * desabilita botões, mas quem garante é o servidor.
 *
 * Cobre: nascer privado, RN-08 (conteúdo para publicar), o 409 de editar
 * publicado, a separação entre o endpoint do dono e o da leitura pública, e o
 * 404 (não 403) para projeto de outra pessoa.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { emailDeTeste, iniciarAmbiente } from '../helpers/ambiente.mjs'

const amb = await iniciarAmbiente('projetos')
test.after(() => amb.encerrar())

const dono = await amb.criarConta(emailDeTeste('dono'))
const estranho = await amb.criarConta(emailDeTeste('estranho'))

/**
 * Documento que a coluna `conteudo` já traz por padrão: um version 1 vazio.
 * É por causa dele que a checagem da RN-08 (`conteudo.elements.length`)
 * recusa um projeto recém-criado em vez de explodir.
 */
const VAZIO_PADRAO = { version: 1, elements: [] }

/** Conteúdo mínimo que satisfaz a RN-08. */
const UMA_TELA = {
  version: 2,
  elements: [{ id: 't1', type: 'screen', x: 0, y: 0, width: 300, height: 600, name: 'Início' }],
  connections: [],
  startScreen: 't1',
}

async function criarProjeto(dados = {}, token = dono.token) {
  const resposta = await amb.api('/api/projects', {
    method: 'POST',
    token,
    body: { titulo: 'Obra de teste', ...dados },
  })
  assert.equal(resposta.status, 201, JSON.stringify(resposta.body))
  return resposta.body.project
}

const publicar = (id, token = dono.token) =>
  amb.api(`/api/projects/${id}/status`, { method: 'PATCH', token, body: { status: 'publicado' } })

const gravarConteudo = (id, conteudo = UMA_TELA, token = dono.token) =>
  amb.api(`/api/projects/${id}/conteudo`, { method: 'PUT', token, body: { conteudo } })

test('projeto nasce privado', async () => {
  const projeto = await criarProjeto()
  assert.equal(projeto.status, 'privado', 'nada vai ao ar sem o dono publicar')
})

test('RN-08: não publica projeto sem conteúdo', async () => {
  const projeto = await criarProjeto()

  const resposta = await publicar(projeto.id)

  assert.equal(resposta.status, 400)
  assert.match(resposta.body.message, /ao menos um elemento/)
})

test('com conteúdo, publica e aparece na vitrine de outra pessoa', async () => {
  const projeto = await criarProjeto({ titulo: 'Vai ao ar' })
  await gravarConteudo(projeto.id)

  const resposta = await publicar(projeto.id)
  assert.equal(resposta.status, 200)
  assert.equal(resposta.body.project.status, 'publicado')

  const vitrine = await amb.api('/api/projects', { token: estranho.token })
  assert.ok(
    vitrine.body.projects.some((p) => p.id === projeto.id),
    'projeto publicado é visível para os outros',
  )
})

test('projeto privado não aparece na vitrine', async () => {
  const projeto = await criarProjeto({ titulo: 'Segredo' })

  const vitrine = await amb.api('/api/projects', { token: estranho.token })
  assert.ok(!vitrine.body.projects.some((p) => p.id === projeto.id))
})

test('despublicar tira da vitrine', async () => {
  const projeto = await criarProjeto()
  await gravarConteudo(projeto.id)
  await publicar(projeto.id)

  const volta = await amb.api(`/api/projects/${projeto.id}/status`, {
    method: 'PATCH',
    token: dono.token,
    body: { status: 'privado' },
  })
  assert.equal(volta.status, 200)

  const vitrine = await amb.api('/api/projects', { token: estranho.token })
  assert.ok(!vitrine.body.projects.some((p) => p.id === projeto.id))
})

test('status inválido é recusado', async () => {
  const projeto = await criarProjeto()
  const resposta = await amb.api(`/api/projects/${projeto.id}/status`, {
    method: 'PATCH',
    token: dono.token,
    body: { status: 'rascunho' },
  })
  assert.equal(resposta.status, 400)
})

test('o endpoint de edição é só do dono — para os outros é 404, não 403', async () => {
  const projeto = await criarProjeto()
  await gravarConteudo(projeto.id)
  await publicar(projeto.id)

  // Publicado e tudo: o endpoint de edição continua estritamente do dono.
  const resposta = await amb.api(`/api/projects/${projeto.id}`, { token: estranho.token })

  assert.equal(resposta.status, 404, 'não confirma nem a existência do projeto')
  assert.equal(resposta.body.message, 'Projeto não encontrado.')
})

test('ninguém publica, edita, grava conteúdo ou exclui projeto alheio', async () => {
  const projeto = await criarProjeto({ titulo: 'Intocável' })
  const token = estranho.token

  const tentativas = [
    await amb.api(`/api/projects/${projeto.id}/status`, { method: 'PATCH', token, body: { status: 'publicado' } }),
    await amb.api(`/api/projects/${projeto.id}`, { method: 'PATCH', token, body: { titulo: 'Sequestrado' } }),
    await gravarConteudo(projeto.id, UMA_TELA, token),
    await amb.api(`/api/projects/${projeto.id}`, { method: 'DELETE', token }),
  ]
  for (const resposta of tentativas) {
    assert.equal(resposta.status, 404, JSON.stringify(resposta.body))
  }

  const { rows } = await amb.pool.query('SELECT titulo, status, conteudo FROM projetos WHERE id = $1', [projeto.id])
  assert.deepEqual(
    { titulo: rows[0].titulo, status: rows[0].status, conteudo: rows[0].conteudo },
    { titulo: 'Intocável', status: 'privado', conteudo: VAZIO_PADRAO },
    'nada foi alterado',
  )
})

test('a leitura pública só abre projeto publicado', async () => {
  const projeto = await criarProjeto({ titulo: 'Para ler' })
  await gravarConteudo(projeto.id)

  const privado = await amb.api(`/api/projects/${projeto.id}/leitura`, { token: estranho.token })
  assert.equal(privado.status, 404)
  assert.match(privado.body.message, /não publicado/)

  await publicar(projeto.id)

  const publicado = await amb.api(`/api/projects/${projeto.id}/leitura`, { token: estranho.token })
  assert.equal(publicado.status, 200)
  assert.equal(publicado.body.project.titulo, 'Para ler')
  assert.equal(publicado.body.project.autor_id, dono.id, 'a apresentação mostra quem escreveu')
  assert.ok(publicado.body.project.conteudo?.elements?.length, 'o documento do canvas vem junto')
})

test('a leitura exige estar logado', async () => {
  const projeto = await criarProjeto()
  await gravarConteudo(projeto.id)
  await publicar(projeto.id)

  const resposta = await amb.api(`/api/projects/${projeto.id}/leitura`)
  assert.equal(resposta.status, 401)
})

test('projeto publicado recusa edição dos dados com 409', async () => {
  const projeto = await criarProjeto({ titulo: 'Original', descricao: 'Sinopse original' })
  await gravarConteudo(projeto.id)
  await publicar(projeto.id)

  const resposta = await amb.api(`/api/projects/${projeto.id}`, {
    method: 'PATCH',
    token: dono.token,
    body: { titulo: 'Mudado', descricao: 'Outra' },
  })

  assert.equal(resposta.status, 409)
  const { rows } = await amb.pool.query('SELECT titulo, descricao FROM projetos WHERE id = $1', [projeto.id])
  assert.deepEqual(rows[0], { titulo: 'Original', descricao: 'Sinopse original' }, 'nada mudou por baixo do leitor')
})

test('o 409 vem ANTES da validação dos campos', async () => {
  const projeto = await criarProjeto()
  await gravarConteudo(projeto.id)
  await publicar(projeto.id)

  // Título vazio normalmente daria 400; publicado, a resposta não pode
  // depender do que foi digitado.
  const resposta = await amb.api(`/api/projects/${projeto.id}`, {
    method: 'PATCH',
    token: dono.token,
    body: { titulo: '' },
  })

  assert.equal(resposta.status, 409)
})

test('privado de volta, a edição dos dados passa', async () => {
  const projeto = await criarProjeto({ titulo: 'Antes' })
  await gravarConteudo(projeto.id)
  await publicar(projeto.id)
  await amb.api(`/api/projects/${projeto.id}/status`, {
    method: 'PATCH',
    token: dono.token,
    body: { status: 'privado' },
  })

  const resposta = await amb.api(`/api/projects/${projeto.id}`, {
    method: 'PATCH',
    token: dono.token,
    body: { titulo: 'Depois', categoria: 'terror' },
  })

  assert.equal(resposta.status, 200)
  assert.equal(resposta.body.project.titulo, 'Depois')
})

test('as tags são gravadas na forma canônica, já sem repetidas', async () => {
  // Separador é vírgula E espaço; repetida ignora acento e caixa.
  const projeto = await criarProjeto({ titulo: 'Com tags', categoria: 'Ação, ação  acao, terror' })

  assert.equal(projeto.categoria, 'Ação, terror')
})

test('tags acima do limite são recusadas', async () => {
  const resposta = await amb.api('/api/projects', {
    method: 'POST',
    token: dono.token,
    body: { titulo: 'Tags demais', categoria: Array.from({ length: 20 }, (_, i) => `tag${i}`).join(', ') },
  })

  assert.equal(resposta.status, 400)
  assert.match(resposta.body.message, /tags devem somar/)
})

test('projeto sem título é recusado', async () => {
  const resposta = await amb.api('/api/projects', { method: 'POST', token: dono.token, body: { titulo: '   ' } })
  assert.equal(resposta.status, 400)
})

test('conteúdo inválido é recusado sem gravar nada', async () => {
  const projeto = await criarProjeto()

  for (const conteudo of [null, 'texto', { semElements: true }, { elements: 'não é lista' }]) {
    const resposta = await gravarConteudo(projeto.id, conteudo)
    assert.equal(resposta.status, 400, `recusa ${JSON.stringify(conteudo)}`)
  }

  const { rows } = await amb.pool.query('SELECT conteudo FROM projetos WHERE id = $1', [projeto.id])
  assert.deepEqual(rows[0].conteudo, VAZIO_PADRAO, 'segue com o documento vazio que já tinha')
})

test('o documento do canvas sobrevive à ida e volta no JSONB', async () => {
  const projeto = await criarProjeto()
  const documento = {
    ...UMA_TELA,
    elements: [
      ...UMA_TELA.elements,
      { id: 'tx', type: 'text', x: 10, y: 20, text: 'Olá', fontSize: 32, runs: [{ start: 0, end: 1, fill: '#e5484d' }] },
    ],
    connections: [{ id: 'cx-1', from: 'tx', to: 't1', trigger: 'click', transition: 'smart', duration: 350 }],
  }

  assert.equal((await gravarConteudo(projeto.id, documento)).status, 204)

  const lido = await amb.api(`/api/projects/${projeto.id}`, { token: dono.token })
  assert.deepEqual(lido.body.project.conteudo, documento, 'inclusive os runs de formatação por caractere')
})

test('id que não é UUID responde 404, não erro de servidor', async () => {
  // O Postgres levanta 22P02 em texto que não é UUID; as rotas traduzem isso.
  const caminhos = [
    '/api/projects/isso-nao-e-uuid',
    '/api/projects/isso-nao-e-uuid/leitura',
    '/api/users/isso-nao-e-uuid/perfil',
  ]
  for (const caminho of caminhos) {
    const resposta = await amb.api(caminho, { token: dono.token })
    assert.equal(resposta.status, 404, `${caminho} → 404`)
  }
})

test('excluir o projeto o remove de vez', async () => {
  const projeto = await criarProjeto()

  const resposta = await amb.api(`/api/projects/${projeto.id}`, { method: 'DELETE', token: dono.token })

  assert.equal(resposta.status, 204)
  const { rows } = await amb.pool.query('SELECT 1 FROM projetos WHERE id = $1', [projeto.id])
  assert.equal(rows.length, 0)
})
