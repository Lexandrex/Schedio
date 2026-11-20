/**
 * Proteção do login contra força bruta.
 *
 * Contamos as senhas erradas **por e-mail** (normalizado): na quinta seguida o
 * login daquele e-mail fica bloqueado por cinco minutos — inclusive para a
 * senha certa, senão o bloqueio não protegeria nada. Acertar zera a contagem.
 * Falhas espaçadas não se acumulam para sempre: depois de `JANELA_MINUTOS` sem
 * erro, a próxima volta a ser a primeira.
 *
 * O estado mora no banco (`login_tentativas`), não na memória do processo:
 * reiniciar o servidor não pode servir para zerar o bloqueio.
 */
const LIMITE_FALHAS = 5;
const BLOQUEIO_MINUTOS = 5;
const JANELA_MINUTOS = 15;

/** Segundos que faltam do bloqueio do e-mail, ou 0 se ele pode tentar. */
async function segundosDeBloqueio(query, email) {
  const { rows } = await query(
    `SELECT CEIL(EXTRACT(EPOCH FROM bloqueado_ate - NOW()))::int AS segundos
     FROM login_tentativas WHERE email = $1 AND bloqueado_ate > NOW()`,
    [email],
  );
  return rows[0]?.segundos || 0;
}

/**
 * Registra uma senha errada e devolve `{ falhas, segundos }` — `segundos` > 0
 * quando esta falha bloqueou o e-mail. É um comando só (`INSERT ... ON
 * CONFLICT`), então tentativas simultâneas não se perdem na contagem.
 *
 * A contagem recomeça em 1 quando o bloqueio anterior já venceu ou quando a
 * última falha é mais velha que a janela. Os `SET` enxergam os valores antigos
 * da linha, por isso a conta da nova contagem aparece duas vezes.
 */
async function registrarFalha(query, email) {
  const recomeca = `(login_tentativas.bloqueado_ate <= NOW()
    OR login_tentativas.ultima_falha_em <= NOW() - make_interval(mins => $3))`;
  const novasFalhas = `CASE WHEN ${recomeca} THEN 1 ELSE login_tentativas.falhas + 1 END`;

  const { rows } = await query(
    `INSERT INTO login_tentativas (email, falhas, ultima_falha_em, bloqueado_ate)
     VALUES ($1, 1, NOW(), CASE WHEN 1 >= $2 THEN NOW() + make_interval(mins => $4) END)
     ON CONFLICT (email) DO UPDATE SET
       falhas = ${novasFalhas},
       ultima_falha_em = NOW(),
       bloqueado_ate = CASE WHEN ${novasFalhas} >= $2 THEN NOW() + make_interval(mins => $4) END
     RETURNING falhas,
       COALESCE(CEIL(EXTRACT(EPOCH FROM bloqueado_ate - NOW())), 0)::int AS segundos`,
    [email, LIMITE_FALHAS, JANELA_MINUTOS, BLOQUEIO_MINUTOS],
  );
  return rows[0];
}

/** Login certo: esquece as falhas do e-mail. */
async function limparFalhas(query, email) {
  await query('DELETE FROM login_tentativas WHERE email = $1', [email]);
}

/** Apaga as linhas que já não contam (fora da janela e sem bloqueio ativo). */
async function expurgarTentativas(query) {
  const { rowCount } = await query(
    `DELETE FROM login_tentativas
     WHERE ultima_falha_em <= NOW() - make_interval(mins => $1)
       AND (bloqueado_ate IS NULL OR bloqueado_ate <= NOW())`,
    [JANELA_MINUTOS],
  );
  return rowCount;
}

/** A mensagem do 429, com os minutos arredondados para cima. */
function mensagemDeBloqueio(segundos) {
  const minutos = Math.max(1, Math.ceil(segundos / 60));
  return `Muitas tentativas de login sem sucesso. Tente novamente em ${minutos} minuto${minutos === 1 ? '' : 's'}.`;
}

module.exports = {
  LIMITE_FALHAS,
  BLOQUEIO_MINUTOS,
  JANELA_MINUTOS,
  segundosDeBloqueio,
  registrarFalha,
  limparFalhas,
  expurgarTentativas,
  mensagemDeBloqueio,
};
