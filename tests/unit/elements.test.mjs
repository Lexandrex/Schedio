import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ALIGN,
  DEFAULT_FILL,
  alignPatches,
  duplicateElements,
  elementsInRect,
  movableItems,
  movePatches,
  topLevelIds,
  REORDER,
  TOOLS,
  boxOf,
  childrenOfScreen,
  clipsContent,
  createIcon,
  createId,
  createImage,
  createScreen,
  createShape,
  createText,
  duplicateElement,
  elementLabel,
  hasBox,
  isHidden,
  isInsideScreen,
  isLocked,
  normalizeRect,
  reorderElement,
  screenContaining,
  visibleElements,
} from '../../client/src/canvas/elements.js'

/* Formas e telas bastam aqui: texto precisaria medir fonte, o que exige navegador. */
const tela = (id, x, y, width = 200, height = 200, extra = {}) => ({
  id, type: 'screen', x, y, width, height, name: id, ...extra,
})
const forma = (id, x, y, width = 20, height = 20, extra = {}) => ({
  id, type: 'rect', x, y, width, height, ...extra,
})

test('pertence à tela quem tem o CENTRO dentro dela, não a caixa inteira', () => {
  const t = tela('t1', 0, 0, 100, 100)

  assert.equal(isInsideScreen(forma('a', 40, 40, 20, 20), t), true, 'inteiro dentro')
  // Centro em (95,50): dentro, mesmo com metade da forma para fora.
  assert.equal(isInsideScreen(forma('b', 85, 40, 20, 20), t), true, 'centro dentro, borda fora')
  // Centro em (115,50): fora, mesmo encostando na tela.
  assert.equal(isInsideScreen(forma('c', 105, 40, 20, 20), t), false, 'centro fora')
})

test('arrastar para dentro de outra tela transfere a posse, sem passo extra', () => {
  const t1 = tela('t1', 0, 0, 100, 100)
  const t2 = tela('t2', 200, 0, 100, 100)
  const movel = forma('m', 40, 40)

  let elements = [t1, t2, movel]
  assert.equal(screenContaining(elements, movel)?.id, 't1')

  // Só muda a posição — nada de campo de parentesco.
  const movido = { ...movel, x: 240, y: 40 }
  elements = [t1, t2, movido]
  assert.equal(screenContaining(elements, movido)?.id, 't2')
})

test('elemento fora de qualquer tela não tem dono', () => {
  const t = tela('t1', 0, 0, 100, 100)
  const solto = forma('s', 500, 500)
  assert.equal(screenContaining([t, solto], solto), null)
})

test('childrenOfScreen devolve o conteúdo na ordem de desenho e exclui telas', () => {
  const t = tela('t1', 0, 0, 100, 100)
  const outra = tela('t2', 10, 10, 50, 50) // tela dentro de tela não vira "filha"
  const a = forma('a', 10, 10)
  const b = forma('b', 30, 30)

  assert.deepEqual(
    childrenOfScreen([t, outra, a, b], t).map((e) => e.id),
    ['a', 'b'],
  )
})

test('tela sem o campo clip recorta — projeto antigo passa a recortar sem migração', () => {
  assert.equal(clipsContent(tela('t', 0, 0)), true)
  assert.equal(clipsContent(tela('t', 0, 0, 200, 200, { clip: false })), false)
  assert.equal(clipsContent(tela('t', 0, 0, 200, 200, { clip: true })), true)
})

test('normalizeRect aceita arrasto em qualquer direção', () => {
  const esperado = { x: 10, y: 20, width: 30, height: 40 }
  assert.deepEqual(normalizeRect(10, 20, 40, 60), esperado)
  assert.deepEqual(normalizeRect(40, 60, 10, 20), esperado, 'arrastado para trás')
  assert.deepEqual(normalizeRect(40, 20, 10, 60), esperado, 'arrastado na diagonal invertida')
})

test('elemento oculto some do desenho', () => {
  const lista = [forma('a', 0, 0), forma('b', 0, 0, 20, 20, { hidden: true }), forma('c', 0, 0)]
  assert.deepEqual(visibleElements(lista).map((e) => e.id), ['a', 'c'])
})

