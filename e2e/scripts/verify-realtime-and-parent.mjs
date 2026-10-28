import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gqjurdcxphdfairbcusj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_IHSNLN7QXkGAvsNTDlVwhw_hAsD2UUA';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log('=== VERIFY PARENT FLOW, REALTIME, AND DRIVER PHONE ABSENCE ===\n');

  // 1. Fetch public_buses with raw HTTP / REST
  console.log('--- Step 1: Raw REST query on public_buses (Anon Key) ---');
  const rawUrl = `${SUPABASE_URL}/rest/v1/public_buses?select=*,stops(*)&bus_number=eq.1`;
  const res = await fetch(rawUrl, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });

  const rawJson = await res.json();
  console.log('Raw HTTP Status:', res.status);
  console.log('Raw JSON Response for Bus 1:');
  console.log(JSON.stringify(rawJson, null, 2));

  // Check if driver_phone exists anywhere in response
  const responseStr = JSON.stringify(rawJson);
  const containsDriverPhoneKey = responseStr.includes('driver_phone');
  const containsPinHashKey = responseStr.includes('driver_pin_hash');
  console.log('\nField Verification:');
  console.log('Does response contain "driver_phone"?:', containsDriverPhoneKey ? '❌ EXPOSED' : '✅ ABSENT');
  console.log('Does response contain "driver_pin_hash"?:', containsPinHashKey ? '❌ EXPOSED' : '✅ ABSENT');

  // 2. Realtime Event Subscription Test
  console.log('\n--- Step 2: Supabase Realtime Channel Subscription for bus_location ---');
  let realtimeReceived = false;
  let receivedPayload = null;

  const channel = supabase
    .channel('test_realtime_channel')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'bus_location',
      filter: 'bus_id=eq.4' // Bus 1 has id 4
    }, (payload) => {
      console.log('🔥 REALTIME EVENT RECEIVED on postgres_changes!');
      console.log('Event Type:', payload.eventType);
      console.log('Payload Data:', payload.new);
      realtimeReceived = true;
      receivedPayload = payload;
    })
    .subscribe((status) => {
      console.log('Channel Subscription Status:', status);
    });

  // Wait for subscription to be SUBSCRIBED
  await new Promise(r => setTimeout(r, 2000));

  console.log('\nTriggering a location update via driver_upsert_location RPC...');
  const { data: rpcRes, error: rpcErr } = await supabase.rpc('driver_upsert_location', {
    p_bus_id: 4,
    p_latitude: 11.27500,
    p_longitude: 77.61000
  });
  console.log('RPC update result:', rpcRes, rpcErr);

  // Wait 4 seconds for realtime propagation
  console.log('Waiting for Realtime event delivery...');
  for (let i = 0; i < 8; i++) {
    if (realtimeReceived) break;
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('Realtime Event Received:', realtimeReceived ? '✅ YES' : '❌ NO');
  if (receivedPayload) {
    console.log('Verified Realtime Telemetry: Lat =', receivedPayload.new?.latitude, 'Lng =', receivedPayload.new?.longitude);
    console.log('Does realtime payload contain driver_phone?:', JSON.stringify(receivedPayload).includes('driver_phone') ? '❌ YES' : '✅ ABSENT');
  }

  await supabase.removeChannel(channel);
  console.log('\n=== PARENT & REALTIME VERIFICATION COMPLETE ===');
}

run().catch(console.error);
