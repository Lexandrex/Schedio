import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LINE_HEIGHT, measureText, onFontsLoaded, verticalOffset } from '../src/canvas/textMetrics.js'
import CanvasElement from '../src/canvas/CanvasElement.jsx'
import PrototypePlayer from '../src/canvas/PrototypePlayer.jsx'
import { USUARIO, renderizarApp } from './helpers.jsx'

vi.mock('../src/api.js', async (original) => ({
  ...(await original()),
  apiRequest: vi.fn(),
  authRequest: vi.fn(),
  uploadImage: vi.fn(),
}))

/*
 * O jsdom não tem canvas 2D. Este falso mede pela fonte em uso (cada caractere
 * tem meia altura de largura), o que basta para as contas de quebra de linha
 * serem exatas e fáceis de conferir: fonte de 20px, 10px por caractere.
 */
beforeAll(() => {
  const contexto = {
    font: '',
    measureText(texto) {
      const tamanho = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10)
      return {
        width: texto.length * (tamanho / 2),
        fontBoundingBoxAscent: tamanho,
        fontBoundingBoxDescent: tamanho / 4,
        hangingBaseline: tamanho * 0.8,
      }
    },
  }
  HTMLCanvasElement.prototype.getContext = () => contexto
})

const tela = (id, extra = {}) => ({
  id, type: 'screen', x: 0, y: 0, width: 300, height: 400, name: id, fill: '#111111', radius: 0, ...extra,
})
const forma = (id, x, y, extra = {}) => ({
  id, type: 'rect', x, y, width: 40, height: 40, fill: '#ffffff', stroke: '#000000', ...extra,
})
const ligacao = (from, to, extra = {}) => ({ id: `${from}-${to}`, from, to, transition: 'instant', duration: 0, ...extra })

const T1 = tela('Início', { id: 't1', name: 'Início' })
const T2 = tela('Fim', { id: 't2', name: 'Fim', x: 1000 })
const BOTAO = forma('botao', 20, 20)

function tocar(elements, connections, props = {}) {
  const fechar = vi.fn()
  const montado = render(
    <PrototypePlayer elements={elements} connections={connections} onClose={fechar} {...props} />,
  )
  return { ...montado, fechar }
}

const titulo = () => document.querySelector('.player-title').textContent
const noPalco = (id) => document.querySelector(`.player-stage [data-el="${id}"]`)
const viewBox = () => document.querySelector('.player-screen').getAttribute('viewBox')

describe('simulação: navegação', () => {
  it('sem telas mostra o aviso próprio de quem a abriu', () => {
    tocar([], [], { emptyMessage: 'Este projeto ainda não tem telas para navegar.' })

    expect(titulo()).toBe('Sem telas')
    expect(screen.getByText('Este projeto ainda não tem telas para navegar.')).toBeInTheDocument()
  })

  it('sem aviso próprio, ensina a criar uma tela', () => {
    tocar([], [])

    expect(screen.getByText(/para simular a navegação/)).toBeInTheDocument()
  })

  it('começa na tela inicial escolhida, ou na primeira', () => {
    const { unmount } = tocar([T1, T2], [], { startScreenId: 't2' })
    expect(titulo()).toBe('Fim')
    unmount()

    tocar([T1, T2], [], { startScreenId: 'nao-existe' })
    expect(titulo()).toBe('Início')
  })

  it('tela oculta não entra na simulação', () => {
    tocar([{ ...T1, hidden: true }, T2], [])

    expect(titulo()).toBe('Fim')
  })

  it('clicar num elemento com ligação navega, e "Voltar" retorna', async () => {
    const usuario = userEvent.setup()
    tocar([T1, BOTAO, T2], [ligacao('botao', 't2')])

    expect(screen.getByRole('button', { name: 'Voltar' })).toBeDisabled()
    expect(noPalco('botao')).toHaveClass('player-hotspot')

    fireEvent.click(noPalco('botao'))
    expect(titulo()).toBe('Fim')

    await usuario.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(titulo()).toBe('Início')
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeDisabled()
  })

  it('elemento sem ligação repassa o clique para a tela', () => {
    tocar([T1, BOTAO, T2], [ligacao('t1', 't2')])

    fireEvent.click(noPalco('botao'))

    expect(titulo()).toBe('Fim')
  })

  it('sem ligação nenhuma, clicar não faz nada', () => {
    tocar([T1, BOTAO, T2], [])

    fireEvent.click(noPalco('botao'))

    expect(titulo()).toBe('Início')
  })

  it('teclado: seta avança com um caminho só, Backspace e seta voltam, Esc sai', () => {
    const { fechar } = tocar([T1, T2], [ligacao('t1', 't2')])

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(titulo()).toBe('Fim')
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(titulo()).toBe('Início')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(titulo()).toBe('Início')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(fechar).toHaveBeenCalledOnce()
  })

  it('a seta só avança sozinha quando a tela tem um caminho só', () => {
    const T3 = tela('Outra', { id: 't3', name: 'Outra', x: 2000 })
    const { unmount } = tocar([T1, T2, T3], [ligacao('t1', 't2'), ligacao('t1', 't3')], { showArrows: true })

    const proxima = screen.getByRole('button', { name: 'Próxima tela' })
    expect(proxima).toBeDisabled()
    expect(proxima).toHaveAttribute('title', 'Esta tela tem mais de um caminho — escolha clicando no conteúdo')
    unmount()

    tocar([T1, T2], [ligacao('t1', 't2')], { showArrows: true })
    fireEvent.click(screen.getByRole('button', { name: 'Próxima tela' }))
    expect(titulo()).toBe('Fim')
    expect(screen.getByRole('button', { name: 'Próxima tela' })).toHaveAttribute('title', 'Fim deste caminho')

    fireEvent.click(screen.getByRole('button', { name: 'Tela anterior' }))
    expect(titulo()).toBe('Início')
  })

  it('tela mais larga que alta sugere deitar o celular', () => {
    const { unmount } = tocar([T1], [])
    expect(screen.queryByText(/Deite o celular/)).not.toBeInTheDocument()
    unmount()

    tocar([{ ...T1, width: 800, height: 400 }], [])
    expect(screen.getByText(/Deite o celular/)).toBeInTheDocument()
  })
})

