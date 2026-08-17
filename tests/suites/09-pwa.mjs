import { newUser, connectByLink, say, home } from '../lib.mjs';

const MOBILE = { width: 360, height: 640 };

export default {
  name: 'Primer uso, PWA y mobile',
  web: true,      // necesita http(s): links, service worker y almacenamiento por pestaña
  async run(t, env){
    const local = env.url.startsWith('file:');

    // ── primer uso ──
    const ctx = await env.browser.newContext({ viewport: MOBILE });
    const A = await ctx.newPage();
    A.on('pageerror', e => env.jsErrors.push('A: ' + e.message));
    await A.goto(env.url);
    t.ok(await A.isVisible('#welcome'), 'la primera vez aparece la bienvenida');
    t.ok(await A.getAttribute('#wel-go', 'disabled') !== null, 'no se puede entrar sin poner un nombre');
    const bullets = await A.$$eval('.wel-list li', ns => ns.length);
    t.ok(bullets === 3, 'explica en tres puntos qué es y qué necesita');

    await A.fill('#wel-name', 'Fernando');
    await A.click('#wel-go');
    await A.waitForSelector('#home:not([hidden])', { timeout: 10000 });
    t.ok(await A.textContent('#me-av') === 'F', 'el nombre queda puesto sin pasar por Ajustes');
    t.ok(await A.evaluate(() => ME.name) === 'Fernando' &&
         JSON.parse(await A.evaluate(() => localStorage.getItem('zh:me'))).name === 'Fernando',
      'y persiste en la identidad');

    await A.reload();
    await A.waitForSelector('#home:not([hidden])', { timeout: 10000 });
    t.ok(!(await A.isVisible('#welcome')), 'la bienvenida no vuelve a aparecer');

    // quien llega por una invitación ve la variante del texto
    const ctx2 = await env.browser.newContext({ viewport: MOBILE });
    const B = await ctx2.newPage();
    B.on('pageerror', e => env.jsErrors.push('B: ' + e.message));
    await B.goto(env.url + '#i=ZH1inventadoperolargoparaquepase');
    await B.waitForSelector('#welcome:not([hidden])', { timeout: 10000 });
    t.ok((await B.textContent('#wel-title')).includes('invitaron') &&
         (await B.textContent('#wel-go')).includes('Unirme'),
      'a quien llega por link le habla de la invitación');
    await B.close();

    // ── mobile: nada se desborda y el compositor entra ──
    const C = await newUser(env, 'Luciana');
    await C.setViewportSize(MOBILE);
    await A.setViewportSize(MOBILE);
    await connectByLink(A, C);
    const layout = await A.evaluate(() => ({
      scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      composer: document.getElementById('composer').getBoundingClientRect().bottom <= innerHeight + 1,
      alto: getComputedStyle(document.querySelector('.app')).height
    }));
    t.ok(layout.scrollX <= 0, `a 360px no hay desborde horizontal (${layout.scrollX}px)`);
    t.ok(layout.composer, 'el compositor entra en la pantalla');
    t.info('alto de la app: ' + layout.alto);

    // ── accesibilidad ──
    await say(C, 'hola, ¿me escuchás?');
    await A.waitForTimeout(400);
    t.ok((await A.textContent('#live')).includes('hola, ¿me escuchás?'),
      'los mensajes entrantes se anuncian por aria-live');
    const sinLabel = await A.$$eval('button[title], a[title]',
      ns => ns.filter(n => !n.getAttribute('aria-label')).length);
    t.ok(sinLabel === 0, 'todos los botones de ícono tienen aria-label');
    const rol = await A.$eval('#live', n => n.getAttribute('role') + '/' + n.getAttribute('aria-live'));
    t.ok(rol === 'status/polite', 'la región de anuncios está bien declarada');

    // ── avisarle por WhatsApp que se conecte ──
    await A.evaluate(() => linkDown([...convs.values()][0], 'corte de prueba', true));
    await A.waitForTimeout(300);
    t.ok(await A.isVisible('#wa-ping'), 'sin conexión aparece el botón para avisarle');
    const href = await A.getAttribute('#wa-ping', 'href');
    t.ok(href.startsWith('https://wa.me/') && decodeURIComponent(href).includes('conectás a ZeroHop'),
      'el mensaje le pide que se conecte');
    if (!local) t.ok(decodeURIComponent(href).includes(new URL(env.url).origin),
      'y le manda la dirección de la app');

    // ── PWA ──
    if (local){
      t.ok(await A.evaluate(() => !('serviceWorker' in navigator) ||
        navigator.serviceWorker.controller === null), 'en file:// no se registra service worker');
      return;
    }

    const man = await A.evaluate(async () => {
      const r = await fetch('manifest.json');
      return r.ok ? await r.json() : null;
    });
    t.ok(man && man.display === 'standalone' && man.start_url === '.' && man.icons.length >= 2,
      `el manifest declara la app instalable (${man ? man.name : 'no se pudo leer'})`);
    t.ok(await A.$eval('link[rel=manifest]', l => l.getAttribute('href')) === 'manifest.json',
      'la página enlaza el manifest');
    t.ok((await A.$$eval('meta[name=theme-color]', ns => ns.length)) === 2,
      'declara theme-color para tema claro y oscuro');

    const iconos = await A.evaluate(async () => {
      const out = {};
      for (const f of ['icon-192.png', 'icon-512.png']){
        const r = await fetch(f);
        out[f] = r.ok && (r.headers.get('content-type') || '').includes('png');
      }
      return out;
    });
    t.ok(Object.values(iconos).every(Boolean), 'los iconos se sirven como PNG');

    const sw = await A.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return null;
      await navigator.serviceWorker.ready;
      return { scope: reg.scope, activo: !!reg.active };
    });
    t.ok(sw && sw.activo, 'el service worker queda registrado y activo');

    const cacheado = await A.evaluate(async () => {
      const ks = await caches.keys();
      if (!ks.length) return null;
      const c = await caches.open(ks[0]);
      return (await c.keys()).map(r => new URL(r.url).pathname.split('/').pop() || 'index.html');
    });
    t.ok(cacheado && cacheado.some(x => x.includes('index.html') || x === ''),
      `el shell queda en cache para abrir sin conexión (${(cacheado || []).join(', ')})`);
  }
};
