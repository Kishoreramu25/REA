import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gqjurdcxphdfairbcusj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_IHSNLN7QXkGAvsNTDlVwhw_hAsD2UUA';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log('=== SECURITY TEST: CALLING EVERY RPC WITH ONLY THE ANON KEY ===\n');

  // RPC 1: verify_pin_login
  console.log('1. Calling verify_pin_login (with anon key only)...');
  const res1 = await supabase.rpc('verify_pin_login', { p_pin: '000000', p_client_id: 'anon_probe' });
  console.log('   Result:', res1.data, res1.error ? `Error: ${res1.error.message}` : '');

  // RPC 2: driver_upsert_location
  console.log('\n2. Calling driver_upsert_location (with anon key only, spoofing bus 4)...');
  const res2 = await supabase.rpc('driver_upsert_location', {
    p_bus_id: 4,
    p_latitude: 11.277,
    p_longitude: 77.630
  });
  console.log('   Result:', res2.data, res2.error ? `Error: ${res2.error.message}` : '');
  const rpc2Vulnerable = res2.error == null;
  console.log('   Vulnerability Check:', rpc2Vulnerable ? '🚨 VULNERABLE: Anon can write GPS!' : '🛡️ BLOCKED');

  // RPC 3: driver_update_tracking
  console.log('\n3. Calling driver_update_tracking (with anon key only, toggling bus 4 tracking)...');
  const res3 = await supabase.rpc('driver_update_tracking', {
    p_bus_id: 4,
    p_is_tracking: true
  });
  console.log('   Result:', res3.data, res3.error ? `Error: ${res3.error.message}` : '');
  const rpc3Vulnerable = res3.error == null;
  console.log('   Vulnerability Check:', rpc3Vulnerable ? '🚨 VULNERABLE: Anon can toggle tracking!' : '🛡️ BLOCKED');

  // RPC 4: admin_delete_bus
  console.log('\n4. Calling admin_delete_bus (with anon key only, probing bus 99999)...');
  const res4 = await supabase.rpc('admin_delete_bus', {
    p_bus_id: 99999
  });
  console.log('   Result:', res4.data, res4.error ? `Error: ${res4.error.message}` : '');
  const rpc4Vulnerable = res4.error == null;
  console.log('   Vulnerability Check:', rpc4Vulnerable ? '🚨 VULNERABLE: Anon can delete buses!' : '🛡️ BLOCKED');

  // RPC 5: admin_save_bus
  console.log('\n5. Calling admin_save_bus (with anon key only)...');
  const res5 = await supabase.rpc('admin_save_bus', {
    p_bus_number: '9999'
  });
  console.log('   Result:', res5.data, res5.error ? `Error: ${res5.error.message}` : '');

  console.log('\n======================================================');
  console.log('SUMMARY: Privileged RPCs exposed to anonymous clients:');
  console.log('driver_upsert_location callable by anon?:', rpc2Vulnerable ? 'FAIL (Exposed)' : 'PASS (Blocked)');
  console.log('driver_update_tracking callable by anon?:', rpc3Vulnerable ? 'FAIL (Exposed)' : 'PASS (Blocked)');
  console.log('admin_delete_bus callable by anon?:', rpc4Vulnerable ? 'FAIL (Exposed)' : 'PASS (Blocked)');
  console.log('======================================================');
}

run().catch(console.error);
