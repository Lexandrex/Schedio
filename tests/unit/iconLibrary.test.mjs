import test from 'node:test'
import assert from 'node:assert/strict'

import { ICON_LIBRARY, filtrarIcones } from '../../client/src/canvas/iconLibrary.js'

const nomes = (icones) => icones.map((i) => i.nome)

test('busca vazia devolve o catálogo inteiro', () => {
  assert.equal(filtrarIcones('').length, ICON_LIBRARY.length)
  assert.equal(filtrarIcones('   ').length, ICON_LIBRARY.length)
})

test('filtra por nome', () => {
  assert.ok(nomes(filtrarIcones('lixeira')).includes('Lixeira'))
})

test('filtra por grupo', () => {
  const setas = filtrarIcones('setas')
  assert.ok(setas.length >= 4)
  assert.ok(setas.every((i) => i.grupo === 'Setas'))
})

test('filtra por palavra-chave, não só pelo nome', () => {
  // Quem procura "excluir" quer a lixeira, cujo nome não contém a palavra.
  assert.deepEqual(nomes(filtrarIcones('excluir')), ['Lixeira'])
  assert.ok(nomes(filtrarIcones('favorito')).includes('Estrela'))
})

test('ignora acento e caixa', () => {
  assert.deepEqual(nomes(filtrarIcones('usuario')), nomes(filtrarIcones('USUÁRIO')))
  assert.ok(nomes(filtrarIcones('CORACAO')).includes('Coração'))
})

test('busca sem resultado devolve lista vazia, não o catálogo', () => {
  assert.deepEqual(filtrarIcones('zzzznaoexiste'), [])
})

test('todo ícone tem nome, grupo, termos e desenho', () => {
  for (const icone of ICON_LIBRARY) {
    assert.ok(icone.nome, 'nome')
    assert.ok(icone.grupo, `grupo de ${icone.nome}`)
    assert.ok(Array.isArray(icone.termos), `termos de ${icone.nome}`)
    assert.ok(icone.path?.startsWith('M'), `path de ${icone.nome} começa com um move`)
  }
})

test('não há nomes repetidos — o nome é a chave na lista', () => {
  const vistos = new Set(nomes(ICON_LIBRARY))
  assert.equal(vistos.size, ICON_LIBRARY.length)
})
