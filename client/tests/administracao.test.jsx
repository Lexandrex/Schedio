import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { USUARIO, renderizarApp } from './helpers.jsx'

vi.mock('../src/api.js', async (original) => ({
  ...(await original()),
  apiRequest: vi.fn(),
  authRequest: vi.fn(),
  uploadImage: vi.fn(),
}))

const ADMIN = { ...USUARIO, id: 'eu', admin: true, dono: false }
const DONO = { ...USUARIO, id: 'eu', admin: true, dono: true }

const OBRA_DENUNCIADA = {
  id: 'p1', titulo: 'Conto Ruim', status: 'publicado', denuncias: 3, autor_id: 'u2', autor_nome: 'Bia', autor_email: 'bia@example.com',
}
const CRIADOR = { id: 'u2', nome: 'Bia', email: 'bia@example.com', denuncias: 2, projetos: 1, admin: false, dono: false }
const DENUNCIAS = { projects: [OBRA_DENUNCIADA], creators: [CRIADOR] }

function abrirAdmin(usuario = ADMIN, rotas = {}) {
  return renderizarApp('/admin', {
    usuario,
    rotas: { 'GET /api/admin/denuncias': DENUNCIAS, ...rotas },
  })
}

const aba = async (usuario, nome) => usuario.click(await screen.findByRole('tab', { name: nome }))

describe('acesso à administração', () => {
  it('quem não é administrador vê o aviso e não tem o atalho no menu', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/admin', { usuario: USUARIO })

    expect(await screen.findByText('Acesso restrito a administradores.')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Menu da conta' }))
    expect(screen.queryByRole('link', { name: 'Administração' })).not.toBeInTheDocument()
  })

  it('administrador tem o atalho no menu da conta', async () => {
    const usuario = userEvent.setup()
    abrirAdmin()

    await usuario.click(await screen.findByRole('button', { name: 'Menu da conta' }))
    expect(screen.getByRole('link', { name: 'Administração' })).toHaveAttribute('href', '/admin')
  })
})

