import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '../src/api.js'
import { createStore, useStore } from '../src/canvas/store.js'
import CategoryTabs from '../src/components/CategoryTabs.jsx'
import MyReports from '../src/components/MyReports.jsx'
import TermsDialog, { MIN_READ_MS } from '../src/components/TermsDialog.jsx'
import { ALL_TAGS, useProjectFilter } from '../src/projectFilter.js'
import { simularApi } from './helpers.jsx'

vi.mock('../src/api.js', async (original) => ({
  ...(await original()),
  apiRequest: vi.fn(),
  authRequest: vi.fn(),
  uploadImage: vi.fn(),
}))

const TERMOS = {
  titulo: 'Termos de Uso e Política de Privacidade',
  versao: '2026-10',
  vigenciaDesde: '2026-10-11',
  secoes: [
    { titulo: '1. Aceite', paragrafos: ['Ao criar a conta você aceita estes termos.'] },
    { titulo: '2. Dados', paragrafos: ['Guardamos o e-mail.', 'Não vendemos dados.'] },
  ],
}

describe('TermsDialog', () => {
  /**
   * O contador soma `performance.now()` a cada 200 ms. Com o intervalo falso do
   * Vitest e o `performance.now()` simulado, o teste anda o tempo de propósito
   * em vez de esperar 5 s de verdade.
   */
  function relogio() {
    let agora = 0
    vi.spyOn(performance, 'now').mockImplementation(() => agora)
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    return {
      // Um `act` por tique, como no navegador: cada tique renderiza antes do
      // próximo. Vários tiques num `act` só acumulariam atualizações pendentes.
      avancar: (ms) => {
        for (let passo = 0; passo < ms; passo += 200) {
          agora += 200
          act(() => vi.advanceTimersByTime(200))
        }
      },
    }
  }

  afterEach(() => vi.useRealTimers())

  it('mostra título, versão, data no formato brasileiro e todas as seções', () => {
    render(<TermsDialog terms={TERMOS} onClose={() => {}} />)

    const dialogo = within(screen.getByRole('dialog'))
    expect(dialogo.getByRole('heading', { level: 2 })).toHaveTextContent(TERMOS.titulo)
    expect(dialogo.getByText('Versão 2026-10 · vigente desde 11/10/2026')).toBeInTheDocument()
    expect(dialogo.getAllByRole('heading', { level: 3 })).toHaveLength(2)
    expect(dialogo.getByText('Não vendemos dados.')).toBeInTheDocument()
  })

  it('só leitura: um botão "Fechar", sem aceite nem barra de progresso', async () => {
    const usuario = userEvent.setup()
    const fechar = vi.fn()
    render(<TermsDialog terms={TERMOS} onClose={fechar} />)

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus()
    await usuario.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(fechar).toHaveBeenCalledOnce()
  })

  it('Esc e clique no véu fecham; clique dentro do cartão não', () => {
    const fechar = vi.fn()
    render(<TermsDialog terms={TERMOS} onClose={fechar} />)

    fireEvent.mouseDown(screen.getByText('Guardamos o e-mail.'))
    expect(fechar).not.toHaveBeenCalled()

    fireEvent.mouseDown(screen.getByRole('dialog'))
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(fechar).toHaveBeenCalledTimes(2)
  })

  it(`o aceite só libera depois de ${MIN_READ_MS / 1000} s com os termos abertos`, () => {
    const tempo = relogio()
    const aceitar = vi.fn()
    render(<TermsDialog terms={TERMOS} onAccept={aceitar} onClose={() => {}} />)

    const botao = screen.getByRole('button', { name: 'Leia os termos (5s)' })
    expect(botao).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()

    tempo.avancar(2000)
    expect(botao).toHaveTextContent('Leia os termos (3s)')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2000')
    expect(botao).toBeDisabled()

    tempo.avancar(3000)
    expect(botao).toBeEnabled()
    expect(botao).toHaveTextContent('Li e aceito')
    fireEvent.click(botao)
    expect(aceitar).toHaveBeenCalledOnce()
  })

  it('com a aba escondida o tempo não conta', () => {
    const tempo = relogio()
    const visibilidade = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    render(<TermsDialog terms={TERMOS} onAccept={() => {}} onClose={() => {}} />)

    tempo.avancar(10000)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')

    // O tempo escondido foi descartado: ao voltar, conta só o que passar dali em diante.
    visibilidade.mockReturnValue('visible')
    tempo.avancar(1000)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1000')
  })
})

