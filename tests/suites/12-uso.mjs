import { newUser, connectByPaste, say, home, PNG } from '../lib.mjs';

// Uso real y de todos los días: muchas conversaciones, muchos mensajes, la
// pantalla scrolleada, el buscador, los emojis, el tema, borrar todo. Cosas
// que un test de "se conectan y se saludan" no toca nunca.
export default {
  name: 'Uso diario · volumen, scroll, buscador, emojis, tema y borrado',
  async run(t, env){
    const A = await newUser(env, 'Fernando');
    const B = await newUser(env, 'Luciana');
    await connectByPaste(A, B);

    // ── 300 mensajes seguidos: la conversación larga no se pierde ni se traba ──
    const N = 300;
    const t0 = Date.now();
    await B.evaluate(async n => {
      const ta = document.querySelector('#input');
      for (let i = 1; i <= n; i++){
        ta.value = 'mensaje ' + i;
        sendText();
        if (i % 20 === 0) await new Promise(r => setTimeout(r));   // deja respirar al canal
      }
    }, N);
    await A.waitForFunction(n => [...convs.values()][0].msgs.filter(m => m.dir === 'in').length >= n,
      N, { timeout: 40000 });
    const tardó = Date.now() - t0;
    t.ok(true, `${N} mensajes seguidos llegan completos en ${(tardó / 1000).toFixed(1)}s`);
    const filas = await A.$$eval('.row.in', ns => ns.length);
    t.ok(filas >= N, `y se dibujan las ${N} burbujas (${filas})`);
    t.ok((await A.$eval('.row.in:last-of-type .bubble', n => n.innerText)).includes('mensaje ' + N),
      'el último mensaje es el último enviado, en orden');
    t.ok(await A.evaluate(() => {
      const m = document.querySelector('#msgs');
      return m.scrollHeight - m.scrollTop - m.clientHeight < 140;
    }), 'la pantalla queda abajo, mirando lo último que llegó');

    // ── una palabra kilométrica no rompe el ancho de la pantalla ──
    await say(B, 'a'.repeat(400));
    await A.waitForTimeout(500);
    const ancho = await A.evaluate(() => {
      const m = document.querySelector('#msgs');
      return { desborda: m.scrollWidth - m.clientWidth, doc: document.documentElement.scrollWidth <= innerWidth + 1 };
    });
    t.ok(ancho.desborda <= 1 && ancho.doc,
      `una palabra de 400 letras no genera scroll horizontal (sobra ${ancho.desborda}px)`);

    // ── leído: solo cuando el otro está mirando el final ──
    await A.evaluate(() => { document.querySelector('#msgs').scrollTop = 0; });
    await A.waitForTimeout(200);
    await say(B, '¿estás ahí?');
    await A.waitForTimeout(900);
    const arriba = await B.$eval('.row.out:last-of-type .meta', n => n.className);
    t.ok(!/read/.test(arriba), 'si el otro está leyendo más arriba, el mensaje no figura como leído');
    await A.evaluate(() => { const m = document.querySelector('#msgs'); m.scrollTop = m.scrollHeight; });
    await A.waitForTimeout(800);
    t.ok(await B.$eval('.row.out:last-of-type .meta', n => n.classList.contains('read')),
      'cuando baja hasta el final, la tilde pasa a leído sola');

    // ── "escribiendo…" se apaga si el otro se queda pensando ──
    await B.click('#input');
    await B.type('#input', 'pensando', { delay: 15 });
    await A.waitForSelector('#typing-row', { timeout: 8000 });
    await B.fill('#input', '');                          // abandona el mensaje
    await A.waitForFunction(() => !document.querySelector('#typing-row'), null, { timeout: 8000 });
    t.ok(true, 'el "escribiendo…" se apaga solo si el otro deja de tipear');

    // ── emojis ──
    await B.click('#btn-emoji');
    t.ok(await B.isVisible('#emoji'), 'el cajón de emojis se abre');
    await B.click('#emoji button:first-child');
    t.ok(await B.inputValue('#input') === '😀', 'el emoji se mete en el mensaje');
    await B.click('#msgs');
    t.ok(!(await B.isVisible('#emoji')), 'y se cierra al tocar afuera');
    await B.press('#input', 'Enter');
    await A.waitForTimeout(400);
    t.ok((await A.$eval('.row.in:last-of-type .bubble', n => n.innerText)).includes('😀'),
      'el emoji llega del otro lado');

    // ── imagen: se ve en la burbuja y se abre en grande ──
    await B.setInputFiles('#file', { name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    await A.waitForSelector('.row.in img.photo', { timeout: 15000 });
    await A.click('.row.in img.photo');
    t.ok(await A.isVisible('#lightbox'), 'la imagen se abre a pantalla completa');
    await A.keyboard.press('Escape');
    t.ok(!(await A.isVisible('#lightbox')), 'y Escape la cierra');

    // ── Escape también cierra los menús ──
    await A.click('#btn-menu');
    t.ok(await A.isVisible('#menu'), 'el menú del chat se abre');
    await A.keyboard.press('Escape');
    t.ok(!(await A.isVisible('#menu')), 'y Escape lo cierra');

    // ── archivos raros: vacío, nombre largo con emojis, y los dos a la vez ──
    await B.setInputFiles('#file', { name: 'vacío.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) });
    await A.waitForFunction(() => [...convs.values()][0].msgs.some(m => m.name === 'vacío.txt' && m.done),
      null, { timeout: 15000 });
    t.ok((await A.$$eval('.att .sz', ns => ns.map(n => n.textContent))).includes('0 B'),
      'un archivo vacío llega y se muestra como 0 B');

    const raro = '🎉 informe (v2) — ünïcödé & símbolos #1.txt';
    await B.setInputFiles('#file', { name: raro, mimeType: 'text/plain', buffer: Buffer.from('contenido') });
    await A.waitForFunction(n => [...convs.values()][0].msgs.some(m => m.name === n && m.done),
      raro, { timeout: 15000 });
    t.ok((await A.$$eval('.att .nm', ns => ns.map(n => n.textContent))).includes(raro),
      'un nombre con emojis, acentos y símbolos llega intacto');

    // un nombre kilométrico se recorta, pero la extensión sobrevive: si no, el
    // archivo guardado no lo abre ningún programa
    const largo = 'contrato ' + 'muy largo '.repeat(12) + 'final.pdf';
    await B.setInputFiles('#file', { name: largo, mimeType: 'application/pdf', buffer: Buffer.from('pdf') });
    await A.waitForFunction(() => {
      const m = [...convs.values()][0].msgs.filter(x => /^contrato/.test(x.name || '')).pop();
      return m && m.done;
    }, null, { timeout: 15000 });
    const recortado = await A.evaluate(() =>
      [...convs.values()][0].msgs.filter(x => /^contrato/.test(x.name || '')).pop().name);
    t.ok(recortado.length <= 70 && recortado.endsWith('.pdf') && recortado.length < largo.length,
      `un nombre de ${largo.length} caracteres se recorta a ${recortado.length} y conserva el .pdf`);

    // cruzados al mismo tiempo, uno para cada lado
    const mediano = Buffer.alloc(400 * 1024, 7);
    await Promise.all([
      A.setInputFiles('#file', { name: 'de-fernando.bin', mimeType: 'application/octet-stream', buffer: mediano }),
      B.setInputFiles('#file', { name: 'de-luciana.bin', mimeType: 'application/octet-stream', buffer: mediano })
    ]);
    const llegó = (p, n) => p.waitForFunction(x => {
      const m = [...convs.values()][0].msgs.find(y => y.name === x && y.dir === 'in');
      return !!(m && m.done && m.blob && m.blob.size === 409600);
    }, n, { timeout: 30000 });
    await Promise.all([llegó(A, 'de-luciana.bin'), llegó(B, 'de-fernando.bin')]);
    t.ok(true, 'dos archivos de 400 KB cruzándose al mismo tiempo llegan enteros y con el tamaño exacto');

    // ── transferencia cortada por la mitad: se avisa, no queda colgada ──
    const grande = Buffer.alloc(6 * 1024 * 1024, 3);
    await B.setInputFiles('#file', { name: 'grande.bin', mimeType: 'application/octet-stream', buffer: grande });
    await A.waitForFunction(() => {
      const c = [...convs.values()][0];
      return c.incoming && c.incoming.got > 200000;
    }, null, { timeout: 20000 });
    await B.evaluate(() => { window.confirm = () => true; });
    await B.click('#btn-menu'); await B.click('#mi-hang');
    await A.waitForTimeout(1200);
    const cortado = await A.evaluate(() => {
      const m = [...convs.values()][0].msgs.filter(x => x.name === 'grande.bin').pop();
      return { problem: m && m.problem, done: m && !!m.done };
    });
    t.ok(/cortó/i.test(cortado.problem || '') && !cortado.done,
      `un archivo a medio recibir queda marcado como cortado ("${cortado.problem}")`);
    t.ok((await A.$$eval('.prob', ns => ns.map(n => n.textContent))).some(x => /cortó/i.test(x)),
      'y el aviso se ve en la burbuja, no solo en los datos');

    // ── buscador: aparece con 5 o más y filtra ──
    const contactos = ['Ana', 'Beto', 'Carla', 'Diego', 'Elena', 'Ana María'].map((n, i) => ({
      id: (i + 1).toString().repeat(16).slice(0, 16), name: n, jwk: null, phone: '', lastSeen: 0, verified: false
    }));
    // se siembra una sola vez: el initScript corre en cada navegación y si no
    // los contactos volverían solos después de borrar todo
    const S = await newUser(env, 'Sofía', {
      initScript: `if (!sessionStorage.getItem('zh-test-seed')){
        sessionStorage.setItem('zh-test-seed', '1');
        localStorage.setItem('zh:contacts', ${JSON.stringify(JSON.stringify(contactos))});
      }`
    });
    t.ok(await S.$$eval('#list .conv', ns => ns.length) === 6, 'los contactos guardados vuelven a aparecer en la lista');
    t.ok(await S.isVisible('#searchbar'), 'con 6 conversaciones aparece el buscador');
    await S.fill('#search', 'ana');
    await S.waitForTimeout(150);
    const filtrado = await S.$$eval('#list .conv .nm', ns => ns.map(n => n.textContent.trim()));
    t.ok(filtrado.length === 2 && filtrado.every(x => /ana/i.test(x)),
      `el buscador filtra sin importar mayúsculas (${filtrado.join(', ')})`);
    await S.fill('#search', 'zzzz');
    await S.waitForTimeout(150);
    t.ok((await S.textContent('#list')).includes('Sin resultados'),
      'y si no coincide nada lo dice en vez de mostrar la lista vacía');
    await S.fill('#search', '');

    // ── tema: se elige una vez y queda ──
    const antes = await S.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await S.click('#btn-home-menu');
    await S.click('#mi-theme-home');
    const después = await S.evaluate(() => document.documentElement.getAttribute('data-theme'));
    t.ok(antes !== después, `el tema cambia (${antes} → ${después})`);
    await S.reload();
    await S.waitForSelector('#home:not([hidden])', { timeout: 15000 });
    t.ok(await S.evaluate(() => document.documentElement.getAttribute('data-theme')) === después,
      'y sobrevive a recargar la página');

    // ── borrar todo: identidad nueva, sin contactos, y vuelve a preguntar el nombre ──
    const viejoId = await S.evaluate(() => ME.fp);
    await S.evaluate(() => { window.confirm = () => true; });
    await S.click('#btn-home-menu'); await S.click('#mi-settings');
    await S.click('#btn-wipe');
    await S.waitForSelector('#welcome:not([hidden])', { timeout: 20000 });
    t.ok(true, 'borrar todo deja la app como recién instalada, pidiendo el nombre');
    const limpio = await S.evaluate(async () => ({
      contactos: JSON.parse(localStorage.getItem('zh:contacts') || '[]').length,
      convs: convs.size,
      me: localStorage.getItem('zh:me'),
      nuevoId: ME.fp,
      claves: await new Promise(r => {
        const req = indexedDB.open('zerohop');
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('kv')) return r(0);
          const q = db.transaction('kv').objectStore('kv').count();
          q.onsuccess = () => r(q.result);
          q.onerror = () => r(-1);
        };
        req.onerror = () => r(-1);
      })
    }));
    t.ok(limpio.contactos === 0 && limpio.convs === 0 && limpio.nuevoId !== viejoId,
      `los seis contactos se van y la identidad es otra (${viejoId.slice(0, 8)}… → ${limpio.nuevoId.slice(0, 8)}…)`);
    t.ok(limpio.claves === 0, `la clave privada se borra de IndexedDB (${limpio.claves} entradas)`);
    t.ok(await S.inputValue('#wel-name') === '' && !(await S.evaluate(() => localStorage.getItem('zh:name'))),
      'y el nombre también: la pantalla de bienvenida arranca vacía');
  }
};
