import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '../src/api.js'
import ShareDialog from '../src/canvas/ShareDialog.jsx'
import { formatarPrazo, urlDoConvite } from '../src/canvas/share.js'
import { USUARIO, renderizarApp, simularApi } from './helpers.jsx'

vi.mock('../src/api.js', async (original) => ({
  ...(await original()),
  apiRequest: vi.fn(),
  authRequest: vi.fn(),
  uploadImage: vi.fn(),
}))

/*
 * O canvas precisa de duas coisas que o jsdom não tem: `matchMedia` (os
 * painéis começam recolhidos no celular) e um contexto 2D para medir texto.
 * Os projetos daqui só têm telas, mas o mapa cria o contexto mesmo assim.
 */
beforeAll(() => {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  HTMLCanvasElement.prototype.getContext = () => ({
    font: '',
    measureText: (texto) => ({ width: texto.length * 5, fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 2, hangingBaseline: 8 }),
  })
})

const TELA = { id: 't1', type: 'screen', x: 0, y: 0, width: 300, height: 400, name: 'Início', fill: '#111111' }
const CONTEUDO = { version: 2, elements: [TELA], connections: [], startScreen: 't1' }
const AMANHA = '2026-11-17T15:30:00.000Z'

const projetoDoEditor = (extra = {}) => ({
  id: 'p1', titulo: 'Aurora', status: 'privado', capa: null, conteudo: CONTEUDO, versao: 3, papel: 'dono', ...extra,
})

/** O cabeçalho do canvas (a biblioteca de ícones também tem um "Compartilhar"). */
const cabecalho = async () => (await screen.findByRole('heading', { name: 'Aurora' })).closest('header')

const erroHttp = (status, message) => Object.assign(new Error(message), { status })

