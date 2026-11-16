/*
 * Administração (RN-15): quem é administrador, a fila de denúncias, excluir
 * obras e contas por má conduta, o aviso ao autor e a restauração de contas
 * encerradas pela moderação — respeitando os Termos: a autoexclusão não pode
 * ser desfeita, e o dono da plataforma nunca perde o acesso.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { SENHA, emailDeTeste, iniciarAmbiente } from '../helpers/ambiente.mjs'

const EMAIL_DONO = emailDeTeste('dono')
const amb = await iniciarAmbiente('administracao', { donoEmail: EMAIL_DONO })
test.after(() => amb.encerrar())

const dono = await amb.criarConta(EMAIL_DONO)
const leitor = await amb.criarConta(emailDeTeste('leitor'))

const UMA_TELA = {
  version: 2,
  elements: [{ id: 't1', type: 'screen', x: 0, y: 0, width: 300, height: 600, name: 'Início' }],
  connections: [],
  startScreen: 't1',
}

async function obraPublicada(token, titulo = 'Obra') {
  const criado = await amb.api('/api/projects', { method: 'POST', token, body: { titulo } })
  const { id } = criado.body.project
  await amb.api(`/api/projects/${id}/conteudo`, { method: 'PUT', token, body: { conteudo: UMA_TELA } })
  await amb.api(`/api/projects/${id}/status`, { method: 'PATCH', token, body: { status: 'publicado' } })
  return id
}

const denunciar = (id, token) => amb.api(`/api/projects/${id}/denuncia`, { method: 'POST', token })

async function concederAdmin(email, token = dono.token) {
  const resposta = await amb.api('/api/admin/admins', { method: 'POST', token, body: { email } })
  assert.equal(resposta.status, 200, JSON.stringify(resposta.body))
  return resposta.body.admin
}

const login = (email, senha = SENHA) =>
  amb.api('/api/auth/login', { method: 'POST', body: { email, password: senha } })

test('quem não é administrador recebe 403 em toda a administração', async () => {
  const eu = await amb.api('/api/auth/me', { token: leitor.token })
  assert.equal(eu.body.user.admin, false)

  for (const [method, caminho] of [
    ['GET', '/api/admin/denuncias'],
    ['GET', '/api/admin/admins'],
    ['POST', '/api/admin/admins'],
    ['GET', '/api/admin/contas-excluidas'],
    ['DELETE', `/api/admin/usuarios/${dono.id}`],
  ]) {
    const resposta = await amb.api(caminho, { method, token: leitor.token, body: method === 'POST' ? {} : undefined })
    assert.equal(resposta.status, 403, `${method} ${caminho}`)
    assert.equal(resposta.body.message, 'Acesso restrito a administradores.')
  }
})

test('o dono vem da configuração e é administrador sem coluna nenhuma', async () => {
  const eu = await amb.api('/api/auth/me', { token: dono.token })
  assert.equal(eu.body.user.admin, true)
  assert.equal(eu.body.user.dono, true)

  const { rows } = await amb.pool.query('SELECT admin FROM users WHERE id = $1', [dono.id])
  assert.equal(rows[0].admin, false, 'nada gravado: o acesso não depende do banco')
})

test('RN-15: lista obras e criadores denunciados com o número de denúncias', async () => {
  const autor = await amb.criarConta(emailDeTeste('autor'))
  const outro = await amb.criarConta(emailDeTeste('outro'))
  const id = await obraPublicada(autor.token, 'Denunciada')
  await denunciar(id, leitor.token)
  await denunciar(id, outro.token)
  await amb.api(`/api/users/${autor.id}/denuncia`, { method: 'POST', token: leitor.token })

  const resposta = await amb.api('/api/admin/denuncias', { token: dono.token })
  assert.equal(resposta.status, 200)

  const obra = resposta.body.projects.find((item) => item.id === id)
  assert.equal(obra.denuncias, 2)
  assert.equal(obra.autor_email, autor.email)
  const criador = resposta.body.creators.find((item) => item.id === autor.id)
  assert.equal(criador.denuncias, 1)
  assert.equal(criador.projetos, 1)
})

test('administrador lê obra privada (a avaliação precisa ver o que foi denunciado)', async () => {
  const autor = await amb.criarConta(emailDeTeste('autor'))
  const id = await obraPublicada(autor.token)
  await amb.api(`/api/projects/${id}/status`, { method: 'PATCH', token: autor.token, body: { status: 'privado' } })

  assert.equal((await amb.api(`/api/projects/${id}/leitura`, { token: leitor.token })).status, 404)
  assert.equal((await amb.api(`/api/projects/${id}/leitura`, { token: dono.token })).status, 200)
})

test('concede e revoga administração pelo e-mail; o dono nunca perde o acesso', async () => {
  const futuro = await amb.criarConta(emailDeTeste('futuro'))

  const concedido = await concederAdmin(futuro.email.toUpperCase())
  assert.equal(concedido.id, futuro.id, 'o e-mail é comparado sem caixa')
  assert.equal((await amb.api('/api/admin/denuncias', { token: futuro.token })).status, 200)
  assert.equal((await concederAdmin(futuro.email)).id, futuro.id, 'conceder de novo não falha')

  const inexistente = await amb.api('/api/admin/admins', {
    method: 'POST',
    token: dono.token,
    body: { email: 'ninguem@example.com' },
  })
  assert.equal(inexistente.status, 404)
  assert.equal(inexistente.body.message, 'Nenhuma conta com esse e-mail.')

  const lista = await amb.api('/api/admin/admins', { token: futuro.token })
  assert.equal(lista.body.admins[0].id, dono.id, 'o dono vem primeiro')
  assert.equal(lista.body.admins[0].dono, true)

  // Nem outro administrador nem o próprio dono tiram o acesso do dono.
  for (const token of [futuro.token, dono.token]) {
    const resposta = await amb.api(`/api/admin/admins/${dono.id}`, { method: 'DELETE', token })
    assert.equal(resposta.status, 400)
    assert.equal(resposta.body.message, 'O dono da plataforma não perde o acesso de administrador.')
  }

  const revogado = await amb.api(`/api/admin/admins/${futuro.id}`, { method: 'DELETE', token: dono.token })
  assert.equal(revogado.status, 204)
  assert.equal((await amb.api('/api/admin/denuncias', { token: futuro.token })).status, 403)
  assert.equal(
    (await amb.api(`/api/admin/admins/${futuro.id}`, { method: 'DELETE', token: dono.token })).status,
    404,
    'quem já não é administrador não se revoga de novo',
  )
})

test('excluir obra por má conduta avisa o autor, com o motivo', async () => {
  const autor = await amb.criarConta(emailDeTeste('autor'))
  const id = await obraPublicada(autor.token, 'Conto Proibido')
  await amb.api(`/api/projects/${id}/like`, { method: 'PUT', token: leitor.token })

  const longo = await amb.api(`/api/admin/projetos/${id}`, {
    method: 'DELETE',
    token: dono.token,
    body: { motivo: 'x'.repeat(501) },
  })
  assert.equal(longo.status, 400, 'motivo longo demais é recusado antes de excluir')

  const resposta = await amb.api(`/api/admin/projetos/${id}`, {
    method: 'DELETE',
    token: dono.token,
    body: { motivo: 'Discurso de ódio.' },
  })
  assert.equal(resposta.status, 204)
  assert.equal((await amb.pool.query('SELECT 1 FROM projetos WHERE id = $1', [id])).rows.length, 0)
  const curtidas = await amb.pool.query('SELECT likes FROM users WHERE id = $1', [leitor.id])
  assert.ok(!curtidas.rows[0].likes.includes(id), 'sai dos arrays de quem curtiu')

  const avisos = await amb.api('/api/avisos', { token: autor.token })
  assert.equal(avisos.body.avisos.length, 1)
  assert.match(avisos.body.avisos[0].mensagem, /"Conto Proibido" foi excluída por um administrador por má conduta/)
  assert.match(avisos.body.avisos[0].mensagem, /Motivo: Discurso de ódio\.$/)

  const aviso = avisos.body.avisos[0].id
  assert.equal((await amb.api(`/api/avisos/${aviso}/lido`, { method: 'POST', token: leitor.token })).status, 404)
  assert.equal((await amb.api(`/api/avisos/${aviso}/lido`, { method: 'POST', token: autor.token })).status, 204)
  assert.equal((await amb.api('/api/avisos', { token: autor.token })).body.avisos.length, 0)

  assert.equal((await amb.api(`/api/admin/projetos/${id}`, { method: 'DELETE', token: dono.token })).status, 404)
})

test('acha a conta pelo e-mail', async () => {
  const alguem = await amb.criarConta(emailDeTeste('alguem'))
  const achado = await amb.api(`/api/admin/usuarios?email=${encodeURIComponent(alguem.email)}`, { token: dono.token })
  assert.equal(achado.status, 200)
  assert.equal(achado.body.usuario.id, alguem.id)

  const ninguem = await amb.api('/api/admin/usuarios?email=ninguem@example.com', { token: dono.token })
  assert.equal(ninguem.status, 404)
})

test('limites da exclusão de conta: a si mesmo, o dono e outros administradores', async () => {
  const admin = await amb.criarConta(emailDeTeste('admin'))
  const colega = await amb.criarConta(emailDeTeste('colega'))
  await concederAdmin(admin.email)
  await concederAdmin(colega.email)

  const casos = [
    [admin.token, admin.id, 400, 'Para excluir a sua própria conta, use a página da conta.'],
    [admin.token, dono.id, 400, 'A conta do dono da plataforma não pode ser excluída.'],
    [admin.token, colega.id, 403, 'Só o dono da plataforma exclui a conta de outro administrador.'],
  ]
  for (const [token, alvo, status, mensagem] of casos) {
    const resposta = await amb.api(`/api/admin/usuarios/${alvo}`, { method: 'DELETE', token })
    assert.equal(resposta.status, status, mensagem)
    assert.equal(resposta.body.message, mensagem)
  }

  assert.equal((await amb.api(`/api/admin/usuarios/${colega.id}`, { method: 'DELETE', token: dono.token })).status, 204)
})

test('conta encerrada por administrador é guardada pelos Termos e pode ser restaurada', async () => {
  const autor = await amb.criarConta(emailDeTeste('restauravel'))
  const deOutro = await obraPublicada(leitor.token, 'Do leitor')
  await amb.api(`/api/projects/${deOutro}/like`, { method: 'PUT', token: autor.token })
  const obra = await obraPublicada(autor.token, 'Volta inteira')
  const { rows: imagem } = await amb.pool.query(
    "INSERT INTO imagens (projeto_id, url, public_id) VALUES ($1, 'https://exemplo.test/a.png', 'pasta/a') RETURNING id",
    [obra],
  )
  await amb.pool.query("UPDATE users SET foto = 'https://exemplo.test/f.png', bio = 'Minha bio' WHERE id = $1", [autor.id])

  const excluir = await amb.api(`/api/admin/usuarios/${autor.id}`, {
    method: 'DELETE',
    token: dono.token,
    body: { motivo: 'Spam.' },
  })
  assert.equal(excluir.status, 204)
  assert.equal((await login(autor.email)).status, 401, 'a conta saiu da plataforma')
  const likesComAutorFora = await amb.pool.query('SELECT likes FROM projetos WHERE id = $1', [deOutro])
  assert.equal(likesComAutorFora.rows[0].likes, 0)

  const lista = await amb.api('/api/admin/contas-excluidas', { token: dono.token })
  const copia = lista.body.contas.find((conta) => conta.usuario_id === autor.id)
  assert.equal(copia.restauravel, true)
  assert.equal(copia.motivo, 'Spam.')
  assert.equal(copia.excluida_por, dono.id)
  assert.equal(copia.projetos, 1)

  const { rows: guardado } = await amb.pool.query('SELECT restauracao FROM contas_excluidas WHERE id = $1', [copia.id])
  for (const campo of ['foto', 'foto_public_id', 'password_reset_token_hash', 'admin']) {
    assert.ok(!(campo in guardado[0].restauracao), `${campo} não fica na cópia`)
  }

  const restaurar = await amb.api(`/api/admin/contas-excluidas/${copia.id}/restaurar`, { method: 'POST', token: dono.token })
  assert.equal(restaurar.status, 200, JSON.stringify(restaurar.body))
  assert.equal(restaurar.body.projetos, 1)

  const entrou = await login(autor.email)
  assert.equal(entrou.status, 200, 'mesmo e-mail e mesma senha')
  assert.equal(entrou.body.user.id, autor.id, 'mesmo id')

  const eu = await amb.api('/api/auth/me', { token: entrou.body.token })
  assert.equal(eu.body.user.bio, 'Minha bio')
  assert.equal(eu.body.user.foto, null, 'a foto foi apagada no encerramento')

  const minhas = await amb.api('/api/projects/mine', { token: entrou.body.token })
  assert.deepEqual(minhas.body.projects.map((projeto) => projeto.id), [obra])
  const imagens = await amb.api(`/api/projects/${obra}/imagens`, { token: entrou.body.token })
  assert.equal(imagens.body.images[0].id, imagem[0].id, 'a imagem volta com o mesmo id que o canvas usa')

  const likesDeVolta = await amb.pool.query('SELECT likes FROM projetos WHERE id = $1', [deOutro])
  assert.equal(likesDeVolta.rows[0].likes, 1, 'o like que a pessoa tinha dado volta a contar')

  const avisos = await amb.api('/api/avisos', { token: entrou.body.token })
  assert.match(avisos.body.avisos[0].mensagem, /restaurada por um administrador/)

  const deNovo = await amb.api(`/api/admin/contas-excluidas/${copia.id}/restaurar`, { method: 'POST', token: dono.token })
  assert.equal(deNovo.status, 404, 'a cópia saiu ao restaurar')
})

test('a conta excluída pela própria pessoa não pode ser reativada', async () => {
  const sai = await amb.criarConta(emailDeTeste('saiu'))
  await amb.api('/api/users/me', { method: 'DELETE', token: sai.token, body: { password: SENHA } })

  const lista = await amb.api('/api/admin/contas-excluidas', { token: dono.token })
  const copia = lista.body.contas.find((conta) => conta.usuario_id === sai.id)
  assert.equal(copia.restauravel, false)
  assert.equal(copia.excluida_por, null)

  const resposta = await amb.api(`/api/admin/contas-excluidas/${copia.id}/restaurar`, { method: 'POST', token: dono.token })
  assert.equal(resposta.status, 409)
  assert.match(resposta.body.message, /pela própria pessoa/)
})

test('não restaura por cima de um cadastro novo com o mesmo e-mail', async () => {
  const email = emailDeTeste('reusado')
  const antiga = await amb.criarConta(email)
  await amb.api(`/api/admin/usuarios/${antiga.id}`, { method: 'DELETE', token: dono.token })
  await amb.criarConta(email)

  const lista = await amb.api('/api/admin/contas-excluidas', { token: dono.token })
  const copia = lista.body.contas.find((conta) => conta.usuario_id === antiga.id)
  const resposta = await amb.api(`/api/admin/contas-excluidas/${copia.id}/restaurar`, { method: 'POST', token: dono.token })
  assert.equal(resposta.status, 409)
  assert.equal(resposta.body.message, 'O e-mail ou o id desta conta já está em uso por outra conta.')
})

test('administrador restaurado volta sem o acesso de administrador', async () => {
  const admin = await amb.criarConta(emailDeTeste('ex-admin'))
  await concederAdmin(admin.email)
  await amb.api(`/api/admin/usuarios/${admin.id}`, { method: 'DELETE', token: dono.token })

  const lista = await amb.api('/api/admin/contas-excluidas', { token: dono.token })
  const copia = lista.body.contas.find((conta) => conta.usuario_id === admin.id)
  await amb.api(`/api/admin/contas-excluidas/${copia.id}/restaurar`, { method: 'POST', token: dono.token })

  const entrou = await login(admin.email)
  const eu = await amb.api('/api/auth/me', { token: entrou.body.token })
  assert.equal(eu.body.user.admin, false)
})
