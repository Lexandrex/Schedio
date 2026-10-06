import test from 'node:test'
import assert from 'node:assert/strict'

import {
  BACKDROP_OPACITY,
  composeFrame,
  createParada,
  flattenFrame,
  overlayMembers,
  sameParada,
} from '../../client/src/canvas/playerFrame.js'

const tela = (id, x, y, width = 300, height = 600) => ({
  id, type: 'screen', x, y, width, height, name: id, fill: '#000', radius: 0,
})
const forma = (id, x, y, width = 40, height = 40) => ({ id, type: 'rect', x, y, width, height })

test('o quadro usa coordenadas RELATIVAS à tela', () => {
  // A tela mora longe da origem do mapa; o conteúdo precisa chegar em 0,0.
  const t = tela('t1', 1000, 500)
  const dentro = forma('d', 1040, 560)

  const frame = composeFrame(createParada('t1'), [t, dentro])

  assert.deepEqual(
    [frame.items[0].element.x, frame.items[0].element.y],
    [40, 60],
    'é isso que permite a transição inteligente comparar telas diferentes',
  )
})

test('parada sem tela válida não produz quadro', () => {
  const t = tela('t1', 0, 0)
  assert.equal(composeFrame(createParada('nao-existe'), [t]), null)
  // Apontar para um elemento que não é tela também não vale.
  assert.equal(composeFrame(createParada('d'), [t, forma('d', 10, 10)]), null)
})

test('só o conteúdo da tela entra no quadro', () => {
  const t = tela('t1', 0, 0, 300, 600)
  const dentro = forma('d', 10, 10)
  const fora = forma('f', 5000, 5000)

  const frame = composeFrame(createParada('t1'), [t, dentro, fora])
  assert.deepEqual(frame.items.map((i) => i.element.id), ['d'])
})

test('sem foco, a câmera enquadra a tela inteira', () => {
  const t = tela('t1', 0, 0, 300, 600)
  const frame = composeFrame(createParada('t1'), [t, forma('d', 10, 10)])

  assert.deepEqual(frame.camera, { x: 0, y: 0, width: 300, height: 600 })
})

test('com foco, a câmera aproxima sem sair da tela nem mudar de proporção', () => {
  const t = tela('t1', 0, 0, 300, 600)
  const alvo = forma('a', 10, 10, 40, 40)

  const frame = composeFrame({ screenId: 't1', focusId: 'a', overlayId: null }, [t, alvo])
  const { camera } = frame

  assert.ok(camera.width < 300, 'aproximou')
  assert.ok(camera.x >= 0 && camera.y >= 0, 'não saiu pela esquerda/topo')
  assert.ok(camera.x + camera.width <= 300 + 1e-9, 'não saiu pela direita')
  assert.ok(camera.y + camera.height <= 600 + 1e-9, 'não saiu por baixo')
  assert.ok(
    Math.abs(camera.width / camera.height - 300 / 600) < 1e-9,
    'mantém a proporção da tela, senão o palco mudaria de formato',
  )
})

test('a câmera não aproxima além do limite, mesmo num alvo minúsculo', () => {
  const t = tela('t1', 0, 0, 400, 800)
  const minusculo = forma('m', 200, 400, 1, 1)

  const { camera } = composeFrame({ screenId: 't1', focusId: 'm', overlayId: null }, [t, minusculo])

  // MAX_ZOOM = 4: a largura não pode ficar menor que a da tela dividida por 4.
  assert.ok(camera.width >= 400 / 4 - 1e-9, 'um ícone pequeno não vira a tela inteira')
})

test('a sobreposição abre junto com o que está empilhado sobre ela', () => {
  const t = tela('t1', 0, 0)
  // Cartão fora de qualquer tela, com um texto por cima (desenhado depois).
  const cartao = forma('cartao', 2000, 2000, 200, 120)
  const dentroDoCartao = forma('rotulo', 2050, 2040, 60, 20)
  const outroSolto = forma('outro', 9000, 9000)

  const membros = overlayMembers([t, cartao, dentroDoCartao, outroSolto], cartao)

  assert.deepEqual(membros.map((e) => e.id), ['cartao', 'rotulo'], 'o cartão abre inteiro')
})

test('a sobreposição não arrasta quem foi desenhado ANTES dela', () => {
  const t = tela('t1', 0, 0)
  const atras = forma('atras', 2050, 2040, 60, 20)
  const cartao = forma('cartao', 2000, 2000, 200, 120)

  // `atras` está dentro da caixa, mas vem antes na ordem de desenho.
  const membros = overlayMembers([t, atras, cartao], cartao)
  assert.deepEqual(membros.map((e) => e.id), ['cartao'])
})

test('a sobreposição entra numa camada própria e acende o véu', () => {
  const t = tela('t1', 0, 0, 300, 600)
  const dentro = forma('d', 10, 10)
  const cartao = forma('cartao', 2000, 2000, 200, 120)

  const frame = composeFrame({ screenId: 't1', focusId: null, overlayId: 'cartao' }, [t, dentro, cartao])
  const plano = flattenFrame(frame)

  assert.deepEqual(plano.below.map((i) => i.key), ['d'], 'o conteúdo da tela fica embaixo')
  assert.deepEqual(plano.above.map((i) => i.key), ['cartao'], 'a sobreposição fica por cima')
  assert.equal(plano.backdrop, BACKDROP_OPACITY)
})

test('sem sobreposição não há véu', () => {
  const t = tela('t1', 0, 0)
  const plano = flattenFrame(composeFrame(createParada('t1'), [t, forma('d', 10, 10)]))

  assert.equal(plano.backdrop, 0)
  assert.deepEqual(plano.above, [])
})

test('a sobreposição é centralizada no que está visível, não na tela inteira', () => {
  const t = tela('t1', 0, 0, 300, 600)
  const alvo = forma('a', 10, 10, 40, 40)
  const cartao = forma('cartao', 2000, 2000, 100, 100)

  const frame = composeFrame({ screenId: 't1', focusId: 'a', overlayId: 'cartao' }, [t, alvo, cartao])
  const posto = frame.items.find((i) => i.layer === 'overlay').element
  const { camera } = frame

  // Com a câmera aproximada, o centro da tela pode estar fora de vista.
  assert.ok(Math.abs(posto.x + 50 - (camera.x + camera.width / 2)) < 1e-6, 'centrado na câmera em X')
  assert.ok(Math.abs(posto.y + 50 - (camera.y + camera.height / 2)) < 1e-6, 'centrado na câmera em Y')
})

test('sameParada compara as três partes', () => {
  const base = { screenId: 't1', focusId: null, overlayId: null }

  assert.equal(sameParada(base, { ...base }), true)
  assert.equal(sameParada(base, { ...base, screenId: 't2' }), false)
  assert.equal(sameParada(base, { ...base, focusId: 'a' }), false)
  assert.equal(sameParada(base, { ...base, overlayId: 'c' }), false)
})
