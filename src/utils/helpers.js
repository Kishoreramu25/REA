/**
 * ESEC Transport - General Helper Functions & Domain Logic
 */

export const TIME_REGEX = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s*(AM|PM)$/i;

export function isValidTimeFormat(timeStr) {
  if (!timeStr) return false;
  return TIME_REGEX.test(String(timeStr).trim());
}

export function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const match = String(timeStr).trim().match(/^(0?[1-9]|1[0-2]):([0-5][0-9])\s*(AM|PM)$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && h < 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return h * 60 + m;
}

export function parseTimeToToday(timeStr, baseDate = new Date()) {
  if (!timeStr) return null;
  const mins = timeToMinutes(timeStr);
  if (mins !== null) {
    const d = new Date(baseDate);
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    return d;
  }
  // Try fallback parse for 24h format "06:40:00"
  const match24 = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    const d = new Date(baseDate);
    d.setHours(parseInt(match24[1], 10), parseInt(match24[2], 10), 0, 0);
    return d;
  }
  return null;
}

export function formatTimeForDisplay(timeStr) {
  if (!timeStr) return '';
  const clean = String(timeStr).trim();
  
  if (/am|pm/i.test(clean)) {
    // Standardize to "hh:mm AM/PM"
    const match = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)$/i);
    if (match) {
      let h = parseInt(match[1], 10);
      const m = match[2];
      const p = match[3].toUpperCase();
      const hPad = h < 10 ? `0${h}` : `${h}`;
      return `${hPad}:${m} ${p}`;
    }
    return clean;
  }

  const match = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = match[2];
    const period = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const hPad = h < 10 ? `0${h}` : `${h}`;
    return `${hPad}:${m} ${period}`;
  }

  return clean;
}

export function formatTimeForDB(timeStr) {
  if (!timeStr) {
    throw new Error('Time string is required for database format');
  }
  const clean = String(timeStr).trim();

  if (/^\d{2}:\d{2}:\d{2}$/.test(clean)) {
    return clean;
  }

  const match = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = match[2];
    const period = match[3] ? match[3].toUpperCase() : null;

    if (period === 'PM' && h < 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;

    const hPad = h < 10 ? `0${h}` : `${h}`;
    return `${hPad}:${m}:00`;
  }

  throw new Error(`Invalid time format for database: "${timeStr}". Expected "hh:mm AM/PM".`);
}

/**
 * Map Supabase DB row to app bus object with 12-hour formatted times
 */
export function mapBus(b) {
  if (!b) return null;
  const routeNo = parseInt(b.bus_number, 10) || 0;
  const rawStops = Array.isArray(b.stops) ? b.stops : [];
  const sortedStops = rawStops
    .slice()
    .sort((x, y) => (x.stop_order ?? 0) - (y.stop_order ?? 0))
    .map((s, idx) => {
      const lat = s.latitude != null ? parseFloat(s.latitude) : (s.lat != null ? parseFloat(s.lat) : null);
      const lng = s.longitude != null ? parseFloat(s.longitude) : (s.lng != null ? parseFloat(s.lng) : null);
      return {
        id: s.id || `stop_${idx}`,
        name: s.stop_name || s.name || '',
        time: formatTimeForDisplay(s.stop_time || s.time),
        stop_order: s.stop_order ?? idx,
        lat,
        lng,
        latitude: lat,
        longitude: lng
      };
    });

  const startTime12 = formatTimeForDisplay(b.start_time);
  const collegeTime12 = formatTimeForDisplay(b.end_time);

  const startLat = b.start_lat != null ? parseFloat(b.start_lat) : (b.startLat != null ? parseFloat(b.startLat) : null);
  const startLng = b.start_lng != null ? parseFloat(b.start_lng) : (b.startLng != null ? parseFloat(b.startLng) : null);
  const endLat = b.end_lat != null ? parseFloat(b.end_lat) : (b.endLat != null ? parseFloat(b.endLat) : null);
  const endLng = b.end_lng != null ? parseFloat(b.end_lng) : (b.endLng != null ? parseFloat(b.endLng) : null);

  return {
    id: b.id,
    routeNo,
    bus_number: String(b.bus_number || ''),
    name: `Bus No ${b.bus_number || ''}`,
    origin: b.start_place || '',
    start_place: b.start_place || '',
    startTime: startTime12,
    start_time: startTime12,
    startLat,
    start_lat: startLat,
    startLng,
    start_lng: startLng,
    endPlace: b.end_place || 'ESEC Campus',
    end_place: b.end_place || 'ESEC Campus',
    endLat,
    end_lat: endLat,
    endLng,
    end_lng: endLng,
    collegeTime: collegeTime12,
    end_time: collegeTime12,
    driverPhone: b.driver_phone || '',
    driver_phone: b.driver_phone || '',
    isTracking: Boolean(b.is_tracking),
    is_tracking: Boolean(b.is_tracking),
    via: sortedStops,
    stops: sortedStops
  };
}

