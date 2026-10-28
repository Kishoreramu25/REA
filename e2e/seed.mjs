import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../src/utils/constants.js';
import { cleanup } from './cleanup.mjs';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function getRelativeTimeStr(offsetMinutes) {
  const d = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = '00';
  return `${h}:${m}:${s}`;
}

export async function seed() {
  console.log('[Seed] Cleaning up previous test data before seeding...');
  await cleanup();

  console.log('[Seed] Seeding Bus 999 and Bus 998 with times relative to now...');

  const startTime999 = getRelativeTimeStr(3);   // now + 3 min
  const stop1Time999  = getRelativeTimeStr(15);  // now + 15 min
  const stop2Time999  = getRelativeTimeStr(30);  // now + 30 min
  const stop3Time999  = getRelativeTimeStr(45);  // now + 45 min
  const endTime999    = getRelativeTimeStr(60);  // now + 60 min

  const startTime998 = getRelativeTimeStr(5);   // now + 5 min
  const endTime998   = getRelativeTimeStr(65);  // now + 65 min

  console.log(`[Seed] Schedule for Bus 999: Start=${startTime999}, Stops=[${stop1Time999}, ${stop2Time999}, ${stop3Time999}], End=${endTime999}`);

  // 0. Try RPC e2e_seed_test_buses (works with RLS enabled)
  try {
    const { data: rpcSeed, error: rpcErr } = await supabase.rpc('e2e_seed_test_buses', {
      p_start_time999: startTime999,
      p_stop1_time: stop1Time999,
      p_stop2_time: stop2Time999,
      p_stop3_time: stop3Time999,
      p_end_time999: endTime999,
      p_start_time998: startTime998,
      p_end_time998: endTime998
    });

    if (!rpcErr && rpcSeed?.success) {
      console.log(`[Seed] Successfully seeded via RPC: Bus 999 (id: ${rpcSeed.bus999_id}), Bus 998 (id: ${rpcSeed.bus998_id})`);
      return;
    }
  } catch (e) {}

  // 1. Create Bus 999
  const { data: bus999, error: bus999Err } = await supabase
    .from('buses')
    .insert({
      bus_number: '999',
      driver_phone: '999999',
      start_place: 'Test Origin (Perundurai)',
      start_time: startTime999,
      start_lat: 11.2700,
      start_lng: 77.6000,
      end_place: 'Test End (ESEC Campus)',
      end_time: endTime999,
      end_lat: 11.2780,
      end_lng: 77.6320,
      is_tracking: false
    })
    .select()
    .single();

  if (bus999Err) {
    console.error('[Seed] Failed to create Bus 999:', bus999Err.message);
    throw bus999Err;
  }
  console.log('[Seed] Created Bus 999, id:', bus999.id);

  // 2. Create 3 Stops for Bus 999 along straight line
  const stops999 = [
    {
      bus_id: bus999.id,
      stop_name: 'Test Stop 1 (Kunnathur Rd)',
      stop_time: stop1Time999,
      stop_order: 1,
      latitude: 11.2720,
      longitude: 77.6080
    },
    {
      bus_id: bus999.id,
      stop_name: 'Test Stop 2 (Bypass Junc)',
      stop_time: stop2Time999,
      stop_order: 2,
      latitude: 11.2740,
      longitude: 77.6160
    },
    {
      bus_id: bus999.id,
      stop_name: 'Test Stop 3 (Thindal Post)',
      stop_time: stop3Time999,
      stop_order: 3,
      latitude: 11.2760,
      longitude: 77.6240
    }
  ];

  const { error: stopsErr } = await supabase.from('stops').insert(stops999);
  if (stopsErr) {
    console.error('[Seed] Failed to insert stops for Bus 999:', stopsErr.message);
    throw stopsErr;
  }
  console.log('[Seed] Inserted 3 stops for Bus 999');

  // 3. Create Bus 998 (for two-bus tests)
  const { data: bus998, error: bus998Err } = await supabase
    .from('buses')
    .insert({
      bus_number: '998',
      driver_phone: '999998',
      start_place: 'Test Origin 998 (Chennimalai)',
      start_time: startTime998,
      start_lat: 11.2600,
      start_lng: 77.5900,
      end_place: 'ESEC Campus',
      end_time: endTime998,
      end_lat: 11.2780,
      end_lng: 77.6320,
      is_tracking: false
    })
    .select()
    .single();

  if (bus998Err) {
    console.error('[Seed] Failed to create Bus 998:', bus998Err.message);
    throw bus998Err;
  }
  console.log('[Seed] Created Bus 998, id:', bus998.id);

  console.log('[Seed] SUCCESS: All test data seeded successfully.');
  return { bus999, bus998 };
}

if (process.argv[1]?.endsWith('seed.mjs')) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
