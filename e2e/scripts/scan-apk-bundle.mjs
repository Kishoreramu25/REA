import fs from 'fs';
import { execSync } from 'child_process';

const apkPath = 'android/app/build/outputs/apk/release/app-release.apk';
const zipPath = 'e2e/app-release.zip';
const extractDir = 'e2e/extracted_apk';

console.log('=== SCANNING RELEASE APK HERMES BUNDLE FOR HARDCODED CREDENTIALS ===\n');
console.log('Copying APK to zip format...');
fs.copyFileSync(apkPath, zipPath);

if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true });

console.log('Extracting archive via PowerShell Expand-Archive...');
execSync(`powershell.exe -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`);

const bundlePath = `${extractDir}/assets/index.android.bundle`;
if (fs.existsSync(bundlePath)) {
  const bundleBuf = fs.readFileSync(bundlePath);
  console.log('Bundle extracted successfully.');
  console.log('Bundle Byte Size:', bundleBuf.length, `(${(bundleBuf.length / 1024 / 1024).toFixed(2)} MB)`);

  const bundleStr = bundleBuf.toString('latin1');

  // Search 1: Old Admin Master PIN (587828)
  const oldPin = '587828';
  const matchesOldPin = (bundleStr.match(new RegExp(oldPin, 'g')) || []).length;
  console.log(`\n1. Search for Old Admin PIN ("${oldPin}"):`);
  console.log(`   Occurrences found: ${matchesOldPin} ->`, matchesOldPin === 0 ? '🛡️ CLEAN (ABSENT)' : '❌ EXPOSED');

  // Search 2: Identifier ADMIN_MASTER_PIN
  const matchesIdentifier = (bundleStr.match(/ADMIN_MASTER_PIN/g) || []).length;
  console.log(`\n2. Search for identifier "ADMIN_MASTER_PIN":`);
  console.log(`   Occurrences found: ${matchesIdentifier} ->`, matchesIdentifier === 0 ? '🛡️ CLEAN (ABSENT)' : '❌ EXPOSED');

  // Search 3: Check for any driver PIN constants
  const testPins = ['999999', '999998', '999997', '444044'];
  console.log('\n3. Search for known test PIN constants:');
  for (const p of testPins) {
    const count = (bundleStr.match(new RegExp(p, 'g')) || []).length;
    console.log(`   PIN "${p}": ${count} occurrences -> ${count === 0 ? '🛡️ ABSENT' : 'Present (check context)'}`);
  }

  // Cleanup zip
  try {
    fs.unlinkSync(zipPath);
  } catch (e) {}

  console.log('\n=== APK BUNDLE SCAN COMPLETE ===');
} else {
  console.error('Bundle not found at', bundlePath);
}
