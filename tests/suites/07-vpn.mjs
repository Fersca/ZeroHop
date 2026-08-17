import { newUser, bothInChat, say } from '../lib.mjs';

// Simula el escenario VPN: Chrome oculta la IP local detrás de un nombre mDNS
// que no resuelve a través del túnel, así que borramos esos candidatos del
// código compartido y dejamos solo el que agrega la IP manual.
const sinMdns = (page, code, kind) => page.evaluate(async ([c, k]) => {
  const o = await unpack(c);
  o.s = o.s.split(/\r?\n/).filter(l => !(l.startsWith('a=candidate') && /\.local /i.test(l))).join('\r\n');
  return [await pack({ ...o, k }), o.s.split(/\r?\n/).filter(l => l.startsWith('a=candidate')).length];
}, [code, kind]);

export default {
  name: 'VPN · candidato manual y configuración de red',
  async run(t, env){
    const IP = '192.0.2.2';
    const A = await newUser(env, 'Martín', { noStun: true, manualIp: IP });
    const B = await newUser(env, 'Sofía',  { noStun: true, manualIp: IP });

    t.ok(JSON.parse(await A.evaluate(() => localStorage.getItem('zh:adv'))).ip === IP,
      'la IP del túnel queda guardada');

    await A.click('#fab');
    await A.waitForSelector('#offer-out:not([hidden])', { timeout: 25000 });
    const cands = await A.evaluate(async c => (await unpack(c)).s.split(/\r?\n/).filter(l => l.startsWith('a=candidate')),
      await A.inputValue('#offer-out'));
    t.ok(cands.some(l => l.includes(IP)), 'la IP manual se agrega como candidato extra');
    t.ok(cands.some(l => /\.local /i.test(l)), 'el candidato mDNS original se conserva');

    const [offerVpn, quedan] = await sinMdns(A, await A.inputValue('#offer-out'), 'o');
    t.ok(quedan === 1, 'sin los mDNS queda solo el candidato manual');

    await B.click('#btn-home-menu');
    await B.click('#mi-join');
    await B.fill('#offer-in', offerVpn);
    await B.click('#btn-make-answer');
    await B.waitForSelector('#guest-step2:not([hidden])', { timeout: 25000 });
    const [answerVpn] = await sinMdns(B, await B.inputValue('#answer-out'), 'a');
    await A.fill('#answer-in', answerVpn);
    await A.click('#btn-connect-host');
    await bothInChat(A, B);
    await say(A, 'conectados por el túnel');
    await B.waitForSelector('.row.in .bubble', { timeout: 10000 });
    t.ok(true, 'conectan usando únicamente el candidato manual (escenario VPN real)');

    // ── TURN y relay forzado llegan a la configuración ──
    const cfg = await A.evaluate(() => {
      net.turn = { url: 'turn:turn.ejemplo.com:3478', user: 'u', pass: 'p' };
      net.forceRelay = true; net.useStun = false;
      return rtcConfig();
    });
    t.ok(cfg.iceServers.length === 1 && cfg.iceServers[0].urls.startsWith('turn:') &&
         cfg.iceServers[0].credential === 'p' && cfg.iceTransportPolicy === 'relay',
      'el TURN propio y el relay forzado llegan a RTCPeerConnection');

    // ── panel de detalles ──
    await A.click('#btn-menu');
    await A.click('#mi-info');
    await A.waitForSelector('.kv');
    const kv = await A.$$eval('.kv', ns => ns.map(n => n.textContent.replace(/\s+/g, ' ')));
    t.ok(kv.some(x => /Servidor de mensajes.*ninguno/i.test(x)), 'los detalles confirman que no hay servidor de mensajes');
  }
};
