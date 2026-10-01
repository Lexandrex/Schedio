import { CHAR_KEYS, charBase, overridesOf, styledRanges, validRuns } from './textMetrics.js'

/*
 * Formatação por caractere, como no Word. O texto continua sendo uma string
 * só (`text`); os trechos com estilo próprio moram em `runs`:
 *
 *   runs: [{ start: 0, end: 3, fontWeight: 'bold', fill: '#ff0000' }]
 *
 * `start`/`end` são posições na string (unidades UTF-16, as mesmas do DOM) e
 * cada trecho guarda **só o que difere** do estilo do elemento. Assim, mudar a
 * cor do elemento continua mudando todo caractere que não tem cor própria, e
 * um texto sem formatação mista simplesmente não tem `runs` — os documentos
 * antigos abrem iguais.
 */

/** Um objeto por caractere com o que ele sobrescreve (ou null). */
function overridesPerChar(element) {
  const text = String(element.text ?? '')
  const porCaractere = new Array(text.length).fill(null)
  for (const run of validRuns(element.runs, text.length)) {
    const overrides = overridesOf(run)
    for (let index = run.start; index < run.end; index += 1) porCaractere[index] = overrides
  }
  return porCaractere
}

/** O que sobra de `overrides` quando se tira o que já é igual à base. */
function diffFromBase(overrides, base) {
  if (!overrides) return null
  const resto = {}
  let vazio = true
  for (const key of CHAR_KEYS) {
    if (overrides[key] !== undefined && overrides[key] !== base[key]) {
      resto[key] = overrides[key]
      vazio = false
    }
  }
  return vazio ? null : resto
}

function sameOverrides(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return CHAR_KEYS.every((key) => a[key] === b[key])
}

/** Compacta o estilo por caractere em trechos, juntando vizinhos iguais. */
function runsFromChars(porCaractere, base) {
  const runs = []
  let atual = null

  porCaractere.forEach((overrides, index) => {
    const resto = diffFromBase(overrides, base)
    if (atual && sameOverrides(atual.overrides, resto)) {
      atual.end = index + 1
      return
    }
    if (atual?.overrides) runs.push({ start: atual.start, end: atual.end, ...atual.overrides })
    atual = { start: index, end: index + 1, overrides: resto }
  })
  if (atual?.overrides) runs.push({ start: atual.start, end: atual.end, ...atual.overrides })

  // Sem formatação mista o campo some, em vez de ficar uma lista vazia salva.
  return runs.length ? runs : undefined
}

/**
 * Monta `runs` a partir do estilo completo de cada caractere — o que o editor
 * lê de volta do DOM depois que o usuário digita.
 */
export function runsFromStyles(element, estilos) {
  const base = charBase(element)
  return runsFromChars(estilos, base)
}

/**
 * Troca o texto mantendo a formatação de quem não mudou. Acha o trecho
 * alterado pelo prefixo e sufixo comuns; o que foi inserido herda o estilo do
 * caractere anterior (ou do seguinte, se entrou no começo), como no Word.
 */
export function replaceText(element, novoTexto) {
  const antigo = String(element.text ?? '')
  const novo = String(novoTexto ?? '')
  const porCaractere = overridesPerChar(element)

  let prefixo = 0
  while (prefixo < antigo.length && prefixo < novo.length && antigo[prefixo] === novo[prefixo]) prefixo += 1
  let sufixo = 0
  while (
    sufixo < antigo.length - prefixo &&
    sufixo < novo.length - prefixo &&
    antigo[antigo.length - 1 - sufixo] === novo[novo.length - 1 - sufixo]
  ) {
    sufixo += 1
  }

  const herdado = prefixo > 0 ? porCaractere[prefixo - 1] : (porCaractere[antigo.length - sufixo] ?? null)
  const inseridos = novo.length - prefixo - sufixo
  const resultado = [
    ...porCaractere.slice(0, prefixo),
    ...new Array(inseridos).fill(herdado),
    ...porCaractere.slice(antigo.length - sufixo),
  ]

  return { text: novo, runs: runsFromChars(resultado, charBase(element)) }
}

/** Faixa `{ start, end }` com algo selecionado, ou null. */
function faixaValida(element, faixa) {
  const tamanho = String(element.text ?? '').length
  if (!faixa) return null
  const start = Math.max(0, Math.min(faixa.start, faixa.end))
  const end = Math.min(tamanho, Math.max(faixa.start, faixa.end))
  if (end <= start) return null
  // A seleção do texto inteiro é o mesmo que nenhuma: vai para o elemento.
  if (start === 0 && end === tamanho) return null
  return { start, end }
}

/**
 * Aplica `patch` (cor, tamanho, fonte, negrito...) à faixa selecionada. Sem
 * faixa — ou com o texto inteiro selecionado —, vale para o elemento todo e
 * apaga essa propriedade dos trechos, para nenhum caractere ficar de fora.
 */
export function formatText(element, faixa, patch) {
  const alvo = faixaValida(element, faixa)

  if (!alvo) {
    const runs = Array.isArray(element.runs)
      ? element.runs.map((run) => {
          const limpo = { ...run }
          Object.keys(patch).forEach((key) => delete limpo[key])
          return limpo
        })
      : []
    const base = charBase({ ...element, ...patch })
    const porCaractere = overridesPerChar({ ...element, runs })
    return { ...patch, runs: runsFromChars(porCaractere, base) }
  }

  const porCaractere = overridesPerChar(element)
  for (let index = alvo.start; index < alvo.end; index += 1) {
    porCaractere[index] = { ...porCaractere[index], ...patch }
  }
  return { runs: runsFromChars(porCaractere, charBase(element)) }
}

/**
 * Estilo da faixa selecionada (ou do texto todo), para o painel mostrar.
 * `values` traz o valor do primeiro caractere; `mixed` diz quais propriedades
 * variam dentro da faixa — o painel mostra essas como "misto".
 */
export function selectionStyle(element, faixa) {
  const tamanho = String(element.text ?? '').length
  const alvo = faixaValida(element, faixa) || { start: 0, end: tamanho }
  const ranges = styledRanges(element).filter(
    (range) => range.end > alvo.start && range.start < alvo.end,
  )
  const estilos = ranges.length ? ranges.map((range) => range.style) : [charBase(element)]

  const values = { ...estilos[0] }
  const mixed = new Set(CHAR_KEYS.filter((key) => estilos.some((estilo) => estilo[key] !== values[key])))
  return { values, mixed }
}

/** Uma faixa selecionada dentro do texto, ou null. Exposto para o painel. */
export function selectedRange(element, faixa) {
  return faixaValida(element, faixa)
}
