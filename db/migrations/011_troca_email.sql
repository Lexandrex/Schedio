-- Troca do e-mail da conta (RF-04).
--
-- Segue a invariante do cadastro: nenhum e-mail entra em `users.email` sem ser
-- confirmado. O novo endereço espera aqui, com o hash do código enviado a ele,
-- até a pessoa digitar o código; só então substitui o atual.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_novo VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email_novo_token_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email_novo_expira_em TIMESTAMPTZ;
