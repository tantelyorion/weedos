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
  };
})();
