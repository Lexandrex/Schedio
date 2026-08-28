ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verification_token_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email_verification_token_expires_at TIMESTAMPTZ;

-- Contas já existentes foram criadas antes da confirmação obrigatória.
UPDATE users
SET email_verified_at = NOW()
WHERE email_verified_at IS NULL;

CREATE INDEX IF NOT EXISTS users_email_verification_pending_idx
  ON users (email)
  WHERE email_verified_at IS NULL;