describe('simulação: outros gatilhos', () => {
  it('rolar dispara só depois do limiar, e na direção da ligação', () => {
    tocar([T1, T2], [ligacao('t1', 't2', { trigger: 'scroll', direction: 'down' })])

    fireEvent.wheel(noPalco('t1'), { deltaY: -100 })
    expect(titulo()).toBe('Início')
    fireEvent.wheel(noPalco('t1'), { deltaY: 10 })
    expect(titulo()).toBe('Início')
    fireEvent.wheel(noPalco('t1'), { deltaY: 200 })
    expect(titulo()).toBe('Fim')
  })

  it('deslizar o dedo para cima é rolar para baixo; toque curto não conta', () => {
    tocar([T1, T2], [ligacao('t1', 't2', { trigger: 'scroll', direction: 'down' })])

    const fundo = noPalco('t1')
    fireEvent.touchStart(fundo, { touches: [{ clientY: 300 }] })
    fireEvent.touchEnd(fundo, { changedTouches: [{ clientY: 290 }] })
    expect(titulo()).toBe('Início')

    fireEvent.touchStart(fundo, { touches: [{ clientY: 300 }] })
    fireEvent.touchEnd(fundo, { changedTouches: [{ clientY: 100 }] })
    expect(titulo()).toBe('Fim')
  })

  it('"após um tempo" navega sozinho', async () => {
    tocar([T1, T2], [ligacao('t1', 't2', { trigger: 'delay', delay: 5 })])

    await waitFor(() => expect(titulo()).toBe('Fim'))
  })

  it('"ao passar o mouse" vai e fica, mesmo saindo de cima', () => {
    tocar([T1, BOTAO, T2], [ligacao('botao', 't2', { trigger: 'mouseenter' })])

    fireEvent.pointerOver(noPalco('botao'))
    expect(titulo()).toBe('Fim')

    fireEvent.pointerLeave(document.querySelector('.player-viewport'))
    expect(titulo()).toBe('Fim')
  })

  it('"enquanto o mouse estiver em cima" desfaz ao sair do retângulo', () => {
    tocar([T1, BOTAO, T2], [ligacao('botao', 't2', { trigger: 'hover' })])

    fireEvent.pointerOver(noPalco('botao'))
    expect(titulo()).toBe('Fim')

    // O jsdom não faz layout: o retângulo guardado é todo zero, e (500, 500) está fora.
    fireEvent.pointerMove(document.querySelector('.player-viewport'), { clientX: 500, clientY: 500 })
    expect(titulo()).toBe('Início')
  })
})

