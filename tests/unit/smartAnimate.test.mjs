import test from 'node:test'
import assert from 'node:assert/strict'

import { easeInOutCubic, mixFrames } from '../../client/src/canvas/smartAnimate.js'
import { BACKDROP_OPACITY } from '../../client/src/canvas/playerFrame.js'

/*
 * Os quadros aqui têm a forma de `composeFrame`, montados à mão: o que está em
 * teste é só a mistura, não a composição (que tem os próprios testes).
 */
const quadro = (screenId, items, extra = {}) => ({
  screen: { id: screenId, width: 200, height: 100, fill: '#000000', radius: 0 },
  camera: { x: 0, y: 0, width: 200, height: 100 },
  overlayId: null,
  items,
  ...extra,
})
const naTela = (element) => ({ layer: 'screen', element })
const naSobreposicao = (element) => ({ layer: 'overlay', element })
const forma = (id, extra = {}) => ({
  id, type: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#000000', stroke: '#000000', ...extra,
})
const porChave = (lista) => Object.fromEntries(lista.map((item) => [item.key, item.element]))

test('easing começa e termina parado e passa pelo meio em 0,5', () => {
  assert.equal(easeInOutCubic(0), 0)
  assert.equal(easeInOutCubic(1), 1)
  assert.equal(easeInOutCubic(0.5), 0.5)
  assert.ok(easeInOutCubic(0.25) < 0.25, 'acelera no começo')
  assert.ok(easeInOutCubic(0.75) > 0.75, 'desacelera no fim')
})

test('na mesma tela pareia por id: o conteúdo fica e só a câmera anda', () => {
  const botao = forma('b', { x: 50, y: 20 })
  const de = quadro('t1', [naTela(botao)])
  const para = quadro('t1', [naTela(botao)], { camera: { x: 40, y: 10, width: 100, height: 50 } })

  const meio = mixFrames(de, para, 0.5)

  assert.equal(meio.below.length, 1, 'sem esmaecimento cruzado')
  assert.equal(meio.below[0].key, 'b')
  assert.equal(meio.below[0].element.x, 50)
  assert.deepEqual(meio.camera, { x: 20, y: 5, width: 150, height: 75 })
})

test('entre telas, pareia pelo nome da camada e interpola posição, cor e opacidade', () => {
  const de = quadro('t1', [naTela(forma('a', { name: 'Botão', x: 0, fill: '#000000', opacity: 0 }))])
  const para = quadro('t2', [naTela(forma('z', { name: 'Botão', x: 100, fill: '#ffffff', opacity: 1 }))])

  const [par] = mixFrames(de, para, 0.5).below

  assert.equal(par.key, 'z', 'a chave é a do destino')
  assert.equal(par.element.x, 50)
  assert.equal(par.element.fill, '#808080')
  assert.equal(par.element.opacity, 0.5)
})

test('sem nome, pareia pela origem de duplicação', () => {
  const de = quadro('t1', [naTela(forma('a', { x: 0 }))])
  const para = quadro('t2', [naTela(forma('copia', { origemId: 'a', x: 40 }))])

  const lista = mixFrames(de, para, 0.25).below

  assert.equal(lista.length, 1)
  assert.equal(lista[0].element.x, 10)
})

test('nome repetido é ambíguo: ninguém pareia e os dois esmaecem', () => {
  const de = quadro('t1', [
    naTela(forma('a1', { name: 'Card' })),
    naTela(forma('a2', { name: 'Card' })),
  ])
  const para = quadro('t2', [naTela(forma('b1', { name: 'Card', x: 90 }))])

  const lista = porChave(mixFrames(de, para, 0.5).below)

  assert.deepEqual(Object.keys(lista).sort(), ['b1', 'de:a1', 'de:a2'])
  assert.equal(lista['de:a1'].opacity, 0.5, 'quem sai some aos poucos')
  assert.equal(lista.b1.opacity, 0.5, 'quem entra aparece aos poucos')
  assert.equal(lista.b1.x, 90, 'quem entra não se mexe')
})

test('mesmo nome mas tipo diferente não pareia', () => {
  const de = quadro('t1', [naTela(forma('a', { name: 'X' }))])
  const para = quadro('t2', [naTela(forma('b', { name: 'X', type: 'ellipse' }))])

  const chaves = mixFrames(de, para, 0.5).below.map((item) => item.key)

  assert.deepEqual(chaves, ['de:a', 'b'], 'quem sai desenha por baixo de quem chega')
})

test('texto que muda de conteúdo vira esmaecimento cruzado na mesma geometria', () => {
  const texto = (id, text, x) => ({ id, type: 'text', name: 'Título', text, x, y: 0, width: null, fontSize: 20 })
  const de = quadro('t1', [naTela(texto('a', 'Olá', 0))])
  const para = quadro('t2', [naTela(texto('b', 'Tchau', 100))])

  const lista = porChave(mixFrames(de, para, 0.25).below)

  assert.equal(lista['de:a'].text, 'Olá', 'o antigo mantém o próprio texto')
  assert.equal(lista.b.text, 'Tchau')
  assert.equal(lista['de:a'].x, 25, 'os dois na posição interpolada')
  assert.equal(lista.b.x, 25)
  assert.equal(lista['de:a'].opacity, 0.75)
  assert.equal(lista.b.opacity, 0.25)
})

