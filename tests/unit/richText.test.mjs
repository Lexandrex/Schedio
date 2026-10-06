import test from 'node:test'
import assert from 'node:assert/strict'

import { formatText, replaceText, selectedRange, selectionStyle } from '../../client/src/canvas/richText.js'

/** Texto simples, sem formatação mista. */
const texto = (text, extra = {}) => ({
  id: 't', type: 'text', x: 0, y: 0,
  text, fontSize: 20, fill: '#ffffff', fontWeight: 'normal',
  ...extra,
})

test('sem formatação mista, o campo runs nem existe', () => {
  const resultado = formatText(texto('Palavra'), null, { fill: '#ff0000' })

  assert.equal(resultado.fill, '#ff0000', 'muda o elemento inteiro')
  assert.equal(resultado.runs, undefined, 'documento antigo continua sem runs')
})

test('formatar uma faixa cria o trecho só para ela', () => {
  const { runs } = formatText(texto('Palavra'), { start: 0, end: 3 }, { fill: '#ff0000' })

  assert.equal(runs.length, 1)
  assert.deepEqual(
    { start: runs[0].start, end: runs[0].end, fill: runs[0].fill },
    { start: 0, end: 3, fill: '#ff0000' },
  )
})

test('o trecho guarda só o que difere do elemento', () => {
  const { runs } = formatText(texto('Palavra'), { start: 0, end: 3 }, { fontSize: 40 })

  // Nada de repetir fill/fontWeight iguais aos do elemento.
  assert.deepEqual(Object.keys(runs[0]).sort(), ['end', 'fontSize', 'start'])
})

test('formatar a faixa com o MESMO valor do elemento não cria trecho', () => {
  const { runs } = formatText(texto('Palavra'), { start: 0, end: 3 }, { fill: '#ffffff' })
  assert.equal(runs, undefined, 'igual à base não é diferença')
})

test('selecionar o texto inteiro vale como "sem seleção": muda o elemento', () => {
  const elemento = texto('Palavra')
  const resultado = formatText(elemento, { start: 0, end: 7 }, { fill: '#ff0000' })

  assert.equal(resultado.fill, '#ff0000', 'foi para o elemento, não para um trecho')
  assert.equal(selectedRange(elemento, { start: 0, end: 7 }), null)
})

test('mudar o elemento apaga aquela propriedade dos trechos — ninguém fica de fora', () => {
  const comTrecho = texto('Palavra', { runs: [{ start: 0, end: 3, fill: '#ff0000', fontSize: 40 }] })
  const { runs } = formatText(comTrecho, null, { fill: '#00ff00' })

  // A cor do trecho some (todos ficam verdes); o tamanho dele permanece.
  const trecho = runs.find((r) => r.start === 0)
  assert.equal(trecho.fill, undefined, 'a cor própria foi apagada')
  assert.equal(trecho.fontSize, 40, 'o que não foi mexido continua')
})

test('trechos vizinhos com o mesmo estilo viram um só', () => {
  const elemento = texto('Palavra')
  const passo1 = formatText(elemento, { start: 0, end: 2 }, { fill: '#ff0000' })
  const passo2 = formatText({ ...elemento, ...passo1 }, { start: 2, end: 4 }, { fill: '#ff0000' })

  assert.equal(passo2.runs.length, 1, 'compactado')
  assert.deepEqual([passo2.runs[0].start, passo2.runs[0].end], [0, 4])
})

test('faixa invertida (selecionada de trás para frente) funciona igual', () => {
  const { runs } = formatText(texto('Palavra'), { start: 5, end: 2 }, { fill: '#ff0000' })
  assert.deepEqual([runs[0].start, runs[0].end], [2, 5])
})

test('digitar no meio herda o estilo do caractere anterior', () => {
  // "Palavra" com "Pal" vermelho; inserir depois do "l" deve sair vermelho.
  const elemento = texto('Palavra', { runs: [{ start: 0, end: 3, fill: '#ff0000' }] })
  const { text, runs } = replaceText(elemento, 'PalXXavra')

  assert.equal(text, 'PalXXavra')
  assert.deepEqual([runs[0].start, runs[0].end], [0, 5], 'o trecho vermelho cresceu com o inserido')
  assert.equal(runs[0].fill, '#ff0000')
})

test('digitar no começo herda o estilo do caractere seguinte', () => {
  const elemento = texto('Palavra', { runs: [{ start: 0, end: 3, fill: '#ff0000' }] })
  const { runs } = replaceText(elemento, 'XXPalavra')

  assert.deepEqual([runs[0].start, runs[0].end], [0, 5], 'o inserido entrou no trecho vermelho')
})

test('apagar no meio preserva a formatação do que sobrou', () => {
  // "abcdef" com "cd" (2..4) em vermelho; apagar o "b".
  const elemento = texto('abcdef', { runs: [{ start: 2, end: 4, fill: '#ff0000' }] })
  const { text, runs } = replaceText(elemento, 'acdef')

  assert.equal(text, 'acdef')
  assert.deepEqual([runs[0].start, runs[0].end], [1, 3], 'o trecho andou junto com o texto')
  assert.equal(runs[0].fill, '#ff0000')
})

test('trocar o texto inteiro não deixa trecho apontando para fora', () => {
  const elemento = texto('Palavra', { runs: [{ start: 0, end: 3, fill: '#ff0000' }] })
  const { text, runs } = replaceText(elemento, 'Outro')

  assert.equal(text, 'Outro')
  for (const run of runs || []) {
    assert.ok(run.end <= text.length, `trecho ${run.start}..${run.end} cabe em "${text}"`)
  }
})

test('o painel mostra o valor quando a faixa é uniforme', () => {
  const elemento = texto('Palavra', { runs: [{ start: 0, end: 3, fill: '#ff0000' }] })
  const { values, mixed } = selectionStyle(elemento, { start: 0, end: 3 })

  assert.equal(values.fill, '#ff0000')
  assert.equal(mixed.has('fill'), false)
})

test('o painel mostra "misto" quando a faixa mistura estilos', () => {
  const elemento = texto('Palavra', { runs: [{ start: 0, end: 3, fill: '#ff0000' }] })
  const { mixed } = selectionStyle(elemento, { start: 0, end: 7 })

  assert.equal(mixed.has('fill'), true, 'parte vermelha, parte branca')
  assert.equal(mixed.has('fontSize'), false, 'o tamanho é o mesmo em todo o texto')
})

test('texto sem runs reporta o estilo do elemento, sem nada misto', () => {
  const { values, mixed } = selectionStyle(texto('Palavra'), null)

  assert.equal(values.fill, '#ffffff')
  assert.equal(values.fontSize, 20)
  assert.equal(mixed.size, 0)
})
