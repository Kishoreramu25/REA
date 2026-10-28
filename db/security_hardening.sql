-- ==============================================================================
-- ESEC Bus Transport System - Security Hardening & RLS Policies (Ultra-Robust)
-- Part A: Database Security, Views, RLS, and Rate-Limited Login RPC
-- ==============================================================================

-- 1. Ensure extensions schema is in search path and pgcrypto is enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SET search_path = public, extensions, auth;

-- 2. Add hash columns to admins and buses if not present
ALTER TABLE admins ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE buses ADD COLUMN IF NOT EXISTS driver_pin_hash TEXT;

-- Migrate existing plaintext pins to bcrypt hashes using extensions.crypt & extensions.gen_salt
UPDATE admins 
SET pin_hash = extensions.crypt(pin, extensions.gen_salt('bf', 10)) 
WHERE pin_hash IS NULL AND pin IS NOT NULL;

UPDATE buses 
SET driver_pin_hash = extensions.crypt(driver_phone, extensions.gen_salt('bf', 10)) 
WHERE driver_pin_hash IS NULL AND driver_phone IS NOT NULL;

-- 3. Rate limiting table for login attempts (5 wrong tries -> 15 min lock)
CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  identifier TEXT NOT NULL UNIQUE,
  attempts INT DEFAULT 1,
  locked_until TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON login_attempts FROM anon;

-- 4. Create Public Buses View (omits driver_phone / PIN)
CREATE OR REPLACE VIEW public_buses 
WITH (security_barrier = true) AS
SELECT
  id,
  bus_number,
  start_place,
  start_time,
  start_lat,
  start_lng,
  end_place,
  end_time,
  end_lat,
  end_lng,
  is_tracking,
  created_at
FROM buses;

-- Make sure view owner has permissions and anon can read the view
GRANT SELECT ON public_buses TO anon, authenticated;

-- 5. Revoke direct anon access on underlying tables
REVOKE SELECT, INSERT, UPDATE, DELETE ON buses FROM anon;
REVOKE ALL ON admins FROM anon;
REVOKE INSERT, UPDATE, DELETE ON stops FROM anon;
REVOKE INSERT, UPDATE, DELETE ON bus_location FROM anon;

-- Grant SELECT on stops and bus_location to anon & authenticated
GRANT SELECT ON stops TO anon, authenticated;
GRANT SELECT ON bus_location TO anon, authenticated;

-- 6. Enable Row Level Security (RLS) on all tables
ALTER TABLE buses ENABLE ROW LEVEL SECURITY;
ALTER TABLE stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Drop all old and new policies to ensure completely clean idempotent execution
DROP POLICY IF EXISTS "Public read buses" ON buses;
DROP POLICY IF EXISTS "Public insert buses" ON buses;
DROP POLICY IF EXISTS "Public update buses" ON buses;
DROP POLICY IF EXISTS "Public delete buses" ON buses;
DROP POLICY IF EXISTS "Admin full access buses" ON buses;
DROP POLICY IF EXISTS "Driver update is_tracking buses" ON buses;

DROP POLICY IF EXISTS "Public read stops" ON stops;
DROP POLICY IF EXISTS "Public insert stops" ON stops;
DROP POLICY IF EXISTS "Public update stops" ON stops;
DROP POLICY IF EXISTS "Public delete stops" ON stops;
DROP POLICY IF EXISTS "Admin full access stops" ON stops;

DROP POLICY IF EXISTS "Public read bus_location" ON bus_location;
DROP POLICY IF EXISTS "Public insert bus_location" ON bus_location;
DROP POLICY IF EXISTS "Public update bus_location" ON bus_location;
DROP POLICY IF EXISTS "Driver insert bus_location" ON bus_location;
DROP POLICY IF EXISTS "Driver update bus_location" ON bus_location;
DROP POLICY IF EXISTS "Admin full access bus_location" ON bus_location;

DROP POLICY IF EXISTS "Public read admins" ON admins;
DROP POLICY IF EXISTS "Admin read admins" ON admins;

-- 7. Define RLS Policies based on JWT Claims (role and bus_id)

-- === BUSES POLICIES ===
-- Public cannot read buses directly (must use public_buses view)
-- Admin has full CRUD
CREATE POLICY "Admin full access buses" ON buses
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- Driver can only update is_tracking for their own assigned bus_id
CREATE POLICY "Driver update is_tracking buses" ON buses
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'driver' 
    AND id = ((auth.jwt() ->> 'bus_id')::bigint)
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'driver' 
    AND id = ((auth.jwt() ->> 'bus_id')::bigint)
  );

