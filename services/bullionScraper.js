let cache = { ts: 0, data: null };
const ttlMs = 30 * 1000;

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('fetch_failed');
  return await res.text();
}

function parseNumber(s) {
  if (!s) return 0;
  let t = String(s).toLowerCase().replace(/[^\d.]/g, '');
  t = t.replace(/(\..*)\./g, '$1');
  if (!/^\d+(\.\d+)?$/.test(t)) {
    const m = t.match(/\d+(\.\d+)?/);
    t = m ? m[0] : '0';
  }
  const v = Number.parseFloat(t);
  return Number.isFinite(v) ? v : 0;
}

function fromHtml(html) {
  const lower = html.toLowerCase();
  const gold24Match = lower.match(/(24\s*carat|24\s*k|24k|gold[^a-z0-9]{0,6}24k)[^0-9]{0,20}([\d,]+(\.\d+)?)/);
  const gold22Match = lower.match(/(22\s*carat|22\s*k|22k|gold[^a-z0-9]{0,6}22k)[^0-9]{0,20}([\d,]+(\.\d+)?)/);
  const silverMatch = lower.match(/(silver|xag)[^0-9]{0,20}([\d,]+(\.\d+)?)/);
  const gold24 = gold24Match ? parseNumber(gold24Match[2]) : 0;
  const gold22 = gold22Match ? parseNumber(gold22Match[2]) : 0;
  const silver = silverMatch ? parseNumber(silverMatch[2]) : 0;
  return { gold24, gold22, silver };
}

async function attemptEmerald() {
  try {
    const url = (process.env.EMERALD_URL && String(process.env.EMERALD_URL).trim()) || 'https://www.emeraldbullion.com/';
    const html = await fetchText(url);
    const out = fromHtml(html);
    if (out.gold24 || out.gold22 || out.silver) return out;
    return null;
  } catch {
    return null;
  }
}

