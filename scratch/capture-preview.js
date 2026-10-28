const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  
  try {
    console.log('Navigating to http://localhost:8081...');
    await page.goto('http://localhost:8081', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    console.log('Waiting for content to load...');
    await page.waitForTimeout(3000);
    
    // Check if Select Bus or bus items are visible
    const selectTrigger = page.locator('text=Select Bus').first();
    if (await selectTrigger.isVisible()) {
      console.log('Clicking Select Bus trigger...');
      await selectTrigger.click();
      await page.waitForTimeout(1000);
    }
    
    // Find Bus 1 item or any bus card
    console.log('Looking for bus card...');
    const bus1 = page.locator('text=Bus No 1').or(page.locator('text=Bus 1')).or(page.locator('text=Route 1')).first();
    if (await bus1.isVisible()) {
      console.log('Found Bus 1, clicking...');
      await bus1.click();
    } else {
      console.log('Clicking first clickable element in list...');
      const firstBus = page.locator('[data-testid*="bus"]').or(page.locator('div[tabindex="0"]')).first();
      await firstBus.click();
    }
    
    console.log('Waiting for BusTracker page to render...');
    await page.waitForTimeout(2500);
    
    await page.screenshot({ 
      path: 'C:/Users/Kishore R/.gemini/antigravity-ide/brain/f64c0424-a1d1-4dbb-bf1b-6bc132aa4b32/.tempmediaStorage/bustracker_overhauled.png' 
    });
    console.log('Screenshot successfully saved to bustracker_overhauled.png!');
  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    await browser.close();
  }
})();
