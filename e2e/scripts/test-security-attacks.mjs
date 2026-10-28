import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = 'https://gqjurdcxphdfairbcusj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_IHSNLN7QXkGAvsNTDlVwhw_hAsD2UUA';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper to create a signed mock JWT with standard header/payload for RLS testing
function createTestJwt(payload, secret = 'super-secret-jwt-token-with-at-least-32-bytes-long') {
  const header = { alg: 'HS256', typ: 'JWT' };
  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${b64Header}.${b64Payload}`).digest('base64url');
  return `${b64Header}.${b64Payload}.${signature}`;
}

async function run() {
  console.log('=== EXECUTE SECURITY ATTACK & PENETRATION SUITE ===\n');

  // --- ATTACK 1: 10 Wrong PINs Rate Limit Lockout ---
  console.log('--- Test 1: 10 Consecutive Wrong PINs Rate Limit Lockout ---');
  const testClientId = `attacker_${Date.now()}`;
  let lockoutObserved = false;
  let attemptCount = 0;

  for (let i = 1; i <= 10; i++) {
    const wrongPin = `11${String(i).padStart(4, '0')}`;
    const { data, error } = await supabase.rpc('verify_pin_login', {
      p_pin: wrongPin,
      p_client_id: testClientId
    });

    attemptCount++;
    if (data?.locked || data?.error?.includes('locked')) {
      console.log(`[Attempt ${i}] Rate limit triggered lockout:`, data.error);
      lockoutObserved = true;
      break;
    } else {
      console.log(`[Attempt ${i}] Rejected (${data?.error || 'Invalid PIN'})`);
    }
  }
  console.log('Test 1 Verdict:', lockoutObserved ? '✅ PASS (Lockout triggered)' : '❌ FAIL');

  // --- ATTACK 2: SQL Injection in PIN Field ---
  console.log('\n--- Test 2: SQL Injection in PIN Field ---');
  const sqliPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE buses; --",
    "123456' UNION SELECT * FROM admins; --",
    "587828' OR 1=1 --",
    "admin' --"
  ];

  let sqliBlockedAll = true;
  for (const sqli of sqliPayloads) {
    const { data, error } = await supabase.rpc('verify_pin_login', {
      p_pin: sqli,
      p_client_id: `sqli_${Date.now()}`
    });

    const success = data?.success === true;
    console.log(`Payload [${sqli}] ->`, { success: data?.success, error: data?.error || error?.message });
    if (success) {
      sqliBlockedAll = false;
      console.log('❌ CRITICAL: SQL Injection succeeded with payload:', sqli);
    }
  }
  console.log('Test 2 Verdict:', sqliBlockedAll ? '✅ PASS (All SQLi payloads safely blocked)' : '❌ FAIL');

  // --- ATTACK 3: Expired Token Rejection ---
  console.log('\n--- Test 3: Expired Token Rejection ---');
  const expiredPayload = {
    role: 'authenticated',
    aud: 'authenticated',
    sub: 'admin_test',
    exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
  };
  const expiredToken = createTestJwt(expiredPayload);
  const expiredClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${expiredToken}` } }
  });

  const { data: expData, error: expErr } = await expiredClient.from('admins').select('*');
  console.log('Expired Token Request Result:', { expData, error: expErr?.message });
  const expiredBlocked = expErr != null;
  console.log('Test 3 Verdict:', expiredBlocked ? '✅ PASS (Expired/Invalid Token Rejected)' : '❌ FAIL');

  // --- ATTACK 4: Edge Functions without Token ---
  console.log('\n--- Test 4: Invoking Edge Functions without Token ---');
  const rawEdgeUrl = `${SUPABASE_URL}/functions/v1/login`;
  const edgeRes = await fetch(rawEdgeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '587828' })
  });
  console.log('Edge Function (No anon key header) HTTP Status:', edgeRes.status);
  const edgeText = await edgeRes.text();
  console.log('Edge Function Response:', edgeText);
  console.log('Test 4 Verdict:', edgeRes.status >= 400 ? '✅ PASS (Rejected/Unauthorized/Not Found)' : '❌ FAIL');

  // --- ATTACK 5: Driver A Writing Bus B Location (RLS Cross-Tenant Check) ---
  console.log('\n--- Test 5: Driver A Writing Bus B Location (Cross-Bus Write) ---');
  // Driver without authenticated driver token attempting direct table insert/update on bus_location
  const { data: crossData, error: crossErr } = await supabase
    .from('bus_location')
    .upsert({
      bus_id: 998,
      latitude: 11.2700,
      longitude: 77.6000,
      updated_at: new Date().toISOString()
    });

  console.log('Direct Anon/Unassigned Driver Write to bus_location:', { crossData, error: crossErr?.message });
  const crossBlocked = crossErr != null && (crossErr.message.includes('permission denied') || crossErr.message.includes('policy'));
  console.log('Test 5 Verdict:', crossBlocked ? '✅ PASS (Direct cross-bus write blocked by RLS)' : '❌ FAIL');

  // --- ATTACK 6: Admin Operations without Admin Token ---
  console.log('\n--- Test 6: Admin Operations without Admin Token ---');
  const { data: adminWriteData, error: adminWriteErr } = await supabase
    .from('buses')
    .insert({
      bus_number: '666',
      start_place: 'Hacker Point',
      start_time: '08:00:00',
      end_place: 'ESEC Campus',
      end_time: '09:00:00'
    });

  console.log('Direct Anon Bus Creation Result:', { adminWriteData, error: adminWriteErr?.message });
  const adminBlocked = adminWriteErr != null && adminWriteErr.message.includes('permission denied');
  console.log('Test 6 Verdict:', adminBlocked ? '✅ PASS (Admin mutation blocked without admin token)' : '❌ FAIL');

  console.log('\n=== ALL SECURITY ATTACK TESTS COMPLETED ===');
}

run().catch(console.error);
