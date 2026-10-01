import { useEffect, useLayoutEffect, useRef } from 'react'
import { CHAR_KEYS, charBase, fontMetrics, measureText, styledRanges, textStyle, verticalOffset } from './textMetrics.js'
import { formatText, runsFromStyles, selectionStyle } from './richText.js'

const HIGHLIGHT = 'schedio-selecao'
const HISTORY_LIMIT = 200
/** Teclas digitadas em sequência viram um passo só de desfazer. */
const COALESCE_MS = 800

const SHORTCUTS = {
  b: ['fontWeight', 'bold', 'normal'],
  i: ['fontStyle', 'italic', 'normal'],
  u: ['textDecoration', 'underline', 'none'],
}

/** O que o DOM do editor está mostrando. Mudou isso, redesenha. */
function signatureOf(element, zoom) {
  return JSON.stringify([element.text ?? '', element.runs ?? null, charBase(element), zoom])
}

/** O que um passo de desfazer guarda: o texto, os trechos e o estilo base. */
function snapshotOf(element) {
  const snapshot = { text: element.text ?? '', runs: element.runs }
  CHAR_KEYS.forEach((key) => {
    snapshot[key] = element[key]
  })
  return snapshot
}

/**
 * Desenha o conteúdo: um <span> por trecho de estilo uniforme. O estilo do
 * trecho vai também em `data-estilo`, que é de onde a leitura de volta tira o
 * estilo de cada caractere — o navegador às vezes clona spans ao editar, e o
 * atributo vai junto com o clone.
 */
function renderContent(div, element, zoom) {
  const text = String(element.text ?? '')
  const fragment = document.createDocumentFragment()

  for (const range of styledRanges(element)) {
    if (range.end <= range.start) continue
    const span = document.createElement('span')
    span.dataset.estilo = JSON.stringify(range.style)
    span.style.color = range.style.fill
    span.style.fontSize = `${range.style.fontSize * zoom}px`
    span.style.fontFamily = range.style.fontFamily
    span.style.fontWeight = range.style.fontWeight
    span.style.fontStyle = range.style.fontStyle
    span.style.textDecoration = range.style.textDecoration
    span.textContent = text.slice(range.start, range.end)
    fragment.appendChild(span)
  }

  // Sentinela: sem um <br> no fim, uma quebra de linha no fim do texto não
  // aparece, e o texto vazio fica sem linha onde pôr o cursor.
  fragment.appendChild(document.createElement('br'))
  div.replaceChildren(fragment)
}

/**
 * O DOM já está exatamente como `renderContent` o desenharia para `element`?
 * Checagem estrutural, sem criar nós: num texto longo, desenhar uma cópia à
 * parte e comparar o HTML custava mais que o resto da tecla inteira.
 */
function isCanonical(div, element) {
  const text = String(element.text ?? '')
  const ranges = styledRanges(element).filter((range) => range.end > range.start)
  const filhos = div.childNodes
  if (filhos.length !== ranges.length + 1 || filhos[ranges.length].nodeName !== 'BR') return false

  return ranges.every((range, index) => {
    const span = filhos[index]
    return (
      span.nodeName === 'SPAN' &&
      span.childNodes.length === 1 &&
      span.firstChild.nodeType === Node.TEXT_NODE &&
      span.firstChild.data === text.slice(range.start, range.end) &&
      span.dataset.estilo === JSON.stringify(range.style)
    )
  })
}

/**
 * Folhas do conteúdo na ordem do documento, com a posição de cada uma no
 * texto. Um <br> conta como quebra de linha, menos o último (a sentinela).
 */
function leavesOf(div) {
  const leaves = []
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let position = 0
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      leaves.push({ node, start: position, length: node.data.length, text: true })
      position += node.data.length
    } else if (node.tagName === 'BR') {
      leaves.push({ node, start: position, length: 1, text: false })
      position += 1
    }
  }
  const last = leaves[leaves.length - 1]
  if (last && !last.text) last.length = 0
  return leaves
}

