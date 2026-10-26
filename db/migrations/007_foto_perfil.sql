-- Foto de perfil (RF do perfil do criador).
--
-- `users.foto` já existe desde a base e guarda a URL. Falta o `public_id`,
-- que é o que permite apagar o arquivo no Cloudinary ao trocar ou remover a
-- foto — o mesmo motivo de `projetos.capa_public_id`.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS foto_public_id TEXT;