describe('CategoryTabs', () => {
  it('só "Todos" não tem o que escolher: nada aparece', () => {
    const { container } = render(<CategoryTabs categories={['Todos']} active="Todos" onChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('marca a aba ativa e avisa a escolhida', async () => {
    const usuario = userEvent.setup()
    const trocar = vi.fn()
    render(
      <CategoryTabs categories={['Todos', 'Aventura', 'Drama']} active="Aventura" onChange={trocar} label="Categorias" />,
    )

    const nav = screen.getByRole('navigation', { name: 'Categorias' })
    expect(within(nav).getByRole('button', { name: 'Aventura' })).toHaveClass('active')
    expect(within(nav).getByRole('button', { name: 'Drama' })).not.toHaveClass('active')

    await usuario.click(screen.getByRole('button', { name: 'Drama' }))
    expect(trocar).toHaveBeenCalledWith('Drama')
  })
})

describe('MyReports', () => {
  const renderizar = () =>
    render(
      <MemoryRouter>
        <MyReports />
      </MemoryRouter>,
    )

  it('começa fechado, com o total no cabeçalho, e abre os dois grupos', async () => {
    const usuario = userEvent.setup()
    simularApi({
      'GET /api/users/me/denuncias': {
        projects: [
          { id: 3, titulo: 'Obra pública', status: 'publicado', autor_nome: 'Bia', capa: 'https://exemplo.test/c.png' },
          { id: 4, titulo: 'Obra escondida', status: 'privado', autor_email: 'caio@example.com' },
        ],
        creators: [{ id: 8, nome: null, email: 'dani@example.com', foto: null }],
      },
    })
    renderizar()

    const alternar = screen.getByRole('button', { name: /Denúncias feitas/ })
    expect(alternar).toHaveAttribute('aria-expanded', 'false')
    expect(await within(alternar).findByText('3')).toBeInTheDocument()

    await usuario.click(alternar)
    expect(alternar).toHaveAttribute('aria-expanded', 'true')

    // Publicado tem link; privado aparece sem link e marcado como indisponível.
    expect(screen.getByRole('link', { name: /Obra pública/ })).toHaveAttribute('href', '/projeto/3')
    expect(screen.queryByRole('link', { name: /Obra escondida/ })).not.toBeInTheDocument()
    expect(screen.getByText('Obra escondida').closest('.reported-item')).toHaveTextContent('Indisponível')
    expect(screen.getByText('caio@example.com')).toBeInTheDocument()

    // Criador sem nome aparece pelo e-mail e leva ao perfil.
    expect(screen.getByRole('link', { name: /dani@example.com/ })).toHaveAttribute('href', '/perfil/8')

    await usuario.click(alternar)
    expect(screen.queryByText('Obra pública')).not.toBeInTheDocument()
  })

  it('sem denúncias, explica onde elas se fazem', async () => {
    const usuario = userEvent.setup()
    simularApi({ 'GET /api/users/me/denuncias': { projects: [], creators: [] } })
    renderizar()

    await usuario.click(screen.getByRole('button', { name: /Denúncias feitas/ }))

    expect(await screen.findByText(/Você ainda não fez nenhuma denúncia/)).toBeInTheDocument()
    expect(apiRequest).toHaveBeenCalledWith('/api/users/me/denuncias')
  })

  it('erro ao carregar aparece ao abrir, sem total no cabeçalho', async () => {
    const usuario = userEvent.setup()
    simularApi({ 'GET /api/users/me/denuncias': new Error('Não foi possível carregar suas denúncias.') })
    renderizar()

    await usuario.click(screen.getByRole('button', { name: /Denúncias feitas/ }))

    expect(await screen.findByText('Não foi possível carregar suas denúncias.')).toBeInTheDocument()
    expect(document.querySelector('.reported-toggle .profile-works-count')).toBeNull()
  })
})

describe('useProjectFilter', () => {
  const PROJETOS = [
    { id: 1, titulo: 'Aurora', autor: 'Ana', categoria: 'Aventura, Ação' },
    { id: 2, titulo: 'Borealis', autor: 'Bruno', categoria: 'aventura drama' },
    { id: 3, titulo: 'Céu', autor: 'Ana', categoria: '' },
  ]
  const campos = (projeto) => [projeto.titulo, projeto.autor]

  it('cada tag vira uma aba; a mesma tag em grafias diferentes é uma aba só', () => {
    const { result } = renderHook(() => useProjectFilter(PROJETOS, campos))

    expect(result.current.categories).toEqual([ALL_TAGS, 'Aventura', 'Ação', 'drama'])
    expect(result.current.activeCategory).toBe(ALL_TAGS)
    expect(result.current.visibleProjects).toHaveLength(3)
  })

  it('filtra pela aba ignorando caixa e pela pesquisa ignorando acento', () => {
    const { result } = renderHook(() => useProjectFilter(PROJETOS, campos))

    act(() => result.current.setActiveCategory('Aventura'))
    expect(result.current.visibleProjects.map((p) => p.id)).toEqual([1, 2])

    act(() => result.current.setSearch('  bruno '))
    expect(result.current.visibleProjects.map((p) => p.id)).toEqual([2])

    act(() => {
      result.current.setActiveCategory(ALL_TAGS)
      result.current.setSearch('ceu')
    })
    expect(result.current.visibleProjects.map((p) => p.id)).toEqual([3])
  })
})

describe('store do canvas', () => {
  it('avisa os assinantes só quando o valor muda de fato', () => {
    const store = createStore(1)
    const ouvinte = vi.fn()
    const cancelar = store.subscribe(ouvinte)

    store.set(1)
    expect(ouvinte).not.toHaveBeenCalled()
    store.set(2)
    expect(store.get()).toBe(2)
    expect(ouvinte).toHaveBeenCalledOnce()

    cancelar()
    store.set(3)
    expect(ouvinte).toHaveBeenCalledOnce()
  })

  it('useStore re-renderiza o componente quando o store muda', () => {
    const store = createStore({ x: 0, y: 0 })
    const { result } = renderHook(() => useStore(store))

    expect(result.current).toEqual({ x: 0, y: 0 })
    act(() => store.set({ x: 10, y: 20 }))
    expect(result.current).toEqual({ x: 10, y: 20 })
  })
})
