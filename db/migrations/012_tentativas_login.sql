-- Proteção do login contra força bruta (ver tentativasLogin.js).
--
-- Uma linha por e-mail que errou a senha. `falhas` conta os erros seguidos;
-- ao chegar ao limite, `bloqueado_ate` recusa novas tentativas até vencer.
-- O e-mail fica em TEXT, e não em VARCHAR(255), porque vem direto do corpo do
-- login: um valor comprido demais não pode derrubar a rota com erro de banco.
CREATE TABLE IF NOT EXISTS login_tentativas (
  email TEXT PRIMARY KEY,
  falhas INTEGER NOT NULL DEFAULT 0,
  ultima_falha_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bloqueado_ate TIMESTAMPTZ
);
