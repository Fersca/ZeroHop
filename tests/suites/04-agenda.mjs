import { newUser, connectByLink, say, home } from '../lib.mjs';

export default {
  name: 'Agenda · persistencia, reinvitar e identidad',
  async run(t, env){
    const A = await newUser(env, 'Fernando');
    const L = await newUser(env, 'Luciana');
    await connectByLink(A, L);
    await say(A, 'primera charla');
    await L.waitForTimeout(400);

    t.ok(await A.isVisible('#composer') && !(await A.isVisible('#offline-bar')),
      'con conexión se ve el compositor y no la barra de reconectar');

    // ── recargar: la agenda sobrevive, los mensajes no ──
    await A.reload();
    await A.waitForSelector('.conv', { timeout: 12000 });
    const fila = await A.$eval('.conv', n => ({
      nm: n.querySelector('.nm').textContent.trim(),
      pv: n.querySelector('.pv').textContent.trim(),
      sello: !!n.querySelector('.nm svg')
    }));
    t.ok(fila.nm === 'Luciana' && fila.sello, 'el contacto sobrevive al cierre, con su sello de verificado');
    t.ok(/reinvitar/i.test(fila.pv), `queda sin conexión: "${fila.pv}"`);

    await A.click('.conv');
    t.ok((await A.$$('.row')).length === 0, 'los mensajes NO se guardan');
    t.ok(!(await A.isVisible('#composer')) && await A.isVisible('#offline-bar'),
      'sin conexión se oculta el compositor y aparece la barra de reinvitar');

    // ── reinvitar al mismo contacto ──
    await L.reload();
    await L.waitForTimeout(300);
    await A.click('#btn-reinvite-bar');
    t.ok((await A.textContent('#invite-title')).includes('Luciana'), 'la invitación queda apuntada al contacto');
    await connectByLink(A, L, true);
    await A.waitForTimeout(1500);
    const avisos = await A.$$eval('.sys', ns => ns.map(n => n.textContent));
    t.ok(avisos.some(x => /el mismo/i.test(x)), 'reconoce que es la misma persona de siempre');
    t.ok(await A.evaluate(() => convs.size) === 1, 'no duplica el contacto');
    t.ok(await A.isVisible('#peer-verified'), 'vuelve a mostrar el sello');

    // ── vuelve "Luciana" desde un navegador nuevo: otras claves ──
    await A.click('#btn-menu');
    await A.click('#mi-reinvite');
    const impostor = await newUser(env, 'Luciana');
    await connectByLink(A, impostor, true);
    await A.waitForTimeout(1800);
    const alerta = await A.$$eval('.sys.bad', ns => ns.map(n => n.textContent));
    t.ok(alerta.some(x => /otra identidad/i.test(x)), 'avisa en rojo que la identidad no es la esperada');
    t.ok(await A.evaluate(() => convs.size) === 2, 'el contacto original queda intacto, aparte');
    t.ok(await A.evaluate(() => [...convs.values()].filter(c => c.verifiedOnce).length) >= 1,
      'la clave del contacto original no se pisa');

    // ── eliminar contacto ──
    await home(A);
    const antes = await A.evaluate(() => convs.size);
    await A.click('.conv');
    await A.evaluate(() => { window.confirm = () => true; });
    await A.click('#btn-menu');
    await A.click('#mi-forget');
    await A.waitForTimeout(300);
    t.ok(await A.evaluate(() => convs.size) === antes - 1, 'eliminar contacto lo saca de la lista');
  }
};
