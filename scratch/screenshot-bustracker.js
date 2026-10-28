const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  
  try {
    await page.goto('http://localhost:8081', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Click on the first bus card (e.g. Bus 1 or 99)
    const busCard = page.locator('text=Bus 1').or(page.locator('text=Bus No 1')).first();
    if (await busCard.isVisible()) {
      await busCard.click();
    } else {
      // Click any bus card
      const anyBus = page.locator('[role="button"]').first();
      await anyBus.click();
    }
    
    await page.waitForTimeout(2000);
    await page.screenshot({ 
      path: 'C:/Users/Kishore R/.gemini/antigravity-ide/brain/f64c0424-a1d1-4dbb-bf1b-6bc132aa4b32/.tempmediaStorage/new_layout_screenshot.png' 
    });
    console.log('Screenshot saved successfully!');
  } catch (err) {
    console.error('Error capturing screenshot:', err);
  } finally {
    await browser.close();
  }
})();
