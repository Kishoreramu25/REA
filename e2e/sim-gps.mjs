import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../src/utils/constants.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ROUTE_POINTS = [
  { name: 'P0 (Origin)', lat: 11.2700, lng: 77.6000 },
  { name: 'P1 (Stop 1)', lat: 11.2720, lng: 77.6080 },
  { name: 'P2 (Stop 2)', lat: 11.2740, lng: 77.6160 },
  { name: 'P3 (Stop 3)', lat: 11.2760, lng: 77.6240 },
  { name: 'P4 (End)',    lat: 11.2780, lng: 77.6320 }
];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    bus: '999',
    late: 0,
    early: 0,
    tunnel: 0,
    stuck: 0,
    noise: 0,
    spike: false,
    speed: 1,
    interval: 10, // seconds
    singlePoint: null, // e.g. 'at_start', 'before_start', 'stop1', 'arrived', 'off_route'
    progress: null, // 0.0 to 1.0
    duration: null // total run time in seconds
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--bus' && args[i + 1]) options.bus = args[++i];
    else if (arg === '--late' && args[i + 1]) options.late = parseFloat(args[++i]);
    else if (arg === '--early' && args[i + 1]) options.early = parseFloat(args[++i]);
    else if (arg === '--tunnel' && args[i + 1]) options.tunnel = parseFloat(args[++i]);
    else if (arg === '--stuck' && args[i + 1]) options.stuck = parseFloat(args[++i]);
    else if (arg === '--noise' && args[i + 1]) options.noise = parseFloat(args[++i]);
    else if (arg === '--spike') options.spike = true;
    else if (arg === '--speed' && args[i + 1]) options.speed = parseFloat(args[++i]);
    else if (arg === '--interval' && args[i + 1]) options.interval = parseFloat(args[++i]);
    else if (arg === '--point' && args[i + 1]) options.singlePoint = args[++i];
    else if (arg === '--progress' && args[i + 1]) options.progress = parseFloat(args[++i]);
    else if (arg === '--duration' && args[i + 1]) options.duration = parseFloat(args[++i]);
  }
  return options;
}

function getInterpolatedPoint(progress) {
  const clamped = Math.max(0, Math.min(1, progress));
  const totalSegs = ROUTE_POINTS.length - 1;
  const scaled = clamped * totalSegs;
  const segIdx = Math.min(totalSegs - 1, Math.floor(scaled));
  const t = scaled - segIdx;

  const pA = ROUTE_POINTS[segIdx];
  const pB = ROUTE_POINTS[segIdx + 1];

  const lat = pA.lat + t * (pB.lat - pA.lat);
  const lng = pA.lng + t * (pB.lng - pA.lng);
  return { lat, lng, segIdx, t };
}

function addMetersNoise(lat, lng, meters) {
  if (!meters || meters <= 0) return { lat, lng };
  const dLat = (meters / 111320) * (2 * Math.random() - 1);
  const refCos = Math.cos((lat * Math.PI) / 180);
  const dLng = (meters / (111320 * refCos)) * (2 * Math.random() - 1);
  return { lat: lat + dLat, lng: lng + dLng };
}

async function upsertLocation(busId, lat, lng, isTracking = true, updatedAt = new Date()) {
  // 1. Update tracking state (direct first, fallback to RPC)
  const { error: busErr } = await supabase
    .from('buses')
    .update({ is_tracking: isTracking })
    .eq('id', busId);

  if (busErr) {
    await supabase.rpc('driver_update_tracking', {
      p_bus_id: busId,
      p_is_tracking: isTracking
    });
  }

  // 2. Upsert location (direct first, fallback to RPC)
  const { error } = await supabase
    .from('bus_location')
    .upsert({
      bus_id: busId,
      latitude: lat,
      longitude: lng,
      updated_at: updatedAt.toISOString()
    }, { onConflict: 'bus_id' });

  if (error) {
    const { error: rpcErr } = await supabase.rpc('driver_upsert_location', {
      p_bus_id: busId,
      p_latitude: lat,
      p_longitude: lng
    });
    if (rpcErr) {
      console.error(`[sim-gps] Error upserting location for bus ${busId}:`, rpcErr.message);
    } else {
      console.log(`[sim-gps] Upserted bus ${busId} (via RPC): lat=${lat.toFixed(5)}, lng=${lng.toFixed(5)}, tracking=${isTracking}, time=${updatedAt.toLocaleTimeString()}`);
    }
  } else {
    console.log(`[sim-gps] Upserted bus ${busId}: lat=${lat.toFixed(5)}, lng=${lng.toFixed(5)}, tracking=${isTracking}, time=${updatedAt.toLocaleTimeString()}`);
  }
}