/** Lê do DOM o texto e o estilo completo de cada caractere. */
function readContent(div, base) {
  let text = ''
  const estilos = []

  for (const leaf of leavesOf(div)) {
    if (!leaf.length) continue
    if (!leaf.text) {
      text += '\n'
      estilos.push(null)
      continue
    }
    const dono = leaf.node.parentElement?.closest('[data-estilo]')
    let estilo = null
    if (dono && div.contains(dono)) {
      try {
        estilo = JSON.parse(dono.dataset.estilo)
      } catch {
        estilo = null
      }
    }
    text += leaf.node.data
    for (let index = 0; index < leaf.length; index += 1) estilos.push(estilo)
  }

  // Texto que o navegador criou fora de qualquer trecho herda o estilo do
  // caractere anterior (ou do seguinte, no começo), como a digitação no Word.
  let anterior = estilos.find(Boolean) || base
  for (let index = 0; index < estilos.length; index += 1) {
    if (estilos[index]) anterior = estilos[index]
    else estilos[index] = anterior
  }
  return { text, estilos }
}

/** Posição no texto de um ponto do DOM (nó + deslocamento). */
function offsetFromDom(div, leaves, node, offset) {
  const folha = leaves.find((leaf) => leaf.node === node && leaf.text)
  if (folha) return folha.start + Math.min(offset, folha.length)

  const ponto = document.createRange()
  ponto.setStart(node, offset)
  let total = 0
  for (const leaf of leaves) {
    // Folha que começa antes do ponto fica inteira antes dele, já que o ponto
    // não está dentro de nenhum nó de texto.
    if (ponto.comparePoint(leaf.node, 0) < 0) total = leaf.start + leaf.length
  }
  return total
}

/**
 * Ponto do DOM para uma posição do texto. `aoFim` escolhe, numa fronteira
 * entre dois trechos, o fim do anterior — é onde o cursor herda o estilo do
 * caractere que vem antes, como no Word.
 */
function domFromOffset(div, leaves, index, aoFim) {
  const textos = leaves.filter((leaf) => leaf.text)
  for (const leaf of textos) {
    const dentro = aoFim
      ? index > leaf.start && index <= leaf.start + leaf.length
      : index >= leaf.start && index < leaf.start + leaf.length
    if (dentro) return [leaf.node, index - leaf.start]
  }
  if (!textos.length) return [div, 0]
  if (index <= 0) return [textos[0].node, 0]
  const ultima = textos[textos.length - 1]
  return [ultima.node, ultima.length]
}

function readSelection(div) {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (!div.contains(range.startContainer) || !div.contains(range.endContainer)) return null
  const leaves = leavesOf(div)
  const start = offsetFromDom(div, leaves, range.startContainer, range.startOffset)
  const end = offsetFromDom(div, leaves, range.endContainer, range.endOffset)
  return { start: Math.min(start, end), end: Math.max(start, end) }
}

function rangeFor(div, selecao) {
  const leaves = leavesOf(div)
  const colapsada = selecao.start === selecao.end
  const range = document.createRange()
  range.setStart(...domFromOffset(div, leaves, selecao.start, colapsada))
  range.setEnd(...domFromOffset(div, leaves, selecao.end, true))
  return range
}

function restoreSelection(div, selecao) {
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(rangeFor(div, selecao))
}

/**
 * Mantém a seleção visível quando o foco vai para o painel de propriedades —
 * é ali que o usuário escolhe a cor ou a fonte do trecho selecionado, e sem
 * isso ele perderia de vista o que está formatando.
 */
function paintHighlight(div, selecao) {
  if (typeof Highlight === 'undefined' || !window.CSS?.highlights) return
  if (!selecao || selecao.start === selecao.end || document.activeElement === div) {
    CSS.highlights.delete(HIGHLIGHT)
    return
  }
  CSS.highlights.set(HIGHLIGHT, new Highlight(rangeFor(div, selecao)))
}

function clampSelection(selecao, element) {
  const tamanho = String(element.text ?? '').length
  return { start: Math.min(selecao.start, tamanho), end: Math.min(selecao.end, tamanho) }
}

