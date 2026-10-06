import test from 'node:test'
import assert from 'node:assert/strict'

import tagsCommonJS from '../../tags.js'
import * as tagsESM from '../../client/src/tags.js'

const { parseTags, formatTags, tagKey, MAX_TAGS_LENGTH } = tagsCommonJS

test('separa por vírgula e por espaço', () => {
  assert.deepEqual(parseTags('aventura, ação'), ['aventura', 'ação'])
  assert.deepEqual(parseTags('aventura ação'), ['aventura', 'ação'])
  assert.deepEqual(parseTags('aventura,ação'), ['aventura', 'ação'])
})

test('ignora espaços sobrando e separadores repetidos', () => {
  assert.deepEqual(parseTags('  aventura ,,   ação  '), ['aventura', 'ação'])
  assert.deepEqual(parseTags(''), [])
  assert.deepEqual(parseTags('   '), [])
})

test('vale para valor ausente, sem estourar', () => {
  assert.deepEqual(parseTags(null), [])
  assert.deepEqual(parseTags(undefined), [])
})

test('descarta repetidas ignorando acento e caixa, mantendo a primeira forma', () => {
  assert.deepEqual(parseTags('Ação, ação, acao'), ['Ação'])
  assert.deepEqual(parseTags('RPG rpg Rpg'), ['RPG'])
})

test('preserva a ordem em que foram digitadas', () => {
  assert.deepEqual(parseTags('terror, aventura, comédia'), ['terror', 'aventura', 'comédia'])
})

test('tagKey iguala acento e caixa', () => {
  assert.equal(tagKey('Ação'), tagKey('acao'))
  assert.equal(tagKey('Ficção'), 'ficcao')
  assert.equal(tagKey(null), '')
})

test('formatTags grava na forma canônica que o parse devolve igual', () => {
  const tags = parseTags('aventura ação  terror')
  const gravado = formatTags(tags)
  assert.equal(gravado, 'aventura, ação, terror')
  // Ida e volta: ler o que foi gravado tem de dar a mesma lista.
  assert.deepEqual(parseTags(gravado), tags)
})

test('uma tag nunca tem espaço no meio — é o que o campo promete ao usuário', () => {
  // Se esta regra mudar, o texto de ajuda (TAGS_HINT) precisa mudar junto.
  assert.deepEqual(parseTags('ficção científica'), ['ficção', 'científica'])
})

test('projeto antigo, gravado como categoria única, já aparece dividido', () => {
  // Não houve migração de dados: o parse na leitura é que divide.
  assert.deepEqual(parseTags('Aventura, fantasia, ação'), ['Aventura', 'fantasia', 'ação'])
})

/*
 * As duas cópias existem porque os pacotes npm são independentes (raiz
 * CommonJS, client ESM) e não compartilham código. Se divergirem, o backend
 * grava de um jeito e o frontend lê de outro — este teste é o que impede isso.
 */
test('as cópias CommonJS e ESM se comportam igual', () => {
  const entradas = [
    'aventura, ação',
    'Ação ação acao',
    '  terror ,, comédia ',
    'ficção científica',
    '',
    null,
  ]

  for (const entrada of entradas) {
    assert.deepEqual(
      tagsESM.parseTags(entrada),
      parseTags(entrada),
      `parseTags divergiu para ${JSON.stringify(entrada)}`,
    )
  }

  assert.equal(tagsESM.MAX_TAGS_LENGTH, MAX_TAGS_LENGTH)
  assert.equal(tagsESM.formatTags(['a', 'b']), formatTags(['a', 'b']))
  assert.equal(tagsESM.tagKey('Ação'), tagKey('Ação'))
})
