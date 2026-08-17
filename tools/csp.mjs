#!/usr/bin/env node
// El CSP de index.html permite el script inline por su hash, así que cualquier
// script inyectado (o un onerror= metido en un mensaje) queda bloqueado. El
// precio es que el hash hay que mantenerlo al día.
//
//   node tools/csp.mjs            actualiza el hash en el meta
//   node tools/csp.mjs --check    falla si está desincronizado (CI y tests)

import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const FILE = new URL('../index.html', import.meta.url);

export function readState(){
  const html = fs.readFileSync(FILE, 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!script) throw new Error('no encontré el <script> inline en index.html');
  const real = 'sha256-' + crypto.createHash('sha256').update(script[1], 'utf8').digest('base64');
  const meta = (html.match(/script-src '(sha256-[^']+)'/) || [])[1] || null;
  return { html, real, meta };
}

// importado desde los tests: solo exporta, no toca nada
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) cli();

function cli(){
const { html, real, meta } = readState();

if (process.argv.includes('--check')){
  if (meta === real){
    console.log('CSP al día:', real);
    process.exit(0);
  }
  console.error('CSP desincronizado con el script inline.');
  console.error('  en el meta: ' + meta);
  console.error('  calculado:  ' + real);
  console.error('Corregilo con:  npm run csp');
  process.exit(1);
}

if (meta === real){
  console.log('CSP ya estaba al día:', real);
} else {
  if (!meta) throw new Error("el meta CSP no tiene un script-src 'sha256-…' que actualizar");
  fs.writeFileSync(FILE, html.replace(/script-src 'sha256-[^']+'/, `script-src '${real}'`));
  console.log('CSP actualizado:', real);
}
}
