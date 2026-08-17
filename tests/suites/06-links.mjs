import { newUser, connectByPaste, bothInChat } from '../lib.mjs';

export default {
  name: 'Links y WhatsApp · invitación, respuesta y navegador embebido',
  web: true,      // necesita http(s): links, service worker y almacenamiento por pestaña
  async run(t, env){
    const A = await newUser(env, 'Fernando', { phone: '+54 9 11 5555 1234' });
    const B = await newUser(env, 'Luciana',  { phone: '+54 9 11 4444 9876' });

    // ── invitación por link ──
    await A.click('#fab');
    await A.waitForSelector('#offer-out:not([hidden])', { timeout: 25000 });
    const link = await A.inputValue('#offer-out');
    t.ok(/#i=ZH1/.test(link), `la invitación es un link con el código en el fragmento (${link.length} chars)`);

    let wa = await A.getAttribute('#wa-invite', 'href');
    t.ok(wa.startsWith('https://wa.me/?text='), 'sin teléfono cargado abre el selector de contactos');
    await A.fill('#peer-phone', '+54 9 11 4444 9876');
    wa = await A.getAttribute('#wa-invite', 'href');
    t.ok(wa.startsWith('https://wa.me/5491144449876?text='), 'con teléfono abre directo su chat');
    const texto = decodeURIComponent(wa.split('?text=')[1]);
    t.ok(texto.includes('línea segura') && texto.includes('#i=ZH1'), 'el mensaje se autoexplica y lleva el link');

    // ── B entra por el link ──
    await B.goto(link);
    await B.waitForSelector('#guest-step2:not([hidden])', { timeout: 25000 });
    t.ok(await B.evaluate(() => location.hash === ''), 'el fragmento se limpia de la barra de direcciones');
    t.ok(!(await B.isVisible('#guest-offer-field')), 'a quien entra por link no se le pide pegar nada');

    const back = await B.getAttribute('#wa-answer', 'href');
    t.ok(back.startsWith('https://wa.me/5491155551234?text='),
      'la respuesta vuelve al chat del anfitrión: su teléfono viajó en la invitación');
    t.ok(decodeURIComponent(back.split('?text=')[1]).includes('#r=ZH1'), 'el link de respuesta lleva el código');

    // ── el anfitrión abre la respuesta en una pestaña nueva ──
    const answerLink = await B.inputValue('#answer-out');
    const otra = await A.context().newPage();
    await otra.goto(answerLink);
    await otra.waitForSelector('#relay-ok:not([hidden])', { timeout: 12000 });
    t.ok(/pasé a la pestaña/i.test(await otra.textContent('#relay-sub')),
      'la pestaña nueva le pasa la respuesta a la que invitó');
    await bothInChat(A, B);
    t.ok(true, 'la pestaña original conecta sola');

    // el teléfono queda en la agenda
    t.ok(await A.evaluate(() => [...convs.values()][0].phone) !== '', 'el teléfono queda guardado en el contacto');
    t.ok(JSON.parse(await A.evaluate(() => localStorage.getItem('zh:contacts')))[0].phone !== '',
      'y persiste entre sesiones');

    // ── comparar el código de seguridad por WhatsApp ──
    await A.click('#btn-menu');
    await A.click('#mi-safety');
    await A.waitForSelector('.safety');
    const codigo = (await A.textContent('.safety')).trim();
    const cmp = await A.getAttribute('.sheet-in .btn-wa', 'href');
    t.ok(cmp.includes('5491144449876') && decodeURIComponent(cmp).includes(codigo),
      'el botón manda el código de seguridad al chat correcto');
    await A.keyboard.press('Escape');

    // ── los dos ven el mismo código ──
    await B.click('#btn-menu');
    await B.click('#mi-safety');
    await B.waitForSelector('.safety');
    t.ok((await B.textContent('.safety')).trim() === codigo, `los dos lados calculan el mismo código (${codigo})`);
    await B.keyboard.press('Escape');

    // ── código suelto para quien usa el archivo local ──
    const C = await newUser(env, 'Martín');
    const D = await newUser(env, 'Sofía');
    await connectByPaste(C, D);
    t.ok(true, 'el modo código suelto sigue funcionando');

    // ── navegador embebido de WhatsApp ──
    const E = await newUser(env, 'Ana', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 WhatsApp/2.24'
    });
    await E.click('#fab');
    await E.waitForSelector('#card-host:not([hidden])');
    t.ok(await E.isVisible('#inapp-note'), 'detecta que se abrió dentro de otra app y avisa');
    await E.click('#btn-inapp-dismiss');
    t.ok(!(await E.isVisible('#inapp-note')), 'el aviso se puede descartar');
  }
};
