/*
 * Links de visualização e de colaboração (RF-18, RN-17 a RN-20) e a trava de
 * versão que impede duas pessoas de sobrescreverem o canvas uma da outra.
 *
 * O que o servidor precisa garantir sozinho: o link só abre enquanto vale,
 * o de visualização não dá direito de gravar, o de colaboração só dá a quem
 * aceitou, e só o dono gerencia links e colaboradores.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { emailDeTeste, iniciarAmbiente } from '../helpers/ambiente.mjs'

const amb = await iniciarAmbiente('compartilhamento')
test.after(() => amb.encerrar())

const dono = await amb.criarConta(emailDeTeste('dono'))
const convidado = await amb.criarConta(emailDeTeste('convidado'))
const estranho = await amb.criarConta(emailDeTeste('estranho'))

const UMA_TELA = {
  version: 2,
  elements: [{ id: 't1', type: 'screen', x: 0, y: 0, width: 300, height: 600, name: 'Início' }],
  connections: [],
  startScreen: 't1',
}

async function criarProjeto(token = dono.token) {
  const resposta = await amb.api('/api/projects', { method: 'POST', token, body: { titulo: 'Compartilhado' } })
  assert.equal(resposta.status, 201, JSON.stringify(resposta.body))
  return resposta.body.project
}

async function gerarLink(projetoId, tipo, horas = 24, token = dono.token) {
  const resposta = await amb.api(`/api/projects/${projetoId}/links`, { method: 'POST', token, body: { tipo, horas } })
  assert.equal(resposta.status, 201, JSON.stringify(resposta.body))
  return resposta.body.link
}

const gravar = (id, token, corpo) =>
  amb.api(`/api/projects/${id}/conteudo`, { method: 'PUT', token, body: { conteudo: UMA_TELA, ...corpo } })

const aceitar = (token, sessao = convidado.token) =>
  amb.api(`/api/convites/${token}/aceitar`, { method: 'POST', token: sessao })

/** Faz o link vencer sem esperar o relógio. */
const vencer = (linkId) =>
  amb.pool.query("UPDATE projeto_links SET expira_em = NOW() - INTERVAL '1 second' WHERE id = $1", [linkId])

test('o link gerado só aparece na resposta: o banco guarda o hash', async () => {
  const projeto = await criarProjeto()
  const link = await gerarLink(projeto.id, 'visualizacao')

  assert.ok(link.token.length >= 32, 'segredo longo')
  const { rows } = await amb.pool.query('SELECT token_hash FROM projeto_links WHERE id = $1', [link.id])
  assert.equal(rows[0].token_hash.length, 64)
  assert.notEqual(rows[0].token_hash, link.token)

  const lista = await amb.api(`/api/projects/${projeto.id}/compartilhamento`, { token: dono.token })
  assert.equal(lista.status, 200)
  assert.equal(lista.body.links.length, 1)
  assert.equal(lista.body.links[0].token, undefined, 'a lista nunca devolve o segredo')
})

test('RN-20: todo link vence, e só nos prazos curtos oferecidos', async () => {
  const projeto = await criarProjeto()

  for (const horas of [0, 2, 168, '24', null]) {
    const resposta = await amb.api(`/api/projects/${projeto.id}/links`, {
      method: 'POST',
      token: dono.token,
      body: { tipo: 'visualizacao', horas },
    })
    // null cai no padrão de 24 horas, como quem não escolheu nada.
    if (horas === null) assert.equal(resposta.status, 201)
    else assert.equal(resposta.status, 400, `recusa ${JSON.stringify(horas)}`)
  }

  const link = await gerarLink(projeto.id, 'visualizacao', 1)
  const horasAteVencer = (new Date(link.expira_em) - Date.now()) / 3_600_000
  assert.ok(horasAteVencer > 0.9 && horasAteVencer <= 1, `vence em ~1h (${horasAteVencer})`)

  const tipoInvalido = await amb.api(`/api/projects/${projeto.id}/links`, {
    method: 'POST',
    token: dono.token,
    body: { tipo: 'admin' },
  })
  assert.equal(tipoInvalido.status, 400)
})

test('só o dono gera, lista e revoga links (404 para os outros)', async () => {
  const projeto = await criarProjeto()
  const link = await gerarLink(projeto.id, 'colaboracao')

  for (const [method, caminho, body] of [
    ['POST', `/api/projects/${projeto.id}/links`, { tipo: 'visualizacao' }],
    ['GET', `/api/projects/${projeto.id}/compartilhamento`],
    ['DELETE', `/api/projects/${projeto.id}/links/${link.id}`],
  ]) {
    const resposta = await amb.api(caminho, { method, token: estranho.token, body })
    assert.equal(resposta.status, 404, `${method} ${caminho}`)
  }

  // Nem o colaborador gerencia: ele edita o canvas, não o acesso.
  await aceitar(link.token)
  const peloColaborador = await amb.api(`/api/projects/${projeto.id}/links`, {
    method: 'POST',
    token: convidado.token,
    body: { tipo: 'visualizacao' },
  })
  assert.equal(peloColaborador.status, 404)
})

