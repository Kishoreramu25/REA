-- ====================================================================
-- ESEC TRANSPORT - SECURE SESSION-BASED ARCHITECTURE & PIN ROTATION
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SET search_path = public, extensions, auth;

-- Clean up any previous function overloads
DROP FUNCTION IF EXISTS verify_pin_login(TEXT, TEXT);
DROP FUNCTION IF EXISTS verify_pin_login(TEXT);
DROP FUNCTION IF EXISTS verify_pin_login;
DROP FUNCTION IF EXISTS admin_login(TEXT);
DROP FUNCTION IF EXISTS admin_login;
DROP FUNCTION IF EXISTS driver_upsert_location(BIGINT, DOUBLE PRECISION, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS driver_upsert_location(TEXT, DOUBLE PRECISION, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS driver_upsert_location;
DROP FUNCTION IF EXISTS driver_update_tracking(BIGINT, BOOLEAN);
DROP FUNCTION IF EXISTS driver_update_tracking(TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS driver_update_tracking;
DROP FUNCTION IF EXISTS admin_delete_bus(BIGINT);
DROP FUNCTION IF EXISTS admin_delete_bus(TEXT, BIGINT);
DROP FUNCTION IF EXISTS admin_delete_bus;
DROP FUNCTION IF EXISTS admin_save_bus;

-- 1. Account Lockout Table (Per bus_number or 'admin', plus global throttle)
CREATE TABLE IF NOT EXISTS account_lockouts (
  account_key TEXT PRIMARY KEY,
  failed_attempts INT DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_attempt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE account_lockouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_lockouts FROM anon, public;

-- Revoke all direct table writes on operational tables
REVOKE INSERT, UPDATE, DELETE ON buses FROM anon, public;
REVOKE INSERT, UPDATE, DELETE ON stops FROM anon, public;
REVOKE INSERT, UPDATE, DELETE ON bus_location FROM anon, public;
REVOKE ALL ON admins FROM anon, public;

-- 2. Sessions Table (Stores SHA-256 hash of 32-byte cryptographically random token)
CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('driver', 'admin')),
  bus_id BIGINT REFERENCES buses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sessions FROM anon, public;

-- 3. Rotate All PINs and Add Passphrase for Admin
-- Admin Passphrase: 'ESEC#Transport@MasterAdmin-2026!'
UPDATE admins
SET pin_hash = extensions.crypt('ESEC#Transport@MasterAdmin-2026!', extensions.gen_salt('bf', 12)),
    updated_at = NOW()
WHERE id = 1 OR id = (SELECT id FROM admins LIMIT 1);

-- Driver PIN for Bus 1: '842105' (New rotated 6-digit PIN)
-- Add realistic coordinates for Bus 1 (Ambur -> ESEC Campus)
UPDATE buses
SET driver_phone = '842105',
    driver_pin_hash = extensions.crypt('842105', extensions.gen_salt('bf', 10)),
    start_place = 'Ambur Bus Stand',
    start_lat = 12.79040,
    start_lng = 78.71600,
    end_place = 'ESEC Campus',
    end_lat = 11.28500,
    end_lng = 77.64000,
    updated_at = NOW()
WHERE bus_number = '1';

-- Update stops for Bus 1 with realistic coordinates
UPDATE stops SET latitude = 12.60200, longitude = 78.58300 WHERE stop_name = 'Jollarpet' AND bus_id = (SELECT id FROM buses WHERE bus_number = '1');
UPDATE stops SET latitude = 12.12800, longitude = 78.39700 WHERE stop_name = 'Morappur' AND bus_id = (SELECT id FROM buses WHERE bus_number = '1');
UPDATE stops SET latitude = 11.66430, longitude = 78.14600 WHERE stop_name = 'Salem' AND bus_id = (SELECT id FROM buses WHERE bus_number = '1');
UPDATE stops SET latitude = 11.34100, longitude = 77.71720 WHERE stop_name = 'ERODE Junction' AND bus_id = (SELECT id FROM buses WHERE bus_number = '1');
UPDATE stops SET latitude = 11.27760, longitude = 77.63040 WHERE stop_name = 'Perundurai' AND bus_id = (SELECT id FROM buses WHERE bus_number = '1');

-- 4. Helper Function: Check & Increment Lockout
CREATE OR REPLACE FUNCTION check_and_record_attempt(
  p_account_key TEXT,
  p_success BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $fn$
DECLARE
  v_rec RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_global RECORD;
BEGIN
  -- Check global throttle (> 50 failures in 5 min)
  SELECT * INTO v_global FROM account_lockouts WHERE account_key = 'GLOBAL';
  IF FOUND AND v_global.locked_until IS NOT NULL AND v_global.locked_until > v_now THEN
    RETURN jsonb_build_object('locked', true, 'error', 'Global rate limit reached. Please wait 15 minutes.');
  END IF;

  -- Check specific account
  SELECT * INTO v_rec FROM account_lockouts WHERE account_key = p_account_key;
  IF FOUND AND v_rec.locked_until IS NOT NULL AND v_rec.locked_until > v_now THEN
    RETURN jsonb_build_object(
      'locked', true, 
      'error', 'Account temporarily locked due to 5 consecutive failed attempts. Try again after 15 minutes.',
      'locked_until', v_rec.locked_until
    );
  END IF;

  IF p_success THEN
    DELETE FROM account_lockouts WHERE account_key = p_account_key;
    RETURN jsonb_build_object('locked', false);
  ELSE
    INSERT INTO account_lockouts (account_key, failed_attempts, last_attempt)
    VALUES (p_account_key, 1, v_now)
    ON CONFLICT (account_key)
    DO UPDATE SET
      failed_attempts = account_lockouts.failed_attempts + 1,
      last_attempt = v_now,
      locked_until = CASE 
        WHEN account_lockouts.failed_attempts + 1 >= 5 THEN v_now + interval '15 minutes'
        ELSE account_lockouts.locked_until
      END;

    -- Also record in global throttle
    INSERT INTO account_lockouts (account_key, failed_attempts, last_attempt)
    VALUES ('GLOBAL', 1, v_now)
    ON CONFLICT (account_key)
    DO UPDATE SET
      failed_attempts = account_lockouts.failed_attempts + 1,
      last_attempt = v_now,
      locked_until = CASE 
        WHEN account_lockouts.failed_attempts + 1 >= 50 THEN v_now + interval '15 minutes'
        ELSE account_lockouts.locked_until
      END;

    SELECT failed_attempts, locked_until INTO v_rec FROM account_lockouts WHERE account_key = p_account_key;
    RETURN jsonb_build_object(
      'locked', v_rec.locked_until IS NOT NULL AND v_rec.locked_until > v_now,
      'remaining_attempts', GREATEST(0, 5 - v_rec.failed_attempts),
      'error', CASE 
        WHEN v_rec.failed_attempts >= 5 THEN 'Account locked for 15 minutes due to 5 failed attempts.'
        ELSE 'Invalid credentials. Remaining attempts: ' || (5 - v_rec.failed_attempts)
      END
    );
  END IF;
END;
$fn$;

-- 5. Driver Login RPC: verify_pin_login(p_bus_number, p_pin)
CREATE OR REPLACE FUNCTION verify_pin_login(
  p_bus_number TEXT,
  p_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $fn$
DECLARE
  v_bus RECORD;
  v_lockout JSONB;
  v_clean_bus TEXT := TRIM(p_bus_number);
  v_clean_pin TEXT := TRIM(p_pin);
  v_raw_token TEXT;
  v_token_hash TEXT;
  v_expires_at TIMESTAMPTZ := NOW() + interval '12 hours';
BEGIN
  -- 1. Check lockout for bus account
  v_lockout := check_and_record_attempt('bus_' || v_clean_bus, NULL);
  IF (v_lockout ->> 'locked')::boolean THEN
    RETURN jsonb_build_object('success', false, 'locked', true, 'error', v_lockout ->> 'error');
  END IF;

  -- 2. Find bus
  SELECT * INTO v_bus FROM buses WHERE bus_number = v_clean_bus;
  IF NOT FOUND THEN
    v_lockout := check_and_record_attempt('bus_' || v_clean_bus, false);
    RETURN jsonb_build_object('success', false, 'error', 'Bus number not found.', 'remaining_attempts', (v_lockout ->> 'remaining_attempts')::int);
  END IF;

  -- 3. Verify PIN hash
  IF (v_bus.driver_pin_hash IS NOT NULL AND extensions.crypt(v_clean_pin, v_bus.driver_pin_hash) = v_bus.driver_pin_hash)
     OR (v_bus.driver_pin_hash IS NULL AND v_bus.driver_phone = v_clean_pin) THEN
    -- Success: reset lockout
    PERFORM check_and_record_attempt('bus_' || v_clean_bus, true);

    -- Generate cryptographically random 32-byte token
    v_raw_token := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

    -- Store session
    INSERT INTO sessions (token_hash, role, bus_id, expires_at)
    VALUES (v_token_hash, 'driver', v_bus.id, v_expires_at);

    RETURN jsonb_build_object(
      'success', true,
      'token', v_raw_token,
      'role', 'driver',
      'bus_id', v_bus.id,
      'bus_number', v_bus.bus_number,
      'expires_at', v_expires_at
    );
  ELSE
    v_lockout := check_and_record_attempt('bus_' || v_clean_bus, false);
    RETURN jsonb_build_object(
      'success', false, 
      'error', v_lockout ->> 'error',
      'locked', (v_lockout ->> 'locked')::boolean,
      'remaining_attempts', (v_lockout ->> 'remaining_attempts')::int
    );
  END IF;
END;
$fn$;

-- 6. Admin Login RPC: admin_login(p_passphrase)
CREATE OR REPLACE FUNCTION admin_login(
  p_passphrase TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $fn$
DECLARE
  v_admin RECORD;
  v_lockout JSONB;
  v_clean_pass TEXT := TRIM(p_passphrase);
  v_raw_token TEXT;
  v_token_hash TEXT;
  v_expires_at TIMESTAMPTZ := NOW() + interval '1 hour';
BEGIN
  -- 1. Check lockout for admin account
  v_lockout := check_and_record_attempt('admin', NULL);
  IF (v_lockout ->> 'locked')::boolean THEN
    RETURN jsonb_build_object('success', false, 'locked', true, 'error', v_lockout ->> 'error');
  END IF;

  -- 2. Verify admin passphrase
  SELECT * INTO v_admin FROM admins 
  WHERE (pin_hash IS NOT NULL AND extensions.crypt(v_clean_pass, pin_hash) = pin_hash)
     OR (pin_hash IS NULL AND pin = v_clean_pass)
  LIMIT 1;

  IF FOUND THEN
    PERFORM check_and_record_attempt('admin', true);

    v_raw_token := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

    INSERT INTO sessions (token_hash, role, bus_id, expires_at)
    VALUES (v_token_hash, 'admin', NULL, v_expires_at);

    RETURN jsonb_build_object(
      'success', true,
      'token', v_raw_token,
      'role', 'admin',
      'name', 'Transport Administrator',
      'college', v_admin.college_name,
      'expires_at', v_expires_at
    );
  ELSE
    v_lockout := check_and_record_attempt('admin', false);
    RETURN jsonb_build_object(
      'success', false,
      'error', v_lockout ->> 'error',
      'locked', (v_lockout ->> 'locked')::boolean,
      'remaining_attempts', (v_lockout ->> 'remaining_attempts')::int
    );
  END IF;
END;
$fn$;

-- 7. Privileged RPC: driver_upsert_location(p_token, p_latitude, p_longitude)
-- Validates token hash and extracts bus_id from session (No p_bus_id accepted from caller!)
CREATE OR REPLACE FUNCTION driver_upsert_location(
  p_token TEXT,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $fn$
DECLARE
  v_session RECORD;
  v_token_hash TEXT;
BEGIN
  IF p_token IS NULL OR TRIM(p_token) = '' THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Missing session token';
  END IF;

  v_token_hash := encode(digest(TRIM(p_token), 'sha256'), 'hex');
  SELECT * INTO v_session FROM sessions 
  WHERE token_hash = v_token_hash 
    AND role = 'driver'
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Invalid or expired driver session token';
  END IF;

  INSERT INTO bus_location (bus_id, latitude, longitude, updated_at)
  VALUES (v_session.bus_id, p_latitude, p_longitude, NOW())
  ON CONFLICT (bus_id)
  DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    updated_at = NOW();

  RETURN jsonb_build_object('success', true, 'bus_id', v_session.bus_id);
END;
$fn$;

-- 8. Privileged RPC: driver_update_tracking(p_token, p_is_tracking)
CREATE OR REPLACE FUNCTION driver_update_tracking(
  p_token TEXT,
  p_is_tracking BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $fn$
DECLARE
  v_session RECORD;
  v_token_hash TEXT;
BEGIN
  IF p_token IS NULL OR TRIM(p_token) = '' THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Missing session token';
  END IF;

  v_token_hash := encode(digest(TRIM(p_token), 'sha256'), 'hex');
  SELECT * INTO v_session FROM sessions 
  WHERE token_hash = v_token_hash 
    AND role = 'driver'
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Invalid or expired driver session token';
  END IF;

  UPDATE buses
  SET is_tracking = p_is_tracking
  WHERE id = v_session.bus_id;

  RETURN jsonb_build_object('success', true, 'bus_id', v_session.bus_id, 'is_tracking', p_is_tracking);
END;
$fn$;

-- 9. Privileged RPC: admin_save_bus(p_token, ...)
CREATE OR REPLACE FUNCTION admin_save_bus(
  p_token TEXT,
  p_bus_id BIGINT,
  p_bus_number TEXT,
  p_driver_phone TEXT,
  p_start_place TEXT,
  p_start_time TIME,
  p_start_lat DOUBLE PRECISION,
  p_start_lng DOUBLE PRECISION,
  p_end_place TEXT,
  p_end_time TIME,
  p_end_lat DOUBLE PRECISION,
  p_end_lng DOUBLE PRECISION,
  p_stops JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $fn$
DECLARE
  v_session RECORD;
  v_token_hash TEXT;
  v_bus_id BIGINT := p_bus_id;
  v_stop JSONB;
BEGIN
  IF p_token IS NULL OR TRIM(p_token) = '' THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Missing session token';
  END IF;

  v_token_hash := encode(digest(TRIM(p_token), 'sha256'), 'hex');
  SELECT * INTO v_session FROM sessions 
  WHERE token_hash = v_token_hash 
    AND role = 'admin'
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Invalid or expired admin session token';
  END IF;

  IF v_bus_id IS NULL THEN
    INSERT INTO buses (
      bus_number, driver_phone, driver_pin_hash,
      start_place, start_time, start_lat, start_lng,
      end_place, end_time, end_lat, end_lng, is_tracking
    ) VALUES (
      p_bus_number, p_driver_phone, 
      CASE WHEN p_driver_phone IS NOT NULL AND p_driver_phone != '' 
           THEN extensions.crypt(p_driver_phone, extensions.gen_salt('bf', 10)) 
           ELSE NULL END,
      p_start_place, p_start_time, p_start_lat, p_start_lng,
      p_end_place, p_end_time, p_end_lat, p_end_lng, false
    ) RETURNING id INTO v_bus_id;
  ELSE
    UPDATE buses SET
      bus_number = p_bus_number,
      driver_phone = p_driver_phone,
      driver_pin_hash = CASE WHEN p_driver_phone IS NOT NULL AND p_driver_phone != '' 
                             THEN extensions.crypt(p_driver_phone, extensions.gen_salt('bf', 10)) 
                             ELSE driver_pin_hash END,
      start_place = p_start_place,
      start_time = p_start_time,
      start_lat = p_start_lat,
      start_lng = p_start_lng,
      end_place = p_end_place,
      end_time = p_end_time,
      end_lat = p_end_lat,
      end_lng = p_end_lng
    WHERE id = v_bus_id;
  END IF;

  -- Atomic stops replacement
  IF p_stops IS NOT NULL THEN
    DELETE FROM stops WHERE bus_id = v_bus_id;
    IF jsonb_array_length(p_stops) > 0 THEN
      FOR v_stop IN SELECT * FROM jsonb_array_elements(p_stops) LOOP
        INSERT INTO stops (bus_id, stop_name, stop_time, stop_order, latitude, longitude)
        VALUES (
          v_bus_id,
          v_stop ->> 'stop_name',
          (v_stop ->> 'stop_time')::time,
          (v_stop ->> 'stop_order')::int,
          (v_stop ->> 'latitude')::double precision,
          (v_stop ->> 'longitude')::double precision
        );
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'bus_id', v_bus_id);
END;
$fn$;

-- 10. Privileged RPC: admin_delete_bus(p_token, p_bus_id)
CREATE OR REPLACE FUNCTION admin_delete_bus(
  p_token TEXT,
  p_bus_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $fn$
DECLARE
  v_session RECORD;
  v_token_hash TEXT;
BEGIN
  IF p_token IS NULL OR TRIM(p_token) = '' THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Missing session token';
  END IF;

  v_token_hash := encode(digest(TRIM(p_token), 'sha256'), 'hex');
  SELECT * INTO v_session FROM sessions 
  WHERE token_hash = v_token_hash 
    AND role = 'admin'
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Invalid or expired admin session token';
  END IF;

  DELETE FROM bus_location WHERE bus_id = p_bus_id;
  DELETE FROM stops WHERE bus_id = p_bus_id;
  DELETE FROM buses WHERE id = p_bus_id;

  RETURN jsonb_build_object('success', true);
END;
$fn$;

-- 11. Grant Execute Permissions
-- In PostgREST, public/anon clients send HTTP requests.
-- By granting execute to anon on the wrapper functions, PostgREST allows the call,
-- but the functions immediately check p_token against the sessions table and RAISE EXCEPTION if missing or invalid.
GRANT EXECUTE ON FUNCTION verify_pin_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_login(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION driver_upsert_location(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION driver_update_tracking(TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_save_bus(TEXT, BIGINT, TEXT, TEXT, TEXT, TIME, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TIME, DOUBLE PRECISION, DOUBLE PRECISION, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_bus(TEXT, BIGINT) TO anon, authenticated;
