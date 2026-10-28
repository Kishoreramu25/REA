# EMERGENCY PIN ROTATION GUIDE (Admin & Driver PINs)

Because the Master Admin PIN (`587828`) and Driver PINs were previously stored in plaintext and exposed in the mobile application bundle and client database queries, they must be rotated immediately using salted bcrypt hashes.

---

## Part 1: Prerequisites
Ensure `pgcrypto` is enabled in PostgreSQL:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

---

## Part 2: Admin PIN Rotation

### Step 1: Generate New 6-Digit Admin PIN
Choose a new high-entropy 6-digit numeric PIN for the Transport Administrator (for example: `842917` — **do not use `587828`**).

### Step 2: Execute SQL in Supabase SQL Editor
Run the following SQL in your Supabase Dashboard:

```sql
-- 1. Ensure hash column exists
ALTER TABLE admins ADD COLUMN IF NOT EXISTS pin_hash TEXT;

-- 2. Update Admin with newly chosen PIN (replace '842917' with your new secret PIN)
UPDATE admins
SET 
  pin = '842917',
  pin_hash = crypt('842917', gen_salt('bf', 12)),
  created_at = NOW()
WHERE id = (SELECT id FROM admins ORDER BY id ASC LIMIT 1);

-- 3. Invalidate any active sessions
DELETE FROM login_attempts;
```

### Step 3: Verify Admin Hash
```sql
SELECT id, college_name, (pin_hash IS NOT NULL) AS has_secure_hash FROM admins;
```

---

## Part 3: Driver PIN Rotation

All driver PINs in the `buses` table must be updated to new unexposed 6-digit PINs, securely hashed with bcrypt.

### Step 1: Execute SQL in Supabase SQL Editor
Assign each active bus a new unique 6-digit PIN and generate bcrypt hashes:

```sql
-- 1. Ensure driver_pin_hash column exists
ALTER TABLE buses ADD COLUMN IF NOT EXISTS driver_pin_hash TEXT;

-- 2. Rotate PIN for Bus No 1 (Example new PIN: 731045)
UPDATE buses
SET 
  driver_phone = '731045',
  driver_pin_hash = crypt('731045', gen_salt('bf', 10))
WHERE bus_number = '1';

-- 3. If you have multiple buses, rotate each one systematically:
-- UPDATE buses SET driver_phone = '<NEW_PIN>', driver_pin_hash = crypt('<NEW_PIN>', gen_salt('bf', 10)) WHERE bus_number = '2';
-- UPDATE buses SET driver_phone = '<NEW_PIN>', driver_pin_hash = crypt('<NEW_PIN>', gen_salt('bf', 10)) WHERE bus_number = '3';

-- 4. Verify that all buses now possess secure bcrypt hashes
SELECT id, bus_number, (driver_pin_hash IS NOT NULL) AS is_hashed FROM buses;
```

---

## Part 4: Revoke Public Access to Plaintext PINs

To ensure newly rotated PINs cannot be scraped using the anon key:

```sql
-- 1. Revoke direct SELECT on buses table from anon
REVOKE SELECT ON buses FROM anon;

-- 2. Grant SELECT on public_buses view (which excludes driver_phone and driver_pin_hash)
GRANT SELECT ON public_buses TO anon, authenticated;

-- 3. Lock admins table completely from public
REVOKE ALL ON admins FROM anon;
```

---

## Part 5: Communicate New PINs to Personnel

1. Send the newly generated Driver PIN privately to the assigned driver for each bus route.
2. Provide the new Admin PIN exclusively to the Head of Transport / Administrator.
3. Advise staff never to share PINs over SMS or unencrypted channels.