test('reordenar anda uma posição e não sai das pontas', () => {
  const lista = [forma('a', 0, 0), forma('b', 0, 0), forma('c', 0, 0)]
  const nomes = (l) => l.map((e) => e.id)

  assert.deepEqual(nomes(reorderElement(lista, 'a', REORDER.frente)), ['b', 'a', 'c'])
  assert.deepEqual(nomes(reorderElement(lista, 'c', REORDER.tras)), ['a', 'c', 'b'])
  assert.deepEqual(nomes(reorderElement(lista, 'a', REORDER.topo)), ['b', 'c', 'a'])
  assert.deepEqual(nomes(reorderElement(lista, 'c', REORDER.fundo)), ['c', 'a', 'b'])

  // Já está na ponta: devolve o mesmo array, sem cópia desnecessária.
  assert.equal(reorderElement(lista, 'a', REORDER.tras), lista)
  assert.equal(reorderElement(lista, 'c', REORDER.frente), lista)
  assert.equal(reorderElement(lista, 'inexistente', REORDER.frente), lista)
})

test('reordenar dentro de uma tela não mexe na ordem de outra', () => {
  const t1 = tela('t1', 0, 0, 100, 100)
  const t2 = tela('t2', 200, 0, 100, 100)
  const a1 = forma('a1', 10, 10)
  const b1 = forma('b1', 30, 30)
  const a2 = forma('a2', 210, 10)

  const lista = [t1, t2, a1, a2, b1]
  const depois = reorderElement(lista, 'a1', REORDER.frente)

  // a1 trocou de lugar com b1 (irmão na mesma tela), pulando a2, que é de outra.
  assert.deepEqual(depois.map((e) => e.id), ['t1', 't2', 'b1', 'a2', 'a1'])
})

test('duplicar guarda origemId — é o que a transição inteligente pareia', () => {
  const [copia] = duplicateElement([forma('a', 10, 10)], 'a')

  assert.notEqual(copia.id, 'a', 'a cópia ganha id próprio')
  assert.equal(copia.origemId, 'a')
  assert.deepEqual([copia.x, copia.y], [26, 26], 'deslocada para não nascer em cima')
})

test('duplicar de novo mantém a origem do primeiro, não da cópia', () => {
  const original = forma('a', 10, 10)
  const [copia1] = duplicateElement([original], 'a')
  const [copia2] = duplicateElement([copia1], copia1.id)

  assert.equal(copia2.origemId, 'a', 'a corrente toda aponta para o elemento raiz')
})

test('duplicar tela leva o conteúdo junto, com o mesmo deslocamento', () => {
  const t = tela('t1', 0, 0, 100, 100)
  const dentro = forma('d', 20, 20)
  const fora = forma('f', 500, 500)

  const copias = duplicateElement([t, dentro, fora], 't1')

  assert.equal(copias.length, 2, 'a tela e o que está dentro dela')
  const [novaTela, novoConteudo] = copias
  assert.deepEqual([novaTela.x, novaTela.y], [16, 16])
  assert.deepEqual([novoConteudo.x, novoConteudo.y], [36, 36], 'mesma geometria relativa')
  assert.equal(novoConteudo.origemId, 'd')
})

test('só a tela duplicada ganha " cópia" no nome; o conteúdo mantém o dele', () => {
  const t = { ...tela('t1', 0, 0, 100, 100), name: 'Login' }
  const dentro = { ...forma('d', 20, 20), name: 'Botão' }

  const [novaTela, novoConteudo] = duplicateElement([t, dentro], 't1')

  assert.equal(novaTela.name, 'Login cópia')
  // Manter o nome é o que faz a transição inteligente parear sem o usuário nomear nada.
  assert.equal(novoConteudo.name, 'Botão')
})

test('duplicar id inexistente não cria nada', () => {
  assert.deepEqual(duplicateElement([forma('a', 0, 0)], 'nao-existe'), [])
})

test('cada elemento criado ganha um id próprio', () => {
  const ids = new Set(Array.from({ length: 50 }, () => createId()))
  assert.equal(ids.size, 50)
})

test('retângulo nasce arredondado; elipse, não', () => {
  const ret = createShape(TOOLS.rect, 1, 2, 30, 40)
  const eli = createShape(TOOLS.ellipse, 1, 2, 30, 40)

  assert.deepEqual([ret.x, ret.y, ret.width, ret.height], [1, 2, 30, 40])
  assert.equal(ret.radius, 8)
  assert.equal(eli.radius, 0)
  assert.equal(ret.fill, DEFAULT_FILL)
  assert.equal(ret.opacity, 1)
})

