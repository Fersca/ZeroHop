import { newUser, bothInChat, say, home, localIPv4 } from '../lib.mjs';

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
    // la IP de esta máquina hace de "IP del túnel": tiene que ser una a la que
    // el otro navegador realmente pueda llegar, si no el test depende del entorno
    const IP = localIPv4();
    const A = await newUser(env, 'Martín', { noStun: true, manualIp: IP });
    const B = await newUser(env, 'Sofía',  { noStun: true, manualIp: IP });

    t.ok(JSON.parse(await A.evaluate(() => localStorage.getItem('zh:adv'))).ip === IP,
      `la IP del túnel queda guardada (${IP})`);

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

    // ── el interruptor de STUN cambia lo que se le pide al navegador ──
    const stun = await A.evaluate(() => {
      const sin = rtcConfig().iceServers.length;
      net.useStun = true;
      const con = rtcConfig().iceServers;
      net.useStun = false;
      return { sin, con: con.length, urls: con[0] ? [].concat(con[0].urls).join(' ') : '' };
    });
    t.ok(stun.sin === 0 && stun.con === 1 && /^stun:/.test(stun.urls),
      'apagar STUN saca los servidores públicos; prenderlo los devuelve');

    // abre Ajustes con el panel avanzado desplegado, desde donde esté
    const ajustes = async () => {
      if (!(await A.isVisible('#home'))) await home(A);
      await A.click('#btn-home-menu');
      await A.click('#mi-settings');
      await A.waitForSelector('#settings:not([hidden])');
      if (!(await A.evaluate(() => $('#adv').open))) await A.click('#adv summary');
    };

    // ── una IP mal escrita no se guarda y se marca en rojo ──
    const ips = [];
    for (const valor of ['999.999.1.1', '10.8.0.256', '10.8.0', 'no es una ip', 'deadbeef',
                         '10.8.0.7', 'fd00::1234', '']){
      await ajustes();
      await A.fill('#vpn-ip', valor);
      ips.push(await A.evaluate(v => ({ v, guardada: net.manualIp, rojo: !!$('#vpn-ip').style.borderColor }), valor));
      await A.click('#settings [data-home]');
    }
    t.ok(ips.filter(x => !x.guardada && x.rojo).length === 5 &&
         ips.find(x => x.v === '10.8.0.7').guardada === '10.8.0.7' &&
         ips.find(x => x.v === 'fd00::1234').guardada === 'fd00::1234',
      'las IPs inválidas se marcan y no se guardan; IPv4 e IPv6 válidas sí');
    t.ok(!ips.find(x => x.v === '').rojo, 'y dejar el campo vacío no es un error: es "no uso VPN"');

    // ── relay forzado sin TURN no se puede prender: no hay a dónde relayear ──
    await A.evaluate(() => { net.turn = { url: '', user: '', pass: '' }; net.forceRelay = false; saveNet(); });
    await ajustes();
    await A.click('#tgl-relay');
    await A.waitForTimeout(150);
    t.ok(await A.evaluate(() => net.forceRelay === false) &&
         await A.getAttribute('#tgl-relay', 'aria-checked') === 'false' &&
         /TURN/i.test(await A.textContent('#toast')),
      'forzar relay sin TURN configurado no prende el interruptor y avisa por qué');
    await A.click('#settings [data-home]');

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
    await A.click('.conv');                     // vuelve a la conversación, que sigue viva
    await A.waitForSelector('#chat:not([hidden])');
    await A.click('#btn-menu');
    await A.click('#mi-info');
    await A.waitForSelector('.kv');
    const kv = await A.$$eval('.kv', ns => ns.map(n => n.textContent.replace(/\s+/g, ' ')));
    t.ok(kv.some(x => /Servidor de mensajes.*ninguno/i.test(x)), 'los detalles confirman que no hay servidor de mensajes');
  }
};