test('RN-19: link de visualização mostra o canvas mas não permite gravar', async () => {
  const projeto = await criarProjeto()
  await gravar(projeto.id, dono.token)
  const link = await gerarLink(projeto.id, 'visualizacao')

  const aberto = await amb.api(`/api/convites/${link.token}`, { token: estranho.token })
  assert.equal(aberto.status, 200)
  assert.equal(aberto.body.convite.tipo, 'visualizacao')
  assert.deepEqual(aberto.body.convite.projeto.conteudo, UMA_TELA)
  assert.equal(aberto.body.convite.projeto.autor_email, undefined, 'o e-mail do dono não vai junto')

  // Ter visto pelo link não dá acesso ao editor.
  assert.equal((await amb.api(`/api/projects/${projeto.id}`, { token: estranho.token })).status, 404)
  assert.equal((await gravar(projeto.id, estranho.token)).status, 404)
  assert.equal((await aceitar(link.token, estranho.token)).status, 400, 'nem vira convite de edição')
})

test('RN-17: o link não publica o projeto', async () => {
  const projeto = await criarProjeto()
  await gravar(projeto.id, dono.token)
  const link = await gerarLink(projeto.id, 'visualizacao')
  await amb.api(`/api/convites/${link.token}`, { token: estranho.token })

  const vitrine = await amb.api('/api/projects', { token: estranho.token })
  assert.ok(!vitrine.body.projects.some((item) => item.id === projeto.id), 'fora da tela inicial')
  const leitura = await amb.api(`/api/projects/${projeto.id}/leitura`, { token: estranho.token })
  assert.equal(leitura.status, 404, 'a leitura pública continua recusando projeto privado')
})

test('link vencido, revogado ou inventado não abre nada', async () => {
  const projeto = await criarProjeto()
  const vencido = await gerarLink(projeto.id, 'colaboracao')
  const revogado = await gerarLink(projeto.id, 'visualizacao')
  await vencer(vencido.id)

  const revogar = await amb.api(`/api/projects/${projeto.id}/links/${revogado.id}`, {
    method: 'DELETE',
    token: dono.token,
  })
  assert.equal(revogar.status, 204)

  for (const token of [vencido.token, revogado.token, 'inventado']) {
    const aberto = await amb.api(`/api/convites/${token}`, { token: convidado.token })
    assert.equal(aberto.status, 404)
    assert.equal(aberto.body.message, 'Link inválido ou expirado.')
  }
  assert.equal((await aceitar(vencido.token)).status, 404, 'convite vencido não se aceita')

  const lista = await amb.api(`/api/projects/${projeto.id}/compartilhamento`, { token: dono.token })
  assert.equal(lista.body.links.length, 0, 'a lista mostra só os que ainda valem')
})

test('o link exige sessão', async () => {
  const projeto = await criarProjeto()
  const link = await gerarLink(projeto.id, 'visualizacao')
  assert.equal((await amb.api(`/api/convites/${link.token}`)).status, 401)
})

test('RN-18: colaboração só para quem aceitou, e continua depois de o link vencer', async () => {
  const projeto = await criarProjeto()
  const link = await gerarLink(projeto.id, 'colaboracao')

  const antes = await amb.api(`/api/convites/${link.token}`, { token: convidado.token })
  assert.equal(antes.body.convite.jaPodeEditar, false)
  assert.equal(antes.body.convite.projeto.conteudo, undefined, 'o convite não entrega o canvas')
  assert.equal((await gravar(projeto.id, convidado.token)).status, 404, 'sem aceitar não edita')

  const aceite = await aceitar(link.token)
  assert.equal(aceite.status, 200)
  assert.equal(aceite.body.projeto.id, projeto.id)
  assert.equal((await aceitar(link.token)).status, 200, 'aceitar de novo não falha nem duplica')
  const { rows } = await amb.pool.query('SELECT COUNT(*)::int AS n FROM projeto_colaboradores WHERE projeto_id = $1', [
    projeto.id,
  ])
  assert.equal(rows[0].n, 1)

  await vencer(link.id)

  const aberto = await amb.api(`/api/projects/${projeto.id}`, { token: convidado.token })
  assert.equal(aberto.status, 200)
  assert.equal(aberto.body.project.papel, 'colaborador')
  assert.equal((await gravar(projeto.id, convidado.token)).status, 200, 'o acesso não vence com o link')

  const compartilhados = await amb.api('/api/projects/compartilhados', { token: convidado.token })
  // O convidado colabora também em projetos de outros testes; o mais recente vem primeiro.
  assert.equal(compartilhados.body.projects[0].id, projeto.id)
  assert.ok(compartilhados.body.projects[0].autor_email, 'com o dono, para o cartão dizer de quem é')
})

