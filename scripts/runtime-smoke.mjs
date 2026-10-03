import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
const out = 'runtime-results';
await fs.mkdir(out, { recursive: true });
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173'], { stdio: 'inherit' });
let browser;
const messages = [];
try {
  for (let i=0; i<50; i++) { try { if ((await fetch('http://127.0.0.1:4173')).ok) break; } catch {} await new Promise(r=>setTimeout(r,200)); }
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => messages.push({ type: 'pageerror', message: error.message, stack: error.stack }));
  page.on('console', message => messages.push({ type: message.type(), message: message.text() }));
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${out}/01-menu.png` });
  await page.locator('[data-action="new-game"]').click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/02-new-game.png` });
  await fs.writeFile(`${out}/body.txt`, await page.locator('body').innerText());
  const state = await page.evaluate(() => ({ title: document.title, minimap: !!document.querySelector('.hud-minimap'), hamburger: !!document.querySelector('.hud-menu-toggle'), clock: document.querySelector('.hud-time-controls')?.textContent, objective: document.querySelector('.hud-objective-strip')?.textContent, canvas: [...document.querySelectorAll('canvas')].map(c=>({ width:c.width,height:c.height })) }));
  await fs.writeFile(`${out}/state.json`, JSON.stringify(state,null,2));
  console.log(JSON.stringify(state));
} finally {
  await fs.writeFile(`${out}/console.json`, JSON.stringify(messages,null,2));
  await browser?.close(); server.kill();
}
