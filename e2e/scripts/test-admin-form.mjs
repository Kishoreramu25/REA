import { execSync } from 'child_process';
import fs from 'fs';

const ADB = 'C:\\Users\\Kishore R\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';

function adb(cmd) {
  return execSync(`& "${ADB}" ${cmd}`, { shell: 'powershell.exe' }).toString('utf8');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function tap(x, y) {
  adb(`shell input tap ${x} ${y}`);
}

function key(code) {
  adb(`shell input keyevent ${code}`);
}

function type(text) {
  adb(`shell input text "${text}"`);
}

function dismissKeyboard() {
  key(111);
}

function clearField() {
  key(123); // move end
  for (let i = 0; i < 40; i++) {
    key(67); // backspace
  }
}

function capture(filename) {
  adb(`shell screencap -p /sdcard/${filename}`);
  adb(`pull /sdcard/${filename} e2e/screenshots/${filename}`);
}

function getNodes() {
  adb('shell uiautomator dump /sdcard/ui.xml');
  const xml = adb('shell cat /sdcard/ui.xml');
  const matches = [...xml.matchAll(/<node [^>]*text="([^"]*)"[^>]*content-desc="([^"]*)"[^>]*bounds="([^"]*)"/g)];
  return matches.map(m => ({ text: m[1], desc: m[2], bounds: m[3] }));
}

function findNodeByText(txt) {
  const nodes = getNodes();
  return nodes.find(n => n.text.includes(txt));
}

function findNodeByDesc(desc) {
  const nodes = getNodes();
  return nodes.find(n => n.desc === desc);
}

function parseCenter(bounds) {
  // bounds="[x1,y1][x2,y2]"
  const m = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!m) return null;
  const x1 = parseInt(m[1], 10);
  const y1 = parseInt(m[2], 10);
  const x2 = parseInt(m[3], 10);
  const y2 = parseInt(m[4], 10);
  return { x: Math.floor((x1 + x2) / 2), y: Math.floor((y1 + y2) / 2) };
}

async function run() {
  console.log('--- Step 1: Change PIN to 999997 (valid) ---');
  let pinNode = findNodeByText('999999');
  if (pinNode) {
    const c = parseCenter(pinNode.bounds);
    tap(c.x, c.y);
    await sleep(200);
    clearField();
    type('999997');
    dismissKeyboard();
    await sleep(400);
  }

  console.log('--- Step 2: Test Missing Origin validation ---');
  let submitBtn = findNodeByDesc('Create Bus Route');
  if (submitBtn) {
    const c = parseCenter(submitBtn.bounds);
    tap(c.x, c.y);
    await sleep(800);
    capture('79_missing_origin_error.png');
    let errNode = getNodes().find(n => n.text.includes('Start Place (Origin) is required.'));
    console.log('Missing Origin Error:', errNode ? errNode.text : 'NOT FOUND');
  }

  console.log('--- Step 3: Enter Origin "Test Origin 997" & Test Missing Departure Time ---');
  let originNode = findNodeByText('e.g. Kundadam');
  if (originNode) {
    const c = parseCenter(originNode.bounds);
    tap(c.x, c.y);
    await sleep(200);
    type('Test%sOrigin%s997');
    dismissKeyboard();
    await sleep(400);
  }
  submitBtn = findNodeByDesc('Create Bus Route');
  if (submitBtn) {
    const c = parseCenter(submitBtn.bounds);
    tap(c.x, c.y);
    await sleep(800);
    capture('80_missing_dept_time_error.png');
    let errNode = getNodes().find(n => n.text.includes('Departure Start Time is required.'));
    console.log('Missing Departure Time Error:', errNode ? errNode.text : 'NOT FOUND');
  }

  console.log('--- Step 4: Enter Invalid Departure Time "07:00" & Test Format Check ---');
  let deptNode = findNodeByText('e.g. 06:40 AM');
  if (deptNode) {
    const c = parseCenter(deptNode.bounds);
    tap(c.x, c.y);
    await sleep(200);
    type('07:00');
    dismissKeyboard();
    await sleep(400);
  }
  submitBtn = findNodeByDesc('Create Bus Route');
  if (submitBtn) {
    const c = parseCenter(submitBtn.bounds);
    tap(c.x, c.y);
    await sleep(800);
    capture('81_invalid_time_format_error.png');
    let errNode = getNodes().find(n => n.text.includes('Departure Time must be in'));
    console.log('Invalid Time Format Error:', errNode ? errNode.text : 'NOT FOUND');
  }

  console.log('--- Step 5: Enter Valid Departure Time "07:00 AM" & Test Missing Start Coords ---');
  deptNode = findNodeByText('07:00');
  if (deptNode) {
    const c = parseCenter(deptNode.bounds);
    tap(c.x, c.y);
    await sleep(200);
    clearField();
    type('07:00%sAM');
    dismissKeyboard();
    await sleep(400);
  }
  submitBtn = findNodeByDesc('Create Bus Route');
  if (submitBtn) {
    const c = parseCenter(submitBtn.bounds);
    tap(c.x, c.y);
    await sleep(800);
    capture('82_missing_start_coords_error.png');
    let errNode = getNodes().find(n => n.text.includes('Start coordinates are required'));
    console.log('Missing Start Coords Error:', errNode ? errNode.text : 'NOT FOUND');
  }

  console.log('--- Step 6: Enter Valid Start Coords "11.2700, 77.6000" & Test Missing Arrival Time ---');
  // First coords field
  let coordsNodes = getNodes().filter(n => n.text.includes('Lat, Lng'));
  if (coordsNodes.length > 0) {
    const c = parseCenter(coordsNodes[0].bounds);
    tap(c.x, c.y);
    await sleep(200);
    type('11.2700,%s77.6000');
    dismissKeyboard();
    await sleep(400);
  }
  submitBtn = findNodeByDesc('Create Bus Route');
  if (submitBtn) {
    const c = parseCenter(submitBtn.bounds);
    tap(c.x, c.y);
    await sleep(800);
    capture('83_missing_arrival_time_error.png');
    let errNode = getNodes().find(n => n.text.includes('Arrival Time at destination is required.'));
    console.log('Missing Arrival Time Error:', errNode ? errNode.text : 'NOT FOUND');
  }

  console.log('--- Step 7: Enter Arrival Time earlier than Start Time ("06:30 AM") & Test Time Order ---');
  let arrivalNode = findNodeByText('e.g. 08:15 AM');
  if (arrivalNode) {
    const c = parseCenter(arrivalNode.bounds);
    tap(c.x, c.y);
    await sleep(200);
    type('06:30%sAM');
    dismissKeyboard();
    await sleep(400);
  }
  submitBtn = findNodeByDesc('Create Bus Route');
  if (submitBtn) {
    const c = parseCenter(submitBtn.bounds);
    tap(c.x, c.y);
    await sleep(800);
    capture('84_time_order_error.png');
    let errNode = getNodes().find(n => n.text.includes('must be after'));
    console.log('Time Order Error:', errNode ? errNode.text : 'NOT FOUND');
  }
}

run().catch(err => console.error(err));
