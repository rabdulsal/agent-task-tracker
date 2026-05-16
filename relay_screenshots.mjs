import { chromium } from 'playwright';

const BASE = 'http://0.0.0.0:4000';
const OUT  = '/Users/abdulsar/Desktop/Project_Apps/Relay_Platform/public/screenshots';

async function load(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ✓ ${name}.png`);
}

async function shotFull(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  ✓ ${name}.png`);
}

async function shotEl(page, name, selector) {
  const el = page.locator(selector).first();
  const count = await el.count();
  if (!count) { console.log(`  ⚠ ${selector} not found — skipping ${name}`); return; }
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await el.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ✓ ${name}.png`);
}

(async () => {
  const browser = await chromium.launch();

  // ── Homepage ────────────────────────────────────────────────────────────
  console.log('\n[homepage]');
  let page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/`);
  await load(page);
  await shot(page,     'homepage-hero');
  await shotFull(page, 'homepage-full');
  await shotEl(page,   'homepage-pricing',  '#pricing');
  await shotEl(page,   'homepage-why',      '#why');
  await shotEl(page,   'homepage-api',      '#api');
  await shotEl(page,   'homepage-waitlist', '#waitlist');
  await page.close();

  // ── Get Started ─────────────────────────────────────────────────────────
  console.log('\n[get-started]');
  page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/get-started.html`);
  await load(page);
  await shot(page,     'get-started');
  await shotFull(page, 'get-started-full');
  await page.close();

  // ── Setup — all 4 tabs ──────────────────────────────────────────────────
  console.log('\n[setup]');
  page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const tab of ['mac', 'claude', 'codex', 'gemini']) {
    await page.goto(`${BASE}/setup`);
    await load(page);
    if (tab !== 'mac') {
      await page.evaluate(t => window.switchTab(t), tab);
      await page.waitForTimeout(400);
    }
    await shot(page,     `setup-${tab}`);
    await shotFull(page, `setup-${tab}-full`);
  }
  await page.close();

  // ── Docs ────────────────────────────────────────────────────────────────
  console.log('\n[docs]');
  page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/docs.html`);
  await load(page);
  await shot(page,     'docs');
  await shotFull(page, 'docs-full');
  await page.close();

  // ── App Store sizes ──────────────────────────────────────────────────────
  console.log('\n[appstore]');
  for (const vp of [{ width:1280, height:800 }, { width:1440, height:900 }]) {
    const tag = `${vp.width}x${vp.height}`;
    page = await browser.newPage();
    await page.setViewportSize(vp);

    await page.goto(`${BASE}/`);
    await load(page);
    await shot(page, `appstore-${tag}-01-homepage`);

    await page.goto(`${BASE}/setup`);
    await load(page);
    await shot(page, `appstore-${tag}-02-setup-mac`);

    await page.evaluate(() => window.switchTab('claude'));
    await page.waitForTimeout(400);
    await shot(page, `appstore-${tag}-03-setup-claude`);

    await page.goto(`${BASE}/docs.html`);
    await load(page);
    await shot(page, `appstore-${tag}-04-docs`);

    await page.close();
  }

  await browser.close();
  console.log('\n✅ Done.');
})();
