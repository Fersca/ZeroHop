import { newUser, connectByPaste, PNG } from '../lib.mjs';

const MB = 1024 * 1024;

export default {
  name: 'Archivos · integridad, imágenes y límites',
  async run(t, env){
    const A = await newUser(env, 'Fernando');
    const B = await newUser(env, 'Luciana');
    await connectByPaste(A, B);

    // ── transferencia grande con control de flujo ──
    const big = Buffer.alloc(8 * MB);
    for (let i = 0; i < big.length; i += 977) big[i] = i & 255;
    const t0 = Date.now();
    await A.setInputFiles('#file', { name: 'video.bin', mimeType: 'application/octet-stream', buffer: big });
    await B.waitForSelector('.row.in .att .dl', { timeout: 120000 });
    const got = await B.$eval('.row.in .att .dl', async a => (await (await fetch(a.href)).blob()).size);
    t.ok(got === 8 * MB, `8 MB llegan íntegros (${got} bytes)`);
    t.info(`${((Date.now() - t0) / 1000).toFixed(1)}s`);

    // ── imagen inline ──
    await A.setInputFiles('#file', { name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    await B.waitForSelector('.row.in .bubble.pic img.photo', { timeout: 20000 });
    const dims = await B.$eval('.row.in .bubble.pic img.photo', i => [i.naturalWidth, i.naturalHeight]);
    t.ok(dims[0] === 8 && dims[1] === 8, 'la imagen se decodifica y se muestra en la burbuja');

    // ── cola de varios archivos, en orden ──
    await A.setInputFiles('#file', [
      { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('A'.repeat(50000)) },
      { name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('B'.repeat(90000)) },
      { name: 'c.txt', mimeType: 'text/plain', buffer: Buffer.from('C'.repeat(30000)) }
    ]);
    await B.waitForFunction(() => document.querySelectorAll('.row.in .att .dl').length === 4, { timeout: 60000 });
    const names = await B.$$eval('.row.in .att .nm', ns => ns.map(n => n.textContent));
    t.ok(names.join(',') === 'video.bin,a.txt,b.txt,c.txt', 'la cola respeta el orden de envío');

    // ── un archivo enorme se rechaza en vez de volar la pestaña ──
    await B.evaluate(() => {
      const c = [...convs.values()][0];
      onData(c, { data: JSON.stringify({ t: 'fmeta', id: 'enorme1', name: 'imposible.bin',
                                         size: 3 * 1024 * 1024 * 1024, mime: '', ts: Date.now() }) });
    });
    await B.waitForSelector('.row.in .bubble.bad', { timeout: 8000 });
    const why = await B.$eval('.row.in .bubble.bad .prob', n => n.textContent);
    t.ok(/supera el límite/.test(why), `rechaza lo que no puede recibir: "${why.trim()}"`);

    // ── el camino a disco: un sink real fuera de RAM ──
    const disk = await B.evaluate(async () => {
      const sink = await makeSink('probadisco', 100 * 1024 * 1024);
      if (!sink || !sink.disk) return { disk: false };
      await sink.write(new Uint8Array(1000));
      await sink.write(new Uint8Array(2000));
      const f = await sink.close('application/octet-stream');
      return { disk: true, size: f.size };
    });
    t.ok(disk.disk && disk.size === 3000,
      `los archivos grandes van a disco, no a memoria (escritos ${disk.size} bytes)`);

    const limpio = await B.evaluate(async () => {
      await wipeDiskFiles();
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('zerohop-files', { create: true });
      let n = 0;
      for await (const k of dir.keys()) n++;
      return n;
    });
    t.ok(limpio === 0, 'los archivos en disco se borran al arrancar la app');
  }
};
