import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { authRequest, getToken } from '../src/api.js'
import { USUARIO, feedback, renderizarApp } from './helpers.jsx'

vi.mock('../src/api.js', async (original) => ({
  ...(await original()),
  apiRequest: vi.fn(),
  authRequest: vi.fn(),
  uploadImage: vi.fn(),
}))

const TERMOS = {
  titulo: 'Termos de Uso',
  versao: '2026-10',
  vigenciaDesde: '2026-10-11',
  secoes: [{ titulo: '1. Aceite', paragrafos: ['Ao usar o Schedio Drasis você concorda.'] }],
}

/** Digita o código nos seis campos do CodeInput, como o usuário faria. */
async function digitarCodigo(usuario, codigo, inicio = 0) {
  const campos = screen.getAllByLabelText(/^Dígito/)
  await usuario.click(campos[inicio])
  await usuario.keyboard(codigo)
}

const enviar = () => fireEvent.submit(document.querySelector('form'))

describe('login', () => {
  it('entra, guarda o token e vai para a tela inicial', async () => {
    const usuario = userEvent.setup()
    authRequest.mockResolvedValue({ token: 'token-novo' })
    renderizarApp('/login', {
      rotas: { 'GET /api/auth/me': { user: USUARIO }, 'GET /api/projects': { projects: [] } },
    })

    await usuario.type(await screen.findByLabelText('E-mail'), 'ana@example.com')
    await usuario.type(screen.getByLabelText('Senha'), 'segredo123')
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Nenhum projeto publicado ainda.')).toBeInTheDocument()
    expect(authRequest).toHaveBeenCalledWith('login', { email: 'ana@example.com', password: 'segredo123' })
    expect(getToken()).toBe('token-novo')
  })

  it('mostra a mensagem do servidor quando a senha está errada', async () => {
    const usuario = userEvent.setup()
    authRequest.mockRejectedValue(new Error('E-mail ou senha inválidos.'))
    renderizarApp('/login')

    await usuario.type(await screen.findByLabelText('E-mail'), 'ana@example.com')
    await usuario.type(screen.getByLabelText('Senha'), 'errada123')
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => expect(feedback(screen)).toHaveTextContent('E-mail ou senha inválidos.'))
    expect(feedback(screen)).toHaveAttribute('data-type', 'error')
    expect(getToken()).toBeNull()
  })

  it('quem já está logado não vê o login: vai direto para o início', async () => {
    renderizarApp('/login', { usuario: USUARIO, rotas: { 'GET /api/projects': { projects: [] } } })

    expect(await screen.findByText('Nenhum projeto publicado ainda.')).toBeInTheDocument()
  })

  it('token vencido é descartado e a rota protegida manda para o login', async () => {
    renderizarApp('/editor', { usuario: USUARIO, rotas: { 'GET /api/auth/me': new Error('Sessão expirada.') } })

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })

  it('rota desconhecida sem sessão acaba no login', async () => {
    renderizarApp('/qualquer-coisa')

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('avisa que a conta foi excluída ao voltar para o login', async () => {
    sessionStorage.setItem('schedio.accountDeleted', '1')
    renderizarApp('/login')

    await waitFor(() => expect(feedback(screen)).toHaveTextContent('Conta excluída com sucesso.'))
    expect(sessionStorage.getItem('schedio.accountDeleted')).toBeNull()
  })
})

describe('cadastro', () => {
  /** Abre os termos, "espera" os 5 s de leitura e aceita. */
  async function aceitarTermos(usuario) {
    let agora = 0
    vi.spyOn(performance, 'now').mockImplementation(() => agora)
    await usuario.click(screen.getByRole('button', { name: /Termos de Uso e Política/ }))
    const aceitar = await screen.findByRole('button', { name: /Leia os termos/ })
    expect(aceitar).toBeDisabled()

    agora = 6000
    await waitFor(() => expect(aceitar).toBeEnabled())
    await usuario.click(screen.getByRole('button', { name: 'Li e aceito' }))
  }

  async function preencher(usuario, senha, confirmacao) {
    await usuario.type(await screen.findByLabelText('E-mail'), 'novo@example.com')
    await usuario.type(screen.getByLabelText('Senha'), senha)
    await usuario.type(screen.getByLabelText('Confirmar senha'), confirmacao)
  }

  it('não deixa criar a conta antes de aceitar os termos', async () => {
    renderizarApp('/register')

    const botao = await screen.findByRole('button', { name: 'Criar conta' })
    expect(botao).toBeDisabled()
    expect(botao).toHaveAttribute('title', 'Aceite os Termos de Uso para continuar')

    enviar()
    expect(feedback(screen)).toHaveTextContent('Leia e aceite os Termos de Uso para criar a conta.')
    expect(authRequest).not.toHaveBeenCalled()
  })

  it('avisa quando os termos não carregam', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/register', { rotas: { 'GET /api/termos': new Error('falhou') } })

    await usuario.click(await screen.findByRole('button', { name: /Termos de Uso e Política/ }))

    expect(feedback(screen)).toHaveTextContent('Não foi possível carregar os Termos de Uso. Tente novamente.')
  })

  it('recusa senhas diferentes sem chamar a API', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/register', { rotas: { 'GET /api/termos': TERMOS } })

    await preencher(usuario, 'segredo123', 'segredo124')
    await aceitarTermos(usuario)
    expect(screen.getByText(/Você aceitou os/)).toHaveTextContent('(versão 2026-10)')
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(feedback(screen)).toHaveTextContent('As senhas informadas não coincidem.')
    expect(authRequest).not.toHaveBeenCalled()
  })

  it('cria a conta com a versão aceita e segue para a confirmação do e-mail', async () => {
    const usuario = userEvent.setup()
    authRequest.mockResolvedValue({ user: { email: 'novo@example.com' }, message: 'Código enviado.' })
    renderizarApp('/register', { rotas: { 'GET /api/termos': TERMOS } })

    await preencher(usuario, 'segredo123', 'segredo123')
    await aceitarTermos(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(await screen.findByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument()
    expect(authRequest).toHaveBeenCalledWith('register', {
      email: 'novo@example.com',
      password: 'segredo123',
      termsVersion: '2026-10',
    })
    expect(screen.getByText('novo@example.com')).toBeInTheDocument()
    await waitFor(() => expect(feedback(screen)).toHaveTextContent('Código enviado.'))
  })

  it('se o servidor recusa, o aceite cai e o erro aparece', async () => {
    const usuario = userEvent.setup()
    authRequest.mockRejectedValue(new Error('Os Termos de Uso foram atualizados. Leia a nova versão.'))
    renderizarApp('/register', { rotas: { 'GET /api/termos': TERMOS } })

    await preencher(usuario, 'segredo123', 'segredo123')
    await aceitarTermos(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }))

    await waitFor(() =>
      expect(feedback(screen)).toHaveTextContent('Os Termos de Uso foram atualizados. Leia a nova versão.'),
    )
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeDisabled()
  })

  it('voltar leva ao login', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/register')

    await usuario.click(await screen.findByRole('button', { name: '← Voltar' }))

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  })
})