describe('diálogo de compartilhar', () => {
  const SEM_NADA = { links: [], colaboradores: [] }

  function abrir(rotas = {}) {
    simularApi({ 'GET /api/projects/p1/compartilhamento': SEM_NADA, ...rotas })
    const fechar = vi.fn()
    render(<ShareDialog project={{ id: 'p1', titulo: 'Aurora' }} onClose={fechar} />)
    return { fechar }
  }

  it('gera um link de colaboração com a validade escolhida e mostra o endereço', async () => {
    const usuario = userEvent.setup()
    const criar = vi.fn(() => ({ link: { id: 'l1', tipo: 'colaboracao', expira_em: AMANHA, token: 'segredo' } }))
    abrir({ 'POST /api/projects/p1/links': criar })

    const secao = within(screen.getByRole('region', { name: 'Link de colaboração' }))
    await usuario.selectOptions(secao.getByLabelText('Validade'), '1 hora')
    await usuario.click(secao.getByRole('button', { name: 'Gerar link' }))

    expect(criar.mock.calls[0][0].json).toEqual({ tipo: 'colaboracao', horas: 1 })
    expect(await secao.findByLabelText('Link de colaboração gerado')).toHaveValue(
      `${window.location.origin}/convite/segredo`,
    )
    expect(secao.getByText(/o link só aparece desta vez/)).toBeInTheDocument()

    // O novo entra nos ativos, sem o segredo.
    const ativos = within(screen.getByRole('region', { name: 'Links ativos' }))
    expect(await ativos.findByText('Colaboração')).toBeInTheDocument()
  })

  it('revoga um link e remove um colaborador', async () => {
    const usuario = userEvent.setup()
    const revogar = vi.fn(() => null)
    const remover = vi.fn(() => null)
    abrir({
      'GET /api/projects/p1/compartilhamento': {
        links: [{ id: 'l1', tipo: 'visualizacao', criado_em: AMANHA, expira_em: AMANHA }],
        colaboradores: [{ id: 'u2', nome: 'Bia', email: 'bia@example.com' }],
      },
      'DELETE /api/projects/p1/links/l1': revogar,
      'DELETE /api/projects/p1/colaboradores/u2': remover,
    })

    await usuario.click(await screen.findByRole('button', { name: /Revogar link de visualização/ }))
    expect(revogar).toHaveBeenCalled()
    expect(await screen.findByText('Nenhum link ativo.')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Remover Bia do projeto' }))
    expect(remover).toHaveBeenCalled()
    expect(await screen.findByText('Ninguém colabora neste projeto ainda.')).toBeInTheDocument()
  })

  it('mostra o erro do servidor ao gerar', async () => {
    const usuario = userEvent.setup()
    abrir({ 'POST /api/projects/p1/links': new Error('Escolha uma validade de 1 hora, 24 horas ou 3 dias.') })

    const secao = within(screen.getByRole('region', { name: 'Link de visualização' }))
    await usuario.click(secao.getByRole('button', { name: 'Gerar link' }))
    expect(await secao.findByRole('status')).toHaveTextContent('Escolha uma validade')
  })

  it('Escape e Fechar encerram o diálogo', async () => {
    const usuario = userEvent.setup()
    const { fechar } = abrir()

    await usuario.keyboard('{Escape}')
    await usuario.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(fechar).toHaveBeenCalledTimes(2)
  })
})

describe('ajudantes do compartilhamento', () => {
  it('monta o endereço do convite e escreve o prazo', () => {
    expect(urlDoConvite('abc', 'https://exemplo.test')).toBe('https://exemplo.test/convite/abc')
    expect(formatarPrazo(new Date(2026, 10, 17, 9, 5))).toBe('17/11 às 09:05')
  })
})

describe('canvas: dono, colaborador e visualização', () => {
  it('o dono vê Compartilhar e abre o diálogo', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/editor/p1', {
      usuario: USUARIO,
      rotas: {
        'GET /api/projects/p1': { project: projetoDoEditor() },
        'GET /api/projects/p1/compartilhamento': { links: [], colaboradores: [] },
      },
    })

    await usuario.click(within(await cabecalho()).getByRole('button', { name: 'Compartilhar' }))
    expect(screen.getByRole('dialog', { name: 'Compartilhar projeto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeInTheDocument()
  })

  it('o colaborador salva, mas não publica, não compartilha nem troca a capa', async () => {
    renderizarApp('/editor/p1', {
      usuario: USUARIO,
      rotas: { 'GET /api/projects/p1': { project: projetoDoEditor({ papel: 'colaborador', autor_nome: 'Caio' }) } },
    })

    expect(await screen.findByText('Colaborador')).toBeInTheDocument()
    expect(screen.getByText('de Caio')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument()
    expect(within(await cabecalho()).queryByRole('button', { name: 'Compartilhar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /capa/ })).not.toBeInTheDocument()
    expect(screen.getByText('Só o dono do projeto troca a capa.')).toBeInTheDocument()
  })

  it('salvar manda a versão aberta; com 409, pergunta e pode sobrescrever', async () => {
    const usuario = userEvent.setup()
    const gravacoes = []
    renderizarApp('/editor/p1', {
      usuario: USUARIO,
      rotas: {
        'GET /api/projects/p1': { project: projetoDoEditor() },
        'PUT /api/projects/p1/conteudo': (opcoes) => {
          gravacoes.push(opcoes.json)
          return gravacoes.length === 1
            ? erroHttp(409, 'Outra pessoa salvou este projeto enquanto você editava.')
            : { versao: 5 }
        },
      },
    })

    await usuario.click(await screen.findByRole('button', { name: 'Salvar' }))
    expect(gravacoes[0].versao).toBe(3)
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Outra pessoa salvou este projeto')

    await usuario.click(within(alerta).getByRole('button', { name: 'Sobrescrever com a minha' }))
    expect(gravacoes[1]).not.toHaveProperty('versao')
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('no conflito, Recarregar busca a versão do servidor', async () => {
    const usuario = userEvent.setup()
    let leituras = 0
    renderizarApp('/editor/p1', {
      usuario: USUARIO,
      rotas: {
        'GET /api/projects/p1': () => {
          leituras += 1
          return { project: projetoDoEditor({ versao: leituras === 1 ? 3 : 4 }) }
        },
        'PUT /api/projects/p1/conteudo': erroHttp(409, 'Outra pessoa salvou este projeto enquanto você editava.'),
      },
    })

    await usuario.click(await screen.findByRole('button', { name: 'Salvar' }))
    await usuario.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Recarregar' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(leituras).toBe(2)
  })
})

describe('página do convite', () => {
  const CONVITE_COLABORACAO = {
    tipo: 'colaboracao',
    expira_em: AMANHA,
    jaPodeEditar: false,
    projeto: { id: 'p1', titulo: 'Aurora', autor_nome: 'Caio' },
  }

  it('aceitar o convite de colaboração leva ao editor como colaborador', async () => {
    const usuario = userEvent.setup()
    const aceitar = vi.fn(() => ({ projeto: { id: 'p1' } }))
    renderizarApp('/convite/abc', {
      usuario: USUARIO,
      rotas: {
        'GET /api/convites/abc': { convite: CONVITE_COLABORACAO },
        'POST /api/convites/abc/aceitar': aceitar,
        'GET /api/projects/p1': { project: projetoDoEditor({ papel: 'colaborador', autor_nome: 'Caio' }) },
      },
    })

    expect(await screen.findByText(/convidou você para/)).toHaveTextContent('Caio convidou você para editar “Aurora”.')
    await usuario.click(screen.getByRole('button', { name: 'Aceitar e abrir' }))

    expect(aceitar).toHaveBeenCalled()
    expect(await screen.findByText('Colaborador')).toBeInTheDocument()
  })

  it('quem já pode editar só abre o editor', async () => {
    renderizarApp('/convite/abc', {
      usuario: USUARIO,
      rotas: { 'GET /api/convites/abc': { convite: { ...CONVITE_COLABORACAO, jaPodeEditar: true } } },
    })

    expect(await screen.findByText('Você já pode editar este projeto.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir no editor' })).toHaveAttribute('href', '/editor/p1')
  })

  it('link de visualização abre o canvas sem nada de edição', async () => {
    renderizarApp('/convite/abc', {
      usuario: USUARIO,
      rotas: {
        'GET /api/convites/abc': {
          convite: {
            tipo: 'visualizacao',
            expira_em: AMANHA,
            projeto: { id: 'p1', titulo: 'Aurora', autor_nome: 'Caio', conteudo: CONTEUDO, versao: 3 },
          },
        },
      },
    })

    expect(await screen.findByText('Somente visualização')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Aurora' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '▶ Simular' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument()
    expect(screen.queryByText('Propriedades')).not.toBeInTheDocument()
    expect(document.querySelector('[data-el="t1"]')).toBeInTheDocument()
    expect(apiRequest).not.toHaveBeenCalledWith('/api/projects/p1', expect.anything())
  })

  it('link inválido ou vencido avisa', async () => {
    renderizarApp('/convite/abc', {
      usuario: USUARIO,
      rotas: { 'GET /api/convites/abc': erroHttp(404, 'Link inválido ou expirado.') },
    })

    expect(await screen.findByRole('status')).toHaveTextContent('Link inválido ou expirado.')
  })

  it('sem sessão, o convite espera o login e abre depois dele', async () => {
    const { authRequest } = await import('../src/api.js')
    const usuario = userEvent.setup()
    authRequest.mockResolvedValue({ token: 'token-novo' })
    renderizarApp('/convite/abc', {
      rotas: {
        'GET /api/auth/me': { user: USUARIO },
        'GET /api/convites/abc': { convite: CONVITE_COLABORACAO },
      },
    })

    await usuario.type(await screen.findByLabelText('E-mail'), 'ana@example.com')
    await usuario.type(screen.getByLabelText('Senha'), 'segredo123')
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('button', { name: 'Aceitar e abrir' })).toBeInTheDocument()
    await waitFor(() => expect(sessionStorage.getItem('schedio.depoisDoLogin')).toBeNull())
  })
})

describe('compartilhados comigo no /editor', () => {
  it('lista os projetos de outras pessoas e permite sair com confirmação', async () => {
    const usuario = userEvent.setup()
    const sair = vi.fn(() => null)
    renderizarApp('/editor', {
      usuario: USUARIO,
      rotas: {
        'GET /api/projects/mine': { projects: [] },
        'GET /api/projects/compartilhados': {
          projects: [{ id: 'p9', titulo: 'Do Caio', autor_nome: 'Caio', status: 'privado', capa: null }],
        },
        [`DELETE /api/projects/p9/colaboradores/${USUARIO.id}`]: sair,
      },
    })

    const secao = within(await screen.findByRole('region', { name: 'Compartilhados comigo' }))
    expect(secao.getByText('de Caio')).toBeInTheDocument()
    expect(secao.getByRole('link', { name: 'Abrir' })).toHaveAttribute('href', '/editor/p9')

    await usuario.click(secao.getByRole('button', { name: 'Sair' }))
    expect(sair).not.toHaveBeenCalled()
    await usuario.click(secao.getByRole('button', { name: 'Confirmar saída' }))
    expect(sair).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('Do Caio')).not.toBeInTheDocument())
  })
})
