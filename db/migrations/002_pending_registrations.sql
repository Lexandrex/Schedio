-- Cadastro aguardando confirmação de e-mail. Na verificação a linha vira um
-- registro em `users` e é apagada daqui.
CREATE TABLE IF NOT EXISTS pending_registrations (
  email VARCHAR(255) PRIMARY KEY,
  senha VARCHAR(255) NOT NULL,
  verification_token_hash VARCHAR(255) NOT NULL,
  verification_token_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