describe('confirmação de e-mail', () => {
  const STATE = { email: 'novo@example.com' }

  it('sem e-mail na navegação, volta para o cadastro', async () => {
    renderizarApp('/verify-email')

    expect(await screen.findByRole('heading', { name: 'Criar perfil' })).toBeInTheDocument()
  })

  it('exige os seis dígitos', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/verify-email', { state: STATE })

    await digitarCodigo(usuario, '123')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar e-mail' }))

    expect(feedback(screen)).toHaveTextContent('Informe os seis dígitos do código.')
    expect(authRequest).not.toHaveBeenCalled()
  })

  it('o campo de código só aceita número e anda sozinho de dígito em dígito', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/verify-email', { state: STATE })

    await digitarCodigo(usuario, '1a2')
    const campos = screen.getAllByLabelText(/^Dígito/)
    expect(campos.map((campo) => campo.value)).toEqual(['1', '2', '', '', '', ''])
    expect(campos[2]).toHaveFocus()

    // Backspace num campo vazio volta para o anterior.
    await usuario.keyboard('{Backspace}')
    expect(campos[1]).toHaveFocus()
  })

  it('código certo confirma e leva ao login com a mensagem de sucesso', async () => {
    const usuario = userEvent.setup()
    authRequest.mockResolvedValue({ message: 'E-mail confirmado. Faça login.' })
    renderizarApp('/verify-email', { state: STATE })

    await digitarCodigo(usuario, '111111')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar e-mail' }))

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(authRequest).toHaveBeenCalledWith('email-verification/verify', {
      email: 'novo@example.com',
      code: '111111',
    })
    await waitFor(() => expect(feedback(screen)).toHaveTextContent('E-mail confirmado. Faça login.'))
    expect(feedback(screen)).toHaveAttribute('data-type', 'success')
  })

  it('código errado mostra o erro do servidor', async () => {
    const usuario = userEvent.setup()
    authRequest.mockRejectedValue(new Error('Código inválido ou expirado.'))
    renderizarApp('/verify-email', { state: STATE })

    await digitarCodigo(usuario, '999999')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar e-mail' }))

    await waitFor(() => expect(feedback(screen)).toHaveTextContent('Código inválido ou expirado.'))
  })

  it('reenviar o código avisa o sucesso ou o erro', async () => {
    const usuario = userEvent.setup()
    authRequest.mockResolvedValueOnce({ message: 'Enviamos um novo código.' })
    authRequest.mockRejectedValueOnce(new Error('Aguarde para pedir outro código.'))
    renderizarApp('/verify-email', { state: STATE })

    await usuario.click(await screen.findByRole('button', { name: 'Reenviar código' }))
    await waitFor(() => expect(feedback(screen)).toHaveTextContent('Enviamos um novo código.'))
    expect(authRequest).toHaveBeenCalledWith('email-verification/resend', { email: 'novo@example.com' })

    await usuario.click(screen.getByRole('button', { name: 'Reenviar código' }))
    await waitFor(() => expect(feedback(screen)).toHaveTextContent('Aguarde para pedir outro código.'))
  })
})