test('colaborador edita o canvas, mas não publica, não edita os dados nem exclui', async () => {
  const projeto = await criarProjeto()
  await aceitar((await gerarLink(projeto.id, 'colaboracao')).token)
  await gravar(projeto.id, convidado.token)

  const tentativas = [
    ['PATCH', `/api/projects/${projeto.id}/status`, { status: 'publicado' }],
    ['PATCH', `/api/projects/${projeto.id}`, { titulo: 'Tomado' }],
    ['DELETE', `/api/projects/${projeto.id}`],
  ]
  for (const [method, caminho, body] of tentativas) {
    const resposta = await amb.api(caminho, { method, token: convidado.token, body })
    assert.equal(resposta.status, 404, `${method} ${caminho}`)
  }

  const { rows } = await amb.pool.query('SELECT titulo, status FROM projetos WHERE id = $1', [projeto.id])
  assert.deepEqual({ ...rows[0] }, { titulo: 'Compartilhado', status: 'privado' })

  const imagens = await amb.api(`/api/projects/${projeto.id}/imagens`, { token: convidado.token })
  assert.equal(imagens.status, 200, 'vê as imagens do canvas que edita')
})

test('o dono não aceita convite do próprio projeto', async () => {
  const projeto = await criarProjeto()
  const link = await gerarLink(projeto.id, 'colaboracao')

  const aberto = await amb.api(`/api/convites/${link.token}`, { token: dono.token })
  assert.equal(aberto.body.convite.jaPodeEditar, true)
  const resposta = await aceitar(link.token, dono.token)
  assert.equal(resposta.status, 400)
  assert.equal(resposta.body.message, 'Você já é o dono deste projeto.')
})

test('o dono remove colaborador, o colaborador pode sair, e mais ninguém tira ninguém', async () => {
  const projeto = await criarProjeto()
  const link = await gerarLink(projeto.id, 'colaboracao')
  await aceitar(link.token)
  await aceitar(link.token, estranho.token)

  const lista = await amb.api(`/api/projects/${projeto.id}/compartilhamento`, { token: dono.token })
  assert.equal(lista.body.colaboradores.length, 2)

  const porOutro = await amb.api(`/api/projects/${projeto.id}/colaboradores/${convidado.id}`, {
    method: 'DELETE',
    token: estranho.token,
  })
  assert.equal(porOutro.status, 404, 'um colaborador não tira o outro')

  const saiu = await amb.api(`/api/projects/${projeto.id}/colaboradores/${estranho.id}`, {
    method: 'DELETE',
    token: estranho.token,
  })
  assert.equal(saiu.status, 204)

  const removido = await amb.api(`/api/projects/${projeto.id}/colaboradores/${convidado.id}`, {
    method: 'DELETE',
    token: dono.token,
  })
  assert.equal(removido.status, 204)
  assert.equal((await amb.api(`/api/projects/${projeto.id}`, { token: convidado.token })).status, 404)
  assert.equal((await gravar(projeto.id, convidado.token)).status, 404)
})

test('quem grava com versão velha recebe 409 em vez de sobrescrever', async () => {
  const projeto = await criarProjeto()
  await aceitar((await gerarLink(projeto.id, 'colaboracao')).token)

  const abertoPeloDono = await amb.api(`/api/projects/${projeto.id}`, { token: dono.token })
  const versao = abertoPeloDono.body.project.versao
  assert.equal(versao, 0)

  const primeira = await gravar(projeto.id, convidado.token, { versao })
  assert.equal(primeira.status, 200)
  assert.equal(primeira.body.versao, 1)

  const atrasada = await gravar(projeto.id, dono.token, { versao })
  assert.equal(atrasada.status, 409)
  assert.equal(atrasada.body.message, 'Outra pessoa salvou este projeto enquanto você editava.')

  const consulta = await amb.api(`/api/projects/${projeto.id}/versao`, { token: dono.token })
  assert.deepEqual(consulta.body, { versao: 1 })

  // "Sobrescrever": sem versão grava de qualquer jeito.
  const forcada = await gravar(projeto.id, dono.token, {})
  assert.equal(forcada.status, 200)
  assert.equal(forcada.body.versao, 2)

  assert.equal((await gravar(projeto.id, dono.token, { versao: 'dois' })).status, 400)
  assert.equal((await gravar(projeto.id, estranho.token, { versao: 2 })).status, 404, 'sem acesso é 404, não 409')
})

test('excluir o projeto leva junto links e colaboradores', async () => {
  const projeto = await criarProjeto()
  const link = await gerarLink(projeto.id, 'colaboracao')
  await aceitar(link.token)

  await amb.api(`/api/projects/${projeto.id}`, { method: 'DELETE', token: dono.token })

  const links = await amb.pool.query('SELECT 1 FROM projeto_links WHERE projeto_id = $1', [projeto.id])
  const colaboradores = await amb.pool.query('SELECT 1 FROM projeto_colaboradores WHERE projeto_id = $1', [projeto.id])
  assert.equal(links.rows.length + colaboradores.rows.length, 0)
  assert.equal((await amb.api(`/api/convites/${link.token}`, { token: convidado.token })).status, 404)
})
