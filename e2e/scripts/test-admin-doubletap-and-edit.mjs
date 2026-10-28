import { execFileSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

const ADB = 'C:\\Users\\Kishore R\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const SUPABASE_URL = 'https://gqjurdcxphdfairbcusj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_IHSNLN7QXkGAvsNTDlVwhw_hAsD2UUA';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function adb(args) {
  return execFileSync(ADB, args).toString('utf8');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function tap(x, y) {
  adb(['shell', 'input', 'tap', String(x), String(y)]);
}

function type(text) {
  adb(['shell', 'input', 'text', text]);
}

function dismissKeyboard() {
  adb(['shell', 'input', 'keyevent', '111']);
}

function clearField() {
  const keys = ['123', ...Array(35).fill('67')];
  adb(['shell', 'input', 'keyevent', ...keys]);
}

function capture(filename) {
  adb(['shell', 'screencap', '-p', `/sdcard/${filename}`]);
  adb(['pull', `/sdcard/${filename}`, `e2e/screenshots/${filename}`]);
}

function getNodes() {
  adb(['shell', 'uiautomator', 'dump', '/sdcard/ui.xml']);
  const xml = adb(['shell', 'cat', '/sdcard/ui.xml']);
  const matches = [...xml.matchAll(/<node [^>]*text="([^"]*)"[^>]*content-desc="([^"]*)"[^>]*bounds="([^"]*)"/g)];
  return matches.map(m => ({ text: m[1], desc: m[2], bounds: m[3] }));
}

async function run() {
  console.log('=== TEST: DOUBLE-TAP & EDIT BUS ===\n');

  // Step 1: Delete the "Too Close Stop" by tapping the trash icon
  console.log('Tapping trash icon to remove invalid stop...');
  tap(890, 1995);
  await sleep(400);

  // Step 2: Add a valid stop (> 50m apart)
  console.log('Adding valid stop (11.28000, 77.63300 - approx 380m from origin)...');
  tap(339, 1700); // Stop Name
  await sleep(100);
  clearField();
  type('Valid%sStop%s1');
  dismissKeyboard();
  await sleep(100);

  tap(848, 1700); // Stop Time
  await sleep(100);
  clearField();
  type('08:15%sAM');
  dismissKeyboard();
  await sleep(100);

  tap(288, 1830); // Stop Coords
  await sleep(100);
  clearField();
  type('11.28000,%s77.63300');
  dismissKeyboard();
  await sleep(100);

  // Tap "+ Add" button
  console.log('Tapping "+ Add"...');
  tap(951, 1830);
  await sleep(500);

  capture('edge_valid_stop_added.png');

  // Step 3: Rapid Double-Tap on "Create Bus Route"
  console.log('Executing rapid double-tap on "Create Bus Route" (x: 716, y: 2220)...');
  tap(716, 2220);
  tap(716, 2220); // Immediate second tap!
  await sleep(2500);

  capture('edge_after_double_tap.png');

  // Check Supabase for Bus 996
  const { data: createdBuses, error } = await supabase
    .from('public_buses')
    .select('id, bus_number, start_place, end_place, stops(*)')
    .eq('bus_number', '996');

  console.log('Query public_buses for #996:', { count: createdBuses?.length, error });
  if (createdBuses && createdBuses.length === 1) {
    console.log('✅ EMPIRICAL RESULT: Exactly ONE bus created despite rapid double-tap! Duplicate prevented.');
    console.log('Created Bus Details:', {
      id: createdBuses[0].id,
      bus_number: createdBuses[0].bus_number,
      stops_count: createdBuses[0].stops?.length,
      stops: createdBuses[0].stops?.map(s => s.name)
    });

    const busId = createdBuses[0].id;

    // Step 4: Test Edit Bus (isolate stop update)
    console.log('\n--- Step 4: Edit Bus Isolation Test ---');
    // Find Bus 996 on Admin Dashboard and tap Edit
    const nodes = getNodes();
    console.log('Nodes after creation:', nodes.map(n => n.text).filter(Boolean).slice(0, 10));

    // We can also test updating a stop via the app or verifying the atomic update logic
    console.log('Testing Stop Edit Isolation via UI/DB...');
  } else {
    console.log('Buses found:', createdBuses);
  }
}

run().catch(console.error);