describe('aba Denúncias (RN-15)', () => {
  it('lista as obras com o número de denúncias', async () => {
    abrirAdmin()

    const obras = within(await screen.findByRole('region', { name: 'Obras denunciadas' }))
    expect(obras.getByRole('link', { name: 'Conto Ruim' })).toHaveAttribute('href', '/projeto/p1')
    expect(obras.getByLabelText('3 denúncias')).toHaveTextContent('3')
    expect(obras.getByText(/de Bia · Pública/)).toBeInTheDocument()

    const criadores = within(screen.getByRole('region', { name: 'Criadores denunciados' }))
    expect(criadores.getByLabelText('2 denúncias')).toBeInTheDocument()
  })

  it('excluir obra pede confirmação e manda o motivo', async () => {
    const usuario = userEvent.setup()
    const excluir = vi.fn(() => null)
    abrirAdmin(ADMIN, { 'DELETE /api/admin/projetos/p1': excluir })

    await usuario.click(await screen.findByRole('button', { name: 'Excluir obra' }))
    const confirmacao = within(screen.getByRole('alertdialog', { name: 'Excluir Conto Ruim' }))
    await usuario.type(confirmacao.getByRole('textbox'), 'Plágio.')
    await usuario.click(confirmacao.getByRole('button', { name: 'Excluir por má conduta' }))

    expect(excluir.mock.calls[0][0].json).toEqual({ motivo: 'Plágio.' })
    expect(await screen.findByRole('status')).toHaveTextContent('"Conto Ruim" foi excluída. Bia foi avisado(a).')
    expect(screen.queryByRole('link', { name: 'Conto Ruim' })).not.toBeInTheDocument()
  })

  it('erro ao excluir fica na confirmação', async () => {
    const usuario = userEvent.setup()
    abrirAdmin(ADMIN, { 'DELETE /api/admin/projetos/p1': new Error('Projeto não encontrado.') })

    await usuario.click(await screen.findByRole('button', { name: 'Excluir obra' }))
    await usuario.click(screen.getByRole('button', { name: 'Excluir por má conduta' }))

    const confirmacao = within(screen.getByRole('alertdialog'))
    expect(await confirmacao.findByRole('status')).toHaveTextContent('Projeto não encontrado.')
  })

  it('excluir o criador tira as obras dele da lista', async () => {
    const usuario = userEvent.setup()
    const excluir = vi.fn(() => null)
    abrirAdmin(ADMIN, { 'DELETE /api/admin/usuarios/u2': excluir })

    const criadores = within(await screen.findByRole('region', { name: 'Criadores denunciados' }))
    await usuario.click(criadores.getByRole('button', { name: 'Excluir conta' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('uma cópia fica guardada por 6 meses')
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir conta' }))

    expect(excluir).toHaveBeenCalled()
    expect(await screen.findByText('Nenhuma obra denunciada.')).toBeInTheDocument()
    expect(screen.getByText('Nenhum criador denunciado.')).toBeInTheDocument()
  })

  it('não oferece excluir o dono, e só o dono exclui outro administrador', async () => {
    const creators = [
      { ...CRIADOR, id: 'dono', nome: 'Dona', dono: true, admin: true },
      { ...CRIADOR, id: 'adm', nome: 'Adm', admin: true },
    ]
    abrirAdmin(ADMIN, { 'GET /api/admin/denuncias': { projects: [], creators } })

    const botoes = await screen.findAllByRole('button', { name: 'Excluir conta' })
    expect(botoes[0]).toBeDisabled()
    expect(botoes[0]).toHaveAttribute('title', 'A conta do dono da plataforma não pode ser excluída.')
    expect(botoes[1]).toBeDisabled()
    expect(botoes[1]).toHaveAttribute('title', 'Só o dono da plataforma exclui a conta de outro administrador.')
  })
})

describe('aba Contas', () => {
  it('acha pelo e-mail e exclui', async () => {
    const usuario = userEvent.setup()
    const excluir = vi.fn(() => null)
    abrirAdmin(ADMIN, {
      'GET /api/admin/usuarios?email=bia%40example.com': { usuario: CRIADOR },
      'DELETE /api/admin/usuarios/u2': excluir,
    })

    await aba(usuario, 'Contas')
    await usuario.type(screen.getByLabelText('E-mail da conta'), 'bia@example.com')
    await usuario.click(screen.getByRole('button', { name: 'Buscar' }))
    await usuario.click(await screen.findByRole('button', { name: 'Excluir conta' }))
    await usuario.type(within(screen.getByRole('alertdialog')).getByRole('textbox'), 'Spam')
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir conta' }))

    expect(excluir.mock.calls[0][0].json).toEqual({ motivo: 'Spam' })
    expect(await screen.findByRole('status')).toHaveTextContent('A conta de Bia foi excluída.')
  })

  it('e-mail sem conta mostra o erro', async () => {
    const usuario = userEvent.setup()
    abrirAdmin(ADMIN, {
      'GET /api/admin/usuarios?email=x%40example.com': new Error('Nenhuma conta com esse e-mail.'),
    })

    await aba(usuario, 'Contas')
    await usuario.type(screen.getByLabelText('E-mail da conta'), 'x@example.com')
    await usuario.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Nenhuma conta com esse e-mail.')
  })
})

describe('aba Administradores', () => {
  const ADMINS = {
    admins: [
      { id: 'dono', nome: 'Dona', email: 'dona@example.com', dono: true, admin: true },
      { id: 'u3', nome: 'Caio', email: 'caio@example.com', dono: false, admin: true, admin_desde: '2026-11-10T12:00:00Z' },
    ],
  }

  it('concede pelo e-mail e revoga com confirmação; o dono não se revoga', async () => {
    const usuario = userEvent.setup()
    const conceder = vi.fn(() => ({ admin: { id: 'u4', nome: 'Duda', email: 'duda@example.com', admin: true } }))
    const revogar = vi.fn(() => null)
    abrirAdmin(DONO, {
      'GET /api/admin/admins': ADMINS,
      'POST /api/admin/admins': conceder,
      'DELETE /api/admin/admins/u3': revogar,
    })

    await aba(usuario, 'Administradores')
    expect(await screen.findByRole('button', { name: 'Revogar o acesso de Dona' })).toBeDisabled()

    await usuario.type(screen.getByLabelText('E-mail da conta'), 'duda@example.com')
    await usuario.click(screen.getByRole('button', { name: 'Conceder acesso' }))
    expect(conceder.mock.calls[0][0].json).toEqual({ email: 'duda@example.com' })
    expect(await screen.findByText('duda@example.com', { exact: false })).toBeInTheDocument()

    const botao = screen.getByRole('button', { name: 'Revogar o acesso de Caio' })
    await usuario.click(botao)
    expect(revogar).not.toHaveBeenCalled()
    expect(botao).toHaveTextContent('Confirmar')
    await usuario.click(botao)
    expect(revogar).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('Caio')).not.toBeInTheDocument())
  })
})

describe('aba Contas excluídas', () => {
  it('restaura só a encerrada por administrador', async () => {
    const usuario = userEvent.setup()
    const restaurar = vi.fn(() => ({ usuario: { id: 'u2' }, projetos: 2 }))
    abrirAdmin(ADMIN, {
      'GET /api/admin/contas-excluidas': {
        contas: [
          {
            id: 'c1', nome: 'Bia', email: 'bia@example.com', excluida_em: '2026-11-15T12:00:00Z', expira_em: '2027-05-15T12:00:00Z',
            excluida_por: 'eu', excluida_por_nome: 'Ana', motivo: 'Spam.', projetos: 2, restauravel: true,
          },
          {
            id: 'c2', nome: 'Caio', email: 'caio@example.com', excluida_em: '2026-11-14T12:00:00Z', expira_em: '2027-05-14T12:00:00Z',
            excluida_por: null, motivo: null, projetos: 0, restauravel: false,
          },
        ],
      },
      'POST /api/admin/contas-excluidas/c1/restaurar': restaurar,
    })

    await aba(usuario, 'Contas excluídas')
    expect(await screen.findByText(/por Ana/)).toBeInTheDocument()
    expect(screen.getByText('Motivo: Spam.')).toBeInTheDocument()
    expect(screen.getByText(/pela própria pessoa/)).toBeInTheDocument()

    const daPropria = screen.getByRole('button', { name: 'Restaurar a conta de Caio' })
    expect(daPropria).toBeDisabled()
    expect(daPropria).toHaveAttribute('title', 'Excluída pela própria pessoa: pelos Termos, não pode ser reativada.')

    await usuario.click(screen.getByRole('button', { name: 'Restaurar a conta de Bia' }))
    expect(restaurar).toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('A conta de Bia foi restaurada, com 2 projetos.')
  })
})

describe('avisos ao autor', () => {
  it('a tela inicial mostra o aviso até a pessoa marcar Entendi', async () => {
    const usuario = userEvent.setup()
    const lido = vi.fn(() => null)
    renderizarApp('/', {
      usuario: USUARIO,
      rotas: {
        'GET /api/projects': { projects: [] },
        'GET /api/avisos': {
          avisos: [{ id: 'a1', mensagem: 'Sua história "X" foi excluída por um administrador por má conduta.' }],
        },
        'POST /api/avisos/a1/lido': lido,
      },
    })

    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('foi excluída por um administrador por má conduta')
    await usuario.click(within(aviso).getByRole('button', { name: 'Entendi' }))
    expect(lido).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('compartilhar a história (RF-41)', () => {
  const OBRA = {
    id: 'p1', titulo: 'Aurora', descricao: '', categoria: '', capa: null, criado: '2026-11-01T12:00:00Z', likes: 0,
    autor_id: 'u2', autor_nome: 'Bia', curtido: false, salvo: false, denunciado: false,
    conteudo: { elements: [{ id: 't1', type: 'screen', x: 0, y: 0, width: 10, height: 10 }] },
  }

  const abrirObra = () =>
    renderizarApp('/projeto/p1', { usuario: USUARIO, rotas: { 'GET /api/projects/p1/leitura': { project: OBRA } } })

  it('o botão ao lado do Ler copia o link da apresentação', async () => {
    const usuario = userEvent.setup()
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    abrirObra()

    const ler = await screen.findByRole('button', { name: 'Ler' })
    const compartilhar = screen.getByRole('button', { name: 'Compartilhar' })
    expect(ler.parentElement).toBe(compartilhar.parentElement)

    await usuario.click(compartilhar)
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/projeto/p1`)
    expect(await screen.findByRole('button', { name: 'Link copiado!' })).toBeInTheDocument()
  })

  it('sem área de transferência, mostra o link para copiar à mão', async () => {
    const usuario = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => Promise.reject(new Error('negado'))) },
      configurable: true,
    })
    abrirObra()

    await usuario.click(await screen.findByRole('button', { name: 'Compartilhar' }))
    expect(await screen.findByRole('textbox')).toHaveValue(`${window.location.origin}/projeto/p1`)
  })

  it('sem sessão, o link da história espera o login', async () => {
    renderizarApp('/projeto/p1')

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(sessionStorage.getItem('schedio.depoisDoLogin')).toBe('/projeto/p1')
  })
})
