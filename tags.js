'use strict';

/**
 * Tags de um projeto — o que o banco guarda na coluna `projetos.categoria`.
 *
 * A coluna é um texto só, mas o usuário digita várias tags de uma vez: escrever
 * "aventura, ação" cria DUAS tags, não uma. Os separadores são vírgula e
 * espaço (é o que o campo do editor promete ao usuário), então uma tag nunca
 * tem espaço no meio.
 *
 * Como parse acontece também na leitura, projetos antigos — gravados quando o
 * campo era uma categoria única — já aparecem divididos, sem migração de dados.
 *
 * Espelhado em `client/src/tags.js`, que é a versão ESM usada pelo frontend
 * (os dois pacotes npm são independentes e não compartilham código). Mudou
 * aqui, mude lá.
 */

/** Limite da coluna `projetos.categoria`, aplicado ao texto já normalizado. */
const MAX_TAGS_LENGTH = 60;

/** Chave de comparação: "Ação", "ação" e "acao" são a mesma tag. */
function tagKey(tag) {
  return String(tag == null ? '' : tag)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Quebra o texto digitado numa lista de tags distintas, sem repetidas. */
function parseTags(value) {
  const vistas = new Set();
  const tags = [];

  for (const bruta of String(value == null ? '' : value).split(/[,\s]+/)) {
    const tag = bruta.trim();
    if (!tag) continue;

    const chave = tagKey(tag);
    if (vistas.has(chave)) continue;

    vistas.add(chave);
    tags.push(tag);
  }

  return tags;
}

/** Forma canônica para gravar no banco: tags separadas por vírgula e espaço. */
function formatTags(tags) {
  return tags.join(', ');
}

module.exports = { MAX_TAGS_LENGTH, tagKey, parseTags, formatTags };
