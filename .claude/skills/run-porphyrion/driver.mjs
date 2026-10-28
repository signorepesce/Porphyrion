// Drive the Porphyrion web UI: send one request through the real UI, screenshot it.
// Usage: node driver.mjs [targetUrl] [METHOD] [--dark] [--out shot.png] [--base http://localhost:8099]
// Needs: server already running on :8099, `npm i --no-save playwright-core` in this dir, Edge or Chrome installed.
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  return i < 0 ? def : args.splice(i, 2)[1];
};
const dark = args.includes('--dark') && !!args.splice(args.indexOf('--dark'), 1);
const out = flag('--out', 'porphyrion.png');
const base = flag('--base', 'http://localhost:8099');
const [target = 'https://httpbin.org/get', method = 'GET'] = args;

const channel = process.env.PW_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chrome');
const browser = await chromium.launch({ channel, headless: true });
const page = await browser.newPage({ viewport: { width: 1470, height: 880 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));

await page.goto(base + '/');
if (dark) await page.evaluate(() => { const t = document.getElementById('darkToggle'); t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); });
await page.selectOption('#method', method);
await page.fill('#url', target);
const before = await page.textContent('#resp');
await page.click('#sendBtn');
await page.waitForFunction((b) => document.getElementById('resp').textContent !== b, before, { timeout: 30000 });
await page.waitForTimeout(300);

console.log('badge:', (await page.textContent('#badge'))?.trim());
console.log('timing:', (await page.textContent('#timing'))?.trim(), (await page.textContent('#respSize'))?.trim());
console.log('resp:', (await page.textContent('#resp')).slice(0, 300));
await page.screenshot({ path: out });
console.log('screenshot:', out);
await browser.close();
