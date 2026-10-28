import { execSync } from 'child_process';

const ADB = 'C:\\Users\\Kishore R\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';

export function dumpScreen() {
  execSync(`& "${ADB}" shell uiautomator dump /sdcard/ui.xml`, { shell: 'powershell.exe' });
  const xml = execSync(`& "${ADB}" shell cat /sdcard/ui.xml`, { shell: 'powershell.exe' }).toString('utf8');
  const tagMatches = [...xml.matchAll(/<node\s+([^>]+)>/g)];
  return tagMatches.map(m => {
    const attrs = m[1];
    const textMatch = attrs.match(/text="([^"]*)"/);
    const descMatch = attrs.match(/content-desc="([^"]*)"/);
    const boundsMatch = attrs.match(/bounds="([^"]*)"/);
    const classMatch = attrs.match(/class="([^"]*)"/);
    return {
      cls: classMatch ? classMatch[1] : '',
      text: textMatch ? textMatch[1] : '',
      desc: descMatch ? descMatch[1] : '',
      bounds: boundsMatch ? boundsMatch[1] : ''
    };
  });
}

const nodes = dumpScreen();
for (const n of nodes) {
  if (n.text || n.desc) {
    console.log(`[${n.bounds}] <${n.cls}> text: "${n.text}" desc: "${n.desc}"`);
  }
}
