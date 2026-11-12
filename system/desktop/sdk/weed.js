/* Weed SDK : à inclure dans un Programme -> <script src="/sdk/weed.js"></script>
   Le Programme tourne dans une iframe isolée (sandbox) : il ne parle au système que via ce pont,
   et le bureau n'autorise que les permissions déclarées dans son manifest.json. */
(function () {
  let n = 0; const pend = {};
  addEventListener('message', e => {
    if (e.source !== parent) return;
    const d = e.data; if (!d || d.weed !== 'res') return;
    const p = pend[d.id]; if (!p) return; delete pend[d.id];
    d.ok ? p.res(d.result) : p.rej(new Error(d.error));
  });
  const call = (name, args) => new Promise((res, rej) => {
    const id = ++n; pend[id] = { res, rej };
    parent.postMessage({ weed: 'req', id, name, args: args || {} }, '*');
  });
  window.weed = {
    call,
    notify: (title, message) => call('notify', { title, message }),
    fs: {
      list: path => call('fs.list', { path }),
      read: path => call('fs.read', { path }),
      write: (path, content) => call('fs.write', { path, content }),
      mkdir: path => call('fs.mkdir', { path }),
      rm: path => call('fs.rm', { path }),
    },
    info: () => call('sys.info'),
    /* Service média (FFmpeg fourni par le système). Exige la permission « app.<id>.media » dans manifest.json,
       accordée par un administrateur (app « Permissions des applications »). */
    media: {
      status: () => call('media.status'),
      probe: path => call('media.probe', { path }),
      thumbnail: (path, o) => call('media.thumbnail', Object.assign({ path }, o)),   // sans output : { data_url }
      url: path => call('media.url', { path }),                                      // { url } pour <video src> / <audio src>
      convert: (path, o) => call('media.convert', Object.assign({ path }, o)),       // -> tâche { id, state, progress… }
      extractAudio: (path, o) => call('media.extract_audio', Object.assign({ path }, o)),
      trim: (path, o) => call('media.trim', Object.assign({ path }, o)),             // rapide, sans ré-encodage
      render: o => call('media.render', o),                                          // montage : { clips:[{path,start,end,volume}], … }
      concat: (inputs, o) => call('media.concat', Object.assign({ inputs }, o)),
      job: id => call('media.job.status', { id }),
      jobs: () => call('media.job.list'),
      cancel: id => call('media.job.cancel', { id }),
      /* Attend la fin d'une tâche ; onProgress(job) est appelé à chaque relevé. Rejette si la tâche échoue ou est annulée. */
      wait: async (id, onProgress, every) => {
        for (;;) {
          const j = await call('media.job.status', { id });
          if (onProgress) onProgress(j);
          if (j.state === 'done') return j;
          if (j.state === 'failed' || j.state === 'cancelled') throw new Error(j.error || j.state);
          await new Promise(r => setTimeout(r, every || 700));
        }
      },
    },
  };
})();