-- === STOPS POLICIES ===
-- Public can read stops
CREATE POLICY "Public read stops" ON stops
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admin has full CRUD on stops
CREATE POLICY "Admin full access stops" ON stops
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- === BUS_LOCATION POLICIES ===
-- Public can read bus locations
CREATE POLICY "Public read bus_location" ON bus_location
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Driver can only insert/update location for their own assigned bus_id
CREATE POLICY "Driver insert bus_location" ON bus_location
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'driver' 
    AND bus_id = ((auth.jwt() ->> 'bus_id')::bigint)
  );

CREATE POLICY "Driver update bus_location" ON bus_location
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'driver' 
    AND bus_id = ((auth.jwt() ->> 'bus_id')::bigint)
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'driver' 
    AND bus_id = ((auth.jwt() ->> 'bus_id')::bigint)
  );

-- Admin can manage bus_location
CREATE POLICY "Admin full access bus_location" ON bus_location
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- === ADMINS POLICIES ===
-- Admins table is NOT readable by anon. Authenticated admins only.
CREATE POLICY "Admin read admins" ON admins
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin');

-- 8. Stored Procedure: verify_pin_login
-- Validates PIN against bcrypt hashes with rate limiting (5 attempts -> 15 min lock)
CREATE OR REPLACE FUNCTION verify_pin_login(
  p_pin TEXT,
  p_client_id TEXT DEFAULT 'default'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_attempt RECORD;
  v_admin RECORD;
  v_bus RECORD;
  v_clean_pin TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_clean_pin := TRIM(p_pin);

  -- 1. Check rate limit
  SELECT * INTO v_attempt FROM login_attempts WHERE identifier = p_client_id;
  IF FOUND THEN
    IF v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until > v_now THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Account temporarily locked due to 5 consecutive failed attempts. Please try again after 15 minutes.',
        'locked', true,
        'locked_until', v_attempt.locked_until
      );
    END IF;
  END IF;

  -- 2. Check Admin PIN
  SELECT * INTO v_admin FROM admins 
  WHERE (pin_hash IS NOT NULL AND extensions.crypt(v_clean_pin, pin_hash) = pin_hash)
     OR (pin_hash IS NULL AND pin = v_clean_pin)
  LIMIT 1;

  IF FOUND THEN
    -- Success: reset rate limit
    DELETE FROM login_attempts WHERE identifier = p_client_id;
    RETURN jsonb_build_object(
      'success', true,
      'role', 'admin',
      'name', 'Transport Administrator',
      'college', v_admin.college_name
    );
  END IF;

  -- 3. Check Driver PIN (from buses table)
  SELECT * INTO v_bus FROM buses 
  WHERE (driver_pin_hash IS NOT NULL AND extensions.crypt(v_clean_pin, driver_pin_hash) = driver_pin_hash)
     OR (driver_pin_hash IS NULL AND driver_phone = v_clean_pin)
  LIMIT 1;

  IF FOUND THEN
    -- Success: reset rate limit
    DELETE FROM login_attempts WHERE identifier = p_client_id;
    RETURN jsonb_build_object(
      'success', true,
      'role', 'driver',
      'bus_id', v_bus.id,
      'bus_number', v_bus.bus_number,
      'name', 'Driver (Bus ' || v_bus.bus_number || ')'
    );
  END IF;

  -- 4. Failure: record failed attempt & check 5-attempt threshold
  IF v_attempt.id IS NULL THEN
    INSERT INTO login_attempts (identifier, attempts, last_attempt_at)
    VALUES (p_client_id, 1, v_now);
  ELSE
    IF v_attempt.attempts + 1 >= 5 THEN
      UPDATE login_attempts
      SET attempts = v_attempt.attempts + 1,
          locked_until = v_now + INTERVAL '15 minutes',
          last_attempt_at = v_now
      WHERE identifier = p_client_id;

      RETURN jsonb_build_object(
        'success', false,
        'error', 'Too many failed login attempts. Locked for 15 minutes.',
        'locked', true,
        'locked_until', v_now + INTERVAL '15 minutes'
      );
    ELSE
      UPDATE login_attempts
      SET attempts = v_attempt.attempts + 1,
          last_attempt_at = v_now
      WHERE identifier = p_client_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'error', 'Invalid PIN. Check your Driver PIN or Admin password.',
    'remaining_attempts', GREATEST(0, 5 - COALESCE(v_attempt.attempts + 1, 1))
  );
END;
$$;

-- Grant EXECUTE on verify_pin_login to anon and authenticated
GRANT EXECUTE ON FUNCTION verify_pin_login(TEXT, TEXT) TO anon, authenticated;
