import fs from 'fs';

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function analyzeMovementTelemetry(filePath = 'e2e/results/movement-telemetry.json') {
  if (!fs.existsSync(filePath)) {
    console.error(`Telemetry file not found: ${filePath}`);
    return null;
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(data) || data.length === 0) {
    console.error('Telemetry data is empty or invalid.');
    return null;
  }

  let maxJumpMeters = 0;
  let maxIdleGapSeconds = 0;
  let backwardMoves = 0;
  const gaps = [];
  const jumps = [];

  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];

    // 1. Progress direction check
    if (curr.progress < prev.progress) {
      backwardMoves++;
    }

    // 2. Idle gap
    const prevTime = new Date(prev.timestamp).getTime();
    const currTime = new Date(curr.timestamp).getTime();
    const gapSec = (currTime - prevTime) / 1000;
    gaps.push(gapSec);
    if (gapSec > maxIdleGapSeconds) {
      maxIdleGapSeconds = gapSec;
    }

    // 3. Distance jump
    const distM = haversineMeters(prev.lat, prev.lng, curr.lat, curr.lng);
    jumps.push(distM);
    if (distM > maxJumpMeters) {
      maxJumpMeters = distM;
    }
  }

  const passCriteria = {
    backwardMovesZero: backwardMoves === 0,
    maxJumpUnder200m: maxJumpMeters <= 200,
    status: backwardMoves === 0 && maxJumpMeters <= 200 ? 'PASS' : 'FAIL'
  };

  const report = {
    totalSteps: data.length,
    maxJumpMeters: Math.round(maxJumpMeters * 10) / 10,
    maxIdleGapSeconds: Math.round(maxIdleGapSeconds * 10) / 10,
    backwardMoves,
    status: passCriteria.status,
    steps: data
  };

  console.log('=== ROUTE MOVEMENT ANALYSIS ===');
  console.log(`Total Steps: ${report.totalSteps}`);
  console.log(`Max Jump: ${report.maxJumpMeters} m (Threshold: 200m) -> ${report.maxJumpMeters <= 200 ? 'PASS' : 'FAIL'}`);
  console.log(`Max Idle Gap: ${report.maxIdleGapSeconds} s`);
  console.log(`Backward Moves: ${report.backwardMoves} (Threshold: 0) -> ${report.backwardMoves === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Overall Route Movement Status: ${report.status}`);

  fs.writeFileSync('e2e/results/movement-analysis.json', JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1]?.endsWith('analyze-movement.mjs')) {
  analyzeMovementTelemetry();
}