/**
 * Bus Status Constants
 */
export const BUS_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  LIVE: 'LIVE',
  SIGNAL_LOST: 'SIGNAL_LOST',
  ENDED: 'ENDED'
};

/**
 * Returns NOT_STARTED, LIVE, SIGNAL_LOST, or ENDED based on tracking and timestamps
 * - LIVE: is_tracking true AND location.updated_at newer than 90s
 * - SIGNAL_LOST: is_tracking true BUT location.updated_at older than 90s (or missing)
 * - ENDED: not tracking AND now is past arrival time
 * - NOT_STARTED: not tracking AND now is not past arrival time
 */
export function getBusStatus(bus, location, now = new Date()) {
  const isTracking = Boolean(bus?.isTracking ?? bus?.is_tracking);
  const currentDate = now instanceof Date ? now : new Date(now);

  // Requirement 3: If is_tracking is true but the last update is older than 30 minutes or from a previous day,
  // ignore the flag and decide NOT_STARTED or ENDED from the schedule. SIGNAL_LOST only for gaps between 90 s and 30 min.
  if (isTracking && location?.updated_at) {
    const updatedDate = new Date(location.updated_at);
    const isPreviousDay = updatedDate.toDateString() !== currentDate.toDateString();
    const diffSeconds = (currentDate.getTime() - updatedDate.getTime()) / 1000;

    if (!isPreviousDay && diffSeconds >= -60 && diffSeconds <= 30 * 60) {
      if (diffSeconds <= 90) {
        return BUS_STATUS.LIVE;
      }
      return BUS_STATUS.SIGNAL_LOST;
    }
  }

  // Decide NOT_STARTED or ENDED from schedule
  const arrival = parseTimeToToday(bus?.collegeTime || bus?.end_time || bus?.endPlaceTime, currentDate);
  if (arrival && currentDate.getTime() > arrival.getTime()) {
    return BUS_STATUS.ENDED;
  }

  return BUS_STATUS.NOT_STARTED;
}

/**
 * Returns true only when bus is NOT_STARTED and current time is between (start + 3 min) and arrival time
 */
export function isBusLate(bus, now = new Date()) {
  const status = getBusStatus(bus, null, now);
  if (status !== BUS_STATUS.NOT_STARTED) return false;

  const currentDate = now instanceof Date ? now : new Date(now);
  const start = parseTimeToToday(bus?.startTime || bus?.start_time, currentDate);
  const arrival = parseTimeToToday(bus?.collegeTime || bus?.end_time, currentDate);

  if (!start || !arrival) return false;

  const startPlus3 = new Date(start.getTime() + 3 * 60 * 1000);
  return currentDate.getTime() >= startPlus3.getTime() && currentDate.getTime() <= arrival.getTime();
}

/**
 * Format "Last seen hh:mm" for SIGNAL_LOST
 */
export function formatLastSeen(updatedAt) {
  if (!updatedAt) return 'Last seen recently';
  try {
    const d = new Date(updatedAt);
    let h = d.getHours();
    const m = d.getMinutes();
    const period = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const hPad = h < 10 ? `0${h}` : `${h}`;
    const mPad = m < 10 ? `0${m}` : `${m}`;
    return `Last seen ${hPad}:${mPad} ${period}`;
  } catch (e) {
    return 'Last seen recently';
  }
}

/**
 * Calculate Great-Circle distance in kilometers between two GPS points
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Estimate travel time in minutes based on distance and college bus speed (avg 35 km/h)
 */
export function calculateETA(distanceKm) {
  if (distanceKm === null || distanceKm === undefined) return '~12 min';
  const minutes = Math.round((distanceKm / 35) * 60);
  if (minutes <= 1) return 'Arriving now';
  return `~${minutes} min`;
}

/**
 * Parses coordinates from raw string or Google Maps link.
 * Supports:
 * - "11.341, 77.717"
 * - Google Maps URL containing @11.341,77.717
 * - Google Maps URL containing !3d11.341!4d77.717
 * - URL query param ?q=11.341,77.717 or ll=11.341,77.717
 */
