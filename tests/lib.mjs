// Utilidades compartidas por las suites. Sin dependencias más allá de Playwright.

import os from 'node:os';

/** IP real de esta máquina: la usamos como si fuera la IP de un túnel VPN. */
export function localIPv4(){
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  return '127.0.0.1';
}

// PNG de 8x8, para probar que las imágenes se muestran en la burbuja
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAANUlEQVR4nGO4dOmSubk5kMzMzASSs2fP' +
  'BpJnz55lkJOTA7ICAgKAZFNTE5DcsmULkGQYlDoAo7l60Sv8dhEAAAAASUVORK5CYII=', 'base64');

/** Abre una pestaña nueva con perfil propio y deja el nombre puesto. */
export async function newUser(env, name, opts = {}){
  const ctx = await env.browser.newContext(opts.userAgent ? { userAgent: opts.userAgent } : {});
  const page = await ctx.newPage();
  page.on('pageerror', e => env.jsErrors.push(`${name}: ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('404')) env.jsErrors.push(`${name} console: ${m.text()}`);
  });
  // se instala antes que los scripts de la página
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation',
      e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`.trim()));
  });
  if (opts.initScript) await page.addInitScript(opts.initScript);
  await page.goto(env.url);
  // el boot es async (espera la identidad): hay que darle tiempo a decidir qué
  // pantalla muestra antes de preguntar, o el test corre contra una app a medio arrancar
  await page.waitForSelector('#welcome:not([hidden]), #home:not([hidden]), #chat:not([hidden])',
    { timeout: 20000 });
  // primer uso: nombre y adentro
  if (await page.isVisible('#welcome')){
    await page.fill('#wel-name', name);
    await page.click('#wel-go');
    await page.waitForSelector('#home:not([hidden])', { timeout: 10000 });
  }
  if (opts.phone || opts.noStun || opts.manualIp){
    await page.click('#btn-home-menu');
    await page.click('#mi-settings');
    if (opts.phone) await page.fill('#myphone', opts.phone);
    if (opts.noStun) await page.click('#tgl-stun');
    if (opts.manualIp){ await page.click('#adv summary'); await page.fill('#vpn-ip', opts.manualIp); }
    await page.click('#settings [data-home]');
  }
  return page;
}

/** Reabre una pestaña en el mismo perfil: conserva identidad y contactos. */
export async function reopenIn(env, ctx, label = 'reabierto'){
  const page = await ctx.newPage();
  page.on('pageerror', e => env.jsErrors.push(`${label}: ${e.message}`));
  await page.goto(env.url);
  return page;
}

/** Flujo manual: A crea la invitación y B pega el código suelto. */
export async function connectByPaste(A, B){
  await A.click('#fab');
  await A.waitForSelector('#offer-out:not([hidden])', { timeout: 25000 });
  if (await A.isVisible('[data-fmt="#offer-out"]')) await A.click('[data-fmt="#offer-out"]');
  const code = await A.inputValue('#offer-out');
  await B.click('#btn-home-menu');
  await B.click('#mi-join');
  await B.fill('#offer-in', code);
  await B.click('#btn-make-answer');
  await B.waitForSelector('#guest-step2:not([hidden])', { timeout: 25000 });
  await A.fill('#answer-in', await B.inputValue('#answer-out'));
  await A.click('#btn-connect-host');
  await bothInChat(A, B);
  return code;
}

/** Flujo por link: B navega a la invitación. `reinvite` salta el clic en el FAB. */
export async function connectByLink(A, B, reinvite = false){
  if (!reinvite) await A.click('#fab');
  await A.waitForSelector('#offer-out:not([hidden])', { timeout: 25000 });
  await A.evaluate(() => { fmtLink = true; refreshFmt(); });   // por si quedó en "código suelto"
  const link = await A.inputValue('#offer-out');
  if (/^https?:/.test(link)){
    await B.goto(link);                       // servida por web: se abre el link
  } else {
    await B.click('#btn-home-menu');          // abierta como archivo: no hay links
    await B.click('#mi-join');
    await B.fill('#offer-in', link);
    await B.click('#btn-make-answer');
  }
  await B.waitForSelector('#guest-step2:not([hidden])', { timeout: 25000 });
  await A.fill('#answer-in', await B.inputValue('#answer-out'));
  await A.click('#btn-connect-host');
  await bothInChat(A, B);
  return link;
}

export async function bothInChat(A, B){
  await A.waitForSelector('#chat:not([hidden])', { timeout: 30000 });
  await B.waitForSelector('#chat:not([hidden])', { timeout: 30000 });
}

export const home = page => page.click('.screen:not([hidden]) [data-home]');

export async function say(page, text){
  await page.fill('#input', text);
  await page.press('#input', 'Enter');
}

/** Último texto recibido en el chat abierto. */
export async function lastIn(page){
  const all = await page.$$eval('.row.in .bubble', ns => ns.map(n => n.innerText));
  return (all.pop() || '').split('\n').slice(1).join('\n') || all.pop() || '';
}

/** Manda algo crudo por el DataChannel, como lo haría un par hostil o con bugs. */
export const raw = (page, payload) => page.evaluate(p => {
  const c = [...convs.values()].find(x => x.dc && x.dc.readyState === 'open');
  c.dc.send(typeof p === 'string' ? p : JSON.stringify(p));
}, payload);

/** Violaciones de CSP registradas en esa pestaña (necesita newUser). */
export const cspViolations = page => page.evaluate(() => window.__csp || []);

/* ───────────── Leer los QR que dibuja la app ─────────────
   La app solo genera códigos: quien los lee es la cámara del otro teléfono.
   Para probar que de verdad se leen usamos ZXing, el decodificador de
   referencia, sobre el SVG que quedó en pantalla. */
let zxing = null;
async function decoder(){
  if (zxing) return zxing;
  const [mod, fs] = await Promise.all([import('zxing-wasm/reader'), import('node:fs/promises')]);
  const wasm = await fs.readFile(new URL(import.meta.resolve('zxing-wasm/reader/zxing_reader.wasm')));
  await mod.prepareZXingModule({ overrides: { wasmBinary: wasm.buffer }, fireImmediately: true });
  return (zxing = mod);
}

/** Reconstruye la matriz desde el <path> del SVG: prueba lo que se ve, no lo que se calculó. */
export const qrMatrix = page => page.$eval('.qr', svg => {
  const lado = Number(svg.getAttribute('viewBox').split(' ')[2]);
  const filas = Array.from({ length: lado }, () => new Uint8Array(lado));
  for (const [, x, y, n] of svg.querySelector('path').getAttribute('d').matchAll(/M(\d+) (\d+)h(\d+)/g))
    for (let i = 0; i < +n; i++) filas[+y][+x + i] = 1;
  return { lado, filas: filas.map(f => [...f]) };
});

/** Decodifica el QR que está en pantalla y devuelve su texto (o null). */
export async function readQr(page, escala = 4){
  const { lado, filas } = await qrMatrix(page);
  const w = lado * escala;
  const data = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++){
    if (!filas[y][x]) continue;
    for (let dy = 0; dy < escala; dy++) for (let dx = 0; dx < escala; dx++){
      const p = ((y * escala + dy) * w + x * escala + dx) * 4;
      data[p] = data[p + 1] = data[p + 2] = 0;
    }
  }
  const { readBarcodes } = await decoder();
  const res = await readBarcodes({ data, width: w, height: w }, { formats: ['QRCode'], tryHarder: true });
  return res[0] ? res[0].text : null;
}
