import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, APP_CONFIG } from '../../src/utils/constants.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function runSecurityAudit() {
  console.log('=== RUNNING SECTION 9: SECURITY AUDIT (ANON KEY ONLY) ===\n');
  const findings = [];

  function record(id, operation, allowed, risk, details) {
    findings.push({ id, operation, allowed, risk, details });
    const flag = allowed ? (risk === 'HIGH' ? '🚨 VULNERABILITY' : '⚠️ ALLOWED') : '🛡️ BLOCKED (RLS)';
    console.log(`[${flag}] ${id}: ${operation}`);
    console.log(`   Details: ${details}\n`);
  }

  // 1. SELECT driver_phone FROM buses
  try {
    const { data, error } = await supabase.from('buses').select('id, bus_number, driver_phone').limit(5);
    if (!error && data && data.length > 0) {
      const phones = data.map(b => `${b.bus_number}: ${b.driver_phone}`).join(', ');
      record(
        'SEC_01',
        'SELECT driver_phone FROM buses (Anon Key)',
        true,
        'HIGH',
        `Unrestricted public read of driver PINs / phones: [${phones}]. Anyone with the anon key can read all driver PINs.`
      );
    } else {
      record('SEC_01', 'SELECT driver_phone FROM buses', false, 'NONE', error?.message || 'Empty data');
    }
  } catch (e) {
    record('SEC_01', 'SELECT driver_phone FROM buses', false, 'NONE', e.message);
  }

  // 2. READ admins table
  try {
    const { data, error } = await supabase.from('admins').select('*').limit(5);
    if (!error) {
      record(
        'SEC_02',
        'SELECT * FROM admins (Anon Key)',
        true,
        'HIGH',
        `Unrestricted public read of admins table! Found ${data?.length || 0} row(s): ${JSON.stringify(data)}`
      );
    } else {
      record(
        'SEC_02',
        'SELECT * FROM admins (Anon Key)',
        false,
        'NONE',
        `Protected by RLS or table does not exist: ${error.message}`
      );
    }
  } catch (e) {
    record('SEC_02', 'SELECT * FROM admins (Anon Key)', false, 'NONE', e.message);
  }

  // 3. INSERT a bus
  let insertedSecBusId = null;
  try {
    const { data, error } = await supabase.from('buses').insert({
      bus_number: '990',
      driver_phone: '990990',
      start_place: 'Sec Test Origin',
      start_time: '08:00:00',
      end_place: 'Sec Test End',
      end_time: '09:00:00',
      is_tracking: false
    }).select().single();

    if (!error && data) {
      insertedSecBusId = data.id;
      record(
        'SEC_03',
        'INSERT into buses table (Anon Key)',
        true,
        'HIGH',
        `Unrestricted public INSERT into buses table. Created unauthorized bus id: ${data.id}`
      );
    } else {
      record('SEC_03', 'INSERT into buses table (Anon Key)', false, 'NONE', error?.message);
    }
  } catch (e) {
    record('SEC_03', 'INSERT into buses table (Anon Key)', false, 'NONE', e.message);
  }

  // 4. UPDATE a bus (Anon Key)
  try {
    const targetBusId = insertedSecBusId || 4;
    const { data, error } = await supabase
      .from('buses')
      .update({ start_place: 'HACKED ORIGIN' })
      .eq('id', targetBusId)
      .select();

    if (!error && data && data.length > 0) {
      record(
        'SEC_04',
        'UPDATE buses table (Anon Key)',
        true,
        'HIGH',
        `Unrestricted public UPDATE on buses table. Modified bus start_place to 'HACKED ORIGIN'`
      );
    } else {
      record('SEC_04', 'UPDATE buses table (Anon Key)', false, 'NONE', error?.message || 'Access blocked by RLS');
    }
  } catch (e) {
    record('SEC_04', 'UPDATE buses table (Anon Key)', false, 'NONE', e.message);
  }

  // 5. UPDATE is_tracking flag (Anon Key)
  try {
    const targetBusId = insertedSecBusId || 4;
    const { data, error } = await supabase
      .from('buses')
      .update({ is_tracking: true })
      .eq('id', targetBusId)
      .select();

    if (!error && data && data.length > 0) {
      record(
        'SEC_05',
        'UPDATE is_tracking on buses (Anon Key)',
        true,
        'HIGH',
        `Any anon client can toggle is_tracking to true/false for any bus.`
      );
    } else {
      record('SEC_05', 'UPDATE is_tracking on buses', false, 'NONE', error?.message || 'Access blocked by RLS');
    }
  } catch (e) {
    record('SEC_05', 'UPDATE is_tracking on buses', false, 'NONE', e.message);
  }

  // 6. INSERT stops (Anon Key)
  let secStopId = null;
  try {
    const targetBusId = insertedSecBusId || 4;
    const { data, error } = await supabase.from('stops').insert({
      bus_id: targetBusId,
      stop_name: 'Sec Malicious Stop',
      stop_time: '08:30:00',
      stop_order: 1
    }).select().single();

    if (!error && data) {
      secStopId = data.id;
      record(
        'SEC_06',
        'INSERT into stops table (Anon Key)',
        true,
        'HIGH',
        `Unrestricted public INSERT into stops table. Created unauthorized stop id: ${data.id}`
      );
    } else {
      record('SEC_06', 'INSERT into stops table', false, 'NONE', error?.message || 'Access blocked by RLS');
    }
  } catch (e) {
    record('SEC_06', 'INSERT into stops table', false, 'NONE', e.message);
  }

  // 7. DELETE stops (Anon Key)
  try {
    const targetStopId = secStopId || 1;
    const { error: delStopErr } = await supabase.from('stops').delete().eq('id', targetStopId);
    if (!delStopErr) {
      record(
        'SEC_07',
        'DELETE from stops table (Anon Key)',
        true,
        'HIGH',
        `Unrestricted public DELETE on stops table. Anyone can delete stops.`
      );
    } else {
      record('SEC_07', 'DELETE from stops table', false, 'NONE', delStopErr.message || 'Access blocked by RLS');
    }
  } catch (e) {
    record('SEC_07', 'DELETE from stops table', false, 'NONE', e.message);
  }

  // 8. INSERT / UPDATE bus_location for ANY bus (Anon Key)
  try {
    const targetBusId = insertedSecBusId || 4;
    const { error: locErr } = await supabase.from('bus_location').upsert({
      bus_id: targetBusId,
      latitude: 11.9999,
      longitude: 77.9999,
      updated_at: new Date().toISOString()
    }, { onConflict: 'bus_id' });

    if (!locErr) {
      record(
        'SEC_08',
        'UPSERT bus_location for ANY bus (Anon Key)',
        true,
        'HIGH',
        `Unrestricted public UPSERT into bus_location table. Spoofed GPS coordinates accepted without driver authentication.`
      );
    } else {
      record('SEC_08', 'UPSERT bus_location', false, 'NONE', locErr.message || 'Access blocked by RLS');
    }
  } catch (e) {
    record('SEC_08', 'UPSERT bus_location', false, 'NONE', e.message);
  }

  // 9. DELETE bus (Anon Key)
  try {
    const targetBusId = insertedSecBusId || 99999;
    const { error: delBusErr } = await supabase.from('buses').delete().eq('id', targetBusId);
    if (!delBusErr) {
      record(
        'SEC_09',
        'DELETE from buses table (Anon Key)',
        true,
        'HIGH',
        `Unrestricted public DELETE on buses table! Any client with anon key can wipe all buses from the database!`
      );
    } else {
      record('SEC_09', 'DELETE from buses table', false, 'NONE', delBusErr.message || 'Access blocked by RLS');
    }
  } catch (e) {
    record('SEC_09', 'DELETE from buses table', false, 'NONE', e.message);
  }

  // 9. APK Hardcoded Secrets Scan
  const apkPath = path.resolve('android/app/build/outputs/apk/release/app-release.apk');
  let apkPinFound = false;
  let apkPinEvidence = '';
  if (fs.existsSync(apkPath)) {
    const buffer = fs.readFileSync(apkPath);
    const pinStr = '587828'; // Legacy exposed master PIN
    if (buffer.includes(pinStr)) {
      apkPinFound = true;
      apkPinEvidence = `Found hardcoded admin PIN "${pinStr}" in plaintext inside app-release.apk!`;
      record(
        'SEC_10',
        'Hardcoded Admin PIN in Release APK',
        true,
        'BLOCKER',
        `Admin master PIN ${pinStr} is present in the release binary. Reverse-engineering strings reveals master admin access.`
      );
    } else {
      record(
        'SEC_10',
        'Hardcoded Admin PIN in Release APK',
        false,
        'NONE',
        `PIN "${pinStr}" not found in plain binary strings of app-release.apk.`
      );
    }
  } else {
    record('SEC_10', 'Hardcoded Admin PIN in Release APK', false, 'UNKNOWN', `APK not found at ${apkPath}`);
  }

  // 11. anon can call RPC (Security Hardening Test)
  try {
    const resTracking = await supabase.rpc('driver_update_tracking', { p_bus_id: 4, p_is_tracking: true });
    const resLocation = await supabase.rpc('driver_upsert_location', { p_bus_id: 4, p_latitude: 11.277, p_longitude: 77.630 });
    const resDelete = await supabase.rpc('admin_delete_bus', { p_bus_id: 99999 });

    const anonCanCall = !resTracking.error || !resLocation.error || !resDelete.error;
    record(
      'SEC_RPC_ANON',
      'anon can call RPC',
      anonCanCall,
      'HIGH',
      `Anon key can execute privileged RPCs without authentication! driver_update_tracking: ${!resTracking.error}, driver_upsert_location: ${!resLocation.error}, admin_delete_bus: ${!resDelete.error}`
    );
  } catch (e) {
    record('SEC_RPC_ANON', 'anon can call RPC', false, 'NONE', e.message);
  }

  const report = `# SECURITY AUDIT REPORT (Anon Key & Bundle Analysis)
Date: ${new Date().toISOString()}

${findings.map(f => `### [${f.risk}] ${f.id}: ${f.operation}
- **Allowed with Anon Key**: ${f.allowed ? 'YES (VULNERABILITY)' : 'NO (RESTRICTED)'}
- **Impact/Details**: ${f.details}
`).join('\n')}
`;

  fs.writeFileSync(path.resolve('e2e/results/security-audit.md'), report);
  console.log('Security report written to e2e/results/security-audit.md');
}

if (process.argv[1]?.endsWith('test-security.mjs')) {
  runSecurityAudit().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