async function attemptEmeraldPuppeteer() {
  let browser = null;
  try {
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    const url = (process.env.EMERALD_URL && String(process.env.EMERALD_URL).trim()) || 'https://www.emeraldbullion.com/';
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const domExtract = await page.evaluate(() => {
      function text(el) { return (el?.innerText || '').trim().toLowerCase(); }
      function parseNum(s) {
        const cleaned = String(s).replace(/[^0-9.]/g, '');
        const v = parseFloat(cleaned);
        return Number.isFinite(v) ? v : 0;
      }
      const tables = Array.from(document.querySelectorAll('table'));
      let goldAsk = 0, silverAsk = 0, mcxGoldAsk = 0, mcxSilverAsk = 0;
      const productEntries = [];
      for (const t of tables) {
        const headerCells = Array.from(t.querySelectorAll('thead tr th, tr th'));
        const headers = headerCells.map(h => text(h));
        const askIdx = headers.findIndex(h => h.includes('ask'));
        if (askIdx === -1) continue;
        const rows = Array.from(t.querySelectorAll('tbody tr, tr')).filter(r => r.querySelectorAll('td').length > 0);
        const isProduct = headers.some(h => h.includes('product'));
        for (const r of rows) {
          const tds = Array.from(r.querySelectorAll('td'));
          if (tds.length === 0) continue;
          const label = text(tds[0]);
          const askCell = tds[askIdx] || tds[1] || tds[tds.length - 1];
          const askText = askCell ? askCell.innerText : r.innerText;
          const nums = (askText.match(/[\d,]+(\.\d+)?/g) || []).map(s => parseNum(s));
          const num = nums.length > 0 ? nums[0] : 0;
          if (!num) continue;
          if (isProduct) {
            productEntries.push({ label, num });
          } else {
            // Spot and MCX panels
            if (label.includes('gold')) {
              if (label.includes('mcx')) mcxGoldAsk = Math.max(mcxGoldAsk, num);
              else goldAsk = Math.max(goldAsk, num);
            }
            if (label.includes('silver')) {
              if (label.includes('mcx')) mcxSilverAsk = Math.max(mcxSilverAsk, num);
              else silverAsk = Math.max(silverAsk, num);
            }
          }
        }
      }
      function pickByNames(names) {
        for (const n of names) {
          const e = productEntries.find(pe => pe.label.includes(n));
          if (e) return e.num;
        }
        return 0;
      }
      // Precedence lists
      const g24 = pickByNames(['gold 9999','gold 999','gold 995']);
      const g22 = pickByNames(['gold 916','916','22k','22 karat','gold 22']);
      const sProd = pickByNames(['silver 999','silver 1000','silver']);
      return { goldAsk, silverAsk, prodGold24: g24, prodGold22: g22, prodSilver: sProd, mcxGoldAsk, mcxSilverAsk };
    });
    // Precedence: PRODUCT named rows > SPOT > MCX (overridden by preference or time window)
    const convertToGram = (x) => {
      let v = Number(x || 0);
      if (v > 1000000) v = v / 1000; else if (v > 20000) v = v / 10;
      return v;
    };
    const mcxGold = convertToGram(domExtract.mcxGoldAsk || 0);
    const mcxSilver = convertToGram(domExtract.mcxSilverAsk || 0);
    const prodGold24 = convertToGram(domExtract.prodGold24 || 0);
    const prodGold22 = convertToGram(domExtract.prodGold22 || 0);
    const prodSilver = convertToGram(domExtract.prodSilver || 0);
    const spotGold = convertToGram(domExtract.goldAsk || 0);
    const spotSilver = convertToGram(domExtract.silverAsk || 0);
    const preferEnv = String(process.env.EMERALD_PREFER_MCX || '').toLowerCase();
    const preferSet = new Set(preferEnv.split(',').map(s => s.trim()).filter(Boolean));
    const windowStr = String(process.env.EMERALD_MCX_WINDOW || '');
    const inWindow = (() => {
      if (!windowStr.includes('-')) return false;
      const [a,b] = windowStr.split('-').map(s => s.trim());
      const now = new Date();
      const toMin = (x) => { const [hh,mm] = x.split(':').map(n => parseInt(n || '0',10)); return hh*60+mm; };
      const cur = now.getHours()*60 + now.getMinutes();
      const start = toMin(a), end = toMin(b);
      if (isNaN(start) || isNaN(end)) return false;
      if (end >= start) return cur >= start && cur <= end;
      return cur >= start || cur <= end;
    })();
    const preferGoldMCX = inWindow || preferSet.has('gold') || preferSet.has('all') || preferSet.has('true');
    const preferSilverMCX = inWindow || preferSet.has('silver') || preferSet.has('all') || preferSet.has('true');
    let gold24 = 0, gold22 = 0, silver = 0;
    if (preferGoldMCX && mcxGold) gold24 = mcxGold;
    if (!gold24 && prodGold24) gold24 = prodGold24;
    if (!gold24 && spotGold) gold24 = spotGold;
    if (!gold22 && prodGold22) gold22 = prodGold22;
    if (!gold22 && gold24) gold22 = Math.round((gold24 * 22) / 24);
    if (preferSilverMCX && mcxSilver) silver = mcxSilver;
    if (!silver && prodSilver) silver = prodSilver;
    if (!silver && spotSilver) silver = spotSilver;
    if (gold24 || silver || gold22) {
      return { gold24: gold24 || 0, gold22: gold22 || 0, silver: silver || 0, mcxGold, mcxSilver };
    }
    let html = await page.content();
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    if (bodyText && bodyText.length > 100) html += '\n' + bodyText;
    const out = fromHtml(html);
    return (out.gold24 || out.gold22 || out.silver) ? out : null;
  } catch {
    return null;
  } finally {
    try { if (browser) await browser.close(); } catch {}
  }
}

async function attemptGoodreturns() {
  try {
    const [g, s] = await Promise.all([
      fetchText('https://www.goodreturns.in/gold-rates/'),
      fetchText('https://www.goodreturns.in/silver-rates/')
    ]);
    const a = fromHtml(g);
    const b = fromHtml(s);
    const gold24 = a.gold24 || 0;
    const gold22 = a.gold22 || Math.round((gold24 * 22) / 24);
    const silver = b.silver || 0;
    return { gold24, gold22, silver };
  } catch {
    return null;
  }
}

async function getRates(fallbackFn) {
  const now = Date.now();
  if (cache.data && now - cache.ts < ttlMs) return cache.data;
  let data = await attemptEmerald();
  if (!data) data = await attemptEmeraldPuppeteer();
  if (!data) data = await attemptGoodreturns();
  if (data && (data.gold24 || data.gold22 || data.silver)) {
    cache = { ts: now, data };
    return data;
  }
  const fb = await fallbackFn();
  cache = { ts: now, data: fb };
  return fb;
}

module.exports = { getRates };
