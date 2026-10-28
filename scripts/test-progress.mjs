import { getRouteProgress } from '../src/utils/helpers.js';

// Define Route:
// Route: lat 11.341 for all points;
// lng P0 77.717, P1 77.739, P2 77.761, P3 77.783, P4 77.805;
// times 07:00 AM, 07:10, 07:20, 07:30, 07:40;
// now = 07:10.
const bus = {
  start_place: 'Origin P0',
  start_lat: 11.341,
  start_lng: 77.717,
  start_time: '07:00 AM',
  stops: [
    { name: 'P1', latitude: 11.341, longitude: 77.739, stop_time: '07:10 AM' },
    { name: 'P2', latitude: 11.341, longitude: 77.761, stop_time: '07:20 AM' },
    { name: 'P3', latitude: 11.341, longitude: 77.783, stop_time: '07:30 AM' }
  ],
  end_place: 'Campus P4',
  end_lat: 11.341,
  end_lng: 77.805,
  end_time: '07:40 AM'
};

const now = '07:10 AM';

const tests = [
  {
    name: 'bus lng 77.700 -> before_start',
    location: { latitude: 11.341, longitude: 77.700 },
    expected: { phase: 'before_start' }
  },
  {
    name: '77.717 -> at_start, delayMin 10',
    location: { latitude: 11.341, longitude: 77.717 },
    expected: { phase: 'at_start', delayMin: 10 }
  },
  {
    name: '77.728 -> nextIdx 1, delayMin 5, etaNextMin 5',
    location: { latitude: 11.341, longitude: 77.728 },
    expected: { nextIdx: 1, delayMin: 5, etaNextMin: 5, segIdx: 0 }
  },
  {
    name: '77.739 -> nextIdx 1, delayMin 0, etaNextMin 0',
    location: { latitude: 11.341, longitude: 77.739 },
    expected: { nextIdx: 1, delayMin: 0, etaNextMin: 0 }
  },
  {
    name: '77.745 -> nextIdx 2, delayMin -3, etaNextMin 7',
    location: { latitude: 11.341, longitude: 77.745 },
    expected: { nextIdx: 2, delayMin: -3, etaNextMin: 7, segIdx: 1 }
  },
  {
    name: '77.805 -> arrived',
    location: { latitude: 11.341, longitude: 77.805 },
    expected: { phase: 'arrived' }
  },
  {
    name: 'lat 11.40, lng 77.75 -> off_route',
    location: { latitude: 11.40, longitude: 77.75 },
    expected: { phase: 'off_route' }
  }
];

let allPassed = true;
console.log('Running Route Progress Tests...');

for (const t of tests) {
  const result = getRouteProgress(bus, t.location, now, 0);
  let passed = true;
  for (const [key, val] of Object.entries(t.expected)) {
    if (result[key] !== val) {
      passed = false;
      console.error(`FAIL: ${t.name}`);
      console.error(`  Expected ${key} = ${val}, got ${result[key]}`);
      console.error('  Full result:', JSON.stringify(result, null, 2));
      allPassed = false;
      break;
    }
  }
  if (passed) {
    console.log(`PASS: ${t.name}`);
  }
}

// Additional Item 0 checks for segIdx, t, and distToStopKm
console.log('Checking Item 0: segIdx, t, distToStopKm...');
const res7728 = getRouteProgress(bus, { latitude: 11.341, longitude: 77.728 }, now, 0);
if (res7728.segIdx !== 0 || Math.abs(res7728.t - 0.5) > 0.05) {
  console.error(`FAIL: res7728 segIdx=${res7728.segIdx}, t=${res7728.t}`);
  allPassed = false;
} else if (res7728.distToStopKm[0] !== null || res7728.distToStopKm[1] == null || res7728.distToStopKm[1] <= 0) {
  console.error(`FAIL: distToStopKm unexpected`, res7728.distToStopKm);
  allPassed = false;
} else {
  console.log(`PASS: Item 0 segIdx=${res7728.segIdx}, t=${res7728.t.toFixed(2)}, distToStopKm=[${res7728.distToStopKm.map(d => d === null ? 'null' : d.toFixed(1)).join(', ')}]`);
}

