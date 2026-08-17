import { newUser, connectByPaste, say } from '../lib.mjs';

export default {
  name: 'Chat · conexión, mensajes y acuses',
  async run(t, env){
    const A = await newUser(env, 'Fernando');
    const B = await newUser(env, 'Luciana');

    const code = await connectByPaste(A, B);
    t.ok(code.startsWith('ZH'), `conectan pegando el código suelto (${code.length} chars)`);
    t.ok(await A.textContent('#peer-name') === 'Luciana' && await B.textContent('#peer-name') === 'Fernando',
      'cada uno ve el nombre del otro');
    t.ok((await A.textContent('.sys')).includes('Línea segura'), 'avisa que la línea quedó establecida');

    // identidad verificada por firma en ambos lados
    await A.waitForTimeout(600);
    const [va, vb] = [await A.evaluate(() => [...convs.values()][0].verified),
                      await B.evaluate(() => [...convs.values()][0].verified)];
    t.ok(va && vb, 'los dos verifican la identidad del otro por firma');
    t.ok(await A.isVisible('#peer-verified'), 'el sello VERIFICADO aparece en la barra');

    // indicador de escritura
    await A.click('#input');
    await A.type('#input', 'hola, andás?', { delay: 15 });
    await B.waitForSelector('#typing-row', { timeout: 8000 });
    t.ok(true, 'el indicador de "escribiendo" llega al otro lado');
    await A.press('#input', 'Enter');

    await B.waitForSelector('.row.in .bubble', { timeout: 8000 });
    t.ok((await B.textContent('.row.in .bubble')).includes('hola, andás?'), 'el mensaje llega completo');
    t.ok(!(await B.$('#typing-row')), 'el indicador se apaga al recibir');

    // acuse de lectura
    await A.waitForTimeout(900);
    t.ok(await A.$eval('.row.out .meta', n => n.classList.contains('read')), 'la tilde pasa a leído');

    // escapado, links y saltos de línea
    await say(B, 'uno\ndos   tres <img src=x onerror=alert(1)> https://example.com/a?b=1');
    await A.waitForTimeout(500);
    const last = await A.$eval('.row.in:last-of-type .bubble', n => ({ html: n.innerHTML, txt: n.innerText }));
    t.ok(!last.html.includes('<img src=x'), 'el HTML del otro lado se escapa');
    t.ok(last.html.includes('<a href="https://example.com'), 'los links se vuelven clickeables');
    t.ok(last.txt.includes('uno\ndos   tres'), 'se conservan saltos de línea y espacios');

    // vaciar pantalla
    await A.click('#btn-menu');
    await A.click('#mi-clear');
    await A.waitForTimeout(200);
    t.ok((await A.$$('.row')).length === 0, 'vaciar pantalla borra las burbujas');
  }
};
