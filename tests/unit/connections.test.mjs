import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_DELAY,
  connectionAnchors,
  connectionsFrom,
  createConnection,
  delayOf,
  destinationKind,
  directionOf,
  pruneConnections,
  reverseTransition,
  triggerOf,
} from '../../client/src/canvas/connections.js'

const tela = (id, x, y, width = 100, height = 100) => ({ id, type: 'screen', x, y, width, height, name: id })
const forma = (id, x, y, width = 20, height = 20) => ({ id, type: 'rect', x, y, width, height })

test('RN-12: ligação só sobrevive entre elementos que existem', () => {
  const elements = [tela('t1', 0, 0), forma('a', 10, 10)]
  const ligacoes = [
    { id: 'c1', from: 'a', to: 't1' },
    { id: 'c2', from: 'sumiu', to: 't1' },
    { id: 'c3', from: 'a', to: 'sumiu' },
  ]

  assert.deepEqual(
    pruneConnections(ligacoes, elements).map((c) => c.id),
    ['c1'],
    'as que apontam para elemento removido caem',
  )
})

test('excluir a tela de destino poda a ligação que apontava para ela', () => {
  const antes = [tela('t1', 0, 0), tela('t2', 200, 0), forma('botao', 10, 10)]
  const ligacoes = [{ id: 'c1', from: 'botao', to: 't2' }]

  const depois = antes.filter((e) => e.id !== 't2')
  assert.deepEqual(pruneConnections(ligacoes, depois), [], 'não sobra seta solta no mapa')
})

test('o destino decide o que a ligação faz', () => {
  const t = tela('t1', 0, 0, 100, 100)
  const dentro = forma('d', 20, 20)
  const fora = forma('f', 500, 500)
  const elements = [t, dentro, fora]

  assert.equal(destinationKind(elements, t), 'screen', 'tela: navega')
  assert.equal(destinationKind(elements, dentro), 'focus', 'objeto numa tela: aproxima a câmera')
  assert.equal(destinationKind(elements, fora), 'overlay', 'objeto solto: abre por cima')
  assert.equal(destinationKind(elements, null), null)
})

test('voltar inverte o deslize e mantém o resto simétrico', () => {
  assert.equal(reverseTransition('slide-left'), 'slide-right')
  assert.equal(reverseTransition('slide-right'), 'slide-left')
  assert.equal(reverseTransition('slide-up'), 'slide-down')
  assert.equal(reverseTransition('slide-down'), 'slide-up')
  assert.equal(reverseTransition('dissolve'), 'dissolve')
  assert.equal(reverseTransition('smart'), 'smart')
  assert.equal(reverseTransition('instant'), 'instant')
})

test('ligação antiga, sem os campos novos, lê os padrões', () => {
  const antiga = { id: 'c1', from: 'a', to: 't1' }

  assert.equal(triggerOf(antiga), 'click')
  assert.equal(directionOf(antiga), 'down')
  assert.equal(delayOf(antiga), DEFAULT_DELAY)
})

test('delay de zero é respeitado, não trocado pelo padrão', () => {
  // Zero é um valor legítimo; só a ausência cai no padrão.
  assert.equal(delayOf({ delay: 0 }), 0)
  assert.equal(delayOf({ delay: 2500 }), 2500)
  assert.equal(delayOf({ delay: null }), DEFAULT_DELAY)
})

test('nova ligação nasce com clique e os padrões de transição', () => {
  const nova = createConnection('a', 't1')

  assert.equal(nova.from, 'a')
  assert.equal(nova.to, 't1')
  assert.equal(triggerOf(nova), 'click')
  assert.ok(nova.id.startsWith('cx-'), 'id distinguível do de elementos')
})

test('connectionsFrom filtra pela origem', () => {
  const ligacoes = [
    { id: 'c1', from: 'a', to: 't1' },
    { id: 'c2', from: 'a', to: 't2' },
    { id: 'c3', from: 'b', to: 't1' },
  ]
  assert.deepEqual(connectionsFrom(ligacoes, 'a').map((c) => c.id), ['c1', 'c2'])
  assert.deepEqual(connectionsFrom(ligacoes, 'z'), [])
})

test('a seta encosta na borda das caixas, não no centro delas', () => {
  const origem = { x: 0, y: 0, width: 100, height: 100 } // centro (50,50)
  const destino = { x: 300, y: 0, width: 100, height: 100 } // centro (350,50)

  const { start, end } = connectionAnchors(origem, destino)

  assert.deepEqual(start, { x: 100, y: 50 }, 'sai pela borda direita da origem')
  assert.deepEqual(end, { x: 300, y: 50 }, 'chega na borda esquerda do destino')
})

test('caixas sobrepostas não quebram o cálculo da seta', () => {
  const caixa = { x: 0, y: 0, width: 100, height: 100 }
  const { start, end } = connectionAnchors(caixa, caixa)

  // Mesmo centro: sem direção definida, cai no próprio centro em vez de NaN.
  for (const ponto of [start, end]) {
    assert.ok(Number.isFinite(ponto.x) && Number.isFinite(ponto.y), 'coordenada utilizável')
  }
})
