import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { USUARIO, renderizarApp } from './helpers.jsx'

vi.mock('../src/api.js', async (original) => ({
  ...(await original()),
  apiRequest: vi.fn(),
  authRequest: vi.fn(),
  uploadImage: vi.fn(),
}))

/* O canvas precisa de `matchMedia` e de um contexto 2D, que o jsdom não tem. */
beforeAll(() => {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  HTMLCanvasElement.prototype.getContext = () => ({
    font: '',
    measureText: (texto) => ({ width: texto.length * 5, fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 2, hangingBaseline: 8 }),
  })
})

const EU = { ...USUARIO, id: 'eu' }
const ROTAS_DA_CONTA = {
  'GET /api/users/eu/perfil': { projects: [] },
  'GET /api/users/me/denuncias': { projects: [], creators: [] },
}

/** Digita um código de 6 dígitos no `CodeInput` (um campo por dígito). */
function digitarCodigo(codigo) {
  const campos = screen.getAllByRole('textbox').filter((campo) => campo.closest('.code-inputs'))
  codigo.split('').forEach((digito, indice) => fireEvent.change(campos[indice], { target: { value: digito } }))
}

const cartaoDoEmail = () => within(screen.getByRole('region', { name: 'E-mail da conta' }))

describe('trocar o e-mail da conta (RF-04)', () => {
  it('pede o código com a senha atual e só troca depois de confirmar', async () => {
    const usuario = userEvent.setup()
    const pedir = vi.fn(() => ({ email_novo: 'nova@example.com', message: 'Enviamos um código para nova@example.com.' }))
    const confirmar = vi.fn(() => ({ user: { ...EU, email: 'nova@example.com' }, message: 'E-mail alterado com sucesso.' }))
    renderizarApp('/conta', {
      usuario: EU,
      rotas: {
        ...ROTAS_DA_CONTA,
        'POST /api/users/me/email': pedir,
        'POST /api/users/me/email/confirmar': confirmar,
      },
    })

    await usuario.click(await screen.findByRole('button', { name: 'Alterar e-mail' }))
    await usuario.type(cartaoDoEmail().getByLabelText('Novo e-mail'), 'nova@example.com')
    await usuario.type(cartaoDoEmail().getByLabelText('Senha atual'), 'segredo123')
    await usuario.click(cartaoDoEmail().getByRole('button', { name: 'Enviar código' }))

    expect(pedir.mock.calls[0][0].json).toEqual({ email: 'nova@example.com', password: 'segredo123' })
    expect(await cartaoDoEmail().findByText(/Digite o código que enviamos para/)).toHaveTextContent('nova@example.com')
    expect(cartaoDoEmail().getByText('ana@example.com')).toBeInTheDocument()

    const botao = cartaoDoEmail().getByRole('button', { name: 'Confirmar novo e-mail' })
    expect(botao).toBeDisabled()
    digitarCodigo('123456')
    await usuario.click(botao)

    expect(confirmar.mock.calls[0][0].json).toEqual({ code: '123456' })
    expect(await cartaoDoEmail().findByRole('status')).toHaveTextContent('E-mail alterado com sucesso.')
    expect(cartaoDoEmail().getByText('nova@example.com')).toBeInTheDocument()
  })

  it('mostra o erro do servidor', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/conta', {
      usuario: EU,
      rotas: { ...ROTAS_DA_CONTA, 'POST /api/users/me/email': new Error('Este e-mail já está cadastrado.') },
    })

    await usuario.click(await screen.findByRole('button', { name: 'Alterar e-mail' }))
    await usuario.type(cartaoDoEmail().getByLabelText('Novo e-mail'), 'ocupado@example.com')
    await usuario.type(cartaoDoEmail().getByLabelText('Senha atual'), 'segredo123')
    await usuario.click(cartaoDoEmail().getByRole('button', { name: 'Enviar código' }))

    expect(await cartaoDoEmail().findByRole('status')).toHaveTextContent('Este e-mail já está cadastrado.')
  })

  it('uma troca pendente reabre na etapa do código e pode ser cancelada', async () => {
    const usuario = userEvent.setup()
    const cancelar = vi.fn(() => null)
    renderizarApp('/conta', {
      usuario: { ...EU, email_novo: 'pendente@example.com' },
      rotas: { ...ROTAS_DA_CONTA, 'DELETE /api/users/me/email': cancelar },
    })

    expect(await screen.findByText('pendente@example.com')).toBeInTheDocument()
    await usuario.click(cartaoDoEmail().getByRole('button', { name: 'Cancelar troca' }))
    expect(cancelar).toHaveBeenCalled()
    expect(await cartaoDoEmail().findByRole('button', { name: 'Alterar e-mail' })).toBeInTheDocument()
  })
})

describe('selecionar vários objetos no canvas (RF-21)', () => {
  const forma = (id, x, y, name) => ({ id, type: 'rect', x, y, width: 40, height: 20, fill: '#ffffff', stroke: '#000000', name })
  const PROJETO = {
    id: 'p1', titulo: 'Aurora', status: 'privado', capa: null, papel: 'dono', versao: 0,
    conteudo: { version: 2, elements: [forma('a', 0, 0, 'Alfa'), forma('b', 100, 50, 'Beta')], connections: [] },
  }
  const abrirCanvas = () =>
    renderizarApp('/editor/p1', { usuario: EU, rotas: { 'GET /api/projects/p1': { project: PROJETO } } })

  const camadas = () => within(document.querySelector('.layers-panel'))
  const xDe = (id) => document.querySelector(`[data-el="${id}"]`).getAttribute('x')

  it('Shift + clique nas camadas junta a seleção, e o painel alinha o grupo', async () => {
    const usuario = userEvent.setup()
    abrirCanvas()

    await usuario.click(await screen.findByText('Alfa'))
    expect(document.querySelector('.properties-type')).toHaveTextContent('Retângulo')

    await usuario.keyboard('{Shift>}')
    await usuario.click(camadas().getByText('Beta'))
    await usuario.keyboard('{/Shift}')

    expect(screen.getByText('2 elementos selecionados')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-selecionado]')).toHaveLength(2)
    expect(camadas().getByText('2 selecionados')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Direita' }))
    expect(xDe('a')).toBe('100')
    expect(xDe('b')).toBe('100')
    expect(screen.getByText('Alterações não salvas')).toBeInTheDocument()
  })

  it('Ctrl+A seleciona tudo, Delete apaga a seleção e Ctrl+D duplica', async () => {
    const usuario = userEvent.setup()
    abrirCanvas()
    await screen.findByText('Alfa')

    await usuario.keyboard('{Control>}a{/Control}')
    expect(screen.getByText('2 elementos selecionados')).toBeInTheDocument()

    await usuario.keyboard('{Control>}d{/Control}')
    expect(document.querySelectorAll('[data-el]')).toHaveLength(4)
    expect(screen.getByText('2 elementos selecionados'), 'a seleção passa para as cópias').toBeInTheDocument()

    await usuario.keyboard('{Delete}')
    await waitFor(() => expect(document.querySelectorAll('[data-el]')).toHaveLength(2))
  })

  it('setas movem todos os selecionados', async () => {
    const usuario = userEvent.setup()
    abrirCanvas()
    await screen.findByText('Alfa')

    await usuario.keyboard('{Control>}a{/Control}')
    await usuario.keyboard('{Shift>}{ArrowRight}{/Shift}')
    expect(xDe('a')).toBe('10')
    expect(xDe('b')).toBe('110')
  })
})
