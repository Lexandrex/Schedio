/**
 * Tags de um projeto — o que o banco guarda na coluna `projetos.categoria`.
 *
 * A coluna é um texto só, mas o usuário digita várias tags de uma vez: escrever
 * "aventura, ação" cria DUAS tags, não uma. Os separadores são vírgula e
 * espaço (é o que o campo do editor promete ao usuário), então uma tag nunca
 * tem espaço no meio.
 *
 * Como o parse acontece também na leitura, projetos antigos — gravados quando o
 * campo era uma categoria única — já aparecem divididos, sem migração de dados.
 *
 * Espelhado em `tags.js` na raiz, que é a versão CommonJS usada pelo backend
 * (os dois pacotes npm são independentes e não compartilham código). Mudou
 * aqui, mude lá.
 */

/** Limite da coluna `projetos.categoria`, aplicado ao texto já normalizado. */
export const MAX_TAGS_LENGTH = 60

/** Texto de ajuda do campo: a regra de separação precisa ser dita ao usuário. */
export const TAGS_HINT = 'Separe por vírgula ou espaço para criar mais de uma tag.'

/** Chave de comparação: "Ação", "ação" e "acao" são a mesma tag. */
export function tagKey(tag) {
  return String(tag ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** Quebra o texto digitado numa lista de tags distintas, sem repetidas. */
export function parseTags(value) {
  const vistas = new Set()
  const tags = []

  for (const bruta of String(value ?? '').split(/[,\s]+/)) {
    const tag = bruta.trim()
    if (!tag) continue

    const chave = tagKey(tag)
    if (vistas.has(chave)) continue

    vistas.add(chave)
    tags.push(tag)
  }

  return tags
}

/** Forma canônica para gravar no banco: tags separadas por vírgula e espaço. */
export function formatTags(tags) {
  return tags.join(', ')
}
