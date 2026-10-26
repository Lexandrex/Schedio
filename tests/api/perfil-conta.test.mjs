/*
 * Perfil do criador, dados da conta e a degradação das rotas de imagem.
 *
 * O ambiente de teste sobe SEM credenciais do Cloudinary de propósito: é o que
 * permite verificar que a falta delas dá 503 com mensagem útil em vez de
 * derrubar o resto do app.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { emailDeTeste, iniciarAmbiente, SENHA } from '../helpers/ambiente.mjs'

const amb = await iniciarAmbiente('perfil')
test.after(() => amb.encerrar())

const criador = await amb.criarConta(emailDeTeste('criador'))
const visitante = await amb.criarConta(emailDeTeste('visitante'))

const UMA_TELA = {
  version: 2,
  elements: [{ id: 't1', type: 'screen', x: 0, y: 0, width: 300, height: 600, name: 'Início' }],
  connections: [],
  startScreen: 't1',
}

async function obra(titulo, { publicada = false } = {}) {
  const { body } = await amb.api('/api/projects', {
    method: 'POST',
    token: criador.token,
    body: { titulo },
  })
  const projeto = body.project
  if (publicada) {
    await amb.api(`/api/projects/${projeto.id}/conteudo`, {
      method: 'PUT',
      token: criador.token,
      body: { conteudo: UMA_TELA },
    })
    await amb.api(`/api/projects/${projeto.id}/status`, {
      method: 'PATCH',
      token: criador.token,
      body: { status: 'publicado' },
    })
  }
  return projeto
}

const publicada = await obra('Obra publicada', { publicada: true })
const privada = await obra('Obra privada')

test('o visitante vê só as obras publicadas do criador', async () => {
  const { status, body } = await amb.api(`/api/users/${criador.id}/perfil`, { token: visitante.token })

  assert.equal(status, 200)
  assert.equal(body.isOwner, false)
  assert.deepEqual(body.projects.map((p) => p.id), [publicada.id], 'a privada não aparece para ninguém')
})

test('o dono vê todas as obras, com o status de cada uma', async () => {
  const { body } = await amb.api(`/api/users/${criador.id}/perfil`, { token: criador.token })

  assert.equal(body.isOwner, true)
  const ids = body.projects.map((p) => p.id).sort()
  assert.deepEqual(ids, [publicada.id, privada.id].sort())
  // O selo "Privado" do frontend depende desse campo vir na lista.
  assert.equal(body.projects.find((p) => p.id === privada.id).status, 'privado')
})

test('o perfil não vaza a senha do criador', async () => {
  const { body } = await amb.api(`/api/users/${criador.id}/perfil`, { token: visitante.token })

  assert.deepEqual(Object.keys(body.user).sort(), ['bio', 'email', 'foto', 'id', 'nome'])
})

test('perfil inexistente responde 404', async () => {
  const resposta = await amb.api('/api/users/00000000-0000-0000-0000-000000000000/perfil', {
    token: visitante.token,
  })
  assert.equal(resposta.status, 404)
})

test('o perfil exige estar logado', async () => {
  const resposta = await amb.api(`/api/users/${criador.id}/perfil`)
  assert.equal(resposta.status, 401)
})

test('a foto de perfil aparece para quem visita, para o dono e na sessão', async () => {
  const conta = await amb.criarConta(emailDeTeste('com-foto'))
  // O envio depende do Cloudinary, que o ambiente não tem: a foto entra pelo banco.
  const url = 'https://res.cloudinary.com/demo/image/upload/foto.jpg'
  await amb.pool.query('UPDATE users SET foto = $1, foto_public_id = $2 WHERE id = $3', [url, 'fotos/x', conta.id])

  const perfil = await amb.api(`/api/users/${conta.id}/perfil`, { token: visitante.token })
  const sessao = await amb.api('/api/auth/me', { token: conta.token })
  const edicao = await amb.api('/api/users/me', {
    method: 'PATCH',
    token: conta.token,
    body: { nome: 'Com Foto', cor: '#1E1E1E' },
  })

  assert.equal(perfil.body.user.foto, url)
  assert.equal(sessao.body.user.foto, url, 'o menu da conta lê a foto da sessão')
  assert.equal(edicao.body.user.foto, url, 'salvar o formulário não apaga a foto')
  assert.equal('foto_public_id' in perfil.body.user, false, 'o public_id não sai do servidor')
})

test('quem não tem foto recebe null, não um campo ausente', async () => {
  const { body } = await amb.api(`/api/users/${criador.id}/perfil`, { token: visitante.token })
  assert.equal(body.user.foto, null)
})

test('as rotas de foto exigem estar logado', async () => {
  for (const method of ['POST', 'DELETE']) {
    const resposta = await amb.api('/api/users/me/foto', { method })
    assert.equal(resposta.status, 401, method)
  }
})

test('a conta aceita nome, descrição e cor de fundo', async () => {
  const conta = await amb.criarConta(emailDeTeste('edita-conta'))

  const resposta = await amb.api('/api/users/me', {
    method: 'PATCH',
    token: conta.token,
    body: { nome: 'Pessoa Teste', bio: 'Escrevo histórias curtas.', cor: '#2A9D8F' },
  })

  assert.equal(resposta.status, 200)
  assert.deepEqual(
    { nome: resposta.body.user.nome, bio: resposta.body.user.bio, cor: resposta.body.user.cor },
    { nome: 'Pessoa Teste', bio: 'Escrevo histórias curtas.', cor: '#2A9D8F' },
  )
})

test('cor fora do formato #RRGGBB é recusada', async () => {
  const conta = await amb.criarConta(emailDeTeste('cor-invalida'))

  for (const cor of ['vermelho', '#FFF', '#GGGGGG', '2A9D8F']) {
    const resposta = await amb.api('/api/users/me', {
      method: 'PATCH',
      token: conta.token,
      body: { nome: 'Alguém', cor },
    })
    assert.equal(resposta.status, 400, `recusa "${cor}"`)
  }
})

test('descrição acima de 280 caracteres é recusada', async () => {
  const conta = await amb.criarConta(emailDeTeste('bio-longa'))

  const resposta = await amb.api('/api/users/me', {
    method: 'PATCH',
    token: conta.token,
    body: { nome: 'Alguém', bio: 'x'.repeat(281) },
  })

  assert.equal(resposta.status, 400)
})

test('excluir a conta exige a senha correta', async () => {
  const conta = await amb.criarConta(emailDeTeste('exclui-errado'))

  const resposta = await amb.api('/api/users/me', {
    method: 'DELETE',
    token: conta.token,
    body: { password: 'senha-errada' },
  })

  assert.equal(resposta.status, 401)
  const { rows } = await amb.pool.query('SELECT 1 FROM users WHERE id = $1', [conta.id])
  assert.equal(rows.length, 1, 'a conta continua de pé')
})

test('excluir a conta leva os projetos junto, por cascade', async () => {
  const conta = await amb.criarConta(emailDeTeste('exclui-certo'))
  const { body } = await amb.api('/api/projects', {
    method: 'POST',
    token: conta.token,
    body: { titulo: 'Obra que vai sumir' },
  })

  const resposta = await amb.api('/api/users/me', {
    method: 'DELETE',
    token: conta.token,
    body: { password: SENHA },
  })

  assert.equal(resposta.status, 204)
  const projetos = await amb.pool.query('SELECT 1 FROM projetos WHERE id = $1', [body.project.id])
  assert.equal(projetos.rows.length, 0, 'não sobra projeto órfão')
})

test('o token de uma conta excluída deixa de valer', async () => {
  const conta = await amb.criarConta(emailDeTeste('token-orfao'))
  await amb.api('/api/users/me', { method: 'DELETE', token: conta.token, body: { password: SENHA } })

  const resposta = await amb.api('/api/auth/me', { token: conta.token })

  // O JWT ainda é criptograficamente válido; quem barra é a consulta ao banco.
  assert.equal(resposta.status, 401)
})

test('sem Cloudinary, o app reporta o armazenamento como não configurado', async () => {
  const { body } = await amb.api('/api/health')

  assert.equal(body.status, 'ok', 'o resto do app funciona normalmente')
  assert.equal(body.storage, 'not-configured')
})

test('sem Cloudinary, as rotas de imagem dão 503 nomeando o que falta', async () => {
  const projeto = await obra('Obra com imagem')

  const rotas = [
    [`/api/projects/${projeto.id}/imagens`, 'POST'],
    [`/api/projects/${projeto.id}/capa`, 'POST'],
    ['/api/imagens/00000000-0000-0000-0000-000000000000', 'DELETE'],
    ['/api/users/me/foto', 'POST'],
    ['/api/users/me/foto', 'DELETE'],
  ]
  for (const [caminho, method] of rotas) {
    const resposta = await amb.api(caminho, { method, token: criador.token })
    assert.equal(resposta.status, 503, `${method} ${caminho}`)
    assert.match(resposta.body.message, /CLOUDINARY_CLOUD_NAME/, 'a mensagem diz qual variável definir')
  }
})

test('a listagem de imagens do projeto não depende do Cloudinary', async () => {
  // Só lê o banco: precisa funcionar mesmo sem credencial de upload.
  const projeto = await obra('Obra sem imagens')

  const resposta = await amb.api(`/api/projects/${projeto.id}/imagens`, { token: criador.token })

  assert.equal(resposta.status, 200)
  assert.deepEqual(resposta.body.images, [])
})
