-- Foto de perfil en participantes (cada usuario actualiza filas con su email al iniciar sesión).
ALTER TABLE public.participantes ADD COLUMN IF NOT EXISTS avatar_url text;
