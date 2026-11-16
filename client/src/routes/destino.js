/*
 * Para onde ir depois do login. Um link compartilhado costuma chegar a quem
 * ainda não entrou: o `RequireAuth` manda para o login e, sem isto, a pessoa
 * cairia na tela inicial e perderia o link. Mora no `sessionStorage` porque
 * passa por várias telas (login, ou cadastro → confirmação → login) e porque
 * os redirecionamentos do `AuthLayout` competem com qualquer `state` de
 * navegação.
 *
 * Só os links que se mandam a outras pessoas são lembrados — convites de
 * colaboração/visualização e a apresentação de uma história (RF-41).
 * Guardar qualquer rota faria, por exemplo, quem saiu em /conta voltar para
 * /conta no próximo login.
 */
const CHAVE = 'schedio.depoisDoLogin'
const COMPARTILHAVEIS = ['/convite/', '/projeto/']

export function lembrarDestino(caminho) {
  if (!COMPARTILHAVEIS.some((inicio) => caminho.startsWith(inicio))) return
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
