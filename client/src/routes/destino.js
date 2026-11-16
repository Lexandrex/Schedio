/*
 * Para onde ir depois do login. Um link de convite costuma chegar a quem ainda
 * não entrou: o `RequireAuth` manda para o login e, sem isto, a pessoa cairia
 * na tela inicial e perderia o convite. Mora no `sessionStorage` porque passa
 * por várias telas (login, ou cadastro → confirmação → login) e porque os
 * redirecionamentos do `AuthLayout` competem com qualquer `state` de navegação.
 *
 * Só os convites são lembrados: guardar qualquer rota faria, por exemplo,
 * quem saiu em /conta voltar para /conta no próximo login.
 */
const CHAVE = 'schedio.depoisDoLogin'

export function lembrarDestino(caminho) {
  if (!caminho.startsWith('/convite/')) return
  try {
    sessionStorage.setItem(CHAVE, caminho)
  } catch {
    // Sem armazenamento (aba privada restrita): o login só leva ao início.
  }
}

export function destinoDepoisDoLogin() {
  try {
    return sessionStorage.getItem(CHAVE) || '/'
  } catch {
    return '/'
  }
}

export function esquecerDestino() {
  try {
    sessionStorage.removeItem(CHAVE)
  } catch {
    // Nada guardado, nada a esquecer.
  }
}
