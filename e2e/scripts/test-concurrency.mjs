import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { SUPABASE_URL, SUPABASE_KEY } from '../../src/utils/constants.js';

const ADB = 'C:\\Users\\Kishore R\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function adb(cmd) {
  return execSync(`& "${ADB}" ${cmd}`, { shell: 'powershell.exe' }).toString('utf8');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('--- Step 1: Query Bus 998 and 999 IDs ---');
  const { data: b998 } = await supabase.from('buses').select('id, bus_number').eq('bus_number', '998').single();
  const { data: b999 } = await supabase.from('buses').select('id, bus_number').eq('bus_number', '999').single();

  console.log(`Bus 998 id: ${b998.id}, Bus 999 id: ${b999.id}`);

  // Step 2: Set tracking=true and insert location for Bus 998 at Stop 1 (11.2650, 77.6000)
  console.log('--- Step 2: Push Location for Bus 998 ---');
  await supabase.from('buses').update({ is_tracking: true }).eq('id', b998.id);
  await supabase.from('bus_location').upsert({
    bus_id: b998.id,
    latitude: 11.2650,
    longitude: 77.6000,
    heading: 45,
    speed: 30,
    updated_at: new Date().toISOString()
  });

  // Step 3: Set tracking=true and insert distinct location for Bus 999 at Stop 2 (11.2740, 77.6160)
  console.log('--- Step 3: Push Distinct Location for Bus 999 ---');
  await supabase.from('buses').update({ is_tracking: true }).eq('id', b999.id);
  await supabase.from('bus_location').upsert({
    bus_id: b999.id,
    latitude: 11.2740,
    longitude: 77.6160,
    heading: 90,
    speed: 25,
    updated_at: new Date().toISOString()
  });

  console.log('--- Step 4: Open Bus 999 in App ---');
  // Re-open app to Home
  adb('shell am start -n com.esec.transport/.MainActivity');
  await sleep(1500);

  // Tap "Open My Bus" (since Bus 999 is My Bus)
  adb('shell input tap 540 1530');
  await sleep(2000);

  adb('shell screencap -p /sdcard/108_concurrency_bus999.png');
  adb('pull /sdcard/108_concurrency_bus999.png e2e/screenshots/108_concurrency_bus999.png');

  console.log('--- Step 5: Switch to Bus 998 in App ---');
  // Press Back to Home
  adb('shell input keyevent 4');
  await sleep(1000);

  // Tap Change Bus
  adb('shell input tap 850 1235');
  await sleep(1000);

  // Tap Bus 998 in dropdown
  // Dump screen to find Bus 998 position
  adb('shell uiautomator dump /sdcard/ui.xml');
  const xml = adb('shell cat /sdcard/ui.xml');
  const m = xml.match(/<node [^>]*text="[^"]*998[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (m) {
    const x = Math.floor((parseInt(m[1]) + parseInt(m[3])) / 2);
    const y = Math.floor((parseInt(m[2]) + parseInt(m[4])) / 2);
    console.log(`Tapping Bus 998 in dropdown at (${x}, ${y})`);
    adb(`shell input tap ${x} ${y}`);
  } else {
    console.log('Bus 998 not found by regex, tapping estimated dropdown row');
    adb('shell input tap 540 1450');
  }
  await sleep(2000);

  adb('shell screencap -p /sdcard/109_concurrency_bus998.png');
  adb('pull /sdcard/109_concurrency_bus998.png e2e/screenshots/109_concurrency_bus998.png');

  console.log('--- Concurrency test completed ---');
}

run().catch(e => console.error(e));
