/* Spot desktop layer.
   Loaded only in the Mac app, before the app script. It gives the app real files:
   each project is a .spot file (in Documents/Spot unless you save it elsewhere),
   settings live in the app's settings folder, and PDFs and backups go through the
   native save dialog. The app finds this layer as window.SpotDesktop. */
(function () {
  const T = window.__TAURI__;
  if (!T) return;
  const FS = T.fs, DLG = T.dialog, PATH = T.path, EV = T.event, CORE = T.core;
  const WIN = T.window && T.window.getCurrentWindow ? T.window.getCurrentWindow() : null;
  const OPENER = T.opener || null;

  let CONFIG_DIR = '', DOCS_DIR = '', HOME_DIR = '', RECENTS_FILE = '', SETTINGS_FILE = '';
  let recents = [];           // [{id, path}]
  const files = {};           // project id -> file path
  const lastName = {};        // project id -> title the file was last named after
  const app = () => window.SpotApp;

  const safeName = n => (n || 'Untitled film').replace(/[\/:*?"<>|\\]+/g, '-').replace(/\s+/g, ' ').trim() || 'Untitled film';
  const dirOf = p => p.slice(0, p.lastIndexOf('/'));
  const fileName = p => p.split('/').pop();
  const msg = e => (e && e.message) || String(e);

  async function readJSON(path, fallback) {
    try { if (!(await FS.exists(path))) return fallback; return JSON.parse(await FS.readTextFile(path)); }
    catch (_) { return fallback; }
  }
  const writeJSON = (path, value) => FS.writeTextFile(path, JSON.stringify(value, null, 1));
  const saveRecents = () => writeJSON(RECENTS_FILE, recents).catch(() => {});
  function remember(id, path) {
    files[id] = path;
    recents = recents.filter(r => r.id !== id && r.path !== path);
    recents.unshift({ id, path });
    saveRecents();
  }
  async function freePath(dir, base) {
    let p = `${dir}/${base}.spot`, n = 2;
    while (await FS.exists(p)) p = `${dir}/${base} ${n++}.spot`;
    return p;
  }
  function pretty(p) {
    return (HOME_DIR && p.startsWith(HOME_DIR) ? '~' + p.slice(HOME_DIR.length) : p)
      .replace(/^~\/Library\/Mobile Documents\/com~apple~CloudDocs/, 'iCloud Drive');
  }
  function setTitle() {
    if (!WIN) return;
    const a = app(), p = a && a.current();
    const t = p ? `${p.title || 'Untitled film'} · Spot` : 'Spot';
    if (setTitle.last !== t) { setTitle.last = t; WIN.setTitle(t).catch(() => {}); }
  }

  /* ---------- reading ---------- */
  async function readProject(path) {
    const o = JSON.parse(await FS.readTextFile(path));
    if (!o || (!Array.isArray(o.sessions) && !Array.isArray(o.notes))) throw new Error('not a Spot project');
    return o;
  }
  // Opens a .spot file or a backup .json. Returns how many projects were added.
  async function openPath(path) {
    const known = Object.keys(files).find(id => files[id] === path);
    if (known && app().state.projects[known]) { app().openProject(known); return 1; }
    let o;
    try { o = JSON.parse(await FS.readTextFile(path)); }
    catch (e) { app().toast(`Couldn't open ${fileName(path)}: ${msg(e)}`); return 0; }
    if (o && o.spotBackup) { app().restoreText(JSON.stringify(o)); return (o.projects || []).length; }
    if (!o || (!Array.isArray(o.sessions) && !Array.isArray(o.notes))) { app().toast(`${fileName(path)} is not a Spot project.`); return 0; }
    if (!o.id || app().state.projects[o.id]) o.id = Math.random().toString(36).slice(2, 11);
    files[o.id] = path; lastName[o.id] = o.title;
    remember(o.id, path);
    app().addProjects([o]);
    return 1;
  }

  /* ---------- the interface the app uses ---------- */
  window.SpotDesktop = {
    async load() {
      CONFIG_DIR = await PATH.appConfigDir();
      await FS.mkdir(CONFIG_DIR, { recursive: true }).catch(() => {});
      DOCS_DIR = await PATH.join(await PATH.documentDir(), 'Spot');
      await FS.mkdir(DOCS_DIR, { recursive: true }).catch(() => {});
      try { HOME_DIR = await PATH.homeDir(); } catch (_) {}
      RECENTS_FILE = await PATH.join(CONFIG_DIR, 'projects.json');
      SETTINGS_FILE = await PATH.join(CONFIG_DIR, 'settings.json');
      recents = await readJSON(RECENTS_FILE, []);
      // First launch, or files added to the folder by hand: pick up every .spot in Documents/Spot
      try {
        for (const e of await FS.readDir(DOCS_DIR)) {
          if (!e.isFile || !/\.spot$/i.test(e.name)) continue;
          const p = `${DOCS_DIR}/${e.name}`;
          if (!recents.some(r => r.path === p)) recents.push({ id: '', path: p });
        }
      } catch (_) {}
      const projects = [], seen = {};
      const keep = [];
      for (const r of recents) {
        try {
          const o = await readProject(r.path);
          if (!o.id || seen[o.id]) o.id = r.id && !seen[r.id] ? r.id : Math.random().toString(36).slice(2, 11);
          seen[o.id] = 1; files[o.id] = r.path; lastName[o.id] = o.title;
          projects.push(o); keep.push({ id: o.id, path: r.path });
        } catch (_) { /* moved or deleted: drop it from the list */ }
      }
      recents = keep; saveRecents();
      const settings = await readJSON(SETTINGS_FILE, {});
      return { projects, settings };
    },
    async saveProject(p) {
      if (!p) return;
      const title = safeName(p.title);
      let path = files[p.id];
      if (!path) path = await freePath(DOCS_DIR, title);
      // Files Spot made in Documents/Spot follow the film's title
      else if (dirOf(path) === DOCS_DIR && lastName[p.id] !== p.title && fileName(path) !== title + '.spot') {
        const target = `${DOCS_DIR}/${title}.spot`;
        if (!(await FS.exists(target))) { try { await FS.rename(path, target); path = target; } catch (_) {} }
      }
      await FS.writeTextFile(path, JSON.stringify(p, null, 1));
      lastName[p.id] = p.title;
      if (files[p.id] !== path || recents[0]?.id !== p.id) remember(p.id, path);
      files[p.id] = path;
      setTitle();
    },
    async removeProject(id) {
      delete files[id];
      recents = recents.filter(r => r.id !== id); saveRecents();
    },
    saveSettings: s => writeJSON(SETTINGS_FILE, s),
    statusText: path => {
      if (path === 'settings/main') return 'Saved';
      const f = files[path.slice(9)];
      return f ? 'Saved to ' + fileName(f) : 'Saved';
    },
    fileOf: id => files[id] || '',
    pretty,
    async reveal(id) {
      const f = files[id];
      if (!f) { app().toast('Not saved yet.'); return; }
      try { if (OPENER && OPENER.revealItemInDir) await OPENER.revealItemInDir(f); else app().toast(f); }
      catch (e) { app().toast('Could not show it in Finder: ' + msg(e)); }
    },
    async saveAs(p) {
      let target;
      try {
        target = await DLG.save({ title: 'Save project as', defaultPath: `${files[p.id] ? dirOf(files[p.id]) : DOCS_DIR}/${safeName(p.title)}.spot`,
          filters: [{ name: 'Spot project', extensions: ['spot'] }] });
      } catch (e) { app().toast('Could not open the save dialog: ' + msg(e)); return; }
      if (!target) return;
      if (!/\.spot$/i.test(target)) target += '.spot';
      try { await FS.writeTextFile(target, JSON.stringify(p, null, 1)); }
      catch (e) { app().toast('Could not save: ' + msg(e)); return; }
      lastName[p.id] = p.title; remember(p.id, target);
      app().toast('Saved as ' + fileName(target) + '. Spot now saves this project there.');
      app().render();
    },
    // Replaces the web version's download prompt: PDFs and backups go through the save dialog.
    downloads: {
      async save({ filename, data }) {
        const ext = (filename.split('.').pop() || '').toLowerCase();
        let target;
        try {
          target = await DLG.save({ title: 'Save', defaultPath: `${DOCS_DIR}/${filename}`, filters: [{ name: ext.toUpperCase() + ' file', extensions: [ext] }] });
        } catch (e) { throw { code: 'unavailable', message: msg(e) }; }
        if (!target) throw { code: 'declined' };
        if (typeof data === 'string') await FS.writeTextFile(target, data);
        else await FS.writeFile(target, new Uint8Array(await (data instanceof Blob ? data : new Blob([data])).arrayBuffer()));
        return { status: 'saved' };
      }
    },
    async ready() {
      document.documentElement.classList.add('desktop');
      setTitle();
      EV.listen('menu', e => runMenu(e.payload));
      EV.listen('open-files', async e => { for (const p of e.payload || []) await openPath(p); });
      let pending = [];
      try { pending = await CORE.invoke('take_pending'); } catch (_) {}
      for (const p of pending || []) await openPath(p);
      // Keep the window title on the current project
      document.addEventListener('click', () => setTimeout(setTitle, 0), true);
      document.addEventListener('input', () => setTimeout(setTitle, 0), true);
    }
  };

  async function openDialog() {
    let picked;
    try {
      picked = await DLG.open({ title: 'Open project', defaultPath: DOCS_DIR, multiple: true, directory: false,
        filters: [{ name: 'Spot project or backup', extensions: ['spot', 'json'] }] });
    } catch (e) { app().toast('Could not open the file dialog: ' + msg(e)); return; }
    if (!picked) return;
    for (const p of [].concat(picked)) await openPath(typeof p === 'string' ? p : p.path);
  }

  async function runMenu(id) {
    const a = app(); if (!a) return;
    const p = a.current();
    switch (id) {
      case 'new': a.newProject(); break;
      case 'open': openDialog(); break;
      case 'save':
        if (!p) { a.toast('Nothing to save yet.'); break; }
        try { await a.flush(); a.status('Saved to ' + fileName(files[p.id] || '')); a.toast('Saved to ' + pretty(files[p.id] || '')); }
        catch (e) { a.toast('Could not save: ' + msg(e)); }
        break;
      case 'saveas': if (p) { await a.flush(); window.SpotDesktop.saveAs(p); } break;
      case 'reveal': if (p) window.SpotDesktop.reveal(p.id); break;
      case 'import': a.importNotes(); break;
      case 'export_pdf': a.exportPDF(); break;
      case 'backup': a.backup(); break;
      case 'settings': a.settings(); break;
      case 'mode_auto': a.setMode('auto'); break;
      case 'mode_light': a.setMode('light'); break;
      case 'mode_dark': a.setMode('dark'); break;
    }
  }

  window.addEventListener('beforeunload', () => { try { app() && app().flush(); } catch (_) {} });
})();
