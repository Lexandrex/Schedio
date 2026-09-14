CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Uma linha só existe depois que o e-mail é confirmado: o cadastro pendente
-- fica em `pending_registrations` até a verificação.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  senha VARCHAR(255) NOT NULL,
  nome VARCHAR(80),
  bio TEXT,
  foto TEXT,
  cor VARCHAR(7) NOT NULL DEFAULT '#1E1E1E',
  -- Reservadas para curtir / salvar para depois / denunciar (RF-36 a RF-41).
  likes JSONB NOT NULL DEFAULT '[]'::jsonb,
  salvos JSONB NOT NULL DEFAULT '[]'::jsonb,
  reportados JSONB NOT NULL DEFAULT '[]'::jsonb,
  password_reset_token_hash VARCHAR(255),
  password_reset_token_expires_at TIMESTAMPTZ,
  email_verified_at TIMESTAMPTZ
);
