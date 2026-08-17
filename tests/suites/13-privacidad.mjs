import { newUser, connectByLink, connectByPaste, say, PNG } from '../lib.mjs';

// La promesa del producto es una sola: nada de lo que se dice pasa por un
// servidor. Esto lo audita de verdad — mira TODO el tráfico HTTP de la pestaña
// mientras se conversa, y revisa qué queda guardado en el navegador.
export default {
  name: 'Privacidad · auditoría del tráfico y de lo que queda guardado',
  web: true,      // necesita links y origen http para que el audit tenga sentido
  async run(t, env){
    const A = await newUser(env, 'Fernando');
    const B = await newUser(env, 'Luciana');

    // todo lo que las dos pestañas le piden a la red, desde ahora
    const pedidos = [];
    const espiar = (page, quién) => page.on('request', r =>
      pedidos.push({ quién, url: r.url(), método: r.method(), body: r.postData() || '' }));
    espiar(A, 'A'); espiar(B, 'B');

    const secreto = 'contraseña-del-banco-747';
    const link = await connectByLink(A, B);
    await say(A, secreto);
    await B.waitForSelector('.row.in .bubble', { timeout: 10000 });
    await B.setInputFiles('#file', { name: 'secreto.png', mimeType: 'image/png', buffer: PNG });
    await A.waitForSelector('.row.in img.photo', { timeout: 15000 });
    await A.waitForTimeout(600);

    const origen = new URL(env.url).origin;
    const ajenos = pedidos.filter(p => !p.url.startsWith(origen) && !p.url.startsWith('data:') && !p.url.startsWith('blob:'));
    t.ok(ajenos.length === 0,
      ajenos.length ? `hubo tráfico a terceros: ${ajenos.map(p => p.url).join(', ')}`
                    : `ni un pedido a un tercero en toda la conversación (${pedidos.length} pedidos, todos a ${origen})`);

    const conCuerpo = pedidos.filter(p => p.body);
    t.ok(conCuerpo.length === 0,
      conCuerpo.length ? `alguien mandó un POST: ${conCuerpo[0].url}` : 'no se sube nada: no hay un solo POST');

    const rastro = pedidos.filter(p => (p.url + p.body).includes(secreto) || /ZH[01][A-Za-z0-9_-]{16,}/.test(p.url + p.body));
    t.ok(rastro.length === 0,
      rastro.length ? `el contenido se filtró en ${rastro[0].url}` : 'ni el mensaje ni el código de invitación aparecen en ningún pedido');

    // el link lleva el código en el fragmento: el navegador nunca lo manda al servidor
    t.ok(link.includes('#i=') && !/[?&]i=/.test(link),
      'la invitación viaja en el fragmento del link (#), que no se envía al servidor');
    // esto se mira del lado del servidor de prueba: lo que de verdad llegó por HTTP
    const alServidor = env.hits || [];
    t.ok(alServidor.length > 0 && !alServidor.some(h => /ZH[01][A-Za-z0-9_-]{16,}/.test(h) || h.includes('#')),
      `el servidor recibió ${alServidor.length} pedidos y en ninguno viajó el código`);
    t.ok(!/i=/.test(await B.evaluate(() => location.hash + location.search)),
      'después de usarla, el código se limpia de la barra de direcciones');

    // ── nada de esto queda escrito en el navegador ──
    const guardado = await A.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
    t.ok(!guardado.includes('contraseña-del-banco'), 'los mensajes no se guardan en localStorage');
    t.ok(!/"privJwk"|"d":/.test(guardado), 'y la clave privada no está en localStorage (vive en IndexedDB, no exportable)');
    t.ok(await A.evaluate(() => document.cookie === ''), 'la app no usa una sola cookie');

    // la clave privada no se puede sacar del navegador ni con la consola abierta
    const exporta = await A.evaluate(async () => {
      try { await crypto.subtle.exportKey('jwk', await idbGet('priv')); return 'la exportó'; }
      catch (e){ return e.name; }
    });
    t.ok(exporta !== 'la exportó', `la clave privada no es exportable ni desde la consola (${exporta})`);

    // ── al recargar no queda historia: los mensajes son de esta sesión ──
    await A.reload();
    await A.waitForSelector('#home:not([hidden])', { timeout: 15000 });
    const tras = await A.evaluate(() => ({
      convs: [...convs.values()].map(c => ({ mensajes: c.msgs.length, estado: c.status, nombre: c.name })),
      texto: document.body.innerText
    }));
    t.ok(tras.convs.length === 1 && tras.convs[0].mensajes === 0,
      'al recargar, el contacto sigue pero la conversación arranca vacía');
    t.ok(!tras.texto.includes('contraseña-del-banco'),
      'no queda ni una línea de lo hablado en la pantalla');
    t.ok(tras.convs[0].estado === 'offline',
      'y la conexión hay que rehacerla: no hay nada guardado que la reviva sola');

    // ── los archivos recibidos tampoco sobreviven ──
    const enDisco = await A.evaluate(async () => {
      try {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle('zerohop-files', { create: true });
        let n = 0;
        for await (const _ of dir.keys()) n++;
        return n;
      } catch { return 0; }
    });
    t.ok(enDisco === 0, `no quedan archivos recibidos en el disco del navegador (${enDisco})`);

    // ── el modo incógnito / dos perfiles: cada uno con su identidad ──
    const C = await newUser(env, 'Otro perfil');
    const ids = await Promise.all([A.evaluate(() => ME.fp), C.evaluate(() => ME.fp)]);
    t.ok(ids[0] !== ids[1], 'cada perfil del navegador tiene su propia identidad, no una global');

    // ── el aviso al salir con la conversación abierta ──
    const D = await newUser(env, 'Vecina');
    await connectByPaste(C, D);
    t.ok(await C.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true });
      dispatchEvent(e);
      return e.defaultPrevented;
    }), 'si cerrás la pestaña con una conversación viva, el navegador te pregunta antes');
  }
};
