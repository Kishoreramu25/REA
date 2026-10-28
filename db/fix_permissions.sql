-- ==============================================================================
-- FIX: Permission Denied for Table buses & stops in Supabase
-- Paste and Run this in your Supabase Dashboard -> SQL Editor -> Run
-- ==============================================================================

-- 1. Grant full table permissions to anon (app client) and authenticated
GRANT ALL ON TABLE public.buses TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.stops TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.bus_location TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.admins TO anon, authenticated, service_role;

-- 2. Grant permissions on all sequences (needed for auto-incrementing bus and stop IDs)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 3. Ensure Row Level Security (RLS) allows reading and writing buses & stops
ALTER TABLE public.buses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_location ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public full access buses" ON public.buses;
CREATE POLICY "Public full access buses" ON public.buses 
  FOR ALL TO anon, authenticated 
  USING (true) 
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public full access stops" ON public.stops;
CREATE POLICY "Public full access stops" ON public.stops 
  FOR ALL TO anon, authenticated 
  USING (true) 
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public full access bus_location" ON public.bus_location;
CREATE POLICY "Public full access bus_location" ON public.bus_location 
  FOR ALL TO anon, authenticated 
  USING (true) 
  WITH CHECK (true);
