CREATE TABLE IF NOT EXISTS pending_registrations (
  email VARCHAR(255) PRIMARY KEY,
  senha VARCHAR(255) NOT NULL,
  verification_token_hash VARCHAR(255) NOT NULL,
  verification_token_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A partir de agora um registro em "users" só existe após a confirmação do e-mail;
-- contas criadas pelo fluxo antigo sem confirmação não são mais válidas.
DELETE FROM users WHERE email_verified_at IS NULL;

ALTER TABLE users
  DROP COLUMN IF EXISTS email_verification_token_hash,
  DROP COLUMN IF EXISTS email_verification_token_expires_at;
