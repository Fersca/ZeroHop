import { newUser, connectByLink, say, home } from '../lib.mjs';

export default {
  name: 'Varias conversaciones en paralelo',
  async run(t, env){
    const yo = await newUser(env, 'Fernando');
    const gente = {};
    for (const n of ['Luciana', 'Martín', 'Sofía']){
      gente[n] = await newUser(env, n);
      await connectByLink(yo, gente[n]);
      await home(yo);
    }

    const lista = await yo.$$eval('.conv', ns => ns.map(n => ({
      nm: n.querySelector('.nm').textContent.trim(),
      on: n.classList.contains('on')
    })));
    t.ok(lista.length === 3 && lista.every(c => c.on), 'las tres conexiones quedan vivas al mismo tiempo');

    // llegan mensajes mientras estoy en la lista
    await say(gente['Luciana'], 'hola! soy Luciana');
    await say(gente['Martín'], 'mandame el plano');
    await say(gente['Sofía'], 'nos vemos el jueves?');
    await say(gente['Sofía'], 'y llevá la guitarra');
    await yo.waitForTimeout(1000);

    const badges = await yo.$$eval('.conv', ns => ns.map(n => ({
      nm: n.querySelector('.nm').textContent.trim(),
      n: (n.querySelector('.badge-n') || {}).textContent || '0',
      pv: n.querySelector('.pv').textContent.trim()
    })));
    const sofia = badges.find(b => b.nm.startsWith('Sofía'));
    t.ok(sofia && sofia.n === '2', 'los no leídos se cuentan por conversación');
    t.ok(sofia.pv === 'y llevá la guitarra', 'la lista muestra el último mensaje');
    t.ok((await yo.title()).startsWith('(4)'), 'el título de la pestaña lleva el total sin leer');

    // entro a una, contesto, y las otras siguen intactas
    await yo.click('.conv:has-text("Sofía")');
    t.ok((await yo.$$('.row.in')).length === 2, 'al abrir el chat están los dos mensajes');
    await say(yo, 'sí, llevo la guitarra');
    await gente['Sofía'].waitForTimeout(500);
    t.ok((await gente['Sofía'].$$eval('.row.in .bubble', ns => ns.map(n => n.innerText))).pop().includes('llevo la guitarra'),
      'la respuesta llega a la conversación correcta');

    await home(yo);
    const conNoLeidos = await yo.$$eval('.conv', ns => ns.filter(n => n.querySelector('.badge-n')).length);
    t.ok(conNoLeidos === 2, 'abrir una conversación no toca los no leídos de las otras');

    // una conversación en segundo plano sigue funcionando
    await yo.click('.conv:has-text("Luciana")');
    await say(yo, 'seguís ahí?');
    await gente['Luciana'].waitForTimeout(500);
    t.ok((await gente['Luciana'].$$eval('.row.in .bubble', ns => ns.map(n => n.innerText))).pop().includes('seguís ahí?'),
      'las conexiones de segundo plano siguen vivas');

    // un archivo a la tercera, mientras el chat abierto es otro
    await home(yo);
    await yo.click('.conv:has-text("Martín")');
    await yo.setInputFiles('#file', { name: 'plano.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(400000, 7) });
    await gente['Martín'].waitForSelector('.row.in .att .dl', { timeout: 30000 });
    t.ok((await gente['Martín'].textContent('.row.in .att .nm')).trim() === 'plano.pdf',
      'los archivos van a la conversación correcta');

    // buscador
    await home(yo);
    t.ok(!(await yo.isVisible('#searchbar')), 'con pocas conversaciones el buscador está oculto');
  }
};
