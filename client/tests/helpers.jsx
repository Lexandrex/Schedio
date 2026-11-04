import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App.jsx'
import { AuthProvider } from '../src/context/AuthContext.jsx'
import { apiRequest, setToken } from '../src/api.js'

/*
 * Cada arquivo de teste troca `api.js` por funções simuladas com:
 *
 *   vi.mock('../src/api.js', async (original) => ({
 *     ...(await original()), apiRequest: vi.fn(), authRequest: vi.fn(), uploadImage: vi.fn(),
 *   }))
 *
 * O `vi.mock` precisa estar no próprio arquivo de teste (o Vitest o iça para
 * antes dos imports), por isso não mora aqui. O token continua no
 * `localStorage` de verdade do jsdom.
 */

export const USUARIO = { id: 1, email: 'ana@example.com', nome: 'Ana', foto: null }

/**
 * Responde o `apiRequest` simulado por rota: `{ 'GET /api/x': dados }`. Sem
 * método na chave vale GET. O valor pode ser uma função (recebe as opções da
 * chamada) e, se for um Error, a chamada falha com ele. Rota não prevista
 * falha alto, para o teste não passar por acaso.
 */
export function simularApi(rotas) {
  apiRequest.mockImplementation(async (path, options = {}) => {
    const chave = `${options.method || 'GET'} ${path}`
    if (!(chave in rotas)) throw new Error(`Rota não simulada no teste: ${chave}`)
    const resposta = typeof rotas[chave] === 'function' ? rotas[chave](options) : rotas[chave]
    if (resposta instanceof Error) throw resposta
    return structuredClone(resposta)
  })
}

/**
 * Monta o app inteiro (rotas, AuthProvider, layouts) numa rota. Com `usuario`,
 * já entra logado: grava um token e responde o `/api/auth/me`.
 */
export function renderizarApp(rota, { usuario = null, state, rotas = {} } = {}) {
  if (usuario) setToken('token-de-teste')
  simularApi({ ...(usuario ? { 'GET /api/auth/me': { user: usuario } } : {}), ...rotas })

  return render(
    <MemoryRouter initialEntries={[state ? { pathname: rota, state } : rota]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

/** A mensagem de retorno dos formulários de autenticação (`role="status"`). */
export const feedback = (screen) => screen.getByRole('status')
