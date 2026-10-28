SET search_path = public, extensions, auth;

-- 1. Driver Location Upsert RPC
CREATE OR REPLACE FUNCTION driver_upsert_location(
  p_bus_id BIGINT,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $fn$
BEGIN
  INSERT INTO bus_location (bus_id, latitude, longitude, updated_at)
  VALUES (p_bus_id, p_latitude, p_longitude, NOW())
  ON CONFLICT (bus_id)
  DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    updated_at = NOW();

  RETURN jsonb_build_object('success', true, 'bus_id', p_bus_id);
END;
$fn$;

GRANT EXECUTE ON FUNCTION driver_upsert_location(BIGINT, DOUBLE PRECISION, DOUBLE PRECISION) TO anon, authenticated;

-- 2. Driver Tracking Status RPC
CREATE OR REPLACE FUNCTION driver_update_tracking(
  p_bus_id BIGINT,
  p_is_tracking BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $fn$
BEGIN
  UPDATE buses
  SET is_tracking = p_is_tracking
  WHERE id = p_bus_id;

  RETURN jsonb_build_object('success', true, 'bus_id', p_bus_id, 'is_tracking', p_is_tracking);
END;
$fn$;

GRANT EXECUTE ON FUNCTION driver_update_tracking(BIGINT, BOOLEAN) TO anon, authenticated;

-- 3. E2E Seed Helper (Seeds Bus 999 and Bus 998 with dynamic stop times)
CREATE OR REPLACE FUNCTION e2e_seed_test_buses(
  p_start_time999 TEXT,
  p_stop1_time TEXT,
  p_stop2_time TEXT,
  p_stop3_time TEXT,
  p_end_time999 TEXT,
  p_start_time998 TEXT,
  p_end_time998 TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $fn$
DECLARE
  v_bus999_id BIGINT;
  v_bus998_id BIGINT;
BEGIN
  -- Cleanup test buses first
  DELETE FROM bus_location WHERE bus_id IN (SELECT id FROM buses WHERE bus_number IN ('999', '998', 'TEST-SEC-1', 'TEST-SEC-2'));
  DELETE FROM stops WHERE bus_id IN (SELECT id FROM buses WHERE bus_number IN ('999', '998', 'TEST-SEC-1', 'TEST-SEC-2'));
  DELETE FROM buses WHERE bus_number IN ('999', '998', 'TEST-SEC-1', 'TEST-SEC-2');

  -- Create Bus 999
  INSERT INTO buses (
    bus_number, driver_phone, driver_pin_hash, start_place, start_time, start_lat, start_lng,
    end_place, end_time, end_lat, end_lng, is_tracking
  ) VALUES (
    '999', '999999', extensions.crypt('999999', extensions.gen_salt('bf', 10)),
    'Test Origin (Perundurai)', p_start_time999::time, 11.2700, 77.6000,
    'Test End (ESEC Campus)', p_end_time999::time, 11.2780, 77.6320, false
  ) RETURNING id INTO v_bus999_id;

  -- Insert Stops for Bus 999
  INSERT INTO stops (bus_id, stop_name, stop_time, stop_order, latitude, longitude)
  VALUES
    (v_bus999_id, 'Test Stop 1 (Kunnathur Rd)', p_stop1_time::time, 1, 11.2720, 77.6080),
    (v_bus999_id, 'Test Stop 2 (Bypass Junc)', p_stop2_time::time, 2, 11.2740, 77.6160),
    (v_bus999_id, 'Test Stop 3 (Thindal Post)', p_stop3_time::time, 3, 11.2760, 77.6240);

  -- Create Bus 998
  INSERT INTO buses (
    bus_number, driver_phone, driver_pin_hash, start_place, start_time, start_lat, start_lng,
    end_place, end_time, end_lat, end_lng, is_tracking
  ) VALUES (
    '998', '999998', extensions.crypt('999998', extensions.gen_salt('bf', 10)),
    'Test Origin 998 (Chennimalai)', p_start_time998::time, 11.2600, 77.5800,
    'Test End (ESEC Campus)', p_end_time998::time, 11.2780, 77.6320, false
  ) RETURNING id INTO v_bus998_id;

  RETURN jsonb_build_object(
    'success', true,
    'bus999_id', v_bus999_id,
    'bus998_id', v_bus998_id
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION e2e_seed_test_buses(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- 4. E2E Cleanup Helper
CREATE OR REPLACE FUNCTION e2e_cleanup_test_buses()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $fn$
BEGIN
  DELETE FROM bus_location WHERE bus_id IN (SELECT id FROM buses WHERE bus_number IN ('999', '998', 'TEST-SEC-1', 'TEST-SEC-2'));
  DELETE FROM stops WHERE bus_id IN (SELECT id FROM buses WHERE bus_number IN ('999', '998', 'TEST-SEC-1', 'TEST-SEC-2'));
  DELETE FROM buses WHERE bus_number IN ('999', '998', 'TEST-SEC-1', 'TEST-SEC-2');
  RETURN jsonb_build_object('success', true);
END;
$fn$;

GRANT EXECUTE ON FUNCTION e2e_cleanup_test_buses() TO anon, authenticated;

-- 5. Admin Delete Bus Helper
CREATE OR REPLACE FUNCTION admin_delete_bus(p_bus_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $fn$
BEGIN
  DELETE FROM bus_location WHERE bus_id = p_bus_id;
  DELETE FROM stops WHERE bus_id = p_bus_id;
  DELETE FROM buses WHERE id = p_bus_id;
  RETURN jsonb_build_object('success', true);
END;
$fn$;

GRANT EXECUTE ON FUNCTION admin_delete_bus(BIGINT) TO anon, authenticated;