describe('simulação: transições', () => {
  it('deslizar entre telas desenha as duas camadas e termina', async () => {
    tocar([T1, T2], [ligacao('t1', 't2', { transition: 'slide-left', duration: 30 })])

    fireEvent.click(noPalco('t1'))

    expect(document.querySelector('.player-in--slide-left')).toBeInTheDocument()
    expect(document.querySelector('.player-out--slide-left')).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('.player-layer--saindo')).toBeNull())
    expect(titulo()).toBe('Fim')
  })

  it('voltar toca o deslize ao contrário', async () => {
    tocar([T1, T2], [ligacao('t1', 't2', { transition: 'slide-left', duration: 30 })])

    fireEvent.click(noPalco('t1'))
    await waitFor(() => expect(document.querySelector('.player-layer--saindo')).toBeNull())

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(document.querySelector('.player-in--slide-right')).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('.player-layer--saindo')).toBeNull())
    expect(titulo()).toBe('Início')
  })

  it('a inteligente anima quadro a quadro e, no meio, ignora cliques', async () => {
    const de = forma('a', 20, 20, { name: 'Par' })
    const para = forma('b', 1020, 20, { name: 'Par' })
    tocar([T1, de, T2, para], [ligacao('t1', 't2', { transition: 'smart', duration: 40 })])

    fireEvent.click(noPalco('t1'))

    // Enquanto o quadro a quadro roda, o palco não tem área de clique nem gatilhos.
    expect(document.querySelector('.player-hotspot')).toBeNull()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => expect(noPalco('t2')).toBeInTheDocument())
    expect(titulo()).toBe('Fim')
  })

  it('ligação para objeto dentro da tela aproxima a câmera nele', async () => {
    const alvo = forma('alvo', 100, 100)
    tocar([T1, alvo], [ligacao('t1', 'alvo', { transition: 'dissolve', duration: 30 })])

    expect(viewBox()).toBe('0 0 300 400')
    fireEvent.click(noPalco('t1'))

    await waitFor(() => expect(viewBox()).not.toBe('0 0 300 400'))
    await waitFor(() => expect(noPalco('t1')).toBeInTheDocument())
    expect(titulo()).toBe('Início')
  })

  it('ligação para objeto fora das telas abre por cima, e o véu fecha', async () => {
    const cartao = forma('cartao', 2000, 2000, { width: 100, height: 100 })
    tocar([T1, cartao], [ligacao('t1', 'cartao')])

    expect(document.querySelector('[data-backdrop]')).toBeNull()
    fireEvent.click(noPalco('t1'))

    const veu = document.querySelector('[data-backdrop]')
    expect(veu).toBeInTheDocument()
    expect(noPalco('cartao')).toBeInTheDocument()

    fireEvent.click(veu)
    expect(document.querySelector('[data-backdrop]')).toBeNull()
    expect(noPalco('cartao')).toBeNull()
  })
})

describe('simulação: tela cheia', () => {
  afterEach(() => {
    delete document.fullscreenEnabled
    delete document.fullscreenElement
    delete document.exitFullscreen
    delete document.documentElement.requestFullscreen
  })

  it('sem suporte do navegador, o botão não aparece', () => {
    tocar([T1], [])

    expect(screen.queryByRole('button', { name: 'Tela cheia' })).not.toBeInTheDocument()
  })

  it('entra, acompanha o navegador, sai e não deixa o app preso ao fechar', async () => {
    const usuario = userEvent.setup()
    document.fullscreenEnabled = true
    document.fullscreenElement = null
    document.documentElement.requestFullscreen = vi.fn(async () => {})
    document.exitFullscreen = vi.fn(async () => {})
    const { unmount } = tocar([T1], [])

    await usuario.click(screen.getByRole('button', { name: 'Tela cheia' }))
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledOnce()

    document.fullscreenElement = document.documentElement
    fireEvent(document, new Event('fullscreenchange'))
    const sair = await screen.findByRole('button', { name: 'Sair da tela cheia' })

    await usuario.click(sair)
    expect(document.exitFullscreen).toHaveBeenCalledOnce()

    unmount()
    expect(document.exitFullscreen).toHaveBeenCalledTimes(2)
  })
})

