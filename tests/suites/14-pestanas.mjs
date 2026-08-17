import { newUser, reopenIn, connectByPaste, say, home } from '../lib.mjs';

// El mismo perfil abierto dos veces (pasa siempre: uno se olvida la pestaña
// vieja) y la agenda compartida entre las dos. Acá se pisaban los contactos.
export default {
  name: 'Dos pestañas del mismo perfil · la agenda no se pisa',
  async run(t, env){
    const A1 = await newUser(env, 'Fernando');
    const ctx = A1.context();
    const P1 = await newUser(env, 'Luciana');
    const P2 = await newUser(env, 'Martín');

    await connectByPaste(A1, P1);
    await say(A1, 'hola Luciana');
    await P1.waitForSelector('.row.in .bubble', { timeout: 10000 });
    await home(A1);

    // segunda pestaña del MISMO perfil: misma identidad, misma agenda
    const A2 = await reopenIn(env, ctx, 'pestaña 2');
    await A2.waitForSelector('#home:not([hidden])', { timeout: 15000 });
    const [id1, id2] = [await A1.evaluate(() => ME.fp), await A2.evaluate(() => ME.fp)];
    t.ok(id1 === id2, 'las dos pestañas del mismo navegador comparten la identidad');
    t.ok(await A2.$$eval('#list .conv .nm', ns => ns.map(n => n.textContent.trim())).then(x => x.includes('Luciana')),
      'y la segunda pestaña ve el contacto que guardó la primera');

    // la pestaña 2 agrega un contacto nuevo
    await connectByPaste(A2, P2);
    await say(A2, 'hola Martín');
    await P2.waitForSelector('.row.in .bubble', { timeout: 10000 });

    const enDisco = () => A2.evaluate(() => JSON.parse(localStorage.getItem('zh:contacts') || '[]').map(c => c.name).sort());
    t.ok(JSON.stringify(await enDisco()) === '["Luciana","Martín"]',
      `con las dos pestañas guardando quedan los dos contactos (${(await enDisco()).join(', ')})`);

    // ahora la pestaña 1 vuelve a guardar: no tiene a Martín en memoria y antes
    // lo borraba de la agenda al escribir
    await A1.click('.conv');
    await say(A1, 'otro mensaje');
    await A1.waitForTimeout(400);
    const tras = await A1.evaluate(() => JSON.parse(localStorage.getItem('zh:contacts') || '[]').map(c => c.name).sort());
    t.ok(JSON.stringify(tras) === '["Luciana","Martín"]',
      `la pestaña vieja no borra el contacto que agregó la nueva (${tras.join(', ')})`);

    // y al recargar la pestaña 1 están los dos, uno online y el otro no
    await A1.reload();
    await A1.waitForSelector('#home:not([hidden])', { timeout: 15000 });
    t.ok((await A1.$$eval('#list .conv .nm', ns => ns.map(n => n.textContent.trim()))).sort().join(',') === 'Luciana,Martín',
      'al recargar, la lista tiene los contactos de las dos pestañas');

    // ── eliminar de verdad elimina: no revive al mezclar ──
    await A2.evaluate(() => { window.confirm = () => true; });
    await home(A2);
    await A2.click('#list .conv');                 // el primero de la lista
    const borrado = await A2.textContent('#peer-name');
    await A2.click('#btn-menu');
    await A2.click('#mi-forget');
    await A2.waitForSelector('#home:not([hidden])', { timeout: 8000 });
    const quedan = await A2.evaluate(() => JSON.parse(localStorage.getItem('zh:contacts') || '[]').map(c => c.name));
    t.ok(!quedan.includes(borrado) && quedan.length === 1,
      `eliminar a ${borrado} lo saca de la agenda y no revive al volver a guardar (queda ${quedan.join(', ') || 'nadie'})`);
    await A2.evaluate(() => saveContacts());
    t.ok(!(await A2.evaluate(() => JSON.parse(localStorage.getItem('zh:contacts') || '[]').map(c => c.name))).includes(borrado),
      'ni después de escribir la agenda otra vez');

    // ── pegarse la propia invitación: error claro en vez de hablar solo ──
    const C = await newUser(env, 'Sofía');
    await C.click('#fab');
    await C.waitForSelector('#offer-out:not([hidden])', { timeout: 25000 });
    const propia = await C.evaluate(() => $('#offer-out').dataset.code || $('#offer-out').value);
    await home(C);
    await C.click('#btn-home-menu');
    await C.click('#mi-join');
    await C.fill('#offer-in', propia);
    await C.click('#btn-make-answer');
    await C.waitForSelector('#guest-err.show', { timeout: 15000 });
    const err = await C.textContent('#guest-err');
    t.ok(/tuya/i.test(err), `pegarse la propia invitación avisa en vez de conectarte con vos mismo: "${err}"`);
    t.ok(await C.evaluate(() => ![...convs.values()].some(c => c.id === ME.fp)),
      'y no queda una conversación con uno mismo en la lista');
  }
};
