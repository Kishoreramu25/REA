# SECURITY AUDIT REPORT (Anon Key & Bundle Analysis)
Date: 2026-10-26T18:33:36.318Z

### [NONE] SEC_01: SELECT driver_phone FROM buses
- **Allowed with Anon Key**: NO (RESTRICTED)
- **Impact/Details**: TypeError: fetch failed

### [NONE] SEC_02: SELECT * FROM admins (Anon Key)
- **Allowed with Anon Key**: NO (RESTRICTED)
- **Impact/Details**: Protected by RLS or table does not exist: TypeError: fetch failed

### [NONE] SEC_03: INSERT into buses table (Anon Key)
- **Allowed with Anon Key**: NO (RESTRICTED)
- **Impact/Details**: TypeError: fetch failed

### [NONE] SEC_04: UPDATE buses table (Anon Key)
- **Allowed with Anon Key**: NO (RESTRICTED)
- **Impact/Details**: TypeError: fetch failed

### [NONE] SEC_05: UPDATE is_tracking on buses
- **Allowed with Anon Key**: NO (RESTRICTED)
- **Impact/Details**: TypeError: fetch failed

### [NONE] SEC_06: INSERT into stops table
- **Allowed with Anon Key**: NO (RESTRICTED)
- **Impact/Details**: TypeError: fetch failed

### [NONE] SEC_07: DELETE from stops table
- **Allowed with Anon Key**: NO (RESTRICTED)
- **Impact/Details**: TypeError: fetch failed

### [NONE] SEC_08: UPSERT bus_location
- **Allowed with Anon Key**: NO (RESTRICTED)
- **Impact/Details**: TypeError: fetch failed

### [NONE] SEC_09: DELETE from buses table
- **Allowed with Anon Key**: NO (RESTRICTED)
- **Impact/Details**: TypeError: fetch failed

### [NONE] SEC_10: Hardcoded Admin PIN in Release APK
- **Allowed with Anon Key**: NO (RESTRICTED)
- **Impact/Details**: PIN "587828" not found in plain binary strings of app-release.apk.

### [HIGH] SEC_RPC_ANON: anon can call RPC
- **Allowed with Anon Key**: NO (RESTRICTED)
- **Impact/Details**: Anon key can execute privileged RPCs without authentication! driver_update_tracking: false, driver_upsert_location: false, admin_delete_bus: false

