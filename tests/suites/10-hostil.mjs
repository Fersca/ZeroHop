import { newUser, connectByPaste, raw, say } from '../lib.mjs';

// El otro lado del canal es código que no controlamos. Puede tener bugs, una
// versión distinta, o querer hacer daño a propósito. Nada de lo que manda
// debería romper la app, colarse como HTML ni conseguir un sello de verificado.
export default {
  name: 'Par hostil o con bugs · nada de lo que llega rompe la app',
  async run(t, env){
    const A = await newUser(env, 'Fernando');
    const B = await newUser(env, 'Luciana');
    await connectByPaste(A, B);
    await A.waitForTimeout(600);

    const burbujas = () => A.$$eval('.row', ns => ns.length);
    const antes = await burbujas();

    // ── basura pura ──
    for (const basura of [
      'esto no es json',
      '{"roto":',
      '[]', 'null', '"solo un string"', '42',
      JSON.stringify({ sinTipo: true }),
      JSON.stringify({ t: 'inventado', payload: 'x' }),
      JSON.stringify({ t: 'msg' }),                          // sin id ni texto
      JSON.stringify({ t: 'msg', id: null, text: null }),
      JSON.stringify({ t: 'ack', id: 'no-existe', s: 'read' }),
      JSON.stringify({ t: 'fend', id: 'nunca-empezo' }),
      JSON.stringify({ t: 'proof' }),
      JSON.stringify({ t: 'typing' })
    ]) await raw(B, basura);          // la manda Luciana, la recibe Fernando
    await A.waitForTimeout(700);
    t.ok(env.jsErrors.length === 0, env.jsErrors.length
      ? `basura del par rompió algo: ${env.jsErrors[0]}`
      : 'trece mensajes basura no generan un solo error');

    // el {t:'msg'} sin nada sí crea una burbuja vacía, y eso está bien: es un
    // mensaje. Lo que importa es que la app siga viva y respondiendo.
    await say(B, 'sigo funcionando');
    await A.waitForTimeout(500);
    t.ok((await A.$$eval('.row.in .bubble', ns => ns.map(n => n.innerText))).pop().includes('sigo funcionando'),
      'después de la basura la conversación sigue andando');
    t.ok(await burbujas() > antes, 'las burbujas siguen apareciendo');

    // ── binario sin metadatos, y metadatos absurdos ──
    await B.evaluate(() => {
      const c = [...convs.values()][0];
      c.dc.send(new Uint8Array(2048));                       // chunk sin fmeta
      c.dc.send(JSON.stringify({ t: 'fmeta', id: 'raro1', name: 'x', size: -5, mime: '' }));
      c.dc.send(JSON.stringify({ t: 'fmeta', id: 'raro2', name: 'y', size: 'muchos', mime: '' }));
    });
    await A.waitForTimeout(700);
    t.ok(env.jsErrors.length === 0, 'un chunk sin metadatos y tamaños absurdos no rompen nada');
    const tam = await A.$$eval('.row.in .att .sz', ns => ns.map(n => n.textContent));
    t.ok(tam.every(x => !/NaN|-/.test(x)), `los tamaños raros se muestran sanos (${tam.join(', ')})`);

    // ── texto gigante: se recorta ──
    const largo = 'x'.repeat(20000);
    await raw(B, { t: 'msg', id: 'gigante', text: largo, ts: Date.now() });
    await A.waitForTimeout(400);
    const guardado = await A.evaluate(() => {
      const c = [...convs.values()][0];
      return (c.msgs.find(m => m.id === 'gigante') || {}).text.length;
    });
    t.ok(guardado === 8000, `un mensaje de 20.000 caracteres se recorta a 8.000 (quedó en ${guardado})`);

    // ── ids repetidos: con uno alcanza ──
    const conteo = () => A.evaluate(() => [...convs.values()][0].msgs.length);
    const c1 = await conteo();
    for (let i = 0; i < 3; i++) await raw(B, { t: 'msg', id: 'repetido', text: 'hola', ts: Date.now() });
    await A.waitForTimeout(400);
    t.ok(await conteo() === c1 + 1, 'un id repetido tres veces deja un solo mensaje');

    // ── HTML en el nombre del contacto ──
    await B.evaluate(() => {
      ME.name = '<img src=x onerror="window.__pwned=1">';
      const c = [...convs.values()][0];
      c.dc.send(JSON.stringify({ t: 'hello', name: ME.name, pub: ME.jwk, nonce: 'n1' }));
    });
    await A.waitForTimeout(600);
    t.ok(await A.textContent('#peer-name') === '<img src=x onerror="window.__pwned=1">',
      'el nombre hostil se muestra como texto, no como HTML');
    t.ok(await A.evaluate(() => !window.__pwned && !document.querySelector('#peer-name img')),
      'y no ejecuta nada ni inyecta elementos');
    await A.click('.screen:not([hidden]) [data-home]');
    t.ok(await A.evaluate(() => !document.querySelector('.conv img')),
      'tampoco se cuela en la lista de conversaciones');
    await A.click('.conv');

    // ── HTML y rutas en el nombre de archivo ──
    await B.setInputFiles('#file', {
      name: '<b>x</b>_..%2F..%2Fetc%2Fpasswd.txt', mimeType: 'text/plain', buffer: Buffer.from('hola')
    });
    await A.waitForSelector('.row.in .att .dl', { timeout: 15000 });
    const nombre = await A.$eval('.row.in:last-of-type .att', n => ({
      texto: n.querySelector('.nm').textContent,
      html: !!n.querySelector('.nm b')
    }));
    t.ok(!nombre.html && nombre.texto.includes('<b>x</b>'),
      'el nombre de archivo con HTML se muestra escapado');

    // ── firma falsa: no alcanza para el sello ──
    await B.evaluate(() => {
      const c = [...convs.values()][0];
      c.dc.send(JSON.stringify({ t: 'hello', name: 'Luciana', pub: ME.jwk, nonce: 'nonce-falso' }));
      setTimeout(() => c.dc.send(JSON.stringify({ t: 'proof', sig: btoa('firma inventada'.repeat(6)) })), 250);
    });
    await A.waitForTimeout(1200);
    t.ok(await A.evaluate(() => [...convs.values()][0].verified === false),
      'una firma inventada deja la identidad SIN verificar');
    t.ok(!(await A.isVisible('#peer-verified')), 'y el sello desaparece de la barra');

    // ── decir ser otro ID no sirve: manda la clave ──
    const idReal = await B.evaluate(() => ME.fp);
    await B.evaluate(() => {
      const c = [...convs.values()][0];
      c.dc.send(JSON.stringify({ t: 'hello', id: 'deadbeefdeadbeef', name: 'Luciana', pub: ME.jwk, nonce: 'n2' }));
    });
    await A.waitForTimeout(700);
    const visto = await A.evaluate(() => [...convs.values()].map(c => c.id));
    t.ok(visto.includes(idReal) && !visto.includes('deadbeefdeadbeef'),
      'el id se recalcula de la clave pública: no se cree el que dice ser');

    t.ok(env.jsErrors.length === 0, 'todo el ataque no dejó un solo error de JS');
  }
};
