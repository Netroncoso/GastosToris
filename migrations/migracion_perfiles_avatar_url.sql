-- Si ya creaste perfiles sin avatar_url, ejecutá solo esto:
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS avatar_url text;
