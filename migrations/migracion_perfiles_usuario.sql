-- Preferencias por usuario (tema, accesos directos, apodo opcional).
-- 1 fila por auth.users; no toca círculos ni gastos.

CREATE TABLE IF NOT EXISTS public.perfiles (
    id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    display_name text,
    tema text NOT NULL DEFAULT 'system'
        CHECK (tema IN ('light', 'dark', 'system')),
    accesos jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS perfiles_select_own ON public.perfiles;
CREATE POLICY perfiles_select_own ON public.perfiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());

DROP POLICY IF EXISTS perfiles_insert_own ON public.perfiles;
CREATE POLICY perfiles_insert_own ON public.perfiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS perfiles_update_own ON public.perfiles;
CREATE POLICY perfiles_update_own ON public.perfiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.perfiles TO authenticated;