test('formatação igual compara pelo conteúdo, não pela referência', () => {
  const runs = () => [{ start: 0, end: 2, fill: '#ff0000' }]
  const texto = (id, x) => ({ id, type: 'text', name: 'T', text: 'Oi', runs: runs(), x, y: 0, fontSize: 20 })
  const de = quadro('t1', [naTela(texto('a', 0))])
  const para = quadro('t2', [naTela(texto('b', 10))])

  assert.equal(mixFrames(de, para, 0.5).below.length, 1, 'mesmos trechos: só interpola')
})

test('cor que não é hexadecimal troca na metade; hexadecimal curto é aceito', () => {
  const de = quadro('t1', [naTela(forma('a', { name: 'F', fill: 'none', stroke: '#000' }))])
  const para = quadro('t2', [naTela(forma('b', { name: 'F', fill: '#ffffff', stroke: '#fff' }))])

  const antes = mixFrames(de, para, 0.4).below[0].element
  const depois = mixFrames(de, para, 0.6).below[0].element

  assert.equal(antes.fill, 'none')
  assert.equal(depois.fill, '#ffffff')
  assert.equal(antes.stroke, '#666666')
})

test('texto sem largura e com largura não têm meio-termo: troca na metade', () => {
  const de = quadro('t1', [naTela(forma('a', { name: 'F', width: null }))])
  const para = quadro('t2', [naTela(forma('b', { name: 'F', width: 80 }))])

  assert.equal(mixFrames(de, para, 0.4).below[0].element.width, null)
  assert.equal(mixFrames(de, para, 0.6).below[0].element.width, 80)
})

test('a tela em si interpola tamanho, cor e raio', () => {
  const de = quadro('t1', [])
  const para = quadro('t2', [], {
    screen: { id: 't2', width: 400, height: 300, fill: '#ffffff', radius: 8 },
  })

  const { screen } = mixFrames(de, para, 0.5)

  assert.deepEqual(screen, { id: 't2', width: 300, height: 200, fill: '#808080', radius: 4 })
})

test('sobreposição desliza para dentro e acende o véu', () => {
  const cartao = forma('card', { x: 20, y: 10 })
  const de = quadro('t1', [])
  const para = quadro('t1', [naSobreposicao(cartao)], { overlayId: 'card' })

  const meio = mixFrames(de, para, 0.5, 'slide-left')

  assert.equal(meio.above.length, 1)
  assert.equal(meio.above[0].element.x, 20 + 200 * 0.5, 'vem da direita, uma tela de distância')
  assert.equal(meio.above[0].element.y, 10)
  assert.equal(meio.backdrop, BACKDROP_OPACITY / 2)
})

test('sobreposição que sai desliza para fora no sentido oposto', () => {
  const cartao = forma('card', { x: 20, y: 10 })
  const de = quadro('t1', [naSobreposicao(cartao)], { overlayId: 'card' })
  const outra = forma('outra')
  const para = quadro('t1', [naSobreposicao(outra)], { overlayId: 'outra' })

  const lista = porChave(mixFrames(de, para, 0.5, 'slide-down').above)

  assert.equal(lista['de:card'].y, 10 + 100 * 0.5, 'slide-down: quem sai vai para baixo')
  assert.equal(lista.outra.y, 0 - 100 * 0.5, 'quem entra vem de cima')
  assert.equal(mixFrames(de, para, 0.5, 'slide-down').backdrop, BACKDROP_OPACITY, 'o véu fica aceso')
})

test('sem deslize, a sobreposição esmaece e a mesma sobreposição pareia consigo', () => {
  const cartao = forma('card', { opacity: 0.8 })
  const aberto = quadro('t1', [naSobreposicao(cartao)], { overlayId: 'card' })
  const fechado = quadro('t1', [])

  const fechando = mixFrames(aberto, fechado, 0.5, 'dissolve')
  assert.equal(fechando.above[0].key, 'de:card')
  assert.equal(fechando.above[0].element.opacity, 0.4)
  assert.equal(fechando.backdrop, BACKDROP_OPACITY / 2)

  const parado = mixFrames(aberto, aberto, 0.5, 'slide-up')
  assert.equal(parado.above.length, 1)
  assert.equal(parado.above[0].key, 'card', 'pareada: não desliza')
  assert.equal(parado.above[0].element.x, 0)
})

test('deslize para a direita e para cima também têm sentido próprio', () => {
  const cartao = forma('card', { x: 0, y: 0 })
  const vazio = quadro('t1', [])
  const aberto = quadro('t1', [naSobreposicao(cartao)], { overlayId: 'card' })

  assert.equal(mixFrames(vazio, aberto, 0, 'slide-right').above[0].element.x, -200)
  assert.equal(mixFrames(vazio, aberto, 0, 'slide-up').above[0].element.y, 100)
})