describe('página de leitura', () => {
  const OBRA = {
    id: 'p1',
    titulo: 'Aurora',
    autor_id: 'bia',
    autor_nome: 'Bia',
    categoria: '',
    criado: '2026-10-11T12:00:00Z',
    likes: 0,
    curtido: false,
    conteudo: { elements: [T1, T2], connections: [ligacao('t1', 't2')], startScreen: 't2' },
  }
  const abrir = (rota) => renderizarApp('/projeto/p1/ler', { usuario: USUARIO, ...rota })

  it('abre na tela inicial do projeto, com as setas', async () => {
    abrir({ rotas: { 'GET /api/projects/p1/leitura': { project: OBRA } } })

    await screen.findByRole('button', { name: 'Sair da leitura' })
    expect(titulo()).toBe('Fim')
    expect(screen.getByRole('button', { name: 'Próxima tela' })).toBeInTheDocument()
  })

  it('projeto sem conteúdo avisa que não há telas', async () => {
    abrir({ rotas: { 'GET /api/projects/p1/leitura': { project: { ...OBRA, conteudo: null } } } })

    expect(await screen.findByText('Este projeto ainda não tem telas para navegar.')).toBeInTheDocument()
  })

  it('projeto indisponível mostra o erro e o caminho de volta', async () => {
    abrir({ rotas: { 'GET /api/projects/p1/leitura': new Error('Projeto não encontrado.') } })

    expect(await screen.findByText('Projeto não encontrado.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Voltar para o início' })).toHaveAttribute('href', '/')
  })

  it('sair volta para a apresentação, com o convite ao like', async () => {
    const usuario = userEvent.setup()
    abrir({ rotas: { 'GET /api/projects/p1/leitura': { project: OBRA } } })

    await usuario.click(await screen.findByRole('button', { name: 'Sair da leitura' }))

    expect(await screen.findByText('Gostou da leitura? Deixe seu like.')).toBeInTheDocument()
  })
})

describe('medição de texto', () => {
  // Fonte de 20px: 10px por caractere, linha de 26px (altura 1,3).
  const texto = (text, extra = {}) => ({ id: 'x', type: 'text', x: 0, y: 0, text, fontSize: 20, fill: '#fff', ...extra })

  it('sem largura, a caixa acompanha o conteúdo', () => {
    const medida = measureText(texto('Olá'))

    expect(medida.width).toBe(30)
    expect(medida.height).toBe(20 * DEFAULT_LINE_HEIGHT)
    expect(medida.isAutoSize).toBe(true)
    expect(medida.rows).toHaveLength(1)
  })

  it('quebra de linha manual cria uma linha por parágrafo, e a linha vazia tem altura', () => {
    const medida = measureText(texto('ab\n\ncde'))

    expect(medida.rows.map((linha) => linha.text)).toEqual(['ab', '', 'cde'])
    expect(medida.width).toBe(30)
    expect(medida.contentHeight).toBe(3 * 20 * DEFAULT_LINE_HEIGHT)
    expect(medida.rows[2].top).toBe(2 * 20 * DEFAULT_LINE_HEIGHT)
  })

  it('com largura, reflui por palavra e o espaço some na quebra', () => {
    const medida = measureText(texto('um dois tres', { width: 60 }))

    expect(medida.rows.map((linha) => linha.text)).toEqual(['um', 'dois', 'tres'])
    expect(medida.width).toBe(60)
    expect(medida.isAutoSize).toBe(false)
  })

  it('palavras que cabem juntas ficam na mesma linha', () => {
    const medida = measureText(texto('um dois tres', { width: 75 }))

    expect(medida.rows.map((linha) => linha.text)).toEqual(['um dois', 'tres'])
  })

  it('palavra maior que a caixa é quebrada por caractere, sem partir emoji', () => {
    expect(measureText(texto('abcdefgh', { width: 30 })).rows.map((linha) => linha.text)).toEqual(['abc', 'def', 'gh'])

    const comEmoji = measureText(texto('a😀b', { width: 25 }))
    expect(comEmoji.rows.map((linha) => linha.text).join('')).toBe('a😀b')
    expect(comEmoji.rows.every((linha) => !/[\uD800-\uDBFF]$/.test(linha.text))).toBe(true)
  })

  it('altura fixa manda na caixa, mas o conteúdo continua medido', () => {
    const medida = measureText(texto('um', { height: 100 }))

    expect(medida.height).toBe(100)
    expect(medida.contentHeight).toBe(20 * DEFAULT_LINE_HEIGHT)
  })

  it('alinhamento vertical usa o que sobra da caixa', () => {
    const metricas = { height: 100, contentHeight: 40 }

    expect(verticalOffset(metricas, { verticalAlign: 'top' })).toBe(0)
    expect(verticalOffset(metricas, { verticalAlign: 'middle' })).toBe(30)
    expect(verticalOffset(metricas, { verticalAlign: 'bottom' })).toBe(60)
  })

  it('cada trecho é medido com a própria fonte, e a linha tem a altura do maior', () => {
    const medida = measureText(texto('abcd', { runs: [{ start: 2, end: 4, fontSize: 40 }] }))

    // ab a 10px + cd a 20px por caractere.
    expect(medida.width).toBe(2 * 10 + 2 * 20)
    expect(medida.rows[0].height).toBe(40 * DEFAULT_LINE_HEIGHT)
    expect(medida.rows[0].segments.map((trecho) => trecho.text)).toEqual(['ab', 'cd'])
    expect(medida.rows[0].baseline).toBe(40 * 0.8)
  })

  it('o mesmo objeto não é medido duas vezes; objeto novo, sim', () => {
    const elemento = texto('cache')

    expect(measureText(elemento)).toBe(measureText(elemento))
    expect(measureText({ ...elemento })).not.toBe(measureText(elemento))
  })

  it('sem suporte a document.fonts, assinar o carregamento não quebra', () => {
    const cancelar = onFontsLoaded(() => {})

    expect(() => cancelar()).not.toThrow()
  })
})

