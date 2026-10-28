import fs from 'fs';
import path from 'path';
import {
  isValidTimeFormat,
  timeToMinutes,
  parseTimeToToday,
  formatTimeForDisplay,
  formatTimeForDB,
  mapBus,
  parseLatLng,
  validateLatLng,
  getPointsDistanceMeters,
  calculateDistanceKm,
  calculateETA,
  getBusStatus,
  isBusLate,
  getRouteProgress,
  BUS_STATUS
} from '../../src/utils/helpers.js';

const results = [];
let passCount = 0;
let failCount = 0;

function isEqual(a, b) {
  if (a === b) return true;
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function assert(id, description, actual, expected) {
  const pass = isEqual(actual, expected);
  if (pass) {
    passCount++;
  } else {
    failCount++;
  }
  const entry = {
    id,
    area: 'Unit: helpers.js',
    test: description,
    status: pass ? 'PASS' : 'FAIL',
    actual: JSON.stringify(actual),
    expected: JSON.stringify(expected)
  };
  results.push(entry);
  const mark = pass ? '✓' : '✗';
  console.log(`${mark} [${id}] ${description} -> ${entry.status}`);
  if (!pass) {
    console.log(`    Expected: ${entry.expected}\n    Actual:   ${entry.actual}`);
  }
}

console.log('=== RUNNING SECTION 1: UNIT LOGIC TESTS FOR helpers.js ===\n');

// 1.1 isValidTimeFormat
assert('TIME_01', 'isValidTimeFormat: valid 12h AM format', isValidTimeFormat('07:30 AM'), true, true);
assert('TIME_02', 'isValidTimeFormat: valid 12h PM format', isValidTimeFormat('12:00 PM'), true, true);
assert('TIME_03', 'isValidTimeFormat: lowercase am/pm', isValidTimeFormat('06:15 pm'), true, true);
assert('TIME_04', 'isValidTimeFormat: trimmed spaces', isValidTimeFormat('  11:45 PM  '), true, true);
assert('TIME_05', 'isValidTimeFormat: single-digit hour', isValidTimeFormat('8:00 AM'), true, true);
assert('TIME_06', 'isValidTimeFormat: 12:00 AM', isValidTimeFormat('12:00 AM'), true, true);
assert('TIME_07', 'isValidTimeFormat: invalid 24h format', isValidTimeFormat('14:30'), false, false);
assert('TIME_08', 'isValidTimeFormat: invalid hour 0:30 AM', isValidTimeFormat('0:30 AM'), false, false);
assert('TIME_09', 'isValidTimeFormat: invalid hour 13:00 PM', isValidTimeFormat('13:00 PM'), false, false);
assert('TIME_10', 'isValidTimeFormat: invalid minutes 11:60 AM', isValidTimeFormat('11:60 AM'), false, false);
assert('TIME_11', 'isValidTimeFormat: empty string', isValidTimeFormat(''), false, false);
assert('TIME_12', 'isValidTimeFormat: null/undefined', isValidTimeFormat(null), false, false);
assert('TIME_13', 'isValidTimeFormat: garbage string', isValidTimeFormat('hello world'), false, false);

// 1.2 timeToMinutes
assert('T2M_01', 'timeToMinutes: 12:00 AM is 0', timeToMinutes('12:00 AM'), 0, 0);
assert('T2M_02', 'timeToMinutes: 12:00 PM is 720', timeToMinutes('12:00 PM'), 720, 720);
assert('T2M_03', 'timeToMinutes: 01:00 AM is 60', timeToMinutes('01:00 AM'), 60, 60);
assert('T2M_04', 'timeToMinutes: 11:59 PM is 1439', timeToMinutes('11:59 PM'), 1439, 1439);
assert('T2M_05', 'timeToMinutes: lowercase with whitespace "  06:30 pm  "', timeToMinutes('  06:30 pm  '), 1110, 1110);
assert('T2M_06', 'timeToMinutes: invalid format returns null', timeToMinutes('25:00'), null, null);
assert('T2M_07', 'timeToMinutes: empty returns null', timeToMinutes(''), null, null);

// 1.3 parseTimeToToday
const baseToday = new Date(2026, 9, 25, 0, 0, 0); // 25 Oct 2026
const parsed12 = parseTimeToToday('08:30 AM', baseToday);
assert('PTT_01', 'parseTimeToToday: 08:30 AM sets hours 8 mins 30', parsed12?.getHours() === 8 && parsed12?.getMinutes() === 30, true, true);
const parsed24 = parseTimeToToday('14:45:00', baseToday);
assert('PTT_02', 'parseTimeToToday: fallback 24h 14:45:00 sets hours 14 mins 45', parsed24?.getHours() === 14 && parsed24?.getMinutes() === 45, true, true);
assert('PTT_03', 'parseTimeToToday: null/empty returns null', parseTimeToToday('', baseToday), null, null);

// 1.4 formatTimeForDisplay
assert('FTD_01', 'formatTimeForDisplay: lowercase am -> uppercase AM', formatTimeForDisplay('07:30 am'), '07:30 AM', '07:30 AM');
assert('FTD_02', 'formatTimeForDisplay: 24h 14:30:00 -> 02:30 PM', formatTimeForDisplay('14:30:00'), '02:30 PM', '02:30 PM');
assert('FTD_03', 'formatTimeForDisplay: 24h 00:15:00 -> 12:15 AM', formatTimeForDisplay('00:15:00'), '12:15 AM', '12:15 AM');
assert('FTD_04', 'formatTimeForDisplay: 24h 12:00:00 -> 12:00 PM', formatTimeForDisplay('12:00:00'), '12:00 PM', '12:00 PM');
assert('FTD_05', 'formatTimeForDisplay: empty returns empty string', formatTimeForDisplay(''), '', '');

// 1.5 formatTimeForDB
assert('FTDB_01', 'formatTimeForDB: 07:30 AM -> 07:30:00', formatTimeForDB('07:30 AM'), '07:30:00', '07:30:00');
assert('FTDB_02', 'formatTimeForDB: 12:00 PM -> 12:00:00', formatTimeForDB('12:00 PM'), '12:00:00', '12:00:00');
assert('FTDB_03', 'formatTimeForDB: 12:00 AM -> 00:00:00', formatTimeForDB('12:00 AM'), '00:00:00', '00:00:00');
assert('FTDB_04', 'formatTimeForDB: already 24h "14:30:00" returns as-is', formatTimeForDB('14:30:00'), '14:30:00', '14:30:00');
let throwsOnEmpty = false;
try { formatTimeForDB(''); } catch (e) { throwsOnEmpty = true; }
assert('FTDB_05', 'formatTimeForDB: throws on empty input', throwsOnEmpty, true, true);
let throwsOnGarbage = false;
try { formatTimeForDB('bad-time'); } catch (e) { throwsOnGarbage = true; }
assert('FTDB_06', 'formatTimeForDB: throws on garbage input', throwsOnGarbage, true, true);

// 1.6 mapBus
const sampleRawBus = {
  id: 42,
  bus_number: '12',
  start_place: 'Erode BS',
  start_time: '07:00:00',
  start_lat: '11.3410',
  start_lng: '77.7170',
  end_place: 'ESEC Campus',
  end_time: '08:30:00',
  end_lat: 11.2780,
  end_lng: 77.6320,
  driver_phone: '123456',
  is_tracking: true,
  stops: [
    { stop_name: 'Stop C', stop_order: 3, stop_time: '07:50:00', latitude: '11.300', longitude: '77.670' },
    { stop_name: 'Stop A', stop_order: 1, stop_time: '07:20:00', latitude: 11.320, longitude: 77.700 },
    { stop_name: 'Stop B', stop_order: 2, stop_time: '07:35:00', lat: null, lng: null }
  ]
};
const mapped = mapBus(sampleRawBus);
assert('MAP_01', 'mapBus: parses string coords to float', mapped.startLat === 11.3410 && mapped.startLng === 77.7170, true, true);
assert('MAP_02', 'mapBus: sorts stops by stop_order', mapped.stops[0].name === 'Stop A' && mapped.stops[1].name === 'Stop B' && mapped.stops[2].name === 'Stop C', true, true);
assert('MAP_03', 'mapBus: converts 24h DB times to 12h display', mapped.startTime === '07:00 AM' && mapped.collegeTime === '08:30 AM', true, true);
assert('MAP_04', 'mapBus: preserves null coordinates in stops without crash', mapped.stops[1].lat === null, true, true);
assert('MAP_05', 'mapBus: handles null bus input', mapBus(null), null, null);

// 1.7 parseLatLng
assert('PLL_01', 'parseLatLng: standard "11.341, 77.717"', parseLatLng('11.341, 77.717'), { lat: 11.341, lng: 77.717 }, { lat: 11.341, lng: 77.717 });
assert('PLL_02', 'parseLatLng: Google Maps @lat,lng', parseLatLng('https://maps.google.com/?q=@11.341,77.717'), { lat: 11.341, lng: 77.717 }, { lat: 11.341, lng: 77.717 });
assert('PLL_03', 'parseLatLng: Google Maps !3dLAT!4dLNG', parseLatLng('https://google.com/maps/place/data=!3d11.341!4d77.717'), { lat: 11.341, lng: 77.717 }, { lat: 11.341, lng: 77.717 });
assert('PLL_04', 'parseLatLng: query param ?q=lat,lng', parseLatLng('https://maps.google.com/?q=11.341,77.717'), { lat: 11.341, lng: 77.717 }, { lat: 11.341, lng: 77.717 });
assert('PLL_05', 'parseLatLng: object format {lat, lng}', parseLatLng({ lat: 11.341, lng: 77.717 }), { lat: 11.341, lng: 77.717 }, { lat: 11.341, lng: 77.717 });
assert('PLL_06', 'parseLatLng: garbage returns null', parseLatLng('not a coordinate'), null, null);

// 1.8 validateLatLng
assert('VLL_01', 'validateLatLng: valid India coordinate', validateLatLng({ lat: 11.341, lng: 77.717 }).valid, true, true);
assert('VLL_02', 'validateLatLng: boundary lat 6.0, lng 68.0', validateLatLng({ lat: 6.0, lng: 68.0 }).valid, true, true);
assert('VLL_03', 'validateLatLng: boundary lat 38.0, lng 98.0', validateLatLng({ lat: 38.0, lng: 98.0 }).valid, true, true);
assert('VLL_04', 'validateLatLng: below boundary lat 5.9 is invalid', validateLatLng({ lat: 5.9, lng: 77.0 }).valid, false, false);
assert('VLL_05', 'validateLatLng: swapped lat/lng gives specific guidance', validateLatLng({ lat: 77.717, lng: 11.341 }).error?.includes('latitude first'), true, true);
assert('VLL_06', 'validateLatLng: null or NaN coordinates', validateLatLng({ lat: null, lng: NaN }).valid, false, false);

// 1.9 Distance & ETA
const distKm = calculateDistanceKm(11.2700, 77.6000, 11.2780, 77.6320);
assert('DIST_01', 'calculateDistanceKm: distance ~3.6 km', distKm > 3.4 && distKm < 3.8, true, true);
assert('DIST_02', 'getPointsDistanceMeters: matches within 5% of Great-Circle', Math.abs(getPointsDistanceMeters({ lat: 11.2700, lng: 77.6000 }, { lat: 11.2780, lng: 77.6320 }) - (distKm * 1000)) < 150, true, true);
assert('ETA_01', 'calculateETA: 0 distance is "Arriving now"', calculateETA(0), 'Arriving now', 'Arriving now');
assert('ETA_02', 'calculateETA: 35 km is "~60 min"', calculateETA(35), '~60 min', '~60 min');
assert('ETA_03', 'calculateETA: null returns fallback "~12 min"', calculateETA(null), '~12 min', '~12 min');

// 1.10 getBusStatus
const testBusSched = {
  is_tracking: true,
  startTime: '07:00 AM',
  collegeTime: '08:30 AM'
};
// Use local time for refNow (07:45 AM) which is between 07:00 and 08:30
const refNow = new Date();
refNow.setHours(7, 45, 0, 0);

// LIVE at 30 s
const locLive = { updated_at: new Date(refNow.getTime() - 30 * 1000).toISOString() };
assert('STAT_01', 'getBusStatus: LIVE when updated 30s ago', getBusStatus(testBusSched, locLive, refNow), BUS_STATUS.LIVE);

// SIGNAL_LOST at 91 s
const loc91s = { updated_at: new Date(refNow.getTime() - 91 * 1000).toISOString() };
assert('STAT_02', 'getBusStatus: SIGNAL_LOST when updated 91s ago', getBusStatus(testBusSched, loc91s, refNow), BUS_STATUS.SIGNAL_LOST);

// SIGNAL_LOST at 29 min
const loc29m = { updated_at: new Date(refNow.getTime() - 29 * 60 * 1000).toISOString() };
assert('STAT_03', 'getBusStatus: SIGNAL_LOST when updated 29m ago', getBusStatus(testBusSched, loc29m, refNow), BUS_STATUS.SIGNAL_LOST);

// Ignored at 31 min (decides from schedule: before 08:30 is NOT_STARTED)
const loc31m = { updated_at: new Date(refNow.getTime() - 31 * 60 * 1000).toISOString() };
assert('STAT_04', 'getBusStatus: Ignored flag at 31 min -> NOT_STARTED', getBusStatus(testBusSched, loc31m, refNow), BUS_STATUS.NOT_STARTED);

// Ignored from yesterday (decides from schedule: before 08:30 is NOT_STARTED)
const locYesterday = { updated_at: new Date(refNow.getTime() - 24 * 3600 * 1000).toISOString() };
assert('STAT_05', 'getBusStatus: Stale update from yesterday ignored -> NOT_STARTED', getBusStatus(testBusSched, locYesterday, refNow), BUS_STATUS.NOT_STARTED);

// Ignored from yesterday after arrival time -> ENDED
const refNowAfterArrival = new Date();
refNowAfterArrival.setHours(9, 15, 0, 0);
assert('STAT_05B', 'getBusStatus: Stale update from yesterday after arrival -> ENDED', getBusStatus(testBusSched, locYesterday, refNowAfterArrival), BUS_STATUS.ENDED);

// Future timestamp within clock skew (-30 s)
const locClockSkew = { updated_at: new Date(refNow.getTime() + 30 * 1000).toISOString() };
assert('STAT_06', 'getBusStatus: Future timestamp (clock skew +30s) -> LIVE', getBusStatus(testBusSched, locClockSkew, refNow), BUS_STATUS.LIVE);

// is_tracking false before arrival -> NOT_STARTED
const busNotTracking = { is_tracking: false, startTime: '07:00 AM', collegeTime: '08:30 AM' };
const nowBeforeArrival = new Date(refNow);
nowBeforeArrival.setHours(8, 0, 0, 0);
assert('STAT_07', 'getBusStatus: is_tracking false before arrival -> NOT_STARTED', getBusStatus(busNotTracking, null, nowBeforeArrival), BUS_STATUS.NOT_STARTED);

// is_tracking false after arrival -> ENDED
const nowAfterArrival = new Date(refNow);
nowAfterArrival.setHours(9, 0, 0, 0);
assert('STAT_08', 'getBusStatus: is_tracking false after arrival -> ENDED', getBusStatus(busNotTracking, null, nowAfterArrival), BUS_STATUS.ENDED);

// 1.11 isBusLate
const lateTestBus = {
  is_tracking: false,
  startTime: '08:00 AM',
  collegeTime: '09:00 AM'
};
const dLate1 = new Date(); dLate1.setHours(8, 2, 0, 0);
assert('LATE_01', 'isBusLate: at 08:02 AM (start+2 min) is false', isBusLate(lateTestBus, dLate1), false, false);
const dLate2 = new Date(); dLate2.setHours(8, 3, 0, 0);
assert('LATE_02', 'isBusLate: at 08:03 AM (start+3 min) is true', isBusLate(lateTestBus, dLate2), true, true);
const dLate3 = new Date(); dLate3.setHours(8, 30, 0, 0);
assert('LATE_03', 'isBusLate: at 08:30 AM is true', isBusLate(lateTestBus, dLate3), true, true);
const dLate4 = new Date(); dLate4.setHours(9, 5, 0, 0);
assert('LATE_04', 'isBusLate: past arrival at 09:05 AM is false', isBusLate(lateTestBus, dLate4), false, false);

// 1.12 getRouteProgress
const mockBus = {
  origin: 'Start Place',
  startLat: 11.2700,
  startLng: 77.6000,
  startTime: '08:00 AM',
  via: [
    { name: 'Stop 1', lat: 11.2720, lng: 77.6080, time: '08:15 AM' },
    { name: 'Stop 2', lat: 11.2740, lng: 77.6160, time: '08:30 AM' },
    { name: 'Stop 3', lat: 11.2760, lng: 77.6240, time: '08:45 AM' }
  ],
  endPlace: 'Campus',
  endLat: 11.2780,
  endLng: 77.6320,
  collegeTime: '09:00 AM'
};

// Phase: at_start (<= 150m) vs before_start (> 150m behind)
const pAtStart149 = getRouteProgress(mockBus, { lat: 11.2700 - (140 / 111320), lng: 77.6000 }, '08:00 AM');
assert('PROG_01', 'getRouteProgress: within 150m (140m) of P0 is at_start', pAtStart149.phase, 'at_start', 'at_start');

const pBeforeStart160 = getRouteProgress(mockBus, { lat: 11.2700 - (200 / 111320), lng: 77.6000 }, '08:00 AM');
assert('PROG_02', 'getRouteProgress: 200m behind P0 is before_start', pBeforeStart160.phase, 'before_start', 'before_start');

// Phase: arrived (<= 200m of Pn) vs en_route (> 200m before Pn)
const pArrived150 = getRouteProgress(mockBus, { lat: 11.2780, lng: 77.6320 }, '09:00 AM');
assert('PROG_03', 'getRouteProgress: at Pn is arrived', pArrived150.phase, 'arrived', 'arrived');

// Off-route limit: > max(1.5 km, 0.2 * segLen)
const pOffRoute = getRouteProgress(mockBus, { lat: 11.2950, lng: 77.6160 }, '08:30 AM');
assert('PROG_04', 'getRouteProgress: 2.3km off track is off_route', pOffRoute.phase, 'off_route', 'off_route');

// En-route at every stop exactly (at stop i, nextIdx is i targeting that stop)
const pAtStop1 = getRouteProgress(mockBus, { lat: 11.2720, lng: 77.6080 }, '08:15 AM');
assert('PROG_05', 'getRouteProgress: at Stop 1 is en_route, nextIdx=1', pAtStop1.phase === 'en_route' && pAtStop1.nextIdx === 1, true);

const pAtStop2 = getRouteProgress(mockBus, { lat: 11.2740, lng: 77.6160 }, '08:30 AM');
assert('PROG_06', 'getRouteProgress: at Stop 2 is en_route, nextIdx=2', pAtStop2.phase === 'en_route' && pAtStop2.nextIdx === 2, true);

// 0 stops (direct trip)
const mockBus0Stops = {
  origin: 'Start Place',
  startLat: 11.2700,
  startLng: 77.6000,
  startTime: '08:00 AM',
  via: [],
  endPlace: 'Campus',
  endLat: 11.2780,
  endLng: 77.6320,
  collegeTime: '08:30 AM'
};
const p0Stops = getRouteProgress(mockBus0Stops, { lat: 11.2740, lng: 77.6160 }, '08:15 AM');
assert('PROG_07', 'getRouteProgress: handles 0 stops without error', p0Stops.ready, true, true);

// 1 stop
const mockBus1Stop = {
  ...mockBus,
  via: [{ name: 'Single Stop', lat: 11.2740, lng: 77.6160, time: '08:30 AM' }]
};
const p1Stop = getRouteProgress(mockBus1Stop, { lat: 11.2720, lng: 77.6080 }, '08:15 AM');
assert('PROG_08', 'getRouteProgress: handles 1 stop correctly', p1Stop.ready && p1Stop.nextIdx === 1, true, true);

// Cross-midnight trip (start 11:30 PM, end 01:00 AM)
const crossMidnightBus = {
  origin: 'Night Origin',
  startLat: 11.2700,
  startLng: 77.6000,
  startTime: '11:30 PM',
  via: [{ name: 'Night Stop', lat: 11.2740, lng: 77.6160, time: '12:15 AM' }],
  endPlace: 'Night End',
  endLat: 11.2780,
  endLng: 77.6320,
  collegeTime: '01:00 AM'
};
const pMidnight = getRouteProgress(crossMidnightBus, { lat: 11.2740, lng: 77.6160 }, '12:15 AM');
assert('PROG_09', 'getRouteProgress: cross-midnight trip calculates smoothly', pMidnight.ready && pMidnight.phase === 'en_route', true, true);

// Now at 03:00 AM on cross-midnight or day-offset
const p3AM = getRouteProgress(crossMidnightBus, { lat: 11.2740, lng: 77.6160 }, '03:00 AM');
assert('PROG_10', 'getRouteProgress: handles evaluation at 03:00 AM', p3AM.ready, true, true);

// minNextIdx behaviour (does not regress backwards)
const pMinIdx = getRouteProgress(mockBus, { lat: 11.2710, lng: 77.6040 }, '08:10 AM', 3);
assert('PROG_11', 'getRouteProgress: minNextIdx=3 prevents searching earlier segments', pMinIdx.nextIdx >= 3, true, true);

// Monotonic delay and ETA arrays
const pArrayCheck = getRouteProgress(mockBus, { lat: 11.2720, lng: 77.6080 }, '08:15 AM');
assert('PROG_12', 'getRouteProgress: etaMin has length matching points', pArrayCheck.etaMin.length === 5, true, true);
assert('PROG_13', 'getRouteProgress: distToStopKm has length matching points', pArrayCheck.distToStopKm.length === 5, true, true);
assert('PROG_14', 'getRouteProgress: distToStopKm is null for passed stops', pArrayCheck.distToStopKm[0] === null, true, true);
assert('PROG_15', 'getRouteProgress: distToStopKm is non-null for upcoming stops', typeof pArrayCheck.distToStopKm[2] === 'number', true, true);

// Missing coords or times -> ready: false
const invalidBus = { origin: 'Bad Bus', startLat: null, startLng: null };
assert('PROG_16', 'getRouteProgress: missing coords returns ready: false', getRouteProgress(invalidBus, { lat: 11.27, lng: 77.6 }).ready, false, false);

console.log('\n=== SECTION 1 SUMMARY ===');
console.log(`Total tests: ${results.length}`);
console.log(`PASS: ${passCount}`);
console.log(`FAIL: ${failCount}`);

const logContent = `SECTION 1: UNIT LOGIC TEST RESULTS
Date: ${new Date().toISOString()}
Total: ${results.length} | PASS: ${passCount} | FAIL: ${failCount}

${results.map(r => `[${r.status}] ${r.id} - ${r.test} (Actual: ${r.actual}, Expected: ${r.expected})`).join('\n')}
`;

fs.writeFileSync(path.resolve('e2e/results/unit-test-results.log'), logContent);
console.log('\nResults written to e2e/results/unit-test-results.log');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
