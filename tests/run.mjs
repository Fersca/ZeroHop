#!/usr/bin/env node
// Corre las suites de tests contra index.html en un Chromium headless.
//
//   npm test                      todas las suites
//   npm test -- chat files        solo las que coincidan
//   ZH_URL=file:///…/index.html npm test      contra el archivo local
//
// Levanta un servidor estático propio: no hace falta nada corriendo antes.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = Number(process.env.ZH_PORT || 8899);
const FILTER = process.argv.slice(2);

// las suites se descubren solas: alcanza con dejar el archivo en tests/suites,
// numerado para que el orden sea el mismo siempre
const SUITES = (await fs.readdir(path.join(HERE, 'suites')))
  .filter(f => f.endsWith('.mjs')).sort();

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json',
  '.js': 'text/javascript; charset=utf-8', '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8'
};

// Todo lo que el servidor realmente recibió. Lo usa la suite de privacidad para
// probar que el código de invitación (que va en el #) nunca llega hasta acá.
const HITS = [];

async function serve(){
  const server = http.createServer(async (req, res) => {
    HITS.push(req.method + ' ' + req.url);
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
      const body = await fs.readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end('no'); }
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  return server;
}

async function loadPlaywright(){
  try { return await import('playwright'); } catch {}
  // en este entorno Playwright está instalado global
  try { return await import('/opt/node22/lib/node_modules/playwright/index.mjs'); } catch {}
  console.error('No encuentro Playwright. Instalalo con:  npm install  &&  npx playwright install chromium');
  process.exit(2);
}

const C = { ok: '\x1b[32m', bad: '\x1b[31m', dim: '\x1b[2m', b: '\x1b[1m', off: '\x1b[0m' };

const run = async () => {
  const { chromium } = await loadPlaywright();
  const server = await serve();
  const browser = await chromium.launch({ args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const url = process.env.ZH_URL || `http://127.0.0.1:${PORT}/index.html`;

  let pass = 0, fail = 0;
  const failures = [];
  console.log(`\n${C.b}ZeroHop · tests${C.off}  ${C.dim}${url}${C.off}\n`);

  for (const file of SUITES){
    if (FILTER.length && !FILTER.some(f => file.includes(f))) continue;
    const suite = (await import(path.join(HERE, 'suites', file))).default;
    const jsErrors = [];
    const env = { browser, url, jsErrors, hits: HITS };
    const t = {
      ok(cond, msg){
        if (cond){ pass++; console.log(`  ${C.ok}✔${C.off} ${msg}`); }
        else { fail++; failures.push(`${suite.name}: ${msg}`); console.log(`  ${C.bad}✖ ${msg}${C.off}`); }
      },
      info(msg){ console.log(`    ${C.dim}${msg}${C.off}`); }
    };
    console.log(`${C.b}${suite.name}${C.off}`);
    if (suite.web && url.startsWith('file:')){
      console.log(`  ${C.dim}(se saltea con file://: necesita links y service worker)${C.off}\n`);
      continue;
    }
    const t0 = Date.now();
    try {
      await suite.run(t, env);
    } catch (e){
      fail++; failures.push(`${suite.name}: excepción — ${e.message}`);
      console.log(`  ${C.bad}✖ excepción: ${e.message.split('\n')[0]}${C.off}`);
    }
    t.ok(jsErrors.length === 0, jsErrors.length ? `sin errores JS (hubo ${jsErrors.length}: ${jsErrors[0]})` : 'sin errores JS');
    console.log(`  ${C.dim}${((Date.now() - t0) / 1000).toFixed(1)}s${C.off}\n`);
    for (const ctx of browser.contexts()) await ctx.close();
  }

  await browser.close();
  server.close();

  console.log(`${C.b}${pass} ok${C.off}` + (fail ? `, ${C.bad}${fail} fallando${C.off}` : '') + '\n');
  if (fail){
    for (const f of failures) console.log(`  ${C.bad}·${C.off} ${f}`);
    console.log('');
  }
  process.exit(fail ? 1 : 0);
};

run();
