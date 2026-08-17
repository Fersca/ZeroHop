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
  await page.goto(env.url);
  await page.click('#btn-home-menu');
  await page.click('#mi-settings');
  await page.fill('#myname', name);
  if (opts.phone) await page.fill('#myphone', opts.phone);
  if (opts.noStun) await page.click('#tgl-stun');
  if (opts.manualIp){ await page.click('#adv summary'); await page.fill('#vpn-ip', opts.manualIp); }
  await page.click('#settings [data-home]');
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
  await B.goto(link);
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
