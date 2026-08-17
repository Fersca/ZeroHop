import { newUser, connectByPaste, say, cspViolations, PNG } from '../lib.mjs';
import { readState } from '../../tools/csp.mjs';

export default {
  name: 'CSP y avisos · script por hash, nada bloqueado, notificaciones',
  async run(t, env){
    // ── el hash del meta tiene que corresponder al script inline ──
    const { real, meta } = readState();
    t.ok(meta === real, meta === real
      ? `el hash del meta CSP coincide con el script (${real.slice(0, 22)}…)`
      : `hash desincronizado: meta ${meta} vs real ${real} — corregir con npm run csp`);

    const A = await newUser(env, 'Fernando');
    const B = await newUser(env, 'Luciana');
    t.ok(await A.evaluate(() => typeof convs !== 'undefined'),
      'el script de la app corre igual (el hash lo habilita)');

    // ── lo que el CSP tiene que impedir ──
    const inyectado = await A.evaluate(() => new Promise(res => {
      window.__pwned = false;
      const s = document.createElement('script');
      s.textContent = 'window.__pwned = true';
      document.body.appendChild(s);
      setTimeout(() => res(window.__pwned), 120);
    }));
    t.ok(inyectado === false, 'un <script> inyectado en el DOM no se ejecuta');

    const handler = await A.evaluate(() => new Promise(res => {
      window.__pwned2 = false;
      const d = document.createElement('div');
      d.innerHTML = '<img src="x" onerror="window.__pwned2 = true">';
      document.body.appendChild(d);
      setTimeout(() => res(window.__pwned2), 250);
    }));
    t.ok(handler === false, 'un onerror= inyectado no se ejecuta');

    const externo = await A.evaluate(() => new Promise(res => {
      const s = document.createElement('script');
      s.src = 'https://example.com/x.js';
      s.onerror = () => res('bloqueado');
      s.onload = () => res('cargó');
      document.body.appendChild(s);
      setTimeout(() => res('bloqueado'), 800);
    }));
    t.ok(externo === 'bloqueado', 'no se puede cargar un script externo');

    // Todo lo de arriba lo provocamos a propósito, así que no cuenta como error
    // de la app: el bloqueo por CSP y, en file://, el fallo del script externo.
    const esperado = /Refused to (execute|load)|ERR_FILE_NOT_FOUND|example\.com/i;
    for (let i = env.jsErrors.length - 1; i >= 0; i--)
      if (esperado.test(env.jsErrors[i])) env.jsErrors.splice(i, 1);

    // ── y lo que NO tiene que romper ──
    await connectByPaste(A, B);
    await say(A, 'texto con <b>html</b> y https://example.com');
    await B.waitForTimeout(400);
    await A.setInputFiles('#file', { name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    await B.waitForSelector('.row.in .bubble.pic img.photo', { timeout: 20000 });
    const ok = await B.$eval('.row.in .bubble.pic img.photo', i => i.naturalWidth === 8);
    t.ok(ok, 'las imágenes por blob: se siguen viendo');

    await A.click('#btn-menu'); await A.click('#mi-safety');
    await A.waitForSelector('.safety');
    await A.keyboard.press('Escape');

    for (const [quien, page] of [['A', A], ['B', B]]){
      const v = await cspViolations(page);
      const propias = v.filter(x => !x.includes('example.com') && !x.includes('script-src'));
      t.ok(propias.length === 0, propias.length
        ? `${quien} tuvo violaciones de CSP propias: ${propias.join(' | ')}`
        : `${quien} usa la app sin violar el CSP en ningún momento`);
    }

    // ── avisos: permiso, sonido y divisor de mensajes nuevos ──
    t.ok(await A.evaluate(() => prefs.notify === false && prefs.sound === true),
      'los avisos arrancan apagados y el sonido encendido');

    // el navegador headless deniega notificaciones: la app tiene que decirlo
    await A.click('.screen:not([hidden]) [data-home]');
    await A.click('#btn-home-menu'); await A.click('#mi-settings');
    await A.click('#tgl-notify');
    await A.waitForSelector('#toast:not([hidden])', { timeout: 5000 });
    t.ok((await A.textContent('#toast')).includes('bloqueó') &&
         await A.getAttribute('#tgl-notify', 'aria-checked') === 'false',
      'si el navegador niega el permiso, avisa y el switch no queda encendido');

    // con el permiso concedido, el switch prende y queda guardado
    await A.evaluate(() => {
      window.__notes = [];
      window.Notification = function(title, opts){ window.__notes.push(title + ': ' + opts.body); return { close(){} }; };
      window.Notification.permission = 'granted';
      window.Notification.requestPermission = async () => 'granted';
    });
    await A.click('#tgl-notify');
    await A.waitForTimeout(200);
    t.ok(await A.getAttribute('#tgl-notify', 'aria-checked') === 'true' &&
         JSON.parse(await A.evaluate(() => localStorage.getItem('zh:prefs'))).notify === true,
      'con permiso concedido el switch prende y la preferencia persiste');

    await A.click('#settings [data-home]');
    await say(B, 'te aviso algo importante');
    await A.waitForTimeout(600);
    const notes = await A.evaluate(() => window.__notes);
    t.ok(notes.length === 1 && notes[0].includes('te aviso algo importante'),
      `el aviso se dispara con el chat cerrado: "${notes[0] || '(ninguno)'}"`);

    await A.click('.conv');
    t.ok(await A.isVisible('.day.new'), 'al abrir aparece el divisor de MENSAJES NUEVOS');
    await A.click('.screen:not([hidden]) [data-home]');
    await A.click('.conv');
    t.ok(!(await A.isVisible('.day.new')), 'y no vuelve a aparecer la próxima vez');

    // la clave privada ya no se puede exportar
    const robo = await A.evaluate(async () => {
      try { await crypto.subtle.exportKey('jwk', ME.priv); return 'la robé'; }
      catch { return 'no se puede exportar'; }
    });
    t.ok(robo === 'no se puede exportar', 'la clave privada no es extraíble ni desde la propia página');
    t.ok(!(await A.evaluate(() => localStorage.getItem('zh:me'))).includes('privJwk'),
      'no queda ninguna copia de la clave en localStorage');
  }
};