/**
 * Edição no lugar, com formatação por caractere. É um `contenteditable`
 * posicionado por cima do texto, fora do <svg> (HTML dentro de SVG, via
 * foreignObject, tem suporte irregular).
 *
 * O modelo (`text` + `runs`) é a verdade; o DOM é desenhado a partir dele e,
 * quando o usuário digita, lido de volta. O navegador cuida da digitação, do
 * cursor, de colar e da composição de acentos; o editor só redesenha quando o
 * DOM foge da forma canônica (um span por trecho) ou o modelo muda por fora —
 * pelo painel, por um atalho ou por desfazer.
 *
 * Desfazer é próprio: o histórico nativo do navegador se perde quando o
 * conteúdo é redesenhado, e aplicaria passos velhos em nós que já não existem.
 */
export default function TextEditor({ element, view, onChange, onSelectionChange, onClose }) {
  const divRef = useRef(null)
  const assinaturaRef = useRef(null)
  const selecaoRef = useRef({ start: 0, end: String(element.text ?? '').length })
  const avisadaRef = useRef(null)
  const compondoRef = useRef(false)
  const manterRef = useRef(false)
  // Quem causou a próxima mudança do modelo: decide se ela entra no histórico
  // e se junta com a anterior.
  const origemRef = useRef(null)
  const historicoRef = useRef({ entradas: [], indice: -1, chave: null, ultimaOrigem: null, ultimaVez: 0 })
  const propsRef = useRef({ element, onChange, onSelectionChange, onClose })
  const desfazerRef = useRef(() => {})

  /**
   * Seleção atual, lida do DOM quando o editor tem o foco. O `selectionchange`
   * é assíncrono: um Ctrl+B logo depois de Shift+→ chegaria antes dele e
   * formataria a seleção velha.
   */
  function selecaoAtual() {
    const div = divRef.current
    if (div && document.activeElement === div) {
      const selecao = readSelection(div)
      if (selecao) selecaoRef.current = selecao
    }
    return selecaoRef.current
  }

  function avisarSelecao(selecao) {
    const anterior = avisadaRef.current
    if (anterior && selecao && anterior.start === selecao.start && anterior.end === selecao.end) return
    avisadaRef.current = selecao
    propsRef.current.onSelectionChange(selecao)
  }

  // Roda a cada render: registra o passo no histórico e redesenha o DOM se o
  // que ele mostra ficou para trás.
  useLayoutEffect(() => {
    propsRef.current = { element, onChange, onSelectionChange, onClose }
    desfazerRef.current = (passo) => irParaHistorico(historicoRef.current.indice + passo)
    const div = divRef.current

    const historico = historicoRef.current
    const snapshot = snapshotOf(element)
    const chave = JSON.stringify(snapshot)
    if (chave !== historico.chave) {
      const origem = origemRef.current
      if (origem !== 'historico') {
        const agora = Date.now()
        const junta =
          origem?.startsWith('digitacao') &&
          origem === historico.ultimaOrigem &&
          agora - historico.ultimaVez < COALESCE_MS
        const entrada = { snapshot, selecao: { ...selecaoRef.current } }
        if (junta) {
          historico.entradas[historico.indice] = entrada
        } else {
          historico.entradas = historico.entradas.slice(0, historico.indice + 1)
          historico.entradas.push(entrada)
          if (historico.entradas.length > HISTORY_LIMIT) historico.entradas.shift()
          historico.indice = historico.entradas.length - 1
        }
        historico.ultimaOrigem = origem
        historico.ultimaVez = agora
      }
      historico.chave = chave
    }
    origemRef.current = null

    // Redesenhar no meio da composição de um acento a desfaria.
    if (compondoRef.current) return

    const assinatura = signatureOf(element, view.zoom)
    if (assinatura !== assinaturaRef.current) {
      renderContent(div, element, view.zoom)
      assinaturaRef.current = assinatura
      selecaoRef.current = clampSelection(selecaoRef.current, element)
      if (document.activeElement === div) restoreSelection(div, selecaoRef.current)
    }
    paintHighlight(div, selecaoRef.current)
  })

  // Ao entrar em edição, foca e seleciona tudo — como o Figma faz.
  useLayoutEffect(() => {
    const div = divRef.current
    div.focus()
    selecaoRef.current = { start: 0, end: String(propsRef.current.element.text ?? '').length }
    restoreSelection(div, selecaoRef.current)
    avisarSelecao(selecaoRef.current)

    return () => {
      if (window.CSS?.highlights) CSS.highlights.delete(HIGHLIGHT)
      propsRef.current.onSelectionChange(null)
    }
    // Só na montagem: a edição de outro texto monta outro editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function aoMudarSelecao() {
      const div = divRef.current
      if (!div || document.activeElement !== div) return
      const selecao = readSelection(div)
      if (!selecao) return
      selecaoRef.current = selecao
      avisarSelecao(selecao)
    }

    // Clicar fora encerra a edição — menos no painel de propriedades, onde se
    // formata o trecho selecionado.
    function aoApertar(event) {
      const div = divRef.current
      if (!div || div.contains(event.target)) return
      if (event.target.closest?.('.properties-panel')) {
        manterRef.current = true
        return
      }
      propsRef.current.onClose()
    }

    // Desfazer pelo menu de contexto também passa pelo histórico próprio. É o
    // `beforeinput` nativo: o `onBeforeInput` do React não traz o `inputType`.
    function antesDeEditar(event) {
      const tipo = event.inputType || ''
      if (tipo === 'historyUndo' || tipo === 'historyRedo') {
        event.preventDefault()
        desfazerRef.current(tipo === 'historyRedo' ? 1 : -1)
      } else if (tipo.startsWith('format')) {
        event.preventDefault()
      }
    }

    const div = divRef.current
    document.addEventListener('selectionchange', aoMudarSelecao)
    document.addEventListener('pointerdown', aoApertar, true)
    div.addEventListener('beforeinput', antesDeEditar)
    return () => {
      document.removeEventListener('selectionchange', aoMudarSelecao)
      document.removeEventListener('pointerdown', aoApertar, true)
      div.removeEventListener('beforeinput', antesDeEditar)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Lê o DOM de volta para o modelo depois que o navegador editou. */
  function sincronizar(origem) {
    const div = divRef.current
    const atual = propsRef.current.element
    const { text, estilos } = readContent(div, charBase(atual))
    const patch = { text, runs: runsFromStyles(atual, estilos) }

    const selecao = readSelection(div)
    if (selecao) selecaoRef.current = selecao

    // Se o DOM já está na forma que o modelo desenharia, não há o que
    // redesenhar; senão (span vazio, texto fora de span...), esquece a
    // assinatura para o efeito redesenhar.
    const novo = { ...atual, ...patch }
    assinaturaRef.current = isCanonical(div, novo) ? signatureOf(novo, view.zoom) : null

    origemRef.current = origem
    propsRef.current.onChange(patch)
    if (selecao) avisarSelecao(selecao)
  }

  function irParaHistorico(indice) {
    const historico = historicoRef.current
    if (indice < 0 || indice >= historico.entradas.length) return
    historico.indice = indice
    historico.ultimaOrigem = null
    const { snapshot, selecao } = historico.entradas[indice]
    selecaoRef.current = { ...selecao }
    origemRef.current = 'historico'
    onChange(snapshot)
    avisarSelecao(selecao)
  }

  function handleKeyDown(event) {
    const mod = (event.ctrlKey || event.metaKey) && !event.altKey

    // Quebra de linha como texto, sempre: sem isso o navegador pode criar
    // <div>s. Tem de ser `insertLineBreak` — `insertText` com "\n" não faz nada
    // num contenteditable plaintext-only.
    if (event.key === 'Enter') {
      event.preventDefault()
      document.execCommand('insertLineBreak')
      return
    }

    if (!mod) return
    const tecla = event.key.toLowerCase()

    if (tecla === 'z' || tecla === 'y') {
      event.preventDefault()
      const refazer = tecla === 'y' || event.shiftKey
      irParaHistorico(historicoRef.current.indice + (refazer ? 1 : -1))
      return
    }

    const atalho = SHORTCUTS[tecla]
    if (atalho) {
      event.preventDefault()
      const selecao = selecaoAtual()
      avisarSelecao(selecao)
      // Com o cursor parado não há o que formatar.
      if (selecao.start === selecao.end) return
      const [campo, ligado, desligado] = atalho
      const { values, mixed } = selectionStyle(element, selecao)
      const proximo = !mixed.has(campo) && values[campo] === ligado ? desligado : ligado
      origemRef.current = 'formatacao'
      onChange(formatText(element, selecao, { [campo]: proximo }))
    }
  }

  function handleInput(event) {
    const tipo = event.nativeEvent?.inputType || ''
    sincronizar(tipo.startsWith('insertText') || tipo === 'insertCompositionText'
      ? 'digitacao'
      : tipo.startsWith('delete')
        ? 'digitacao-apagar'
        : 'edicao')
  }

  function handleBlur(event) {
    const div = divRef.current
    const destino = event.relatedTarget
    if (manterRef.current || destino?.closest?.('.properties-panel')) {
      manterRef.current = false
      paintHighlight(div, selecaoRef.current)
      return
    }
    onClose()
  }

  function handleFocus() {
    manterRef.current = false
    paintHighlight(divRef.current, selecaoRef.current)
  }

  // Posição: a mesma conta do desenho, para nada saltar ao entrar em edição.
  const estilo = textStyle(element)
  const metrics = measureText(element)
  const deslocamentoY = verticalOffset(metrics, estilo)
  const ranges = styledRanges(element)
  // O "strut" do CSS (a linha mínima do bloco) usa a fonte do contêiner. Com o
  // menor tamanho do texto ele nunca deixa uma linha mais alta do que o mapa
  // desenha.
  const menor = Math.min(...ranges.map((range) => range.style.fontSize))
  const strut = { ...charBase(element), fontSize: menor }
  // O CSS põe metade da entrelinha acima das letras; o mapa põe a linha de
  // base "pendurada" no topo. Descontar a diferença na primeira linha faz as
  // duas linhas de base coincidirem.
  const primeira = metrics.rows[0]
  const baseCss = Math.max(
    ...[strut, ...primeira.styles].map((item) => {
      const { ascent, descent } = fontMetrics(item)
      return ascent + (estilo.lineHeight * item.fontSize - ascent - descent) / 2
    }),
  )
  const ajuste = primeira.baseline - baseCss
  // Com largura definida o texto reflui dentro dela, igual ao mapa; sem largura
  // a caixa acompanha o conteúdo e nada deve quebrar.
  const reflui = element.width > 0

  return (
    <div
      ref={divRef}
      className="canvas-text-editor"
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-multiline="true"
      aria-label="Editar texto"
      onKeyDown={handleKeyDown}
      onInput={handleInput}
      onCompositionStart={() => {
        compondoRef.current = true
      }}
      onCompositionEnd={() => {
        compondoRef.current = false
        sincronizar('digitacao')
      }}
      onBlur={handleBlur}
      onFocus={handleFocus}
      style={{
        left: element.x * view.zoom + view.x,
        top: (element.y + deslocamentoY + ajuste) * view.zoom + view.y,
        width: reflui ? element.width * view.zoom : undefined,
        minWidth: 24 * view.zoom,
        whiteSpace: reflui ? 'pre-wrap' : 'pre',
        // Casa com a quebra por caractere de `breakLongWord`.
        overflowWrap: reflui ? 'anywhere' : 'normal',
        fontSize: menor * view.zoom,
        lineHeight: estilo.lineHeight,
        fontFamily: estilo.fontFamily,
        textAlign: estilo.textAlign,
        color: element.fill,
      }}
    />
  )
}
