import { newUser, readQr, qrMatrix, bothInChat, say, lastIn } from '../lib.mjs';

// El QR es el mecanismo para cuando los dos están en el mismo lugar: uno lo
// muestra y el otro lo escanea con la cámara. Acá se prueba con ZXing, el
// decodificador de referencia, que lo que se dibuja se lee de verdad.
export default {
  name: 'QR · mostrar la invitación y la respuesta en pantalla',
  async run(t, env){
    const web = !env.url.startsWith('file:');
    const A = await newUser(env, 'Fernando');
    const B = await newUser(env, 'Luciana');

    // ── el codificador, contra textos de todos los tamaños ──
    const casos = [
      ['una letra', 'x'],
      ['un link corto', 'https://fersca.github.io/ZeroHop/'],
      ['acentos y emojis', 'Nos vemos en lo de Ana 🙂 ñandú'],
      ['300 caracteres', 'a'.repeat(300)],
      ['1000 caracteres', 'b'.repeat(1000)],
      ['2953 caracteres, el máximo', 'c'.repeat(2953)]
    ];
    for (const [nombre, txt] of casos){
      // se dibuja igual que en la app y se lee del DOM, no del cálculo
      const v = await A.evaluate(s => {
        const d = document.createElement('div');
        d.innerHTML = qrSvg(s);
        d.firstElementChild.id = 'qr-prueba';
        document.body.appendChild(d.firstElementChild);
        return qrEncode(s).version;
      }, txt);
      const leido = await readQr(A);
      await A.evaluate(() => document.querySelector('#qr-prueba').remove());
      t.ok(leido === txt, `${nombre} entra en un QR v${v} y se lee entero`);
    }

    t.ok(await A.evaluate(() => { try { qrEncode('z'.repeat(2954)); return false; } catch { return true; } }),
      'un texto más largo que el máximo se rechaza en vez de dibujar un QR roto');

    // ── el QR de la invitación ──
    await A.click('#fab');
    await A.waitForSelector('#offer-out:not([hidden])', { timeout: 25000 });
    const invitacion = await A.inputValue('#offer-out');

    t.ok(await A.isVisible('[data-qr="#offer-out"]'), 'el anfitrión tiene el botón de QR junto a copiar y compartir');
    await A.click('[data-qr="#offer-out"]');
    await A.waitForSelector('#sheet:not([hidden]) .qr', { timeout: 10000 });

    const { lado } = await qrMatrix(A);
    const version = await A.evaluate(s => qrEncode(s).version, invitacion);
    t.ok(lado === version * 4 + 17 + 8, `el QR se dibuja completo: v${version}, ${lado - 8} módulos más la zona muda`);

    const leido = await readQr(A);
    t.ok(leido === invitacion,
      `escanear el QR da exactamente la invitación (${invitacion.length} caracteres)`);
    t.ok(web ? /^https?:.*#i=ZH1/.test(leido) : /^ZH1/.test(leido),
      web ? 'servida por web, el QR trae el link: la cámara lo abre sola'
          : 'como archivo local no hay link, así que el QR trae el código suelto');

    // el QR va negro sobre blanco aunque la app esté en oscuro
    await A.evaluate(() => document.documentElement.dataset.theme = 'dark');
    const fondo = await A.$eval('.qr rect', r => r.getAttribute('fill'));
    t.ok(fondo === '#fff', 'el QR queda negro sobre blanco también con el tema oscuro');
    await A.evaluate(() => document.documentElement.dataset.theme = 'light');

    await A.click('#sheet [data-close-sheet]');
    t.ok(await A.isHidden('#sheet'), 'se cierra con el botón');

    // el mismo botón sirve para el código suelto, para quien abre el HTML local
    if (web){
      await A.click('[data-fmt="#offer-out"]');
      const suelto = await A.inputValue('#offer-out');
      await A.click('[data-qr="#offer-out"]');
      await A.waitForSelector('#sheet:not([hidden]) .qr', { timeout: 10000 });
      const leidoSuelto = await readQr(A);
      t.ok(suelto.startsWith('ZH1') && leidoSuelto === suelto,
        'con "Ver código suelto" el QR pasa a traer el código pelado');
      await A.click('#sheet [data-close-sheet]');
      await A.click('[data-fmt="#offer-out"]');
    }

    // ── B "escanea": usa lo que salió del QR, no lo que había en pantalla ──
    if (web) await B.goto(leido);
    else {
      await B.click('#btn-home-menu');
      await B.click('#mi-join');
      await B.fill('#offer-in', leido);
      await B.click('#btn-make-answer');
    }
    await B.waitForSelector('#guest-step2:not([hidden])', { timeout: 25000 });

    // ── y el QR de la respuesta, para la vuelta ──
    const respuesta = await B.inputValue('#answer-out');
    t.ok(await B.isVisible('[data-qr="#answer-out"]'), 'quien se une también puede mostrar su respuesta como QR');
    await B.click('[data-qr="#answer-out"]');
    await B.waitForSelector('#sheet:not([hidden]) .qr', { timeout: 10000 });
    const vuelta = await readQr(B);
    t.ok(vuelta === respuesta, 'el QR de la respuesta también se lee entero');
    await B.click('#sheet [data-close-sheet]');

    await A.fill('#answer-in', vuelta);
    await A.click('#btn-connect-host');
    await bothInChat(A, B);
    t.ok(true, 'la conversación queda abierta habiendo pasado los dos códigos solo por QR');

    await say(A, 'llegamos sin copiar ni pegar nada');
    await B.waitForFunction(() => document.querySelectorAll('.row.in .bubble').length > 0, null, { timeout: 15000 });
    t.ok((await lastIn(B)).includes('sin copiar ni pegar'), 'y los mensajes viajan por el canal directo');
  }
};
