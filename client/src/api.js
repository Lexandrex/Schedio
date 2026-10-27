const TOKEN_KEY = 'schedio.token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

async function handleResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json') ? await response.json() : null

  if (!response.ok) {
    throw new Error(data?.message || response.statusText || 'Não foi possível concluir a operação.')
  }

  return data
}

/**
 * Chamada à API com o token da sessão. `json` vira o corpo da requisição já
 * com o Content-Type certo; para enviar arquivo, passe um FormData em `body`
 * (sem Content-Type manual: o navegador precisa definir o boundary).
 */
export async function apiRequest(path, { json, ...options } = {}) {
  const token = getToken()
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(json)
  }

  return handleResponse(await fetch(path, { ...options, headers }))
}

/** Envia uma imagem no campo `imagem`, que é o que as rotas de upload esperam. */
export function uploadImage(path, file) {
  const body = new FormData()
  body.append('imagem', file)
  return apiRequest(path, { method: 'POST', body })
}

export function authRequest(endpoint, body) {
  return apiRequest(`/api/auth/${endpoint}`, { method: 'POST', json: body })
}