export function parseLatLng(text) {
  if (!text) return null;
  if (typeof text === 'object' && text !== null) {
    const lat = parseFloat(text.lat ?? text.latitude);
    const lng = parseFloat(text.lng ?? text.longitude);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    return null;
  }

  const str = String(text).trim();
  if (!str) return null;

  // 1. Google Maps !3dLAT!4dLNG
  const g3d4d = str.match(/!3d(-?\d+(?:\.\d+)?).*?!4d(-?\d+(?:\.\d+)?)/);
  if (g3d4d) {
    const lat = parseFloat(g3d4d[1]);
    const lng = parseFloat(g3d4d[2]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }

  // 2. Google Maps @lat,lng
  const gAt = str.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (gAt) {
    const lat = parseFloat(gAt[1]);
    const lng = parseFloat(gAt[2]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }

  // 3. Query string q=lat,lng or ll=lat,lng
  const gQuery = str.match(/[?&](?:q|ll|query)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (gQuery) {
    const lat = parseFloat(gQuery[1]);
    const lng = parseFloat(gQuery[2]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }

  // 4. Standard "lat, lng" or "lat lng"
  const m = str.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }

  return null;
}

/**
 * Validates coordinate range (India bounding box: lat 6-38, lng 68-98)
 */
export function validateLatLng(coords) {
  if (!coords || typeof coords !== 'object') {
    return { valid: false, error: 'Coordinates are required.' };
  }
  const { lat, lng } = coords;
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
    return { valid: false, error: 'Invalid coordinates.' };
  }
  if (lat < 6 || lat > 38 || lng < 68 || lng > 98) {
    return { valid: false, error: 'check order: latitude first' };
  }
  return { valid: true, lat, lng };
}

/**
 * Calculates distance in meters between two points using local projection
 */
export function getPointsDistanceMeters(p1, p2) {
  if (!p1 || !p2) return 0;
  const lat1 = p1.lat ?? p1.latitude;
  const lng1 = p1.lng ?? p1.longitude;
  const lat2 = p2.lat ?? p2.latitude;
  const lng2 = p2.lng ?? p2.longitude;
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 0;
  const refLat = ((lat1 + lat2) / 2 * Math.PI) / 180;
  const dx = (lng2 - lng1) * Math.cos(refLat) * 111.32;
  const dy = (lat2 - lat1) * 111.32;
  return Math.hypot(dx, dy) * 1000;
}

/**
 * Pure route progress function for Phase 2A.
 * Converts coordinates to local km and calculates segment projection,
 * phase, delay, ETA, and predicted times.
 */
export function getRouteProgress(bus, location, now = new Date(), minNextIdx = 0) {
  const emptyResult = {
    ready: false,
    phase: 'unknown',
    nextIdx: 0,
    passedCount: 0,
    delayMin: 0,
    etaNextMin: 0,
    distToNextKm: 0,
    predicted: [],
    etaMin: [],
    segIdx: 0,
    t: 0,
    distToStopKm: []
  };

  if (!bus || !location) return emptyResult;
  const busLat = parseFloat(location.latitude ?? location.lat);
  const busLng = parseFloat(location.longitude ?? location.lng);
  if (isNaN(busLat) || isNaN(busLng)) return emptyResult;

  // Build points P0..Pn
  const points = [];

  // P0 (Origin)
  const p0Lat = bus.startLat ?? bus.start_lat;
  const p0Lng = bus.startLng ?? bus.start_lng;
  const p0Time = bus.startTime ?? bus.start_time;
  if (p0Lat == null || p0Lng == null || !p0Time) return emptyResult;
  points.push({
    name: bus.origin || bus.start_place || 'Origin',
    lat: parseFloat(p0Lat),
    lng: parseFloat(p0Lng),
    time: p0Time
  });

  // P1..Pn-1 (Stops)
  const rawStops = bus.via || bus.stops || [];
  for (let s of rawStops) {
    const sLat = typeof s === 'object' ? (s.lat ?? s.latitude) : null;
    const sLng = typeof s === 'object' ? (s.lng ?? s.longitude) : null;
    const sTime = typeof s === 'object' ? (s.time ?? s.stop_time) : null;
    if (sLat == null || sLng == null || !sTime) return emptyResult;
    points.push({
      name: typeof s === 'object' ? (s.name ?? s.stop_name ?? 'Stop') : 'Stop',
      lat: parseFloat(sLat),
      lng: parseFloat(sLng),
      time: sTime
    });
  }

  // Pn (Destination / End)
  const pnLat = bus.endLat ?? bus.end_lat;
  const pnLng = bus.endLng ?? bus.end_lng;
  const pnTime = bus.collegeTime ?? bus.end_time;
  if (pnLat == null || pnLng == null || !pnTime) return emptyResult;
  points.push({
    name: bus.endPlace || bus.end_place || 'ESEC Campus',
    lat: parseFloat(pnLat),
    lng: parseFloat(pnLng),
    time: pnTime
  });

  if (points.length < 2) return emptyResult;
  for (let p of points) {
    if (isNaN(p.lat) || isNaN(p.lng)) return emptyResult;
  }

  // Convert scheduled times to continuous scale (minutes from midnight)
  const time_P = points.map((p) => {
    const mins = timeToMinutes(p.time);
    return mins !== null ? mins : 0;
  });

  // Handle cross-midnight trips
  for (let k = 0; k < points.length - 1; k++) {
    if (time_P[k + 1] < time_P[k]) {
      for (let m = k + 1; m < points.length; m++) {
        time_P[m] += 1440;
      }
    }
  }

  // Parse `now` into minutes from midnight
  let nowMin = 0;
  if (typeof now === 'string') {
    nowMin = timeToMinutes(now) ?? 0;
  } else if (now instanceof Date) {
    nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  } else if (typeof now === 'number') {
    if (now > 10000000) {
      const d = new Date(now);
      nowMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
    } else {
      nowMin = now;
    }
  }

  // Day offset: try nowMin, nowMin+1440 and nowMin-1440 and use the one closest to window [time(P0), time(Pn)] (distance 0 inside it)
  const wStart = time_P[0];
  const wEnd = time_P[points.length - 1];
  const distToWindow = (val) => {
    if (val < wStart) return wStart - val;
    if (val > wEnd) return val - wEnd;
    return 0;
  };
  const candidates = [nowMin, nowMin + 1440, nowMin - 1440];
  let bestCandidate = nowMin;
  let minCandidateDist = Infinity;
  for (const c of candidates) {
    const d = distToWindow(c);
    if (d < minCandidateDist) {
      minCandidateDist = d;
      bestCandidate = c;
    }
  }
  nowMin = bestCandidate;

  // Convert to local km: x = dLng * cos(lat) * 111.32, y = dLat * 111.32
  const refLatRad = (points[0].lat * Math.PI) / 180;
  const cosLat = Math.cos(refLatRad);

  for (let p of points) {
    p.x = (p.lng - points[0].lng) * cosLat * 111.32;
    p.y = (p.lat - points[0].lat) * 111.32;
  }

  const x_B = (busLng - points[0].lng) * cosLat * 111.32;
  const y_B = (busLat - points[0].lat) * 111.32;

  // Find nearest segment Pi -> Pi+1, only from segment max(0, minNextIdx - 1)
  const startSeg = Math.max(0, (minNextIdx || 0) - 1);
  let bestI = -1;
  let bestDistM = Infinity;
  let bestT = 0;
  let bestSegLenKm = 0;

  for (let i = startSeg; i < points.length - 1; i++) {
    const pA = points[i];
    const pB = points[i + 1];
    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    const segLenSq = dx * dx + dy * dy;
    const segLenKm = Math.sqrt(segLenSq);

    let t = 0;
    if (segLenSq > 0) {
      const dot = (x_B - pA.x) * dx + (y_B - pA.y) * dy;
      t = Math.max(0, Math.min(1, dot / segLenSq));
    }

    const qx = pA.x + t * dx;
    const qy = pA.y + t * dy;
    const distM = Math.hypot(x_B - qx, y_B - qy) * 1000;

    if (bestI === -1) {
      bestI = i;
      bestDistM = distM;
      bestT = t;
      bestSegLenKm = segLenKm;
    } else {
      // If two segments are within 30 m of each other, take the earlier one
      if (distM < bestDistM - 30) {
        bestI = i;
        bestDistM = distM;
        bestT = t;
        bestSegLenKm = segLenKm;
      }
    }
  }

  // Phase, checked in this order:
  // 1. at_start = within 150 m of P0
  // 2. arrived = within 200 m of Pn
  // 3. before_start = t is 0 on segment 0 and over 150 m from P0
  // 4. off_route = limit max(1.5 km, 0.2 * length of the nearest segment)
  // Otherwise en_route
  const p0 = points[0];
  const pn = points[points.length - 1];
  const distToP0_M = Math.hypot(x_B - p0.x, y_B - p0.y) * 1000;
  const distToPn_M = Math.hypot(x_B - pn.x, y_B - pn.y) * 1000;

  const offRouteLimitKm = Math.max(1.5, 0.2 * bestSegLenKm);
  const isOffRoute = (bestDistM / 1000) > offRouteLimitKm;

  let phase = 'en_route';
  if (distToP0_M <= 150) {
    phase = 'at_start';
  } else if (distToPn_M <= 200) {
    phase = 'arrived';
  } else if (bestI === 0 && bestT === 0 && distToP0_M > 150) {
    phase = 'before_start';
  } else if (isOffRoute) {
    phase = 'off_route';
  } else {
    phase = 'en_route';
  }

  const predicted = new Array(points.length).fill(0);
  let nextIdx = 0;
  let passedCount = 0;
  let delayMin = 0;
  let etaNextMin = 0;
  let distToNextKm = 0;

  if (phase === 'at_start') {
    nextIdx = 0;
    passedCount = 0;
    etaNextMin = 0;
    delayMin = Math.max(0, Math.round(nowMin - time_P[0]));
    distToNextKm = bestSegLenKm;
    for (let j = 0; j < points.length; j++) {
      predicted[j] = time_P[j] + delayMin;
    }
  } else if (phase === 'before_start') {
    nextIdx = 0;
    passedCount = 0;
    delayMin = Math.max(0, Math.round(nowMin - time_P[0]));
    distToNextKm = distToP0_M / 1000;
    etaNextMin = Math.max(0, Math.round(time_P[0] - nowMin));
    for (let j = 0; j < points.length; j++) {
      predicted[j] = time_P[j];
    }
  } else if (phase === 'arrived') {
    nextIdx = points.length - 1;
    passedCount = points.length - 1;
    delayMin = Math.round(nowMin - time_P[points.length - 1]);
    etaNextMin = 0;
    distToNextKm = 0;
    for (let j = 0; j < points.length; j++) {
      predicted[j] = time_P[j];
    }
  } else if (phase === 'off_route') {
    nextIdx = bestI + 1;
    passedCount = nextIdx;
    delayMin = 0;
    etaNextMin = 0;
    distToNextKm = 0;
    for (let j = 0; j < points.length; j++) {
      predicted[j] = time_P[j];
    }
  } else { // en_route
    nextIdx = bestI + 1;
    passedCount = nextIdx;
    const scheduledAtBus = time_P[bestI] + bestT * (time_P[bestI + 1] - time_P[bestI]);
    const unroundedDelay = nowMin - scheduledAtBus;
    delayMin = Math.round(unroundedDelay);
    for (let j = nextIdx; j < points.length; j++) {
      predicted[j] = time_P[j] + unroundedDelay;
    }
    for (let j = 0; j < nextIdx; j++) {
      predicted[j] = time_P[j];
    }
    etaNextMin = Math.max(0, Math.round(predicted[nextIdx] - nowMin));
    distToNextKm = (1 - bestT) * bestSegLenKm;
  }

  // Compute etaMin array for every stop
  const etaMin = predicted.map((pred) => Math.max(0, Math.round(pred - nowMin)));

  // Compute segment lengths
  const segLengths = [];
  for (let k = 0; k < points.length - 1; k++) {
    const dx = points[k + 1].x - points[k].x;
    const dy = points[k + 1].y - points[k].y;
    segLengths.push(Math.hypot(dx, dy));
  }

  // Calculate route distance from the bus to each stop ahead (null for passed stops)
  const distToStopKm = new Array(points.length).fill(null);

  if (phase === 'before_start') {
    const d0 = distToP0_M / 1000;
    distToStopKm[0] = d0;
    let accum = d0;
    for (let k = 0; k < points.length - 1; k++) {
      accum += segLengths[k];
      distToStopKm[k + 1] = accum;
    }
  } else if (phase === 'at_start') {
    distToStopKm[0] = 0;
    let accum = 0;
    for (let k = 0; k < points.length - 1; k++) {
      accum += segLengths[k];
      distToStopKm[k + 1] = accum;
    }
  } else if (phase === 'arrived') {
    for (let k = 0; k < points.length - 1; k++) {
      distToStopKm[k] = null;
    }
    distToStopKm[points.length - 1] = 0;
  } else {
    // en_route or off_route
    for (let k = 0; k <= bestI; k++) {
      distToStopKm[k] = null;
    }
    const remOnSeg = (1 - bestT) * (segLengths[bestI] || 0);
    distToStopKm[bestI + 1] = remOnSeg;
    let accum = remOnSeg;
    for (let k = bestI + 1; k < points.length - 1; k++) {
      accum += segLengths[k];
      distToStopKm[k + 1] = accum;
    }
  }

  return {
    ready: true,
    phase,
    nextIdx,
    passedCount,
    delayMin,
    etaNextMin,
    distToNextKm,
    predicted,
    etaMin,
    segIdx: bestI >= 0 ? bestI : 0,
    t: bestT,
    distToStopKm
  };
}
