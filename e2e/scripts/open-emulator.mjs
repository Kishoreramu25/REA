import { execSync } from 'child_process';
import path from 'path';

const ADB = 'C:\\Users\\Kishore R\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const APK = path.resolve('esec-transport-updated.apk');

function run(cmd) {
  console.log(`[EXEC] ${cmd}`);
  const out = execSync(`"${ADB}" ${cmd}`, { stdio: 'pipe' }).toString('utf8');
  console.log(out.trim());
  return out;
}

try {
  console.log('--- Step 1: Checking devices ---');
  run('devices');

  console.log('\n--- Step 2: Installing APK ---');
  run(`install -r "${APK}"`);

  console.log('\n--- Step 3: Launching ESEC Transport App ---');
  run('shell monkey -p com.esec.transport -c android.intent.category.LAUNCHER 1');

  // Wait 3 seconds
  const start = Date.now();
  while (Date.now() - start < 3000) {}

  console.log('\n--- Step 4: Capturing Screen ---');
  run('shell screencap -p /sdcard/emu_launched.png');
  run('pull /sdcard/emu_launched.png e2e/screenshots/emu_launched.png');
  console.log('\n[SUCCESS] App launched and screenshot saved to e2e/screenshots/emu_launched.png');
} catch (e) {
  console.error('[ERROR]', e.message);
  if (e.stdout) console.error('stdout:', e.stdout.toString());
  if (e.stderr) console.error('stderr:', e.stderr.toString());
}
