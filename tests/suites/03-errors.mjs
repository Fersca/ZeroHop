import { newUser, connectByPaste, connectByLink, reopenIn, say, home } from '../lib.mjs';

export default {
  name: 'Errores · mensajes sin confirmar, reintento y códigos inválidos',
  async run(t, env){
    const A = await newUser(env, 'Fernando');
    const B = await newUser(env, 'Luciana');
    await connectByPaste(A, B);

    // ── el otro se va justo después de mandar: el mensaje queda sin confirmar ──
    const perfilB = B.context();
    await A.evaluate(() => { const c = [...convs.values()][0]; c.dc.send = () => {}; });  // el envío se traga
    await say(A, 'este no se sabe si llegó');
    await B.close({ runBeforeUnload: true });
    await A.waitForSelector('.bubble.bad', { timeout: 12000 });
    const prob = await A.$eval('.bubble.bad .prob', n => n.textContent);
    t.ok(/Sin confirmar/.test(prob), `avisa que no hay confirmación: "${prob.trim()}"`);
    t.ok(await A.isVisible('.bubble.bad [data-retry]'), 'ofrece reintentar');
    t.ok(await A.$eval('.bubble.bad .meta', n => n.querySelector('svg') === null),
      'quita la tilde de enviado cuando no está confirmado');

    // reintentar sin conexión avisa en vez de fingir
    await A.click('.bubble.bad [data-retry]');
    await A.waitForSelector('#toast:not([hidden])', { timeout: 5000 });
    t.ok((await A.textContent('#toast')).includes('conexión'), 'reintentar sin conexión avisa');

    // ── reconectar (mismo perfil: misma identidad) y reintentar de verdad ──
    const B2 = await reopenIn(env, perfilB, 'Luciana');
    await A.click('.screen:not([hidden]) [data-home]').catch(() => {});
    await A.click('.conv');
    await A.click('#btn-reinvite-bar');
    await connectByLink(A, B2, true);
    await A.click('[data-retry]');
    await B2.waitForSelector('.row.in .bubble', { timeout: 8000 });
    t.ok((await B2.textContent('.row.in .bubble')).includes('este no se sabe si llegó'),
      'el reintento reenvía el mensaje y llega');
    await A.waitForTimeout(600);
    t.ok((await A.$$('.bubble.bad')).length === 0, 'la burbuja deja de estar marcada');

    // ── códigos inválidos con mensajes entendibles ──
    await home(A);
    await A.click('#btn-home-menu');
    await A.click('#mi-join');
    for (const [entrada, espera] of [
      ['no soy un codigo pero soy largo', /no parece un código/i],
      ['ZH1esteEstaCortadoOModificado123', /cortado|incompleto/i]
    ]){
      await A.fill('#offer-in', entrada);
      await A.click('#btn-make-answer');
      await A.waitForSelector('#guest-err.show', { timeout: 8000 });
      const msg = (await A.textContent('#guest-err')).trim();
      t.ok(espera.test(msg), `error claro para "${entrada.slice(0, 22)}…": ${msg}`);
    }
    t.ok(await A.isVisible('#offer-in'), 'el campo sigue disponible para corregir a mano');
  }
};
