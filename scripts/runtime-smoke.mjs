/* global window, document */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = 'runtime-results';
await fs.mkdir(out, { recursive: true });
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173'], { stdio: 'inherit' });
let browser;
let page;
const messages = [];
const results = {};
try {
  for (let i=0; i<50; i++) {
    try { if ((await fetch('http://127.0.0.1:4173')).ok) break; } catch { /* server is starting */ }
    await new Promise(r=>setTimeout(r,200));
  }
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => messages.push({ type: 'pageerror', message: error.message, stack: error.stack }));
  page.on('console', message => messages.push({ type: message.type(), message: message.text() }));
  await page.goto('http://127.0.0.1:4173/?qa=1', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${out}/01-menu.png` });
  await page.locator('[data-action="new-game"]').click();
  await page.waitForFunction(() => window.__game?.gameState === 'playing', { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  assert.equal(await page.locator('.hud-menu-toggle').count(),1);
  assert.equal(await page.locator('.hud-minimap').count(),1);
  assert.equal(await page.locator('.hud-management-menu').isVisible(),false);
  await page.screenshot({ path: `${out}/02-new-game.png` });
  await page.locator('.hud-menu-toggle').click();
  assert.equal(await page.locator('.hud-management-menu').isVisible(),true);
  await page.locator('[data-panel="work"]').click();
  await page.screenshot({ path: `${out}/03-work.png` });
  await page.keyboard.press('Escape');
  await page.locator('[data-cat="rooms"]').click();
  await page.locator('.hud-build-items [data-id="room:dormitory"]').click();
  const points = await page.evaluate(() => [window.__game.renderer.camera.tileToScreen(26,26),window.__game.renderer.camera.tileToScreen(30,30)]);
  await page.mouse.move(points[0].x,points[0].y);
  await page.mouse.down();
  await page.mouse.move(points[1].x,points[1].y,{steps:12});
  await page.screenshot({path:`${out}/04-room-preview.png`});
  await page.mouse.up();
  await page.waitForTimeout(400);
  results.designated = await page.evaluate(() => window.__game.buildingSystem.getAllRooms());
  assert.equal(results.designated.length,1,'Room drag must create one designation');
  await page.screenshot({path:`${out}/05-room-designated.png`});
  // Complete the room through the same building API used by the drag tools.
  results.room = await page.evaluate(() => {
    const g=window.__game,b=g.buildingSystem;
    b.placeFloorArea(26,26,30,30);
    b.placeWallLine(25,25,31,25); b.placeWallLine(25,31,31,31);
    b.placeWallLine(25,26,25,30); b.placeWallLine(31,26,31,30);
    b.placeDoor(28,31); b.placeObject(27,27,'bed');
    g.afterStructureChange();g.closeBuildMenu();
    return b.getRoomStatus(b.getAllRooms()[0].id);
  });
  assert.equal(results.room.complete,true,'Fully furnished enclosed room must be functional');
  await page.screenshot({path:`${out}/06-room-complete.png`});
  await page.keyboard.press('Escape');
  await page.locator('#pause-menu [data-action="save"]').click();
  results.saved = await page.evaluate(() => window.__game.saveSystem.load());
  assert.ok(results.saved?.building?.objects?.length,'Manual save contains compound');
  await page.evaluate(() => { window.__game.dialog.hide(); window.__game.returnToMainMenu(); });
  await page.locator('[data-action="continue"]').click();
  await page.waitForFunction(() => window.__game.gameState === 'playing');
  await page.evaluate(() => window.__game.setTimeMode('pause'));
  results.restored = await page.evaluate(() => window.__game.buildingSystem.getSnapshot());
  assert.equal(results.restored.objects.length,results.saved.building.objects.length);
  assert.equal(results.restored.rooms.length,results.saved.building.rooms.length);
  await page.screenshot({path:`${out}/07-restored.png`});
  for (const [width,height] of [[1024,720],[1920,1080]]) {
    await page.setViewportSize({width,height});await page.waitForTimeout(300);
    await page.screenshot({path:`${out}/08-layout-${width}.png`});
  }
  await page.evaluate(() => {window.__game.dialog.hide();window.__game.returnToMainMenu();});
  await page.locator('[data-action="new-game"]').click();
  await page.waitForFunction(() => window.__game.gameState === 'playing');
  results.newGame = await page.evaluate(() => ({rooms:window.__game.buildingSystem.getAllRooms().length,day:window.__game.currentDay,tech:window.__game.techTree.getUnlocked().length}));
  assert.equal(results.newGame.rooms,0);assert.equal(results.newGame.day,1);assert.equal(results.newGame.tech,0);
  assert.equal(messages.filter(m=>m.type==='pageerror').length,0,'No browser runtime errors');
  await fs.writeFile(`${out}/body.txt`, await page.locator('body').innerText());
  results.passed=true;
} finally {
  if(page) await page.screenshot({path:`${out}/99-final.png`}).catch(()=>{});
  await fs.writeFile(`${out}/state.json`, JSON.stringify(results,null,2));
  await fs.writeFile(`${out}/console.json`, JSON.stringify(messages,null,2));
  await browser?.close();server.kill();
}
