-- ==============================================================================
-- ESEC Bus Transport System - Database Schema (Supabase & PostgreSQL)
-- Project: https://gqjurdcxphdfairbcusj.supabase.co
-- ==============================================================================

-- 1. Buses table
CREATE TABLE IF NOT EXISTS buses (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  bus_number TEXT UNIQUE NOT NULL,
  driver_phone TEXT NOT NULL,
  start_place TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_place TEXT DEFAULT 'ESEC Campus',
  end_time TIME NOT NULL,
  is_tracking BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Middle stops table
CREATE TABLE IF NOT EXISTS stops (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  bus_id BIGINT NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  stop_name TEXT NOT NULL,
  stop_time TIME NOT NULL,
  stop_order INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Real-time bus location
CREATE TABLE IF NOT EXISTS bus_location (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  bus_id BIGINT NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bus_id)
);

-- 4. Parent-student mapping
CREATE TABLE IF NOT EXISTS parent_children (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  parent_phone TEXT NOT NULL,
  student_name TEXT NOT NULL,
  bus_id BIGINT NOT NULL REFERENCES buses(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Admin table
CREATE TABLE IF NOT EXISTS admins (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  pin TEXT NOT NULL UNIQUE,
  college_name TEXT DEFAULT 'ESEC',
  created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Insert Default Admin PIN (587828)
INSERT INTO admins (pin, college_name)
VALUES ('587828', 'ESEC')
ON CONFLICT (pin) DO NOTHING;

-- 7. Enable Realtime on bus_location and buses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'bus_location'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bus_location;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'buses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE buses;
  END IF;
END $$;

-- 8. Driver 6-digit PIN Constraint & Unique Index
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'driver_pin_6_digits'
  ) THEN
    ALTER TABLE buses
      ADD CONSTRAINT driver_pin_6_digits CHECK (driver_phone ~ '^[0-9]{6}$') NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS buses_driver_pin_unique ON buses (driver_phone);

-- 9. Row Level Security (RLS) - Allow App Access
ALTER TABLE buses ENABLE ROW LEVEL SECURITY;
ALTER TABLE stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_children ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read buses" ON buses;
CREATE POLICY "Public read buses" ON buses FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert buses" ON buses;
CREATE POLICY "Public insert buses" ON buses FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public update buses" ON buses;
CREATE POLICY "Public update buses" ON buses FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Public delete buses" ON buses;
CREATE POLICY "Public delete buses" ON buses FOR DELETE USING (true);

DROP POLICY IF EXISTS "Public read stops" ON stops;
CREATE POLICY "Public read stops" ON stops FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert stops" ON stops;
CREATE POLICY "Public insert stops" ON stops FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public update stops" ON stops;
CREATE POLICY "Public update stops" ON stops FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Public delete stops" ON stops;
CREATE POLICY "Public delete stops" ON stops FOR DELETE USING (true);

DROP POLICY IF EXISTS "Public read bus_location" ON bus_location;
CREATE POLICY "Public read bus_location" ON bus_location FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert bus_location" ON bus_location;
CREATE POLICY "Public insert bus_location" ON bus_location FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public update bus_location" ON bus_location;
CREATE POLICY "Public update bus_location" ON bus_location FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public read admins" ON admins;
CREATE POLICY "Public read admins" ON admins FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read parent_children" ON parent_children;
CREATE POLICY "Public read parent_children" ON parent_children FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert parent_children" ON parent_children;
CREATE POLICY "Public insert parent_children" ON parent_children FOR INSERT WITH CHECK (true);