test('texto novo se ajusta ao conteúdo: sem largura nem altura', () => {
  const texto = createText(5, 6)

  assert.equal(texto.type, TOOLS.text)
  assert.equal(texto.text, 'Novo texto')
  assert.equal(texto.width, null)
  assert.equal(texto.height, null)
})

test('tela nova recorta o conteúdo e tem nome padrão', () => {
  const semNome = createScreen(0, 0, 360, 640)
  const comNome = createScreen(0, 0, 360, 640, 'Login')

  assert.equal(semNome.name, 'Tela')
  assert.equal(comNome.name, 'Login')
  assert.equal(clipsContent(semNome), true)
})

test('imagem guarda a URL e o id da linha em `imagens`; ícone copia o desenho', () => {
  const imagem = createImage(0, 0, 100, 50, 'https://exemplo.test/a.png', 7)
  const icone = createIcon(0, 0, 24, 'casa', 'M0 0h24')

  assert.equal(imagem.src, 'https://exemplo.test/a.png')
  assert.equal(imagem.imageId, 7)
  assert.deepEqual([icone.width, icone.height], [24, 24], 'ícone é quadrado')
  assert.equal(icone.path, 'M0 0h24')
})

test('só texto não tem caixa explícita', () => {
  assert.equal(hasBox(createShape(TOOLS.rect, 0, 0, 1, 1)), true)
  assert.equal(hasBox(createScreen(0, 0, 1, 1)), true)
  assert.equal(hasBox(createImage(0, 0, 1, 1, '', 1)), true)
  assert.equal(hasBox(createIcon(0, 0, 1, 'x', '')), true)
  assert.equal(hasBox(createText(0, 0)), false)
  assert.deepEqual(boxOf(forma('a', 3, 4, 5, 6)), { x: 3, y: 4, width: 5, height: 6 })
})

test('rótulo na lista de camadas: apelido, conteúdo e, por último, o tipo', () => {
  assert.equal(elementLabel({ ...forma('a', 0, 0), name: 'Botão' }), 'Botão')
  assert.equal(elementLabel({ type: 'text', text: 'Primeira linha\nsegunda' }), 'Primeira linha')
  assert.equal(elementLabel({ type: 'text', text: 'x'.repeat(40) }), 'x'.repeat(28), 'corta textos longos')
  assert.equal(elementLabel({ type: 'text', text: '   ' }), 'Texto')
  assert.equal(elementLabel({ type: 'icon', nome: 'casa' }), 'casa')
  assert.equal(elementLabel({ type: 'icon' }), 'Ícone')
  assert.equal(elementLabel({ type: 'ellipse' }), 'Elipse')
  assert.equal(elementLabel({ type: 'desconhecido' }), 'desconhecido')
})

test('oculto e travado só valem quando marcados explicitamente', () => {
  assert.equal(isHidden({ hidden: true }), true)
  assert.equal(isHidden({ hidden: 'sim' }), false)
  assert.equal(isLocked({ locked: true }), true)
  assert.equal(isLocked({}), false)
})

test('topo e fundo levam até a ponta; direção inválida não mexe', () => {
  const t = tela('t1', 0, 0, 100, 100)
  const a = forma('a', 10, 10)
  const b = forma('b', 20, 20)
  const c = forma('c', 30, 30)
  const elements = [t, a, b, c]

  assert.deepEqual(reorderElement(elements, 'a', REORDER.topo).map((e) => e.id), ['t1', 'b', 'c', 'a'])
  assert.deepEqual(reorderElement(elements, 'c', REORDER.fundo).map((e) => e.id), ['t1', 'c', 'a', 'b'])
  assert.equal(reorderElement(elements, 'a', 'para-o-lado'), elements)
  assert.equal(reorderElement(elements, 'nao-existe', REORDER.topo), elements)
})

test('telas se reordenam entre telas, sem misturar com o conteúdo', () => {
  const t1 = tela('t1', 0, 0)
  const t2 = tela('t2', 500, 0)
  const dentro = forma('d', 10, 10)

  const proximo = reorderElement([t1, dentro, t2], 't1', REORDER.frente)

  assert.deepEqual(proximo.map((e) => e.id), ['t2', 'd', 't1'])
})


/* Seleção de vários objetos (RF-21) */