export async function runSimulation() {
  const opts = parseArgs();
  console.log('[sim-gps] Starting simulation with options:', opts);

  // Find bus
  let { data: bus, error: busErr } = await supabase
    .from('public_buses')
    .select('*')
    .eq('bus_number', opts.bus)
    .maybeSingle();

  if (!bus) {
    const res = await supabase.from('buses').select('*').eq('bus_number', opts.bus).maybeSingle();
    bus = res.data;
    busErr = res.error;
  }

  if (busErr || !bus) {
    console.error(`[sim-gps] Could not find bus with number ${opts.bus}:`, busErr?.message);
    process.exit(1);
  }

  const busId = bus.id;
  console.log(`[sim-gps] Found bus ${opts.bus} (id: ${busId})`);

  // Handle single point presets
  if (opts.singlePoint) {
    let lat, lng;
    let isTracking = true;
    let updatedTime = new Date();

    if (opts.singlePoint === 'before_start') {
      // 300 meters behind origin
      lat = 11.2700 - (300 / 111320);
      lng = 77.6000;
    } else if (opts.singlePoint === 'at_start') {
      lat = 11.2700;
      lng = 77.6000;
    } else if (opts.singlePoint === 'stop1') {
      lat = 11.2720;
      lng = 77.6080;
    } else if (opts.singlePoint === 'stop2') {
      lat = 11.2740;
      lng = 77.6160;
    } else if (opts.singlePoint === 'stop3') {
      lat = 11.2760;
      lng = 77.6240;
    } else if (opts.singlePoint === 'arrived') {
      lat = 11.2780;
      lng = 77.6320;
    } else if (opts.singlePoint === 'off_route') {
      // 2 km north of route
      lat = 11.2900;
      lng = 77.6160;
    } else if (opts.singlePoint === 'stale_yesterday') {
      lat = 11.2740;
      lng = 77.6160;
      updatedTime = new Date(Date.now() - 24 * 3600 * 1000);
      isTracking = true;
    } else if (opts.singlePoint === 'signal_lost') {
      lat = 11.2740;
      lng = 77.6160;
      updatedTime = new Date(Date.now() - 100 * 1000); // 100 seconds ago (>90s)
      isTracking = true;
    } else {
      console.error(`[sim-gps] Unknown point preset: ${opts.singlePoint}`);
      process.exit(1);
    }

    await upsertLocation(busId, lat, lng, isTracking, updatedTime);
    console.log(`[sim-gps] Preset "${opts.singlePoint}" set successfully.`);
    return;
  }

  // Handle explicit progress (0.0 to 1.0)
  if (opts.progress !== null) {
    const pt = getInterpolatedPoint(opts.progress);
    await upsertLocation(busId, pt.lat, pt.lng, true, new Date());
    console.log(`[sim-gps] Progress ${opts.progress} set successfully.`);
    return;
  }

  // Continuous route drive
  // Total trip: 4 segments. Standard speed = 10s per step, advance ~0.05 progress each step (20 steps total)
  const stepIntervalMs = Math.max(500, Math.round((opts.interval * 1000) / opts.speed));
  const progressIncrement = 0.05; // 20 steps to cover route
  let currentProgress = 0.0;

  // If late or early, adjust initial progress or timing
  if (opts.late > 0) {
    console.log(`[sim-gps] Applying --late ${opts.late} mins (bus running behind schedule)`);
  }
  if (opts.early > 0) {
    console.log(`[sim-gps] Applying --early ${opts.early} mins (bus running ahead of schedule)`);
  }

  console.log(`[sim-gps] Driving route... Interval: ${stepIntervalMs}ms per step`);

  let elapsedSec = 0;
  let stuckRemaining = opts.stuck;
  let tunnelRemaining = opts.tunnel;
  let spikeTriggered = false;
  const telemetryData = [];

  return new Promise((resolve) => {
    const timer = setInterval(async () => {
      elapsedSec += opts.interval;

      // Check tunnel simulation (no GPS packets sent)
      if (tunnelRemaining > 0) {
        console.log(`[sim-gps] IN TUNNEL: No GPS update sent (${tunnelRemaining}s remaining)`);
        tunnelRemaining -= opts.interval;
        return;
      }

      // Check stuck simulation (same GPS coordinates sent)
      if (stuckRemaining > 0) {
        console.log(`[sim-gps] BUS STUCK at progress ${currentProgress.toFixed(2)} (${stuckRemaining}s remaining)`);
        const pt = getInterpolatedPoint(currentProgress);
        await upsertLocation(busId, pt.lat, pt.lng, true, new Date());
        stuckRemaining -= opts.interval;
        return;
      }

      // Check spike simulation (one abnormal jump, then restore)
      if (opts.spike && !spikeTriggered && currentProgress > 0.3) {
        spikeTriggered = true;
        console.log('[sim-gps] TRIGGERING GPS SPIKE (1.5 km off)');
        const pt = getInterpolatedPoint(currentProgress);
        await upsertLocation(busId, pt.lat + 0.015, pt.lng + 0.015, true, new Date());
        return;
      }

      // Normal progression
      const pt = getInterpolatedPoint(currentProgress);
      const noisyPt = addMetersNoise(pt.lat, pt.lng, opts.noise);
      const stepTime = new Date();
      await upsertLocation(busId, noisyPt.lat, noisyPt.lng, true, stepTime);

      telemetryData.push({
        step: telemetryData.length + 1,
        timestamp: stepTime.toISOString(),
        progress: Math.min(1.0, currentProgress),
        lat: noisyPt.lat,
        lng: noisyPt.lng
      });

      currentProgress += progressIncrement;

      if (currentProgress > 1.0) {
        console.log('[sim-gps] Destination reached. Final location upserted.');
        clearInterval(timer);
        import('fs').then(fs => {
          fs.mkdirSync('e2e/results', { recursive: true });
          fs.writeFileSync('e2e/results/movement-telemetry.json', JSON.stringify(telemetryData, null, 2));
          console.log('[sim-gps] Telemetry saved to e2e/results/movement-telemetry.json (' + telemetryData.length + ' steps)');
          resolve(telemetryData);
        });
      }
    }, stepIntervalMs);
  });
}

if (process.argv[1]?.endsWith('sim-gps.mjs')) {
  runSimulation().catch(err => {
    console.error('[sim-gps] Error:', err);
    process.exit(1);
  });
}