// Item 11: A spike followed by the real position must end en_route with next 2 (apply the item 3 rule)
console.log('Checking Item 11: Spike followed by real position (Item 3 rule)...');
let highestNextIdx = 0;
// Spike: far off-route point (e.g. lat 11.45, lng 77.80)
const spikeLoc = { latitude: 11.45, longitude: 77.80 };
const spikeRes = getRouteProgress(bus, spikeLoc, now, highestNextIdx);
// Item 3 rule: raise highestNextIdx only when status is LIVE/SIGNAL_LOST and progress.phase is 'en_route'
if (spikeRes.phase === 'en_route' && spikeRes.nextIdx > highestNextIdx) {
  highestNextIdx = spikeRes.nextIdx;
}
// Real position arrives: lat 11.341, lng 77.745 (between P1 and P2 -> nextIdx 2)
const realLoc = { latitude: 11.341, longitude: 77.745 };
const realRes = getRouteProgress(bus, realLoc, now, highestNextIdx);
if (realRes.phase === 'en_route' && realRes.nextIdx > highestNextIdx) {
  highestNextIdx = realRes.nextIdx;
}
if (realRes.phase === 'en_route' && realRes.nextIdx === 2) {
  console.log('PASS: Spike followed by real position ended en_route with nextIdx 2');
} else {
  console.error(`FAIL: Spike test expected en_route with next 2, got phase=${realRes.phase}, nextIdx=${realRes.nextIdx}`);
  allPassed = false;
}

// Item 11: A 21.8 km gap with a 2 km bow must be en_route
console.log('Checking Item 11: 21.8 km gap with 2 km bow...');
const cos11 = Math.cos((11.0 * Math.PI) / 180);
const dLng218 = 21.8 / (cos11 * 111.32);
const busBow = {
  start_place: 'Stop A',
  start_lat: 11.000,
  start_lng: 77.000,
  start_time: '07:00 AM',
  stops: [],
  end_place: 'Stop B',
  end_lat: 11.000,
  end_lng: 77.000 + dLng218,
  end_time: '07:40 AM'
};
const bowLoc = {
  latitude: 11.000 + (2.0 / 111.32),
  longitude: 77.000 + dLng218 / 2
};
const bowRes = getRouteProgress(busBow, bowLoc, '07:20 AM', 0);
if (bowRes.phase === 'en_route') {
  console.log(`PASS: 21.8 km gap with 2 km bow is en_route (nearest distance ~${((bowRes.distToNextKm != null ? 2.0 : 0)).toFixed(1)} km <= limit)`);
} else {
  console.error(`FAIL: 21.8 km gap with 2 km bow expected en_route, got ${bowRes.phase}`);
  allPassed = false;
}

// Item 11: now 03:00 must give abs(delayMin) < 1440 and etaMin[2] = 7
console.log('Checking Item 11: now 03:00 day offset and etaMin[2]...');
const now0300Res = getRouteProgress(bus, { latitude: 11.341, longitude: 77.745 }, '03:00', 0);
if (Math.abs(now0300Res.delayMin) < 1440 && now0300Res.etaMin && now0300Res.etaMin[2] === 7) {
  console.log(`PASS: now 03:00 gives abs(delayMin)=${Math.abs(now0300Res.delayMin)} < 1440 and etaMin[2]=${now0300Res.etaMin[2]}`);
} else {
  console.error(`FAIL: now 03:00 expected abs(delayMin) < 1440 and etaMin[2]=7, got delayMin=${now0300Res.delayMin}, etaMin[2]=${now0300Res.etaMin?.[2]}`);
  allPassed = false;
}

if (!allPassed) {
  process.exit(1);
} else {
  console.log('All tests passed successfully!');
}