test('retângulo de seleção: formas que tocam entram, telas só se couberem inteiras', () => {
  const elementos = [
    tela('t1', 0, 0, 100, 100),
    forma('dentro', 10, 10),
    forma('borda', 95, 95, 20, 20),
    forma('longe', 300, 300),
    forma('travada', 20, 20, 10, 10, { locked: true }),
    forma('oculta', 20, 20, 10, 10, { hidden: true }),
  ]

  // Puxado dentro da tela: pega o conteúdo, não a tela.
  assert.deepEqual(elementsInRect(elementos, { x: 5, y: 5, width: 100, height: 100 }), ['dentro', 'borda'])
  // Envolvendo a tela inteira: agora ela entra.
  assert.deepEqual(elementsInRect(elementos, { x: -1, y: -1, width: 120, height: 120 }), ['t1', 'dentro', 'borda'])
  assert.deepEqual(elementsInRect(elementos, { x: 500, y: 500, width: 10, height: 10 }), [])
})

test('seleção sem redundância: conteúdo de tela selecionada sai, ordem fica', () => {
  const elementos = [tela('t1', 0, 0), forma('filho', 10, 10), forma('solto', 500, 500)]

  assert.deepEqual(topLevelIds(elementos, ['solto', 'filho', 't1']), ['solto', 't1'])
  assert.deepEqual(topLevelIds(elementos, ['filho', 'solto']), ['filho', 'solto'], 'sem a tela, o filho fica')
  assert.deepEqual(topLevelIds(elementos, ['sumiu', 'solto']), ['solto'])
})

test('mover a seleção: cada um uma vez, tela leva o conteúdo, travado fica', () => {
  const elementos = [
    tela('t1', 0, 0),
    forma('filho', 10, 10),
    forma('filho-travado', 30, 30, 20, 20, { locked: true }),
    forma('solto', 500, 500),
    forma('travado', 600, 600, 20, 20, { locked: true }),
  ]

  const itens = movableItems(elementos, ['t1', 'filho', 'solto', 'travado'])
  assert.deepEqual(itens.map((item) => item.id).sort(), ['filho', 'solto', 't1'])
  assert.deepEqual(movePatches(itens, 5, -2.6), {
    t1: { x: 5, y: -3 },
    filho: { x: 15, y: 7 },
    solto: { x: 505, y: 497 },
  })
})

test('duplicar vários: tela vem com o conteúdo, e as cópias diretas viram a seleção', () => {
  const elementos = [tela('t1', 0, 0), forma('filho', 10, 10), forma('solto', 500, 500)]

  const { novos, selecao } = duplicateElements(elementos, ['t1', 'filho', 'solto'])
  assert.equal(novos.length, 3, 'tela + filho + solto, sem copiar o filho duas vezes')
  assert.equal(selecao.length, 2)
  const porId = new Map(novos.map((item) => [item.id, item]))
  assert.equal(porId.get(selecao[0]).origemId, 't1')
  assert.equal(porId.get(selecao[1]).origemId, 'solto')
})

test('alinhar pela caixa que envolve todos; tela leva o conteúdo', () => {
  const elementos = [
    forma('a', 0, 0, 20, 20),
    forma('b', 100, 50, 40, 10),
    tela('t', 10, 200, 100, 100),
    forma('dentro', 20, 210, 10, 10),
  ]
  const todos = ['a', 'b', 't']

  assert.deepEqual(alignPatches(elementos, todos, ALIGN.esquerda), {
    b: { x: 0, y: 50 },
    t: { x: 0, y: 200 },
    dentro: { x: 10, y: 210 },
  })
  // Caixa de x 0 a 140: as direitas vão a 140.
  assert.deepEqual(alignPatches(elementos, ['a', 'b'], ALIGN.direita), { a: { x: 120, y: 0 } })
  // Caixa de y 0 a 60 (a e b): meio em 30.
  assert.deepEqual(alignPatches(elementos, ['a', 'b'], ALIGN.meio), { a: { x: 0, y: 20 }, b: { x: 100, y: 25 } })
  assert.deepEqual(alignPatches(elementos, ['a'], ALIGN.topo), {}, 'um só não se alinha')
  assert.deepEqual(
    alignPatches([...elementos, forma('fixa', 900, 900, 20, 20, { locked: true })], ['a', 'fixa'], ALIGN.topo),
    {},
    'travado não conta nem se move',
  )
})