describe('desenho de um elemento', () => {
  const desenhar = (element, props) =>
    render(
      <svg>
        <CanvasElement element={element} {...props} />
      </svg>,
    ).container

  it('retângulo e tela levam a área de clique no próprio desenho', () => {
    const svg = desenhar(forma('r', 1, 2, { radius: 8 }), { hitId: 'r', hitClassName: 'player-hotspot' })

    const rect = svg.querySelector('rect')
    expect(rect).toHaveAttribute('data-el', 'r')
    expect(rect).toHaveClass('player-hotspot')
    expect(rect).toHaveAttribute('rx', '8')
  })

  it('sem hitId o elemento é só decorativo', () => {
    expect(desenhar(forma('r', 0, 0)).querySelector('[data-el]')).toBeNull()
  })

  it('elipse é desenhada a partir do centro da caixa', () => {
    const elipse = desenhar({ ...forma('e', 10, 20), type: 'ellipse' }, { hitId: 'e' }).querySelector('ellipse')

    expect(elipse).toHaveAttribute('cx', '30')
    expect(elipse).toHaveAttribute('cy', '40')
    expect(elipse).toHaveAttribute('data-el', 'e')
  })

  it('ícone desenha o traço na cor de preenchimento, com área de clique própria', () => {
    const svg = desenhar(
      { id: 'i', type: 'icon', x: 0, y: 0, width: 24, height: 24, path: 'M0 0h24', fill: '#abcdef', strokeWidth: 2 },
      { hitId: 'i' },
    )

    expect(svg.querySelector('path')).toHaveAttribute('d', 'M0 0h24')
    expect(svg.querySelector('path')).toHaveAttribute('stroke', '#abcdef')
    expect(svg.querySelector('rect')).toHaveAttribute('data-el', 'i')
  })

  it('imagem tem área de clique própria, para funcionar com o arquivo quebrado', () => {
    const svg = desenhar(
      { id: 'm', type: 'image', x: 0, y: 0, width: 50, height: 50, src: 'https://exemplo.test/a.png' },
      { hitId: 'm' },
    )

    expect(svg.querySelector('image')).toHaveAttribute('href', 'https://exemplo.test/a.png')
    expect(svg.querySelector('rect')).toHaveAttribute('data-el', 'm')
  })

  it('texto vira um tspan por trecho, com o alinhamento pedido', () => {
    const svg = desenhar(
      {
        id: 't', type: 'text', x: 10, y: 0, width: 100, text: 'abcd', fontSize: 20, fill: '#111111',
        textAlign: 'right', runs: [{ start: 2, end: 4, fill: '#ff0000' }],
      },
      { hitId: 't' },
    )

    const trechos = [...svg.querySelectorAll('tspan')]
    expect(trechos.map((trecho) => trecho.textContent)).toEqual(['ab', 'cd'])
    expect(trechos[1]).toHaveAttribute('fill', '#ff0000')
    expect(svg.querySelector('text')).toHaveAttribute('text-anchor', 'end')
    expect(trechos[0]).toHaveAttribute('x', '110')
    expect(svg.querySelector('rect')).toHaveAttribute('data-el', 't')
  })
})
