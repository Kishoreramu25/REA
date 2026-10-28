import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../src/utils/constants.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function cleanup() {
  console.log('[Cleanup] Starting cleanup of test data...');

  try {
    // 0. Try RPC e2e_cleanup_test_buses first (works with RLS active)
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('e2e_cleanup_test_buses');
      if (!rpcErr && rpcData?.success) {
        console.log('[Cleanup] CONFIRMED: All test data cleaned via e2e_cleanup_test_buses RPC.');
        return true;
      }
    } catch (e) {}

    // 1. Find all test buses (999, 998)
    const { data: testBuses, error: findErr } = await supabase
      .from('buses')
      .select('id, bus_number')
      .in('bus_number', ['999', '998']);

    if (findErr) {
      console.error('[Cleanup] Error querying test buses:', findErr.message);
      return false;
    }

    if (!testBuses || testBuses.length === 0) {
      console.log('[Cleanup] No test buses found to clean up.');
      return true;
    }

    const busIds = testBuses.map((b) => b.id);
    console.log(`[Cleanup] Found ${busIds.length} test bus(es):`, testBuses.map(b => b.bus_number));

    // 2. Delete bus_locations
    const { error: locErr } = await supabase
      .from('bus_location')
      .delete()
      .in('bus_id', busIds);
    if (locErr) console.warn('[Cleanup] Error deleting bus_location:', locErr.message);
    else console.log('[Cleanup] Deleted test bus_location entries');

    // 3. Delete stops
    const { error: stopsErr } = await supabase
      .from('stops')
      .delete()
      .in('bus_id', busIds);
    if (stopsErr) console.warn('[Cleanup] Error deleting stops:', stopsErr.message);
    else console.log('[Cleanup] Deleted test stops');

    // 4. Delete buses
    const { error: busErr } = await supabase
      .from('buses')
      .delete()
      .in('id', busIds);
    if (busErr) console.warn('[Cleanup] Error deleting buses:', busErr.message);
    else console.log('[Cleanup] Deleted test buses');

    // 5. Verification
    const { data: verifyData } = await supabase
      .from('buses')
      .select('id, bus_number')
      .in('bus_number', ['999', '998']);

    if (!verifyData || verifyData.length === 0) {
      console.log('[Cleanup] CONFIRMED: All test data has been successfully removed.');
      return true;
    } else {
      console.error('[Cleanup] WARNING: Some test buses remain:', verifyData);
      return false;
    }
  } catch (err) {
    console.error('[Cleanup] Exception occurred during cleanup:', err);
    return false;
  }
}

if (process.argv[1]?.endsWith('cleanup.mjs')) {
  cleanup().then((success) => {
    process.exit(success ? 0 : 1);
  });
}
