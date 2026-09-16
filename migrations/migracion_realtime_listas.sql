-- Realtime: ítems de lista (compras compartidas).
-- Ejecutar en Supabase → SQL Editor si lista_compras aún no está en la publicación.
-- La tabla `gastos` suele estar ya publicada (ver README / migraciones previas).

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lista_compras;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'lista_compras ya está en supabase_realtime';
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.gastos_participantes;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'gastos_participantes ya está en supabase_realtime';
END $$;
