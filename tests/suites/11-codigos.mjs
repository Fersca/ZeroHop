import { newUser, connectByPaste, say, bothInChat } from '../lib.mjs';

export default {
  name: 'Códigos, formatos y navegadores flacos',
  async run(t, env){
    const A = await newUser(env, 'Fernando');

    // ── funciones de formato: son las que se ven en cada burbuja ──
    const fmt = await A.evaluate(() => ({
      tamaños: [0, 1, 1023, 1024, 1536, 1048576, 5 * 1048576, 1073741824].map(humanSize),
      hoy: dayLabel(Date.now()),
      ayer: dayLabel(Date.now() - 864e5),
      viejo: dayLabel(new Date('2020-03-15T12:00:00').getTime()),
      relHoy: relTime(Date.now()).length,
      relAyer: relTime(Date.now() - 864e5),
      id: prettyId('8c28e3ded9456ff9')
    }));
    t.ok(fmt.tamaños.join(' ') === '0 B 1 B 1023 B 1.0 KB 1.5 KB 1.0 MB 5.0 MB 1.00 GB',
      `los tamaños se formatean bien (${fmt.tamaños.join(', ')})`);
    t.ok(fmt.hoy === 'HOY' && fmt.ayer === 'AYER' && /2020/.test(fmt.viejo),
      `las fechas dicen HOY, AYER y la fecha larga (${fmt.viejo})`);
    t.ok(fmt.relHoy === 5 && fmt.relAyer === 'ayer', 'la hora de la lista es hora hoy y "ayer" ayer');
    t.ok(fmt.id === '8C28 E3DE D945 6FF9', `el ID se muestra legible (${fmt.id})`);

    // ── el código se reconoce venga como venga ──
    await A.click('#fab');
    await A.waitForSelector('#offer-out:not([hidden])', { timeout: 25000 });
    const link = await A.inputValue('#offer-out');
    const puro = await A.evaluate(l => extractCode(l), link);

    const casos = {
      'el link entero': link,
      'el código suelto': puro,
      'partido en líneas (como lo corta un mail)': puro.replace(/(.{40})/g, '$1\n'),
      'con espacios alrededor': '   ' + puro + '  \n',
      'metido en una frase': 'mirá, pegá esto: ' + puro + ' y listo',
      'con el link en una frase': 'te paso el link ' + link + ' abrilo'
    };
    // lo que importa no es extractCode sino que unpack lo recupere: es lo que
    // pasa cuando alguien pega cualquiera de estas formas en el campo
    const esperado = await A.evaluate(c => unpack(c).then(o => o.s.length), puro);
    for (const [como, entrada] of Object.entries(casos)){
      const largo = await A.evaluate(e => unpack(e).then(o => o.s.length, () => -1), entrada);
      t.ok(largo === esperado, `recupera el código ${como}`);
    }

    // ── una respuesta que no corresponde da un error entendible ──
    const otroSid = await A.evaluate(async c => {
      const o = await unpack(c);
      return await pack({ ...o, k: 'a', sid: 'sid-de-otra-invitacion' });
    }, puro);
    await A.fill('#answer-in', otroSid);
    await A.waitForSelector('#btn-connect-host:not([disabled])', { timeout: 8000 });
    await A.click('#btn-connect-host');
    await A.waitForSelector('#host-err.show', { timeout: 8000 });
    const err = (await A.textContent('#host-err')).trim();
    t.ok(/otra invitación|venció/i.test(err), `una respuesta de otra invitación se rechaza: "${err}"`);

    // ── sin CompressionStream: el código sale sin comprimir y funciona igual ──
    const sinZip = { initScript: () => { delete window.CompressionStream; } };
    const C = await newUser(env, 'Martín', sinZip);
    const D = await newUser(env, 'Sofía');
    await C.click('#fab');
    await C.waitForSelector('#offer-out:not([hidden])', { timeout: 25000 });
    const crudo = await C.evaluate(() => $('#offer-out').dataset.code);
    t.ok(crudo.startsWith('ZH0'), `sin compresión el código sale como ZH0 (${crudo.length} chars, vs ~830 comprimido)`);
    await D.click('#btn-home-menu'); await D.click('#mi-join');
    await D.fill('#offer-in', crudo);
    await D.click('#btn-make-answer');
    await D.waitForSelector('#guest-step2:not([hidden])', { timeout: 25000 });
    await C.fill('#answer-in', await D.inputValue('#answer-out'));
    await C.click('#btn-connect-host');
    await bothInChat(C, D);
    await say(C, 'conectados sin comprimir');
    await D.waitForSelector('.row.in .bubble', { timeout: 10000 });
    t.ok(true, 'un navegador sin CompressionStream conversa igual');

    // ── sin WebCrypto: se conecta, pero sin verificación y lo dice ──
    const sinCrypto = {
      initScript: () => {
        Object.defineProperty(window.crypto, 'subtle', { get: () => undefined, configurable: true });
      }
    };
    const E = await newUser(env, 'Ana', sinCrypto);
    const F = await newUser(env, 'Beto', sinCrypto);
    t.ok((await E.evaluate(() => ME.fp)).startsWith('sin-id-') && await E.evaluate(() => ME.ok === false),
      'sin WebCrypto la app arranca con una identidad provisoria en vez de morir');
    await connectByPaste(E, F);
    await say(E, 'hola sin crypto');
    await F.waitForSelector('.row.in .bubble', { timeout: 10000 });
    t.ok(true, 'y la conversación funciona igual');
    t.ok(await F.evaluate(() => [...convs.values()][0].verified === false) &&
         !(await F.isVisible('#peer-verified')),
      'pero no promete una verificación que no puede hacer');
    await F.click('#btn-menu'); await F.click('#mi-safety');
    await F.waitForSelector('.safety');
    t.ok((await F.textContent('.safety')).includes('No disponible'),
      'y el código de seguridad dice que no está disponible');
  }
};
