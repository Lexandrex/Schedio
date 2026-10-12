-- Aceite dos Termos de Uso (ver `termos.js`): versão e momento do aceite.
--
-- O aceite acontece no cadastro, antes de o usuário existir, então ele passa
-- por `pending_registrations` e é copiado para `users` na confirmação do
-- e-mail. Nulas porque contas anteriores a esta migration nunca aceitaram
-- termo nenhum — e é justamente isso que o NULL registra.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS termos_versao VARCHAR(10),
  ADD COLUMN IF NOT EXISTS termos_aceitos_em TIMESTAMPTZ;

ALTER TABLE pending_registrations
  ADD COLUMN IF NOT EXISTS termos_versao VARCHAR(10),
  ADD COLUMN IF NOT EXISTS termos_aceitos_em TIMESTAMPTZ;