describe('recuperação de senha', () => {
  it('recusa e-mail sem @', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/recover-email')

    await usuario.type(await screen.findByLabelText('E-mail'), 'ana.example.com')
    enviar()

    expect(feedback(screen)).toHaveTextContent('Informe um e-mail válido.')
    expect(authRequest).not.toHaveBeenCalled()
  })

  it('o fluxo inteiro: e-mail, código e nova senha', async () => {
    const usuario = userEvent.setup()
    authRequest.mockImplementation(async (rota) => ({
      'password-recovery': { message: 'Se o e-mail existir, enviamos um código.' },
      'password-recovery/verify': { ok: true },
      'password-recovery/reset': { message: 'Senha redefinida. Faça login.' },
    })[rota])
    renderizarApp('/recover-email')

    await usuario.type(await screen.findByLabelText('E-mail'), '  ana@example.com  ')
    await usuario.click(screen.getByRole('button', { name: 'Enviar código' }))
    expect(await screen.findByRole('heading', { name: 'Verifique seu e-mail' })).toBeInTheDocument()
    expect(authRequest).toHaveBeenLastCalledWith('password-recovery', { email: 'ana@example.com' })
    await waitFor(() => expect(feedback(screen)).toHaveTextContent('Se o e-mail existir, enviamos um código.'))

    await digitarCodigo(usuario, '111111')
    await usuario.click(screen.getByRole('button', { name: 'Validar código' }))
    expect(await screen.findByRole('heading', { name: 'Nova senha' })).toBeInTheDocument()
    expect(authRequest).toHaveBeenLastCalledWith('password-recovery/verify', {
      email: 'ana@example.com',
      code: '111111',
    })

    await usuario.type(screen.getByLabelText('Nova senha'), 'novaSenha1')
    await usuario.type(screen.getByLabelText('Confirmar nova senha'), 'novaSenha1')
    await usuario.click(screen.getByRole('button', { name: 'Redefinir senha' }))

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(authRequest).toHaveBeenLastCalledWith('password-recovery/reset', {
      email: 'ana@example.com',
      code: '111111',
      password: 'novaSenha1',
    })
    await waitFor(() => expect(feedback(screen)).toHaveTextContent('Senha redefinida. Faça login.'))
  })

  it('e-mail recusado pelo servidor mostra o erro', async () => {
    const usuario = userEvent.setup()
    authRequest.mockRejectedValue(new Error('Muitas tentativas. Tente mais tarde.'))
    renderizarApp('/recover-email')

    await usuario.type(await screen.findByLabelText('E-mail'), 'ana@example.com')
    await usuario.click(screen.getByRole('button', { name: 'Enviar código' }))

    await waitFor(() => expect(feedback(screen)).toHaveTextContent('Muitas tentativas. Tente mais tarde.'))
  })

  it('código incompleto ou errado não avança', async () => {
    const usuario = userEvent.setup()
    authRequest.mockRejectedValue(new Error('Código inválido ou expirado.'))
    renderizarApp('/recover-code', { state: { email: 'ana@example.com' } })

    await digitarCodigo(usuario, '12')
    await usuario.click(await screen.findByRole('button', { name: 'Validar código' }))
    expect(feedback(screen)).toHaveTextContent('Informe os seis dígitos do código.')

    await digitarCodigo(usuario, '3456', 2)
    await usuario.click(screen.getByRole('button', { name: 'Validar código' }))
    expect(authRequest).toHaveBeenCalledWith('password-recovery/verify', {
      email: 'ana@example.com',
      code: '123456',
    })
    await waitFor(() => expect(feedback(screen)).toHaveTextContent('Código inválido ou expirado.'))
    expect(screen.getByRole('heading', { name: 'Verifique seu e-mail' })).toBeInTheDocument()
  })

  it('sem e-mail na navegação, as etapas seguintes voltam ao começo', async () => {
    renderizarApp('/recover-code')
    expect(await screen.findByRole('heading', { name: 'Recuperar senha' })).toBeInTheDocument()
  })

  it('nova senha sem o código volta ao começo', async () => {
    renderizarApp('/reset-password', { state: { email: 'ana@example.com' } })
    expect(await screen.findByRole('heading', { name: 'Recuperar senha' })).toBeInTheDocument()
  })

  it('nova senha: confirmação diferente e erro do servidor', async () => {
    const usuario = userEvent.setup()
    authRequest.mockRejectedValue(new Error('A senha deve ter pelo menos 8 caracteres.'))
    renderizarApp('/reset-password', { state: { email: 'ana@example.com', code: '111111' } })

    await usuario.type(await screen.findByLabelText('Nova senha'), 'novaSenha1')
    await usuario.type(screen.getByLabelText('Confirmar nova senha'), 'outraSenha')
    await usuario.click(screen.getByRole('button', { name: 'Redefinir senha' }))
    expect(feedback(screen)).toHaveTextContent('As senhas informadas não coincidem.')
    expect(authRequest).not.toHaveBeenCalled()

    await usuario.clear(screen.getByLabelText('Confirmar nova senha'))
    await usuario.type(screen.getByLabelText('Confirmar nova senha'), 'novaSenha1')
    await usuario.click(screen.getByRole('button', { name: 'Redefinir senha' }))
    await waitFor(() =>
      expect(feedback(screen)).toHaveTextContent('A senha deve ter pelo menos 8 caracteres.'),
    )
  })

  it('o botão de voltar de cada etapa leva para a anterior', async () => {
    const usuario = userEvent.setup()
    renderizarApp('/recover-code', { state: { email: 'ana@example.com' } })

    await usuario.click(await screen.findByRole('button', { name: '← Voltar' }))
    expect(await screen.findByRole('heading', { name: 'Recuperar senha' })).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: '← Voltar' }))
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  })
})
