/* Hochsitze · Jagdgemeinschaft Thuine
 * Eigenständige Test-App, später Teil von „Jagd Thuine“.
 * Daten: data/hochsitze.json im GitHub-Repo (mit dem Passwort der Jagdgemeinschaft verschlüsselt, AES-GCM).
 * Fotos: data/fotos/*.bin (verschlüsselt, Format „SBE1“ wie die Dokumente in Jagd Thuine).
 * Lesen: öffentlich (GitHub-API bzw. Pages-Datei). Schreiben: nur mit GitHub-Token (Einstellungen).
 * Änderungen ohne Netz landen in einer Warteschlange (IndexedDB) und werden später hochgeladen.
 */
'use strict';

const APP_VERSION = '1.12.4';
/* Einstellungen je Installation (config.js): Konten-Server, Test-Umgebung */
const CONF = self.JAGD_CFG || {};
const LSP = CONF.lsPrefix || '';
const LS_CFG = 'hs.cfg.v1';
const LS_DATA = 'hs.data.v1';
const LS_PW = 'hs.pw.v1';
const LS_VIEW = 'hs.view.v1';
const LS_SALT = 'hs.salt.v1';
const DATA_PATH = 'data/hochsitze.json';
const FOTO_DIR = 'data/fotos';
const THUINE = [52.5028, 7.4836];
const NEAR_M = 30; // so nah dran → „Diesen Sitz umstellen?“

const ARTEN = {
  kanzel: { name: 'Kanzel (geschlossen)', short: 'Kanzel', color: '#1f4a24', icon: '<path d="M4 10 12 4.5l8 5.5v4H4Z"/><path d="M6.5 14v7M17.5 14v7M6.5 18h11"/>' },
  leiter: { name: 'Leiter / offener Sitz', short: 'Leiter', color: '#7a5a1e', icon: '<path d="M7.5 21 10 4M16.5 21 14 4M8.6 15h6.8M9.4 10h5.2M7 4h10"/>' },
  drueckjagd: { name: 'Drückjagdbock', short: 'Drückjagdbock', color: '#9a4b1c', icon: '<path d="M5 8h14v4H5ZM7.5 12 5.5 21M16.5 12l2 9M7 17h10"/>' },
  erdsitz: { name: 'Erdsitz / Bodensitz', short: 'Erdsitz', color: '#4d6a2a', icon: '<path d="M3 20h18M5 20v-7l7-4.5 7 4.5v7M9.5 14.5h5"/>' },
  sonst: { name: 'Sonstiges', short: 'Sonstiges', color: '#555b66', icon: '<circle cx="12" cy="12" r="4.5"/>' },
};
const LECKE = { name: 'Salzlecke', color: '#3c6e8f', icon: '<path d="M6.5 6.5h11v6h-11Z"/><path d="M12 12.5V21M9 21h6"/>' };
const KIRR_ICON = '<circle cx="12" cy="12" r="6.5"/><circle cx="10" cy="10.5" r="1" fill="currentColor"/><circle cx="14" cy="11" r="1" fill="currentColor"/><circle cx="11.5" cy="14" r="1" fill="currentColor"/>';
const WARTUNG = { bestueckt: 'Bestückt', kontrolliert: 'Kontrolliert', repariert: 'Repariert' };
const ZUSTAND = { gut: 'In Ordnung', maengel: 'Mängel', gesperrt: 'Gesperrt' };
const DIRS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
const LAYERS = {
  luftbild: { name: 'Luftbild', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', opt: { maxNativeZoom: 19, maxZoom: 20, crossOrigin: 'anonymous', attribution: 'Luftbild © Esri, Maxar, Earthstar Geographics' } },
  karte: { name: 'Topografische Karte', url: 'https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png', opt: { maxNativeZoom: 18, maxZoom: 20, attribution: '© BKG (TopPlusOpen)' } },
  osm: { name: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', opt: { maxNativeZoom: 19, maxZoom: 20, crossOrigin: 'anonymous', attribution: '© OpenStreetMap-Mitwirkende' } },
};

/* ================= Hilfsfunktionen ================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function lsGet(key, fallback) { try { const v = localStorage.getItem(LSP + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function lsSet(key, val) { try { val === undefined ? localStorage.removeItem(LSP + key) : localStorage.setItem(LSP + key, JSON.stringify(val)); } catch { /* egal */ } }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function dateDE(iso) {
  if (!iso) return '–';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
const dtDE = iso => iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–';
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}
function distM(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const distTxt = m => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
function bearing(a, b) {
  const r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
const dirName = deg => DIRS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
const dirTxt = deg => deg == null ? 'nicht angegeben' : `${Math.round(deg)}° ${dirName(deg)}`;
const coordTxt = s => `${s.lat.toFixed(6)}, ${s.lng.toFixed(6)}`;
const artOf = s => ARTEN[s.art] || ARTEN.sonst;
const artIcon = (art, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(ARTEN[art] || ARTEN.sonst).icon}</svg>`;

/* ================= Verschlüsselung (identisch zu Jagd Thuine) ================= */
class NeedPassword extends Error {}
const bytesToB64 = bytes => { let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const b64ToBytes = b64 => Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0));
const b64encodeUtf8 = str => bytesToB64(new TextEncoder().encode(str));
const keyCache = new Map();
async function deriveKey(pw, salt, iter = 150000) {
  const id = pw + '|' + iter + '|' + bytesToB64(salt);
  if (keyCache.has(id)) return keyCache.get(id);
  const p = (async () => {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  })();
  keyCache.set(id, p);
  p.catch(() => keyCache.delete(id));
  return p;
}
async function encryptJSON(obj, pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 150000;
  const key = await deriveKey(pw, salt, iter);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  return { enc: 'aes-gcm-v1', hinweis: 'Verschlüsselte Daten', iter, salt: bytesToB64(salt), iv: bytesToB64(iv), data: bytesToB64(ct) };
}
async function decryptJSON(env, pw) {
  const key = await deriveKey(pw, b64ToBytes(env.salt), env.iter || 150000);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(env.iv) }, key, b64ToBytes(env.data));
  return JSON.parse(new TextDecoder().decode(pt));
}
const MAGIC = [83, 66, 69, 49]; // "SBE1"
/** Fotos: ein fester Salt pro Gerät → der Schlüssel wird nur einmal abgeleitet (schnell bei vielen Bildern) */
function fotoSalt() {
  let s = lsGet(LS_SALT, '');
  if (!s) { s = bytesToB64(crypto.getRandomValues(new Uint8Array(16))); lsSet(LS_SALT, s); }
  return b64ToBytes(s);
}
async function encryptBytes(bytes, pw) {
  const salt = fotoSalt(), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pw, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(32 + ct.length);
  out.set(MAGIC, 0); out.set(salt, 4); out.set(iv, 20); out.set(ct, 32);
  return out;
}
const isEnc = b => b.length > 32 && MAGIC.every((v, i) => b[i] === v);
async function decryptBytes(b, pws = [state.pw]) {
  if (!isEnc(b)) return b;
  for (const pw of pws.filter(Boolean)) {
    try { const key = await deriveKey(pw, b.slice(4, 20)); return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(20, 32) }, key, b.slice(32))); } catch { /* nächstes */ }
  }
  throw new Error('Foto lässt sich nicht entschlüsseln (Passwort geändert?).');
}

/* ================= Kleiner Speicher auf dem Gerät (IndexedDB) ================= */
let dbP = null;
function db() {
  if (!dbP) dbP = new Promise((res, rej) => {
    const r = indexedDB.open(LSP + 'hochsitze', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbP;
}
async function idb(mode, fn) {
  try {
    const d = await db();
    return await new Promise((res, rej) => {
      const tx = d.transaction('kv', mode), st = tx.objectStore('kv');
      const req = fn(st);
      tx.oncomplete = () => res(req?.result);
      tx.onerror = () => rej(tx.error);
    });
  } catch { return undefined; }
}
const idbGet = k => idb('readonly', st => st.get(k));
const idbSet = (k, v) => idb('readwrite', st => st.put(v, k));
const idbDel = k => idb('readwrite', st => st.delete(k));
const idbKeys = () => idb('readonly', st => st.getAllKeys());

/* ================= Zustand ================= */
function defaultCfg() {
  let owner = '', repo = '';
  if (location.hostname.endsWith('.github.io')) {
    owner = location.hostname.split('.')[0];
    repo = location.pathname.split('/').filter(Boolean)[0] || `${owner}.github.io`;
  }
  if (CONF.owner) owner = CONF.owner;
  if (CONF.repo) repo = CONF.repo;
  return { owner, repo, branch: 'main', token: '', mode: '' };
}
const state = {
  cfg: Object.assign(defaultCfg(), lsGet(LS_CFG, {})),
  pw: lsGet(LS_PW, ''),
  remote: null,          // Stand auf GitHub (entschlüsselt)
  remoteEnc: false,      // liegt die Datei verschlüsselt vor?
  remoteExists: false,
  data: { version: 1, sitze: [] }, // remote + eigene, noch nicht hochgeladene Änderungen
  queue: [],
  view: Object.assign({ bl: 'civil', ctlZu: false, scent: true, windAnim: true, layer: 'luftbild', hist: false, tab: 'karte', sort: 'name', liste: 'sitze', lsort: 'alt' }, lsGet(LS_VIEW, {})),
  me: null,              // {lat, lng, acc}
  loaded: false,
};
// In der Test-Umgebung immer das Test-Repo (nie versehentlich in die echten Daten schreiben)
if ((state.cfg.mode !== 'voll' && location.hostname.endsWith('.github.io')) || CONF.test) {
  const d = defaultCfg(); Object.assign(state.cfg, { owner: d.owner, repo: d.repo });
}
/* Zugang: GitHub-Token auf dem Gerät (bisher) ODER Konto beim Konten-Server */
const tokenAdmin = () => !!(state.cfg.mode === 'voll' && state.cfg.token && state.cfg.owner && state.cfg.repo);
const viaKonto = () => !tokenAdmin() && !!window.Konto?.hatZugang();
const isAdmin = () => tokenAdmin() || !!(window.Konto?.isAdmin() && state.cfg.owner && state.cfg.repo);
/** Einzelrechte (vom Admin je Person freigegeben) */
const canZustand = () => isAdmin() || !!window.Konto?.can('zustand');
const canLecke = () => isAdmin() || !!window.Konto?.can('lecke');
const canWrite = () => isAdmin() || canZustand() || canLecke();
const saveCfg = () => lsSet(LS_CFG, state.cfg);
const saveView = () => lsSet(LS_VIEW, state.view);
const sitzById = id => state.data.sitze.find(s => s.id === id);
const leckeById = id => state.data.lecken.find(s => s.id === id);
const pendingIds = () => new Set(state.queue.map(o => o.sitzId));

function normalize(d) {
  d = d && typeof d === 'object' ? d : {};
  d.version ||= 1;
  d.sitze = Array.isArray(d.sitze) ? d.sitze : [];
  d.lecken = Array.isArray(d.lecken) ? d.lecken : [];
  d.lecken.forEach(l => { l.wartung ||= []; l.bemerkung ||= ''; });
  d.sitze.forEach(s => { if (s.flaeche && !(s.flaeche.pts?.length >= 3)) s.flaeche = null; if (s.kirrung === undefined) s.kirrung = null; s.verlauf ||= []; s.zustand ||= 'gut'; s.art ||= 'sonst'; s.bemerkung ||= ''; if (s.richtung === undefined) s.richtung = null; });
  return d;
}
function applyOps(data, ops) {
  const d = normalize(clone(data || {}));
  for (const op of ops) {
    if (op.t === 'meta') { if (op.val == null) delete d[op.key]; else d[op.key] = clone(op.val); continue; }
    const arr = d[op.coll === 'lecken' ? 'lecken' : 'sitze'];
    const i = arr.findIndex(s => s.id === op.sitzId);
    if (op.t === 'put') { if (i >= 0) arr[i] = clone(op.sitz); else arr.push(clone(op.sitz)); }
    if (op.t === 'del' && i >= 0) arr.splice(i, 1);
  }
  const byName = (a, b) => a.name.localeCompare(b.name, 'de', { numeric: true });
  d.sitze.sort(byName); d.lecken.sort(byName);
  return d;
}
function rebuild() {
  state.data = applyOps(state.remote || {}, state.queue);
  lsSet(LS_DATA, state.remote ? { enc: state.remoteEnc, data: state.remote } : undefined);
}

/* ================= GitHub ================= */
const ghBase = () => viaKonto() ? Konto.ghBase() : 'https://api.github.com';
function ghHeaders(auth, raw = false) {
  const h = { Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (viaKonto()) h.Authorization = `Bearer ${Konto.token()}`;
  else if (auth && state.cfg.token) h.Authorization = `Bearer ${state.cfg.token}`;
  return h;
}
/** Pfad im Repo (Test-Umgebung: Unterordner, z. B. „hochsitze/“) */
const repoPath = path => CONF.base && !path.startsWith(CONF.base) ? CONF.base + path : path;
function ghUrl(path, ref = true) {
  const { owner, repo, branch } = state.cfg;
  return `${ghBase()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${repoPath(path).split('/').map(encodeURIComponent).join('/')}` + (ref ? `?ref=${encodeURIComponent(branch || 'main')}` : '');
}
/** Fehlermeldung des Konten-Servers lesen (z. B. „Dafür fehlt dir das Recht“) */
async function serverFehler(r, fallback) { try { const j = await r.clone().json(); return j.fehler || j.message || fallback; } catch { return fallback; } }
/** Liest die Datendatei. Ergebnis: {raw} (null = Datei gibt es noch nicht) – wirft bei Netzfehler. */
async function fetchRemoteRaw() {
  const { owner, repo } = state.cfg;
  if (owner && repo) {
    try {
      const r = await fetch(ghUrl(DATA_PATH) + `&t=${Date.now()}`, { headers: ghHeaders(true, true), cache: 'no-store' });
      if (r.ok) return { raw: JSON.parse(await r.text()) };
      if (r.status === 404) return { raw: null };
      if (r.status === 401 && !viaKonto()) toast('GitHub-Token ungültig – bitte in den Einstellungen prüfen.', 5000);
    } catch { /* weiter mit Pages */ }
  }
  const r = await fetch(`${DATA_PATH}?t=${Date.now()}`, { cache: 'no-store' });
  if (r.status === 404) return { raw: null };
  if (!r.ok) throw new Error('Daten nicht erreichbar');
  return { raw: await r.json() };
}
async function openRaw(raw) {
  if (!raw) return { data: { version: 1, sitze: [] }, enc: false };
  if (!raw.enc) return { data: raw, enc: false };
  if (!state.pw) throw new NeedPassword('fehlt');
  try { return { data: await decryptJSON(raw, state.pw), enc: true }; } catch { throw new NeedPassword('falsch'); }
}
async function getSha(path) {
  const r = await fetch(ghUrl(path) + `&t=${Date.now()}`, { headers: ghHeaders(true), cache: 'no-store' });
  if (r.ok) return (await r.json()).sha;
  if (r.status === 404) return undefined;
  if (r.status === 401 || r.status === 403) throw new Error(viaKonto() ? await serverFehler(r, 'Keine Rechte') : 'Keine Rechte – Token prüfen');
  throw new Error(`GitHub ${r.status}`);
}
async function putFile(path, b64, message, sha) {
  const body = { message, content: b64, branch: state.cfg.branch || 'main' };
  if (sha) body.sha = sha;
  const r = await fetch(ghUrl(path, false), { method: 'PUT', headers: { ...ghHeaders(true), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r;
}
async function deleteFile(path, message) {
  try {
    const sha = await getSha(path); if (!sha) return;
    await fetch(ghUrl(path, false), { method: 'DELETE', headers: { ...ghHeaders(true), 'Content-Type': 'application/json' }, body: JSON.stringify({ message, sha, branch: state.cfg.branch || 'main' }) });
  } catch { /* egal – die Datei ist ohnehin nicht mehr verlinkt */ }
}

/* ================= Laden ================= */
async function load({ quiet = false } = {}) {
  const btn = $('#refreshBtn'); btn.classList.add('spin');
  try {
    const { raw } = await fetchRemoteRaw();
    state.remoteExists = !!raw;
    const { data, enc } = await openRaw(raw);
    state.remote = normalize(data); state.remoteEnc = enc;
    $('#lock').hidden = true;
    rebuild(); state.loaded = true; render();
    if (state.queue.length && canWrite()) flush();
  } catch (e) {
    if (e instanceof NeedPassword) {
      // Angemeldetes Konto: aktuelles Passwort vom Server holen (z. B. nach Passwortwechsel)
      if (window.Konto?.loggedIn() && Date.now() - (load._kt || 0) > 60e3) {
        load._kt = Date.now();
        const vorher = state.pw;
        await Konto.refresh();
        if (state.pw && state.pw !== vorher) return;
      }
      showLock(e.message); return;
    }
    if (!quiet) toast(state.loaded ? 'Offline – zeige zuletzt geladenen Stand.' : 'Keine Verbindung – zeige gespeicherten Stand.', 3500);
  } finally { btn.classList.remove('spin'); }
}
async function loadCached() {
  state.queue = (await idbGet('queue')) || [];
  const c = lsGet(LS_DATA, null);
  if (c && c.data && (!c.enc || state.pw)) { state.remote = normalize(c.data); state.remoteEnc = c.enc; }
  rebuild(); render();
}

/* ================= Speichern (Warteschlange) ================= */
const saveQueue = () => idbSet('queue', state.queue);
async function enqueue(op) {
  op.id = uid(); op.zeit = new Date().toISOString(); op.files ||= []; op.done = [];
  state.queue.push(op);
  await saveQueue();
  rebuild(); render();
  flush();
}
let flushing = false;
async function flush() {
  if (flushing || !state.queue.length) { updateBanner(); return; }
  if (!canWrite()) { updateBanner(); return; }
  if (!state.pw) { updateBanner(); return; }
  flushing = true; updateBanner('Speichere …');
  const batch = [...state.queue];
  try {
    // 1) Fotos hochladen
    let n = 0; const total = batch.reduce((a, o) => a + o.files.length - o.done.length, 0);
    for (const op of batch) {
      for (const p of op.files) {
        if (op.done.includes(p)) continue;
        const bin = await idbGet('bin:' + p);
        if (bin) {
          updateBanner(`Lade Fotos hoch … ${++n}/${total}`);
          const r = await putFile(p, bytesToB64(bin), `Foto ${op.sitzName || ''}`.trim());
          if (!r.ok && r.status !== 422) throw new Error(r.status === 401 || r.status === 403 ? (viaKonto() ? await serverFehler(r, 'Keine Schreibrechte') : 'Keine Schreibrechte (Token prüfen)') : `Foto-Upload fehlgeschlagen (GitHub ${r.status})`);
        }
        op.done.push(p); await saveQueue();
      }
    }
    // 2) Daten: neuesten Stand holen, eigene Änderungen anwenden, speichern
    updateBanner('Speichere …');
    let ok = false, fresh;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      const { raw } = await fetchRemoteRaw();
      const opened = await openRaw(raw);
      fresh = applyOps(opened.data, batch);
      fresh.stand = new Date().toISOString();
      const sha = await getSha(DATA_PATH);
      const body = JSON.stringify(await encryptJSON(fresh, state.pw), null, 1) + '\n';
      const msg = batch.length === 1 ? batch[0].msg : `${batch.length} Änderungen an Hochsitzen`;
      const r = await putFile(DATA_PATH, b64encodeUtf8(body), msg, sha);
      if (r.ok) ok = true;
      else if (r.status === 409 || r.status === 422) continue;
      else throw new Error(r.status === 401 || r.status === 403 ? (viaKonto() ? await serverFehler(r, 'Keine Schreibrechte') : 'Keine Schreibrechte (Token prüfen)') : `GitHub ${r.status}`);
    }
    if (!ok) throw new Error('Konflikt beim Speichern');
    // 3) Aufräumen
    const ids = new Set(batch.map(o => o.id));
    state.queue = state.queue.filter(o => !ids.has(o.id));
    await saveQueue();
    state.remote = normalize(fresh); state.remoteEnc = true; state.remoteExists = true;
    rebuild(); render();
    toast('Gespeichert ✓ – für alle sichtbar.');
    for (const op of batch) for (const p of op.delFiles || []) deleteFile(p, 'Foto entfernt');
  } catch (e) {
    if (e instanceof NeedPassword) { updateBanner(null, 'Passwort passt nicht zur Datei auf GitHub – bitte in den Einstellungen prüfen.'); return; }
    updateBanner(null, navigator.onLine === false ? 'Kein Netz' : e.message);
    return;
  } finally { flushing = false; }
  updateBanner();
  if (state.queue.length) flush();
}
function updateBanner(busy, err) {
  const b = $('#banner');
  const n = state.queue.length;
  if (busy) { b.className = 'banner'; b.innerHTML = `<span>⏳ ${esc(busy)}</span>`; b.hidden = false; return; }
  if (!n) { b.hidden = true; return; }
  const why = !canWrite() ? 'Kein Schreibzugang auf diesem Gerät' : !state.pw ? 'Passwort fehlt' : err || 'Wartet auf Netz';
  b.className = 'banner' + (err ? ' err' : '');
  b.innerHTML = `<span>📤 ${n} ${n === 1 ? 'Änderung' : 'Änderungen'} noch nicht hochgeladen · ${esc(why)}</span><button class="btn small" id="retryBtn">Jetzt senden</button>`;
  b.hidden = false;
  $('#retryBtn').onclick = () => { if (!state.pw && canWrite()) openPwSheet(); else flush(); };
}

/* ================= Fotos ================= */
const imgUrlCache = new Map();
/** Verschlüsselte Bytes eines Fotos: Gerät → GitHub Pages → API (Admin, sofort aktuell) → raw */
async function fetchBin(path) {
  const cached = await idbGet('bin:' + path);
  if (cached) return cached;
  const { owner, repo, branch } = state.cfg;
  const tries = [() => fetch(path, { cache: 'force-cache' })];
  if (isAdmin() || viaKonto()) tries.push(() => fetch(ghUrl(path) + `&t=${Date.now()}`, { headers: ghHeaders(true, true), cache: 'no-store' }));
  if (owner && repo) tries.push(() => fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch || 'main'}/${repoPath(path)}`));
  for (const t of tries) {
    try {
      const r = await t();
      if (r.ok) { const b = new Uint8Array(await r.arrayBuffer()); if (b.length) { idbSet('bin:' + path, b); return b; } }
    } catch { /* nächster Weg */ }
  }
  throw new Error('Foto nicht erreichbar');
}
async function imgUrl(path) {
  if (!path) return '';
  if (imgUrlCache.has(path)) return imgUrlCache.get(path);
  const p = (async () => URL.createObjectURL(new Blob([await decryptBytes(await fetchBin(path))], { type: 'image/jpeg' })))();
  imgUrlCache.set(path, p);
  p.catch(() => imgUrlCache.delete(path));
  return p;
}
/** Bilder mit data-img="pfad" nachladen */
function hydrateImages(root = document) {
  $$('[data-img]', root).forEach(async el => {
    const p = el.dataset.img; el.removeAttribute('data-img');
    try {
      const u = await imgUrl(p);
      if (el.tagName === 'IMG') el.src = u; else el.style.backgroundImage = `url("${u}")`;
    } catch { el.classList.add('img-fail'); }
  });
}
function loadImage(file) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file), img = new Image();
    img.onload = () => res({ img, done: () => URL.revokeObjectURL(u) });
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Bild konnte nicht gelesen werden')); };
    img.src = u;
  });
}
function toJpeg(img, w, h, q = 0.82) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((res, rej) => c.toBlob(b => {
    c.width = c.height = 0;
    b ? b.arrayBuffer().then(a => res(new Uint8Array(a))) : rej(new Error('Bild zu groß für dieses Gerät'));
  }, 'image/jpeg', q));
}
/** Foto verkleinern: normal 1600 px lange Seite, Panorama 1200 px hoch (max. 9000 px breit) + Vorschaubild */
async function prepPhoto(file, kind) {
  const { img, done } = await loadImage(file);
  try {
    const W = img.naturalWidth, H = img.naturalHeight;
    let s;
    if (kind === 'pano') s = Math.min(1, 1200 / H, 9000 / W);
    else s = Math.min(1, 1600 / Math.max(W, H));
    const w = Math.round(W * s), h = Math.round(H * s);
    const full = await toJpeg(img, w, h, 0.82);
    const ts = kind === 'pano' ? 180 / H : 260 / Math.max(W, H);
    const thumb = await toJpeg(img, Math.max(1, Math.round(W * Math.min(1, ts))), Math.max(1, Math.round(H * Math.min(1, ts))), 0.75);
    return { full, thumb, w, h };
  } finally { done(); }
}

/* ================= Karte ================= */
let map, baseLayer, sitzLayer, histLayer, flLayer, scentLayer, revLayer, meMarker, meCircle;
/* Kreise/Flächen beim Zoomen nicht per CSS hochskalieren (driftet mit leaflet-rotate, v. a. iPhone),
 * sondern bei jedem Zoom-Schritt neu an ihrer Stelle zeichnen; während einer Zoom-Animation kurz ausblenden. */
(function vektorZoomFix() {
  const orig = L.Renderer.prototype.getEvents;
  L.Renderer.include({
    getEvents() {
      const ev = orig.call(this);
      ev.zoom = this._hsZoom; ev.zoomanim = this._hsAnim; ev.zoomend = this._hsZoomEnd;
      ev.moveend = this._hsMoveEnd; ev.viewreset = this._hsZoomEnd;
      return ev;
    },
    _hsShow() { clearTimeout(this._hsT); if (this._container) this._container.style.visibility = ''; },
    _hsZoom() { if (this._map && !this._map._animatingZoom) { this._reset(); this._hsShow(); } },
    _hsAnim() {
      if (this._container) this._container.style.visibility = 'hidden';
      clearTimeout(this._hsT); this._hsT = setTimeout(() => this._hsZoomEnd(), 350); // Sicherheitsnetz
    },
    _hsZoomEnd() {
      if (!this._map || this._map._animatingZoom) return;
      for (const id in this._layers) this._layers[id]._project();
      this._reset(); this._hsShow();
    },
    _hsMoveEnd() { this._update(); if (!this._map._animatingZoom) this._hsShow(); },
  });
})();

function initMap() {
  map = L.map('map', { zoomControl: false, attributionControl: true, center: THUINE, zoom: 14, tap: true,
    rotate: true, touchRotate: true, rotateControl: false, bearing: 0, shiftKeyRotate: true });
  const brg = () => { const b = map.getBearing ? map.getBearing() : 0; $('#view-karte').style.setProperty('--brg', b + 'deg'); $('#northBtn').classList.toggle('rotated', Math.abs(((b + 540) % 360) - 180) > 0.5); };
  map.on('rotate', brg); brg();
  // Nordpfeil: gedreht → Norden; Norden → Kompass folgen; Kompass → Norden
  $('#northBtn').onclick = async () => {
    if (follow.stop) { stopFollow(); map.setBearing(0); brg(); toast('Karte nach Norden ausgerichtet', 1400); return; }
    if (Math.abs(((map.getBearing() + 540) % 360) - 180) > 0.5) { map.setBearing(0); brg(); return; }
    await startFollow();
  };
  // Mit zwei Fingern selbst drehen beendet das Mitdrehen
  $('#map').addEventListener('touchstart', e => { if (follow.stop && e.touches.length >= 2) { stopFollow(); toast('Kompass-Ausrichtung beendet', 1400); } }, { passive: true });
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
  map.attributionControl.setPrefix(false);
  setLayer(state.view.layer, true);
  revLayer = L.layerGroup().addTo(map);
  scentLayer = L.layerGroup().addTo(map);
  flLayer = L.layerGroup().addTo(map);
  sitzLayer = L.layerGroup().addTo(map);
  histLayer = L.layerGroup();
  if (state.view.hist) histLayer.addTo(map);
  $('#histBtn').classList.toggle('on', state.view.hist);
  map.on('zoomend', labelZoom); labelZoom();
  $('#layerBtn').onclick = () => {
    const keys = Object.keys(LAYERS);
    setLayer(keys[(keys.indexOf(state.view.layer) + 1) % keys.length]);
  };
  $('#histBtn').onclick = () => toggleHist();
  $('#fitBtn').onclick = () => fitAll(true);
  const ctl = () => {
    const zu = !!state.view.ctlZu;
    $('.map-ctl-tr').classList.toggle('collapsed', zu);
    $('#ctlToggle').setAttribute('aria-expanded', String(!zu));
  };
  $('#ctlToggle').onclick = () => { state.view.ctlZu = !state.view.ctlZu; saveView(); ctl(); };
  ctl();
  $('#windBadge').onclick = () => { openWind(); loadWind(); };
  $('#sunBadge').onclick = () => openSun();
  $('#measureBtn').onclick = () => (meas.on ? stopMeasure() : startMeasure());
  $('#measDone').onclick = () => stopMeasure();
  $('#measClear').onclick = () => { meas.targets = []; drawMeasure(); };
  $('#measStart').onclick = () => { meas.wait = 'start'; measInfo('<b>Neuen Startpunkt</b> in die Karte tippen (Hochsitz antippen = genau dort)'); };
  map.on('click', e => { if (meas.on) measTap(e.latlng); });
  $('#locBtn').onclick = () => locate();
  $('#addBtn').onclick = () => openAddChoice();
}
function makeTiles(key) { const l = LAYERS[key] || LAYERS.luftbild; return L.tileLayer(l.url, l.opt); }
function setLayer(key, silent) {
  if (!LAYERS[key]) key = 'luftbild';
  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = makeTiles(key).addTo(map);
  state.view.layer = key; saveView();
  if (!silent) {
    const n = $('#layerName'); n.textContent = LAYERS[key].name; n.hidden = false;
    clearTimeout(setLayer._t); setLayer._t = setTimeout(() => (n.hidden = true), 1400);
  }
}
function labelZoom() { $('#map').classList.toggle('z-lo', map.getZoom() < 15); }
function toggleHist(on = !state.view.hist) {
  state.view.hist = on; saveView();
  $('#histBtn').classList.toggle('on', on);
  if (on) histLayer.addTo(map); else map.removeLayer(histLayer);
  toast(on ? 'Alte Standorte werden angezeigt' : 'Alte Standorte ausgeblendet', 1600);
}
function coneSvg(deg) {
  if (deg == null) return '';
  return `<svg class="hs-cone" viewBox="0 0 46 46" style="--r:${Math.round(deg)}deg" aria-hidden="true"><path d="M23 23 L12 3.95 A22 22 0 0 1 34 3.95 Z" fill="rgba(255,214,90,.55)" stroke="rgba(120,90,10,.8)" stroke-width="1"/></svg>`;
}
function sitzIcon(s, pending) {
  const a = artOf(s);
  const ring = s.zustand === 'gesperrt' ? '#c0281a' : s.zustand === 'maengel' ? '#e0a000' : '#fff';
  return L.divIcon({
    className: 'hs-ico', iconSize: [46, 46], iconAnchor: [23, 23], tooltipAnchor: [0, 16],
    html: `<div class="hs-wrap">${coneSvg(s.richtung)}<div class="hs-pin${pending ? ' pending' : ''}" style="background:${a.color};border-color:${ring}">${artIcon(s.art)}</div></div>`,
  });
}
function renderMap() {
  if (!map) return;
  sitzLayer.clearLayers(); histLayer.clearLayers(); flLayer.clearLayers();
  if (meas.on) drawMeasure();
  drawScent();
  drawRevier();
  const pend = pendingIds();
  for (const s of state.data.sitze) {
    if (s.flaeche) {
      const pg = L.polygon(s.flaeche.pts, { color: '#e8d24a', weight: 2, fillColor: '#f2e27a', fillOpacity: .22 });
      pg.bindTooltip(`Freifläche ${esc(s.name)} · ${areaTxt(s.flaeche.m2)}`, { sticky: true });
      pg.on('click', e => pick(e, () => openDetail(s.id), `Freifläche ${s.name}`));
      flLayer.addLayer(pg);
    }
    if (s.kirrung) {
      const km = L.marker([s.kirrung.lat, s.kirrung.lng], { icon: kirrIcon(), title: `Kirrung ${s.name}` });
      km.bindTooltip(`Kirrung · ${esc(s.name)}<br><small>${distTxt(distM(s, s.kirrung))} vom Sitz</small>`, { direction: 'top' });
      km.on('click', e => pick(e, () => openDetail(s.id), `Kirrung ${s.name}`));
      flLayer.addLayer(km);
    }
  }
  for (const l of state.data.lecken) {
    const m = L.marker([l.lat, l.lng], { icon: leckeIcon(pend.has(l.id)), title: l.name });
    m.bindTooltip(esc(l.name), { permanent: true, direction: 'bottom', className: 'hs-label', offset: [0, 4] });
    m.on('click', e => pick(e, () => openLecke(l.id), l.name));
    sitzLayer.addLayer(m);
  }
  for (const s of state.data.sitze) {
    const m = L.marker([s.lat, s.lng], { icon: sitzIcon(s, pend.has(s.id)), keyboard: true, title: s.name, riseOnHover: true });
    m.bindTooltip(esc(s.name), { permanent: true, direction: 'bottom', className: 'hs-label', offset: [0, 4] });
    m.on('click', e => pick(e, () => openDetail(s.id), s.name));
    sitzLayer.addLayer(m);
    let prev = [s.lat, s.lng];
    for (const v of s.verlauf) {
      const p = [v.lat, v.lng];
      histLayer.addLayer(L.polyline([prev, p], { color: '#333', weight: 2, dashArray: '5 6', opacity: .75, interactive: false }));
      const om = L.marker(p, { icon: L.divIcon({ className: 'hs-old', iconSize: [12, 12], iconAnchor: [6, 6], html: '<i></i>' }) });
      om.bindTooltip(`${esc(s.name)}<br><small>bis ${dateDE(v.bis)}</small>`, { direction: 'top' });
      om.on('click', e => pick(e, () => openDetail(s.id), `${s.name} (alt)`));
      histLayer.addLayer(om);
      prev = p;
    }
  }
}
function fitAll(animate) {
  const pts = [...state.data.sitze, ...state.data.lecken].map(s => [s.lat, s.lng]);
  if (state.data.revier) state.data.revier.polys.forEach(pl => pl[0].forEach(p => pts.push(p)));
  if (state.me) pts.push([state.me.lat, state.me.lng]);
  if (!pts.length) { map.setView(THUINE, 14, { animate }); return; }
  if (pts.length === 1) { map.setView(pts[0], 17, { animate }); return; }
  map.fitBounds(L.latLngBounds(pts).pad(0.12), { animate, maxZoom: 17 });
}
function focusSitz(s) {
  switchTab('karte');
  setTimeout(() => { map.invalidateSize(); map.setView([s.lat, s.lng], Math.max(map.getZoom(), 17)); }, 60);
}

/* ---------- Eigener Standort ---------- */
let meWatch = null, meCentered = false;
function locate() {
  if (!navigator.geolocation) { toast('Dieses Gerät liefert keinen Standort.'); return; }
  if (meWatch != null && state.me) {
    // läuft schon → nochmal tippen = zentrieren, Doppeltipp auf aktiven Knopf = aus
    if (map.getCenter().distanceTo([state.me.lat, state.me.lng]) < 5) { stopLocate(); return; }
    map.setView([state.me.lat, state.me.lng], Math.max(map.getZoom(), 16)); return;
  }
  meCentered = false;
  $('#locBtn').classList.add('follow');
  meWatch = navigator.geolocation.watchPosition(p => {
    state.me = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
    const ll = [state.me.lat, state.me.lng];
    if (!meMarker) {
      meMarker = L.marker(ll, { icon: L.divIcon({ className: 'me-dot', iconSize: [24, 24], iconAnchor: [12, 12], html: '<i></i>' }), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
      meCircle = L.circle(ll, { radius: state.me.acc, color: '#1c6fe0', weight: 1, fillOpacity: .12, interactive: false }).addTo(map);
    } else { meMarker.setLatLng(ll); meCircle.setLatLng(ll).setRadius(state.me.acc); }
    if (!meCentered) { meCentered = true; map.setView(ll, Math.max(map.getZoom(), 16)); }
    if (state.view.tab === 'liste') renderListDistances();
  }, err => {
    stopLocate();
    toast(err.code === 1 ? 'Standort nicht erlaubt – bitte in den Einstellungen des Handys freigeben.' : 'Standort nicht verfügbar.', 4500);
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
}
function stopLocate() {
  if (meWatch != null) navigator.geolocation.clearWatch(meWatch);
  meWatch = null; $('#locBtn').classList.remove('follow');
  if (meMarker) { map.removeLayer(meMarker); map.removeLayer(meCircle); meMarker = meCircle = null; }
  state.me = null;
}


/* ================= Entfernung messen (ab 1.2.0, nur auf dem Gerät, nichts wird gespeichert) ================= */
const meas = { on: false, start: null, targets: [], layer: null, wait: false };
/** Klick auf Kartenobjekt: im Messmodus als Ziel/Start nehmen, sonst normal öffnen */
function pick(e, fn, label) {
  if (!meas.on) { fn(); return; }
  if (e?.originalEvent) L.DomEvent.stop(e);
  measTap(e.latlng || e.target.getLatLng(), label);
}
function startMeasure() {
  meas.on = true; meas.targets = []; meas.start = null; meas.wait = false;
  meas.layer = L.layerGroup().addTo(map);
  $('#measureBtn').classList.add('on'); $('#addBtn').hidden = true;
  $('#map').classList.add('measuring');
  const bar = $('#measBar'); bar.hidden = false;
  const fromPos = me => {
    const near = [...state.data.sitze].map(x => ({ x, d: distM(me, x) })).sort((a, b) => a.d - b.d)[0];
    if (near && near.d <= Math.max(25, me.acc || 0)) setMeasStart({ lat: near.x.lat, lng: near.x.lng }, near.x.name);
    else setMeasStart({ lat: me.lat, lng: me.lng }, 'Mein Standort');
  };
  if (state.me) fromPos(state.me);
  else if (navigator.geolocation) {
    measInfo('Suche Standort … oder Startpunkt in die Karte tippen');
    meas.wait = true;
    navigator.geolocation.getCurrentPosition(p => {
      if (!meas.on || meas.start) return;
      state.me = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
      fromPos(state.me);
    }, () => { if (meas.on && !meas.start) measInfo('Kein GPS – Startpunkt (z. B. Hochsitz) in die Karte tippen'); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  } else measInfo('Startpunkt (z. B. Hochsitz) in die Karte tippen');
}
function stopMeasure() {
  meas.on = false; if (meas.layer) { map.removeLayer(meas.layer); meas.layer = null; }
  meas.targets = []; meas.start = null;
  $('#measureBtn').classList.remove('on'); $('#measBar').hidden = true; $('#map').classList.remove('measuring');
  $('#addBtn').hidden = !isAdmin();
}
function measInfo(txt) { $('#measTxt').innerHTML = txt; }
function setMeasStart(ll, label) {
  meas.start = { lat: ll.lat, lng: ll.lng, label: label || 'Start' }; meas.wait = false;
  if (!map.getBounds().contains([ll.lat, ll.lng])) map.setView([ll.lat, ll.lng], Math.max(map.getZoom(), 17));
  drawMeasure();
}
function measTap(ll, label) {
  if (!meas.start || meas.wait === 'start') { setMeasStart(ll, label || 'Startpunkt'); return; }
  meas.targets.push({ lat: ll.lat, lng: ll.lng, label: label || '' });
  if (navigator.vibrate) navigator.vibrate(20);
  drawMeasure();
}
function drawMeasure() {
  const L0 = meas.layer; if (!L0) return; L0.clearLayers();
  const st = meas.start; if (!st) return;
  [50, 100, 150, 200].forEach(r => {
    L0.addLayer(L.circle([st.lat, st.lng], { radius: r, color: '#fff', weight: 1, opacity: .7, dashArray: '2 5', fill: false, interactive: false }));
    const lbl = L.marker([st.lat + r / 111195, st.lng], { interactive: false, icon: L.divIcon({ className: 'ring-lbl', iconSize: [40, 14], iconAnchor: [20, 7], html: `${r} m` }) });
    L0.addLayer(lbl);
  });
  const sm = L.marker([st.lat, st.lng], { draggable: true, zIndexOffset: 900, icon: L.divIcon({ className: 'meas-start', iconSize: [22, 22], iconAnchor: [11, 11], html: '<i></i>' }) });
  sm.on('drag', e => { st.lat = e.latlng.lat; st.lng = e.latlng.lng; });
  sm.on('dragend', () => { st.label = 'Startpunkt'; drawMeasure(); });
  L0.addLayer(sm);
  meas.targets.forEach((t, i) => {
    const d = distM(st, t), b = bearing(st, t);
    L0.addLayer(L.polyline([[st.lat, st.lng], [t.lat, t.lng]], { color: '#ffd54a', weight: 3, opacity: .95, interactive: false }));
    const tm = L.marker([t.lat, t.lng], { zIndexOffset: 950, icon: L.divIcon({ className: 'meas-t', iconSize: [14, 14], iconAnchor: [7, 7], html: '<i></i>' }) });
    tm.bindTooltip(`<b>${distTxt(d)}</b> · ${Math.round(b)}° ${dirName(b)}${t.label ? `<br><small>${esc(t.label)}</small>` : ''}`, { permanent: true, direction: 'auto', className: 'meas-lbl', offset: [0, 0] });
    tm.on('click', e => { L.DomEvent.stop(e); meas.targets.splice(i, 1); drawMeasure(); });
    L0.addLayer(tm);
  });
  const last = meas.targets[meas.targets.length - 1];
  measInfo(`Start: <b>${esc(st.label)}</b>${last ? ` · letztes Ziel <b>${distTxt(distM(st, last))}</b> · Ziel antippen = weg` : ' · Ziel in die Karte tippen'}`);
}


/* ================= Wind (ab 1.3.0) – Deutscher Wetterdienst über Bright Sky, Ersatz: Open-Meteo (DWD ICON) ================= */
const LS_WIND = 'hs.wind.v1';
const wind = { cur: lsGet(LS_WIND, null), fc: null, loading: false, at: 0 };
const angDiff = (a, b) => { const d = Math.abs((((a - b) % 360) + 360) % 360); return d > 180 ? 360 - d : d; };
function windPos() {
  const rv = state.data.revier;
  if (rv?.polys?.length) { const o = rv.polys.flatMap(pl => pl[0]); return { lat: o.reduce((a, p) => a + p[0], 0) / o.length, lng: o.reduce((a, p) => a + p[1], 0) / o.length }; }
  const pts = [...state.data.sitze, ...state.data.lecken];
  if (!pts.length) return { lat: THUINE[0], lng: THUINE[1] };
  return { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length };
}
function bft(kmh) { const t = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118]; let i = 0; while (i < t.length && kmh >= t[i]) i++; return i; }
async function fetchJson(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
async function loadWind(force = false) {
  if (wind.loading || (!force && Date.now() - wind.at < 9 * 60 * 1000)) return;
  wind.loading = true; $('#windBadge')?.classList.add('busy');
  const p = windPos(), la = p.lat.toFixed(4), lo = p.lng.toFixed(4);
  try {
    try {
      const j = await fetchJson(`https://api.brightsky.dev/current_weather?lat=${la}&lon=${lo}&tz=Europe/Berlin`);
      const w = j.weather || {}, src = (j.sources || []).find(x => x.id === w.source_id) || (j.sources || [])[0] || {};
      if (w.wind_direction_10 == null && w.wind_speed_10 == null) throw new Error('keine Winddaten');
      wind.cur = { dir: w.wind_direction_10, speed: w.wind_speed_10, gust: w.wind_gust_speed_10, zeit: w.timestamp, station: src.station_name || '', dist: src.distance, quelle: 'DWD-Messstation (Bright Sky)', abruf: new Date().toISOString() };
      try {
        const now = new Date(), end = new Date(now.getTime() + 13 * 3600e3);
        const f = await fetchJson(`https://api.brightsky.dev/weather?lat=${la}&lon=${lo}&date=${encodeURIComponent(now.toISOString())}&last_date=${encodeURIComponent(end.toISOString())}&tz=Europe/Berlin`);
        wind.fc = (f.weather || []).filter(x => new Date(x.timestamp) > now).slice(0, 12).map(x => ({ zeit: x.timestamp, dir: x.wind_direction, speed: x.wind_speed, gust: x.wind_gust_speed }));
        wind.fcQuelle = 'DWD-Vorhersage MOSMIX (Bright Sky)';
      } catch { wind.fc = null; }
    } catch {
      const j = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&models=icon_seamless&wind_speed_unit=kmh&timezone=Europe%2FBerlin&forecast_hours=13`);
      const c = j.current || {};
      wind.cur = { dir: c.wind_direction_10m, speed: c.wind_speed_10m, gust: c.wind_gusts_10m, zeit: c.time, station: '', quelle: 'DWD-Modell ICON (Open-Meteo)', abruf: new Date().toISOString() };
      const h = j.hourly || {}, now = Date.now();
      wind.fc = (h.time || []).map((t, i) => ({ zeit: t, dir: h.wind_direction_10m[i], speed: h.wind_speed_10m[i], gust: h.wind_gusts_10m[i] })).filter(x => new Date(x.zeit).getTime() > now).slice(0, 12);
      wind.fcQuelle = 'DWD-Modell ICON (Open-Meteo)';
    }
    wind.at = Date.now();
    lsSet(LS_WIND, wind.cur);
  } catch { /* offline – letzter Stand bleibt */ }
  finally { wind.loading = false; renderWind(); }
}
const windArrow = (dir, size = 26) => dir == null ? '' : `<svg viewBox="0 0 24 24" width="${size}" height="${size}" class="wrot" style="--r:${Math.round(dir + 180)}deg" aria-hidden="true"><path d="M12 2 18.5 20 12 16 5.5 20Z" fill="currentColor"/></svg>`;
const zeitHM = iso => iso ? new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–';
function windAlt(c) { if (!c?.abruf) return ''; const min = (Date.now() - new Date(c.zeit || c.abruf).getTime()) / 60000; return min > 90 ? ' (älter)' : ''; }
function renderWind() {
  flowCheck();
  drawScent();
  const b = $('#windBadge'); if (!b) return;
  const c = wind.cur;
  b.classList.toggle('busy', wind.loading);
  if (!c || c.speed == null) { b.innerHTML = '<span class="w-txt"><b>Wind</b><small>lädt …</small></span>'; return; }
  b.innerHTML = `<span class="w-arrow">${windArrow(c.dir)}</span><span class="w-txt"><b>aus ${c.dir == null ? '–' : dirName(c.dir)} · ${Math.round(c.speed)} km/h</b><small>${c.gust != null ? `Böen ${Math.round(c.gust)} · ` : ''}${zeitHM(c.zeit)}${windAlt(c)}</small></span>`;
}
/** Wind gegenüber Blickrichtung des Sitzes */
function windFuerSitz(s) {
  const c = wind.cur;
  if (!c || c.dir == null || c.speed == null) return '';
  const base = `aus ${dirName(c.dir)} (${Math.round(c.dir)}°), ${Math.round(c.speed)} km/h`;
  const warn = scentWarn(s), w = warn ? `<br><b style="color:var(--warn)">⚠ ${warn}</b>` : '';
  if (c.speed < 4) return `${base} – kaum Wind, kann umlaufen`;
  if (s.richtung == null) return base + w;
  const d = angDiff(c.dir, s.richtung);
  if (d <= 60) return `${base} – <b style="color:var(--green)">von vorn, günstig</b>${w}`;
  if (d >= 120) return `${base} – <b style="color:var(--warn)">im Rücken, ungünstig</b>${w}`;
  return `${base} – <b style="color:var(--brass)">Seitenwind</b>${w}`;
}
function openWind() {
  const c = wind.cur;
  const body = c ? `
    <div class="card pad wind-now"><span class="w-big">${windArrow(c.dir, 54)}</span>
      <div><div class="w-dir">Wind aus ${c.dir == null ? '–' : `${dirName(c.dir)} <small>(${Math.round(c.dir)}°)</small>`}</div>
      <div class="w-spd">${c.speed == null ? '–' : Math.round(c.speed)} km/h${c.gust != null ? ` · Böen ${Math.round(c.gust)} km/h` : ''}</div>
      <div class="sub">${c.speed != null ? `Stärke ${bft(c.speed)} Bft · ` : ''}Stand ${zeitHM(c.zeit)}${windAlt(c)}</div></div></div>
    <p class="hint">Quelle: ${esc(c.quelle)}${c.station ? `, Station ${esc(c.station)}${c.dist ? ` (${distTxt(c.dist)} entfernt)` : ''}` : ''}. Der Pfeil zeigt, wohin der Wind weht.</p>
    ${wind.fc?.length ? `<h2 class="section">Nächste Stunden</h2><div class="card"><ul class="wind-fc">${wind.fc.map(f => `<li><span class="t">${zeitHM(f.zeit)}</span><span class="a">${windArrow(f.dir, 18)}</span><span class="d">aus ${f.dir == null ? '–' : dirName(f.dir)}</span><span class="v">${f.speed == null ? '–' : Math.round(f.speed)} km/h</span><span class="g">${f.gust != null ? `Böen ${Math.round(f.gust)}` : ''}</span></li>`).join('')}</ul></div><p class="hint">Vorhersage: ${esc(wind.fcQuelle || '')}</p>` : ''}
    <div class="card pad"><label class="check"><input type="checkbox" id="scentChk" ${state.view.scent ? 'checked' : ''}> Witterungsfahnen an den Hochsitzen zeigen</label>
      <p class="hint" style="margin-top:6px">Der orange Kegel zeigt, wohin die Witterung vom Sitz zieht. Länge und Breite richten sich nach der Windstärke, bei Windstille (unter 4 km/h) ein Kreis: Wind kann umlaufen. Nur ein Anhalt – am Boden lenken Wald, Hecken und Senken den Wind um.</p></div>
    ${state.data.sitze.some(s => s.richtung != null || scentWarn(s)) ? `<h2 class="section">Wind an den Sitzen (jetzt)</h2><div class="card pad"><ul class="hist">${state.data.sitze.filter(s => s.richtung != null || scentWarn(s)).map(s => `<li><i></i><div><b>${esc(s.name)}</b>${s.richtung != null ? ` · Blick ${dirName(s.richtung)}` : ''}<small>${windFuerSitz(s)}</small></div></li>`).join('')}</ul></div>` : ''}`
    : '<p class="hint">Noch keine Winddaten – bitte Internetverbindung prüfen.</p>';
  openSheet('Wind', body, `<button class="btn secondary" id="windReload">Aktualisieren</button>`);
  $('#windReload').onclick = async () => { await loadWind(true); openWind(); };
  $('#scentChk')?.addEventListener('change', e => { state.view.scent = e.target.checked; saveView(); drawScent(); });
}



/* ---------- Witterungsfahne je Hochsitz (ab 1.5.0) ---------- */
function destPoint(p, brg, m) {
  const R = 6371008.8, r = Math.PI / 180, d = m / R, b = brg * r, la = p.lat * r, lo = p.lng * r;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return { lat: la2 / r, lng: lo2 / r };
}
/** Form der Fahne aus dem aktuellen Wind: Richtung, Länge (m), halber Öffnungswinkel (°) */
function scentShape() {
  const c = wind.cur;
  if (!c || c.dir == null || c.speed == null) return null;
  if (c.speed < 4) return { calm: true, len: 60 };
  return { to: (c.dir + 180) % 360, len: Math.min(350, 80 + c.speed * 12), half: Math.max(12, Math.min(40, 40 - c.speed * 1.2)) };
}
function scentPoly(s, sh, f) {
  const pts = [[s.lat, s.lng]];
  for (let a = -sh.half; a <= sh.half + 0.01; a += 4) { const q = destPoint(s, sh.to + a, sh.len * f); pts.push([q.lat, q.lng]); }
  return pts;
}
/** Liegt ein Punkt in der Witterungsfahne des Sitzes? */
function inScent(s, p, sh = scentShape()) {
  if (!sh || sh.calm) return false;
  const d = distM(s, p);
  return d > 3 && d <= sh.len && angDiff(bearing(s, p), sh.to) <= sh.half;
}
function scentWarn(s) {
  const sh = scentShape(); if (!sh || sh.calm) return '';
  const hits = [];
  if (s.kirrung && inScent(s, s.kirrung, sh)) hits.push('die Kirrung');
  if (s.flaeche) {
    const n = s.flaeche.pts.length, c = { lat: s.flaeche.pts.reduce((a, p) => a + p[0], 0) / n, lng: s.flaeche.pts.reduce((a, p) => a + p[1], 0) / n };
    const share = s.flaeche.pts.filter(p => inScent(s, { lat: p[0], lng: p[1] }, sh)).length / n;
    if (inScent(s, c, sh) || share >= 0.5) hits.push('die Freifläche');
  }
  return hits.length ? `Witterung zieht über ${hits.join(' und ')}` : '';
}
function drawScent() {
  if (!scentLayer) return;
  scentLayer.clearLayers();
  const sh = scentShape();
  if (!state.view.scent || !sh) return;
  for (const s of state.data.sitze) {
    if (sh.calm) {
      scentLayer.addLayer(L.circle([s.lat, s.lng], { radius: sh.len, color: '#e2572b', weight: 1.5, dashArray: '4 6', fillColor: '#ff7a45', fillOpacity: .12, interactive: false }));
      continue;
    }
    [[1, .10], [0.66, .12], [0.33, .16]].forEach(([f, op], i) => {
      scentLayer.addLayer(L.polygon(scentPoly(s, sh, f), { stroke: i === 0, color: '#e2572b', weight: 1, opacity: .55, dashArray: '3 5', fillColor: '#ff7a45', fillOpacity: op, interactive: false }));
    });
  }
}

/* ---------- Wind-Animation über der Karte (ab 1.4.0) ---------- */
const flow = { cv: null, ctx: null, parts: [], raf: 0, w: 0, h: 0, dpr: 1, last: 0 };
function flowInit() {
  const cv = document.createElement('canvas');
  cv.id = 'windCanvas'; cv.className = 'wind-canvas'; cv.setAttribute('aria-hidden', 'true');
  $('#map').after(cv);
  flow.cv = cv; flow.ctx = cv.getContext('2d');
  const clear = () => flow.ctx && flow.ctx.clearRect(0, 0, flow.w, flow.h);
  map.on('movestart zoomstart rotate', clear);
  window.addEventListener('resize', flowSize);
  document.addEventListener('visibilitychange', flowCheck);
  $('#windAnimBtn').onclick = () => { state.view.windAnim = !state.view.windAnim; saveView(); flowCheck(); toast(state.view.windAnim ? 'Windanimation an' : 'Windanimation aus', 1400); };
  flowSize(); flowCheck();
}
function flowSize() {
  if (!flow.cv) return;
  const r = $('#map').getBoundingClientRect();
  flow.dpr = Math.min(2, window.devicePixelRatio || 1);
  flow.w = r.width; flow.h = r.height;
  flow.cv.width = Math.round(r.width * flow.dpr); flow.cv.height = Math.round(r.height * flow.dpr);
  flow.cv.style.width = r.width + 'px'; flow.cv.style.height = r.height + 'px';
  flow.ctx.setTransform(flow.dpr, 0, 0, flow.dpr, 0, 0);
  const n = Math.round(Math.min(420, Math.max(120, r.width * r.height / 2600)) * (matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.4 : 1));
  flow.parts = Array.from({ length: n }, () => flowSpawn(true));
}
function flowSpawn(anywhere) {
  return { x: Math.random() * flow.w, y: Math.random() * flow.h, age: anywhere ? Math.random() * 80 : 0, max: 50 + Math.random() * 60, j: 0.85 + Math.random() * 0.3 };
}
function flowActive() {
  const c = wind.cur;
  return !!(state.view.windAnim && c && c.dir != null && c.speed != null && document.visibilityState === 'visible' && state.view.tab === 'karte' && $('#sheet').hidden && $('#viewer').hidden);
}
function flowCheck() {
  $('#windAnimBtn')?.classList.toggle('on', !!state.view.windAnim);
  if (!flow.cv) return;
  flow.cv.hidden = !state.view.windAnim;
  if (flowActive()) { if (!flow.raf) { flow.last = 0; flow.raf = requestAnimationFrame(flowStep); } }
  else if (flow.raf) { cancelAnimationFrame(flow.raf); flow.raf = 0; }
}
function flowStep(t) {
  flow.raf = 0;
  if (!flowActive()) { flow.ctx.clearRect(0, 0, flow.w, flow.h); return; }
  const dt = flow.last ? Math.min(50, t - flow.last) / 16.7 : 1; flow.last = t;
  const c = wind.cur, ctx = flow.ctx;
  const to = (c.dir + 180 + (map.getBearing ? map.getBearing() : 0)) * Math.PI / 180; // Richtung, in die der Wind weht (Bildschirm, Karte evtl. gedreht)
  const v = Math.min(5, 0.35 + c.speed * 0.09);              // px pro Frame, nach Windstärke
  const gust = c.gust && c.speed ? Math.min(1.6, c.gust / Math.max(c.speed, 1)) : 1;
  const wob = Math.sin(t / 900) * 0.06 + Math.sin(t / 2300) * 0.04; // leichtes Pendeln der Richtung
  const pulse = 1 + (gust - 1) * Math.max(0, Math.sin(t / 1700)) * 0.5; // Böen
  const dx = Math.sin(to + wob) * v * pulse * dt, dy = -Math.cos(to + wob) * v * pulse * dt;
  // Spuren ausblenden
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,0.085)';
  ctx.fillRect(0, 0, flow.w, flow.h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.72)';
  ctx.beginPath();
  for (let i = 0; i < flow.parts.length; i++) {
    const p = flow.parts[i];
    const nx = p.x + dx * p.j, ny = p.y + dy * p.j;
    ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny);
    p.x = nx; p.y = ny; p.age += dt;
    if (p.age > p.max || p.x < -10 || p.y < -10 || p.x > flow.w + 10 || p.y > flow.h + 10) flow.parts[i] = flowSpawn(false);
  }
  ctx.stroke();
  flow.raf = requestAnimationFrame(flowStep);
}


/* ================= Reviergrenze (ab 1.6.0) ================= */
function drawRevier() {
  if (!revLayer) return;
  revLayer.clearLayers();
  const rv = state.data.revier; if (!rv?.polys?.length) return;
  rv.polys.forEach(pl => {
    revLayer.addLayer(L.polygon(pl, { color: '#000', weight: 6, opacity: .25, fill: false, interactive: false }));
    revLayer.addLayer(L.polygon(pl, { color: '#ff5a1f', weight: 3, opacity: .95, fillColor: '#ff5a1f', fillOpacity: .03, interactive: false }));
  });
}
const ringArea = r => areaM2(r);
const polyArea = pl => Math.max(0, ringArea(pl[0]) - pl.slice(1).reduce((a, h) => a + ringArea(h), 0));
function parseCoords(txt) {
  return txt.trim().split(/\s+/).map(t => t.split(',').map(Number)).filter(a => a.length >= 2 && isFinite(a[0]) && isFinite(a[1])).map(a => [a[1], a[0]]);
}
function closeRing(r) { if (r.length > 2) { const a = r[0], b = r[r.length - 1]; if (a[0] === b[0] && a[1] === b[1]) r = r.slice(0, -1); } return r; }
/** KML → [{name, poly:[outer, ...holes]}] (Polygone; geschlossene/lange Linien werden als Fläche genommen) */
function parseKml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Datei ist kein gültiges KML.');
  const out = [], lines = [];
  const byTag = (el, tag) => [...el.getElementsByTagNameNS('*', tag)];
  byTag(doc, 'Placemark').forEach(pm => {
    const name = (byTag(pm, 'name')[0]?.textContent || '').trim();
    byTag(pm, 'Polygon').forEach(pg => {
      const outer = byTag(byTag(pg, 'outerBoundaryIs')[0] || pg, 'coordinates')[0];
      if (!outer) return;
      const rings = [closeRing(parseCoords(outer.textContent))];
      byTag(pg, 'innerBoundaryIs').forEach(ib => { const c = byTag(ib, 'coordinates')[0]; if (c) rings.push(closeRing(parseCoords(c.textContent))); });
      if (rings[0].length >= 3) out.push({ name, poly: rings, typ: 'Fläche' });
    });
    const folder = pm.parentElement?.localName === 'Folder' ? (byTag(pm.parentElement, 'name')[0]?.textContent || '').trim() : '';
    byTag(pm, 'LineString').forEach(ls => {
      const c = byTag(ls, 'coordinates')[0]; if (!c) return;
      const pts = parseCoords(c.textContent);
      if (pts.length >= 2) lines.push({ name, folder, pts });
    });
  });
  const res = out.concat(joinLines(lines));
  res.docName = (doc.getElementsByTagNameNS('*', 'Document')[0]?.getElementsByTagNameNS('*', 'name')[0]?.textContent || '').trim();
  return res;
}
/** Linienstücke, die an den Enden aneinanderstoßen (≤ 3 m), zu Ringen zusammensetzen.
 *  So wird eine in Google My Maps aus mehreren Linien gezeichnete Grenze zu einer Fläche. */
function joinLines(lines) {
  const near = (a, b) => distM({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] }) <= 3;
  const pool = lines.map(l => ({ ...l, pts: l.pts.slice() })), out = [];
  while (pool.length) {
    const first = pool.shift();
    let chain = first.pts.slice(); const names = [first.name];
    for (let found = true; found && !(chain.length > 3 && near(chain[0], chain[chain.length - 1]));) {
      found = false;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i].pts, end = chain[chain.length - 1], start = chain[0];
        if (near(end, p[0])) chain = chain.concat(p.slice(1));
        else if (near(end, p[p.length - 1])) chain = chain.concat(p.slice(0, -1).reverse());
        else if (near(start, p[p.length - 1])) chain = p.slice(0, -1).concat(chain);
        else if (near(start, p[0])) chain = p.slice(1).reverse().concat(chain);
        else continue;
        names.push(pool[i].name); pool.splice(i, 1); found = true; break;
      }
    }
    const closed = chain.length > 3 && near(chain[0], chain[chain.length - 1]);
    const ring = closeRing(closed ? chain.slice(0, -1).concat([chain[0]]) : chain);
    if (ring.length < 3) continue;
    const name = names.length > 1 ? (first.folder || names.join(' + ')) : first.name;
    out.push({ name, poly: [ring], typ: names.length > 1 ? `${closed ? 'Fläche' : 'Linie'} aus ${names.length} Linien` : closed ? 'Fläche (geschlossene Linie)' : 'Linie' });
  }
  return out;
}
function parseGeoJson(text) {
  const j = JSON.parse(text), out = [];
  const feats = j.type === 'FeatureCollection' ? j.features : j.type === 'Feature' ? [j] : [{ geometry: j, properties: {} }];
  feats.forEach(f => {
    const g = f.geometry || {}, name = f.properties?.name || f.properties?.Name || '';
    const conv = rings => rings.map(r => closeRing(r.map(c => [c[1], c[0]])));
    if (g.type === 'Polygon') out.push({ name, poly: conv(g.coordinates), typ: 'Fläche' });
    if (g.type === 'MultiPolygon') g.coordinates.forEach(p => out.push({ name, poly: conv(p), typ: 'Fläche' }));
    if (g.type === 'LineString' && g.coordinates.length >= 3) out.push({ name, poly: conv([g.coordinates]), typ: 'Linie' });
  });
  return out;
}
/** KMZ = ZIP mit doc.kml → erste .kml-Datei entpacken */
async function unzipKml(buf) {
  const b = new Uint8Array(buf), dv = new DataView(buf);
  let i = 0;
  while (i + 30 < b.length && dv.getUint32(i, true) === 0x04034b50) {
    const method = dv.getUint16(i + 8, true), csize = dv.getUint32(i + 18, true);
    const nlen = dv.getUint16(i + 26, true), xlen = dv.getUint16(i + 28, true);
    const name = new TextDecoder().decode(b.subarray(i + 30, i + 30 + nlen));
    const start = i + 30 + nlen + xlen, data = b.subarray(start, start + csize);
    if (/\.kml$/i.test(name)) {
      if (method === 0) return new TextDecoder().decode(data);
      if (method === 8 && typeof DecompressionStream !== 'undefined') {
        const ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return await new Response(ds).text();
      }
      throw new Error('KMZ lässt sich hier nicht entpacken – bitte in My Maps „Als KML exportieren“ anhaken.');
    }
    if (!csize) break;
    i = start + csize;
  }
  throw new Error('In der KMZ-Datei wurde keine KML gefunden.');
}
function pickRevierFile() {
  // Kein accept-Filter: iOS kennt .kml/.kmz nicht und graut die Dateien sonst aus. Inhalt wird nach der Auswahl geprüft.
  const inp = document.createElement('input'); inp.type = 'file';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      let items;
      const buf = await f.arrayBuffer(), head = new Uint8Array(buf.slice(0, 4));
      if (head[0] === 0x50 && head[1] === 0x4b) items = parseKml(await unzipKml(buf)); // ZIP = KMZ (auch ohne passende Endung)
      else {
        const t = new TextDecoder().decode(buf);
        if (/^\s*[{[]/.test(t)) items = parseGeoJson(t);
        else if (/<kml[\s>]/i.test(t)) items = parseKml(t);
        else throw new Error('Das ist keine KML-, KMZ- oder GeoJSON-Datei. Bitte in Google My Maps „In KML/KMZ exportieren“ nehmen.');
      }
      if (!items.length) throw new Error('Keine Fläche oder Linie in der Datei gefunden.');
      openRevierPreview(items, f.name);
    } catch (e) { toast(e.message, 5000); }
  };
  inp.click();
}
function openRevierPreview(items, fname) {
  items.forEach((it, i) => { it.m2 = polyArea(it.poly); it.on = true; it.i = i; });
  // Linien nur vorauswählen, wenn es keine echten Flächen gibt
  if (items.some(x => x.typ.startsWith('Fläche'))) items.forEach(x => { if (!x.typ.startsWith('Fläche')) x.on = false; });
  let mini = null, grp = null;
  openSheet('Reviergrenze importieren', `
    <div class="mini-map tall" id="rvMini"></div>
    <p class="hint">Aus „${esc(fname)}“. Haken bei allem, was zum Revier gehört (mehrere Teilflächen möglich).</p>
    <div class="card pad"><ul class="hist">${items.map(it => `<li><i></i><label class="check" style="align-items:flex-start"><input type="checkbox" data-rv="${it.i}" ${it.on ? 'checked' : ''}><span><b>${esc(it.name || 'ohne Namen')}</b><small>${it.typ} · ${areaTxt(it.m2)} · ${it.poly[0].length} Punkte</small></span></label></li>`).join('')}</ul></div>
    <label class="field"><span>Name</span><input id="rvName" value="${esc(items.docName || items.find(x => x.on)?.name || 'Revier Thuine')}" autocomplete="off"></label>
    <p class="hint" id="rvSum"></p>`,
    `<button class="btn secondary" data-close>Abbrechen</button><button class="btn" id="rvSave">Übernehmen</button>`);
  const draw = () => {
    const sel = items.filter(x => x.on);
    $('#rvSum').innerHTML = sel.length ? `Gesamt: <b>${areaTxt(sel.reduce((a, x) => a + x.m2, 0))}</b>` : 'Nichts ausgewählt.';
    if (!mini) return;
    grp.clearLayers();
    items.forEach(it => grp.addLayer(L.polygon(it.poly, { color: it.on ? '#ff5a1f' : '#888', weight: it.on ? 3 : 1.5, dashArray: it.on ? null : '4 5', fillOpacity: it.on ? .08 : 0 })));
  };
  setTimeout(() => {
    if (!$('#rvMini')) return;
    mini = makeMini('rvMini', THUINE, 13); grp = L.featureGroup().addTo(mini);
    draw();
    setTimeout(() => { mini.invalidateSize(); try { mini.fitBounds(grp.getBounds().pad(0.05)); } catch { /* leer */ } }, 260);
  }, 60);
  $$('[data-rv]').forEach(c => c.onchange = () => { items[c.dataset.rv].on = c.checked; draw(); });
  sheetCleanup = () => { if (mini) { mini.remove(); mini = null; } };
  $('#rvSave').onclick = () => {
    const sel = items.filter(x => x.on);
    if (!sel.length) { toast('Bitte mindestens eine Fläche auswählen.'); return; }
    if (!state.pw) { toast('Bitte zuerst das Passwort festlegen.'); return; }
    const rnd = r => r.map(p => [Math.round(p[0] * 1e7) / 1e7, Math.round(p[1] * 1e7) / 1e7]);
    const val = { name: $('#rvName').value.trim() || 'Revier', polys: sel.map(x => x.poly.map(rnd)), m2: Math.round(sel.reduce((a, x) => a + x.m2, 0)), quelle: fname, datum: todayISO() };
    sheetCleanup(); sheetCleanup = null; closeSheet();
    enqueue({ t: 'meta', key: 'revier', val, msg: `Reviergrenze „${val.name}“ importiert` });
    setTimeout(() => { switchTab('karte'); fitAll(true); }, 300);
  };
}

/* ================= Sonne, Büchsenlicht & Mond (ab 1.10.0) =================
 * Berechnung auf dem Gerät, ohne Internet. Formeln nach SunCalc (Vladimir Agafonkin, BSD-2-Clause),
 * die wiederum auf den astronomischen Näherungen von astro.ukho.gov / „Astronomy Answers“ beruhen. */
const ASTRO = (() => {
  const PI = Math.PI, sin = Math.sin, cos = Math.cos, tan = Math.tan, asin = Math.asin, atan = Math.atan2, acos = Math.acos, rad = PI / 180;
  const dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397, J0 = 0.0009;
  const toJulian = d => d.valueOf() / dayMs - 0.5 + J1970;
  const fromJulian = j => new Date((j + 0.5 - J1970) * dayMs);
  const toDays = d => toJulian(d) - J2000;
  const rightAscension = (l, b) => atan(sin(l) * cos(e) - tan(b) * sin(e), cos(l));
  const declination = (l, b) => asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l));
  const altitude = (H, phi, dec) => asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H));
  const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
  const astroRefraction = h => { if (h < 0) h = 0; return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179)); };
  const solarMeanAnomaly = d => rad * (357.5291 + 0.98560028 * d);
  const eclipticLongitude = M => M + rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M)) + rad * 102.9372 + PI;
  const sunCoords = d => { const L = eclipticLongitude(solarMeanAnomaly(d)); return { dec: declination(L, 0), ra: rightAscension(L, 0) }; };
  const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * PI));
  const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * PI) + n;
  const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * sin(M) - 0.0069 * sin(2 * L);
  const hourAngle = (h, phi, d) => acos((sin(h) - sin(phi) * sin(d)) / (cos(phi) * cos(d)));
  /** Zeiten, zu denen die Sonne die Höhe `deg` (Grad) erreicht: {rise, set}; date = beliebige Uhrzeit des Tages */
  function sunTimes(date, lat, lng, degs) {
    const lw = rad * -lng, phi = rad * lat, d = toDays(date), n = julianCycle(d, lw), ds = approxTransit(0, lw, n);
    const M = solarMeanAnomaly(ds), L = eclipticLongitude(M), dec = declination(L, 0), Jnoon = solarTransitJ(ds, M, L);
    const out = { noon: fromJulian(Jnoon) };
    for (const [k, deg] of Object.entries(degs)) {
      const w = hourAngle(deg * rad, phi, dec);
      if (Number.isNaN(w)) { out[k] = null; continue; }
      const Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
      out[k] = { rise: fromJulian(Jnoon - (Jset - Jnoon)), set: fromJulian(Jset) };
    }
    return out;
  }
  function moonCoords(d) {
    const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.229350 * d);
    const l = L + rad * 6.289 * sin(M), b = rad * 5.128 * sin(F), dt = 385001 - 20905 * cos(M);
    return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt };
  }
  function moonAltitude(date, lat, lng) {
    const lw = rad * -lng, phi = rad * lat, d = toDays(date), c = moonCoords(d);
    const H = siderealTime(d, lw) - c.ra; let h = altitude(H, phi, c.dec);
    return h + astroRefraction(h);
  }
  /** fraction = beleuchteter Anteil 0..1, phase = 0 Neumond, .25 erstes Viertel, .5 Vollmond, .75 letztes Viertel */
  function moonIllum(date) {
    const d = toDays(date), s = sunCoords(d), m = moonCoords(d), sdist = 149598000;
    const phi = acos(sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra));
    const inc = atan(sdist * sin(phi), m.dist - sdist * cos(phi));
    const angle = atan(cos(s.dec) * sin(s.ra - m.ra), sin(s.dec) * cos(m.dec) - cos(s.dec) * sin(m.dec) * cos(s.ra - m.ra));
    return { fraction: (1 + cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / PI };
  }
  /** Mondaufgang/-untergang für den Kalendertag von `day0` (lokale Mitternacht) */
  function moonTimes(day0, lat, lng) {
    const t = new Date(day0); t.setHours(0, 0, 0, 0);
    const at = h => new Date(t.getTime() + h * 3600e3), hc = 0.133 * rad;
    let h0 = moonAltitude(t, lat, lng) - hc, rise, set;
    for (let i = 1; i <= 24; i += 2) {
      const h1 = moonAltitude(at(i), lat, lng) - hc, h2 = moonAltitude(at(i + 1), lat, lng) - hc;
      const a = (h0 + h2) / 2 - h1, b = (h2 - h0) / 2, xe = -b / (2 * a), ye = (a * xe + b) * xe + h1, dd = b * b - 4 * a * h1;
      let roots = 0, x1 = 0, x2 = 0;
      if (dd >= 0) { const dx = Math.sqrt(dd) / (Math.abs(a) * 2); x1 = xe - dx; x2 = xe + dx; if (Math.abs(x1) <= 1) roots++; if (Math.abs(x2) <= 1) roots++; if (x1 < -1) x1 = x2; }
      if (roots === 1) { if (h0 < 0) rise = i + x1; else set = i + x1; }
      else if (roots === 2) { rise = i + (ye < 0 ? x2 : x1); set = i + (ye < 0 ? x1 : x2); }
      if (rise != null && set != null) break;
      h0 = h2;
    }
    return { rise: rise != null ? at(rise) : null, set: set != null ? at(set) : null };
  }
  /** Nächste Hauptphasen ab `from` (Neumond, erstes Viertel, Vollmond, letztes Viertel) */
  function nextPhases(from, count = 5) {
    const targets = [0, 0.25, 0.5, 0.75], out = [];
    const diff = (p, t) => { let x = p - t; if (x > 0.5) x -= 1; if (x < -0.5) x += 1; return x; };
    let t = from.getTime(), prev = moonIllum(new Date(t)).phase;
    for (let k = 0; k < 24 * 60 && out.length < count; k++) {
      const t2 = t + 3600e3, cur = moonIllum(new Date(t2)).phase;
      for (const tg of targets) {
        const a = diff(prev, tg), b = diff(cur, tg);
        if (a < 0 && b >= 0 && b - a < 0.1) {
          let lo = t, hi = t2;
          for (let j = 0; j < 20; j++) { const mid = (lo + hi) / 2; if (diff(moonIllum(new Date(mid)).phase, tg) < 0) lo = mid; else hi = mid; }
          out.push({ t: new Date(hi), phase: tg });
        }
      }
      t = t2; prev = cur;
    }
    return out;
  }
  return { sunTimes, moonIllum, moonTimes, nextPhases };
})();

const PHASEN = { 0: 'Neumond', 0.25: 'Zunehmender Halbmond', 0.5: 'Vollmond', 0.75: 'Abnehmender Halbmond' };
const hm = d => d ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }) : '–';
const tagName = (d, i) => i === 0 ? 'Heute' : i === 1 ? 'Morgen' : i === 2 ? 'Übermorgen' : d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
function dauer(ms) { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; }

/** Sonnenzeiten eines Tages inkl. Büchsenlicht und Nachtzeit (§ 19 BJagdG) */
function sonnenTag(day) {
  const p = windPos(), d = new Date(day); d.setHours(12, 0, 0, 0);
  const t = ASTRO.sunTimes(d, p.lat, p.lng, { sun: -0.833, civil: -6 });
  const sa = t.sun?.rise || null, su = t.sun?.set || null;
  // Büchsenlicht = bürgerliche Dämmerung (Sonne 6° unter dem Horizont) – so von Sebastian festgelegt
  const blA = t.civil?.rise || null, blE = t.civil?.set || null;
  return { tag: d, sa, su, blA, blE, nachtAb: su && new Date(+su + 90 * 60e3), nachtBis: sa && new Date(sa - 90 * 60e3) };
}
/** Mond als kleines Bild: beleuchteter Teil hell, Rest dunkel (Nordhalbkugel: zunehmend rechts hell) */
function moonSvg(fraction, phase, size = 26) {
  const r = 10, waxing = phase < 0.5, k = 1 - 2 * fraction; // Terminator-Ellipse: -1 (voll) … 1 (neu)
  const rx = Math.abs(k) * r, sweepOuter = waxing ? 1 : 0, sweepInner = (k > 0) === waxing ? 0 : 1;
  const lit = fraction < 0.01 ? '' : fraction > 0.99 ? `<circle cx="12" cy="12" r="${r}" fill="#f6efc8"/>`
    : `<path d="M12 2 A${r} ${r} 0 0 ${sweepOuter} 12 22 A${rx.toFixed(2)} ${r} 0 0 ${sweepInner} 12 2Z" fill="#f6efc8"/>`;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><circle cx="12" cy="12" r="${r}" fill="#3a4034" stroke="#c9c39a" stroke-width=".8"/>${lit}</svg>`;
}
const SUN_ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="6.5" fill="#e6d23a"/><g stroke="#e6d23a" stroke-width="2.2" stroke-linecap="round"><path d="M16 2.5v4M16 25.5v4M2.5 16h4M25.5 16h4M6.5 6.5l2.8 2.8M22.7 22.7l2.8 2.8M6.5 25.5l2.8-2.8M22.7 9.3l2.8-2.8"/></g></svg>';
const blIcon = ende => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="6"/><path d="M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5"/>${ende ? '<path d="m9.8 9.8 4.4 4.4M14.2 9.8l-4.4 4.4"/>' : '<path d="m9.3 12.2 1.9 1.9 3.6-3.8"/>'}</svg>`;
function renderSun() {
  const b = $('#sunBadge'); if (!b) return;
  const now = new Date(), t = sonnenTag(now);
  let hint = '';
  if (t.blA && t.blE) {
    if (now < t.blA) hint = `Büchsenlicht in ${dauer(t.blA - now)}`;
    else if (now < t.blE) { const rest = t.blE - now; if (rest < 3 * 3600e3) hint = `noch ${dauer(rest)} Büchsenlicht`; }
  }
  b.innerHTML = `<div class="sb-grid">
      <span class="sb-sun">${SUN_ICON}</span>
      <span class="sb-ar">↑</span><span class="sb-t up">${hm(t.sa)}</span>
      <span class="sb-ic" title="Erstes Büchsenlicht">${blIcon(false)}</span><span class="sb-t up">${hm(t.blA)}</span>
      <span class="sb-ar">↓</span><span class="sb-t dn">${hm(t.su)}</span>
      <span class="sb-ic" title="Letztes Büchsenlicht">${blIcon(true)}</span><span class="sb-t dn">${hm(t.blE)}</span>
    </div>${hint ? `<div class="sb-hint">${hint}</div>` : ''}`;
  b.setAttribute('aria-label', `Sonnenaufgang ${hm(t.sa)}, Sonnenuntergang ${hm(t.su)}, Büchsenlicht ${hm(t.blA)} bis ${hm(t.blE)}`);
}
function openSun() {
  const now = new Date(), p = windPos();
  const tage = [0, 1, 2].map(i => { const d = new Date(now); d.setDate(d.getDate() + i); return sonnenTag(d); });
  const mi = ASTRO.moonIllum(now), mt = ASTRO.moonTimes(now, p.lat, p.lng);
  const phasen = ASTRO.nextPhases(now, 5);
  const kal = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() + i); d.setHours(22, 0, 0, 0);
    const il = ASTRO.moonIllum(d), tm = ASTRO.moonTimes(d, p.lat, p.lng);
    return { d, il, tm, i };
  });
  const naechste = phasen.find(x => x.phase === 0.5);
  openSheet('Sonne & Mond', `
    <div class="card"><table class="sun-tab">
      <thead><tr><th></th>${tage.map((t, i) => `<th>${tagName(t.tag, i)}<small>${t.tag.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</small></th>`).join('')}</tr></thead>
      <tbody>
        <tr class="bl"><td>Erstes Büchsenlicht</td>${tage.map(t => `<td>${hm(t.blA)}</td>`).join('')}</tr>
        <tr><td>Sonnenaufgang</td>${tage.map(t => `<td>${hm(t.sa)}</td>`).join('')}</tr>
        <tr><td>Sonnenuntergang</td>${tage.map(t => `<td>${hm(t.su)}</td>`).join('')}</tr>
        <tr class="bl"><td>Letztes Büchsenlicht</td>${tage.map(t => `<td>${hm(t.blE)}</td>`).join('')}</tr>
        <tr class="nz"><td>Nachtzeit ab<small>§ 19 BJagdG</small></td>${tage.map(t => `<td>${hm(t.nachtAb)}</td>`).join('')}</tr>
        <tr class="nz"><td>Nachtzeit bis<small>am Morgen</small></td>${tage.map(t => `<td>${hm(t.nachtBis)}</td>`).join('')}</tr>
      </tbody></table></div>
    <p class="hint">Büchsenlicht = bürgerliche Dämmerung (Sonne 6° unter dem Horizont). Gesetzlich ist es nicht festgelegt – entscheidend ist, dass du das Wild sicher ansprechen kannst. Nachtzeit nach § 19 BJagdG: 1,5 Stunden nach Sonnenuntergang bis 1,5 Stunden vor Sonnenaufgang (Schalenwild außer Schwarzwild darf dann nicht erlegt werden).</p>

    <h2 class="section">Mond</h2>
    <div class="card pad moon-now">${moonSvg(mi.fraction, mi.phase, 64)}
      <div><div class="w-dir">${mondName(mi.phase)}</div>
        <div class="w-spd">${Math.round(mi.fraction * 100)} % beleuchtet</div>
        <div class="sub">Heute: Aufgang ${hm(mt.rise)} · Untergang ${hm(mt.set)}${naechste ? `<br>Nächster Vollmond: ${naechste.t.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}` : ''}</div></div></div>
    <div class="card pad"><ul class="phasen">${phasen.map(x => `<li>${moonSvg(x.phase === 0 ? 0 : x.phase === 0.5 ? 1 : 0.5, x.phase === 0.75 ? 0.75 : x.phase, 22)}<span><b>${PHASEN[x.phase]}</b><small>${x.t.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' })}</small></span></li>`).join('')}</ul></div>
    <h2 class="section">Mondkalender (14 Tage)</h2>
    <div class="card"><table class="moon-tab"><thead><tr><th>Tag</th><th></th><th>Licht</th><th>Aufgang</th><th>Untergang</th></tr></thead><tbody>
      ${kal.map(k => `<tr class="${k.il.fraction > 0.9 ? 'voll' : ''}"><td>${tagName(k.d, k.i)}${k.i > 2 ? '' : `<small>${k.d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</small>`}</td><td>${moonSvg(k.il.fraction, k.il.phase, 20)}</td><td>${Math.round(k.il.fraction * 100)} %</td><td>${hm(k.tm.rise)}</td><td>${hm(k.tm.set)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="hint">Alle Zeiten für die Reviermitte, auf dem Gerät berechnet (ohne Internet). Genauigkeit: Sonne etwa ±2 Minuten, Mondauf-/untergang etwa ±15 Minuten, Mondphasen auf den Tag genau. Licht = beleuchteter Anteil der Mondscheibe um 22 Uhr.</p>`);
}
function mondName(phase) {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.03 || p > 0.97) return 'Neumond';
  if (p < 0.22) return 'Zunehmende Sichel';
  if (p < 0.28) return 'Zunehmender Halbmond';
  if (p < 0.47) return 'Zunehmender Mond';
  if (p < 0.53) return 'Vollmond';
  if (p < 0.72) return 'Abnehmender Mond';
  if (p < 0.78) return 'Abnehmender Halbmond';
  return 'Abnehmende Sichel';
}

/* ================= Ansichten ================= */
function render() {
  $('#addBtn').hidden = !isAdmin() || meas.on;
  renderMap();
  if (state.view.tab === 'liste') renderList();
  updateBanner();
  if (!render._fitted && state.loaded) { render._fitted = true; fitAll(false); }
}
function switchTab(tab, fromPop) {
  state.view.tab = tab; saveView();
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#view-karte').hidden = tab !== 'karte';
  $('#view-liste').hidden = tab !== 'liste';
  if (tab === 'liste') renderList();
  else setTimeout(() => { map.invalidateSize(); flowSize(); }, 30);
  flowCheck();
  if (!fromPop && tab !== 'karte') history.pushState({ hs: 'tab' }, '');
}
function renderList() {
  const el = $('#view-liste');
  if (state.view.liste === 'lecken') { renderLeckenList(el); return; }
  const sitze = state.data.sitze;
  const pend = pendingIds();
  const q = (state.listQ || '').trim().toLowerCase();
  let rows = sitze.filter(s => !q || s.name.toLowerCase().includes(q) || artOf(s).name.toLowerCase().includes(q) || (s.bemerkung || '').toLowerCase().includes(q));
  const sort = state.view.sort;
  if (sort === 'dist' && state.me) rows = rows.slice().sort((a, b) => distM(state.me, a) - distM(state.me, b));
  else if (sort === 'art') rows = rows.slice().sort((a, b) => artOf(a).short.localeCompare(artOf(b).short) || a.name.localeCompare(b.name, 'de', { numeric: true }));
  const counts = {};
  sitze.forEach(s => { counts[s.art] = (counts[s.art] || 0) + 1; });
  const mangel = sitze.filter(s => s.zustand !== 'gut').length;
  el.innerHTML = `${listSeg()}
    <div class="card pad">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px">
        <div><div style="font:600 30px/1 var(--serif);color:var(--green)">${sitze.length}</div><div class="sub">${sitze.length === 1 ? 'Hochsitz' : 'Hochsitze'} im Revier</div></div>
        ${mangel ? `<span class="badge maengel">${mangel} mit Mängeln/gesperrt</span>` : ''}
      </div>
      <div class="legend" style="margin-top:10px">${Object.entries(ARTEN).filter(([k]) => counts[k]).map(([k, a]) => `<span><i style="background:${a.color}"></i>${esc(a.short)} ${counts[k]}</span>`).join('')}</div>
    </div>
    ${sitze.length ? `<div class="list-tools">
      <input type="search" id="listQ" placeholder="Suchen …" value="${esc(state.listQ || '')}" aria-label="Suchen">
      <select id="listSort" aria-label="Sortierung">
        <option value="name" ${sort === 'name' ? 'selected' : ''}>Name</option>
        <option value="dist" ${sort === 'dist' ? 'selected' : ''}>Entfernung</option>
        <option value="art" ${sort === 'art' ? 'selected' : ''}>Art</option>
      </select>
    </div>` : ''}
    <div id="sitzList">
      ${rows.map(s => `<button class="sitz" data-id="${esc(s.id)}">
        <div class="th" ${s.foto ? `data-img="${esc(s.foto.t)}"` : `style="background:${artOf(s).color}"`}>${s.foto ? '' : artIcon(s.art)}</div>
        <div style="min-width:0"><div class="nm">${esc(s.name)}</div>
          <div class="mt">${esc(artOf(s).short)}${s.richtung != null ? ` · Blick ${dirName(s.richtung)}` : ''}${s.pano ? ' · Panorama' : ''}</div>
          ${s.zustand !== 'gut' || pend.has(s.id) ? `<div style="margin-top:5px;display:flex;gap:5px;flex-wrap:wrap">${s.zustand !== 'gut' ? `<span class="badge ${s.zustand}">${ZUSTAND[s.zustand]}</span>` : ''}${pend.has(s.id) ? '<span class="badge wait">nicht hochgeladen</span>' : ''}</div>` : ''}
        </div>
        <div class="ds" data-dist="${esc(s.id)}"></div>
      </button>`).join('') || (sitze.length ? '<div class="card pad empty">Nichts gefunden.</div>' : `<div class="card pad empty"><img src="icons/logo.png" alt=""><p>Noch keine Hochsitze erfasst.${isAdmin() ? '<br>Auf der Karte unten „+ Hochsitz erfassen“ tippen, wenn du am Sitz stehst.' : ''}</p></div>`)}
    </div>
    ${sort === 'dist' && !state.me && sitze.length ? '<p class="hint" style="text-align:center">Für die Entfernung bitte auf der Karte „Mein Standort“ einschalten.</p>' : ''}
    <p class="hint" style="text-align:center">${state.data.stand ? `Stand: ${dtDE(state.data.stand)} · ` : ''}v${APP_VERSION}</p>`;
  wireListSeg(el);
  $$('.sitz', el).forEach(b => b.onclick = () => openDetail(b.dataset.id));
  const qi = $('#listQ', el);
  if (qi) qi.oninput = () => { state.listQ = qi.value; const pos = qi.selectionStart; renderList(); const n = $('#listQ'); n.focus(); n.setSelectionRange(pos, pos); };
  const so = $('#listSort', el);
  if (so) so.onchange = () => { state.view.sort = so.value; saveView(); if (so.value === 'dist' && !state.me) locate(); renderList(); };
  renderListDistances();
  hydrateImages(el);
}
function renderListDistances() {
  $$('[data-dist]').forEach(el => {
    const s = sitzById(el.dataset.dist) || leckeById(el.dataset.dist);
    el.innerHTML = s && state.me ? `${distTxt(distM(state.me, s))}<small>${dirName(bearing(state.me, s))}</small>` : '';
  });
}

/* ================= Sheet & Verlauf (Zurück-Taste) ================= */
let sheetCleanup = null;
function openSheet(title, body, foot = '', { overLock = false } = {}) {
  if (sheetCleanup) { const c = sheetCleanup; sheetCleanup = null; c(); }
  if ($('#sheet').hidden) history.pushState({ hs: 'sheet' }, '');
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = body;
  $('#sheetFoot').innerHTML = foot;
  $('#sheet').hidden = false;
  flowCheck();
  $('#sheet').style.zIndex = overLock ? 1160 : '';
  $('#sheetBody').scrollTop = 0;
}
function closeSheet(fromPop = false) {
  if ($('#sheet').hidden) return;
  if (sheetCleanup) { const c = sheetCleanup; sheetCleanup = null; c(); }
  $('#sheet').hidden = true;
  flowCheck();
  if (!fromPop && history.state?.hs === 'sheet') { ignorePop++; history.back(); }
}
document.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
let ignorePop = 0;
window.addEventListener('popstate', () => {
  if (ignorePop > 0) { ignorePop--; return; }
  if (!$('#viewer').hidden) { closeViewer(true); return; }
  if (!$('#sheet').hidden) { closeSheet(true); return; }
  if (state.view.tab !== 'karte') switchTab('karte', true);
});

/* ================= Bild-Betrachter ================= */
async function openViewer(path, title, pano) {
  const v = $('#viewer'), body = $('#viewerBody');
  $('#viewerTitle').textContent = title;
  body.className = 'viewer-body' + (pano ? ' pano' : '');
  body.innerHTML = '<p style="color:#ccc">Lade …</p>';
  v.hidden = false; history.pushState({ hs: 'viewer' }, ''); flowCheck();
  try {
    const u = await imgUrl(path);
    body.innerHTML = `<img src="${u}" alt="" class="${pano ? '' : 'photo'}" draggable="false">` + (pano ? '<div class="pano-bar"><i></i></div><div class="pano-hint">← zum Umsehen wischen →</div>' : '');
    if (pano) {
      const img = $('img', body);
      const upd = () => {
        const bar = $('.pano-bar i'); if (!bar) return;
        const sw = body.scrollWidth, cw = body.clientWidth;
        bar.style.left = (body.scrollLeft / sw * 100) + '%'; bar.style.width = (cw / sw * 100) + '%';
      };
      const center = () => { body.scrollLeft = (body.scrollWidth - body.clientWidth) / 2; upd(); };
      img.complete ? center() : img.addEventListener('load', center);
      body.addEventListener('scroll', upd, { passive: true });
      // Maus ziehen (PC)
      let drag = null;
      body.onpointerdown = e => { if (e.pointerType !== 'mouse') return; drag = { x: e.clientX, l: body.scrollLeft }; body.style.cursor = 'grabbing'; };
      body.onpointermove = e => { if (drag) body.scrollLeft = drag.l - (e.clientX - drag.x); };
      body.onpointerup = body.onpointerleave = () => { drag = null; body.style.cursor = ''; };
    }
  } catch (e) { body.innerHTML = `<p style="color:#f3dcc6;padding:20px">${esc(e.message)}</p>`; }
}
function closeViewer(fromPop = false) {
  if ($('#viewer').hidden) return;
  $('#viewer').hidden = true; $('#viewerBody').innerHTML = ''; flowCheck();
  if (!fromPop && history.state?.hs === 'viewer') { ignorePop++; history.back(); }
}
$('#viewerClose').onclick = () => closeViewer();

/* ================= Hochsitz-Details ================= */
function openDetail(id) {
  const s = sitzById(id); if (!s) return;
  const pend = pendingIds().has(id);
  const a = artOf(s);
  const me = state.me;
  const fotoOld = v => v.foto && (!s.foto || v.foto.f !== s.foto.f);
  const panoOld = v => v.pano && (!s.pano || v.pano.f !== s.pano.f);
  const body = `
    <div class="det-photo">${s.foto ? `<img data-img="${esc(s.foto.t)}" data-full="${esc(s.foto.f)}" alt="Foto ${esc(s.name)}" id="detFoto">` : `<div class="ph-empty">Kein Foto</div>`}</div>
    ${s.pano ? `<button class="pano-strip" id="detPano" data-img="${esc(s.pano.t)}"><span>🔭 Panorama vom Sitz ansehen</span></button>` : ''}
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <span class="badge" style="background:${a.color};color:#fff">${esc(a.short)}</span>
      <span class="badge ${s.zustand}">${ZUSTAND[s.zustand] || s.zustand}</span>
      ${pend ? '<span class="badge wait">noch nicht hochgeladen</span>' : ''}
    </div>
    ${s.bemerkung ? `<div class="note">${esc(s.bemerkung)}</div>` : ''}
    <dl class="facts">
      <dt>Blickrichtung</dt><dd>${dirTxt(s.richtung)}</dd>
      ${windFuerSitz(s) ? `<dt>Wind jetzt</dt><dd>${windFuerSitz(s)}</dd>` : ''}
      ${me ? `<dt>Entfernung</dt><dd>${distM(me, s) <= Math.max(10, me.acc || 0) ? 'Du bist am Sitz' : `${distTxt(distM(me, s))} Richtung ${dirName(bearing(me, s))}`}</dd>` : ''}
      <dt>Steht hier seit</dt><dd>${dateDE(s.seit)}</dd>
      <dt>Koordinaten</dt><dd>${coordTxt(s)}${s.acc ? ` <span class="sub">(±${Math.round(s.acc)} m)</span>` : ''}</dd>
      <dt>Geändert</dt><dd>${dtDE(s.geaendert)}</dd>
    </dl>
    <div class="btn-row">
      <button class="btn secondary small" id="detMap">📍 Auf Karte zeigen</button>
      <button class="btn secondary small" id="detCopy">Koordinaten kopieren</button>
    </div>
    ${flaecheSection(s)}
    ${s.verlauf.length ? `<h2 class="section">Standorte (${s.verlauf.length + 1})</h2>
    <div class="card pad"><ul class="hist">
      <li class="cur"><i></i><div><b>Aktuell</b> · seit ${dateDE(s.seit)}<small>${coordTxt(s)}</small></div></li>
      ${s.verlauf.map((v, i) => `<li><i></i><div><b>${dateDE(v.von)} – ${dateDE(v.bis)}</b><small>${distTxt(distM(v, s))} vom heutigen Standort · ${coordTxt(v)}</small>
        <div class="btn-row" style="gap:6px">
          ${fotoOld(v) ? `<button class="btn secondary small" data-hfoto="${i}">Foto damals</button>` : ''}
          ${panoOld(v) ? `<button class="btn secondary small" data-hpano="${i}">Panorama damals</button>` : ''}
          <button class="btn ghost small" data-hmap="${i}">Auf Karte</button>
          ${isAdmin() ? `<button class="btn ghost small" data-hdel="${i}" style="color:var(--warn)">Entfernen</button>` : ''}
        </div></div></li>`).join('')}
    </ul></div>` : ''}
    ${isAdmin() ? '<button class="btn danger block" id="detDel" style="margin-top:22px">Hochsitz löschen</button>' : ''}`;
  const foot = isAdmin() ? `<button class="btn secondary" id="detEdit">Bearbeiten</button><button class="btn" id="detMove">⇄ Umstellen</button>`
    : canZustand() ? '<button class="btn" id="detZustand">Zustand ändern</button>' : '';
  openSheet(s.name, body, foot);
  const root = $('#sheet');
  hydrateImages(root);
  $('#detFoto')?.addEventListener('click', () => openViewer(s.foto.f, s.name));
  $('#detPano')?.addEventListener('click', () => openViewer(s.pano.f, `${s.name} · Panorama`, true));
  $('#detMap').onclick = () => { closeSheet(); focusSitz(s); };
  $('#detCopy').onclick = async () => { try { await navigator.clipboard.writeText(coordTxt(s)); toast('Koordinaten kopiert'); } catch { toast(coordTxt(s), 5000); } };
  $$('[data-hfoto]', root).forEach(b => b.onclick = () => openViewer(s.verlauf[b.dataset.hfoto].foto.f, `${s.name} · bis ${dateDE(s.verlauf[b.dataset.hfoto].bis)}`));
  $$('[data-hpano]', root).forEach(b => b.onclick = () => openViewer(s.verlauf[b.dataset.hpano].pano.f, `${s.name} · Panorama bis ${dateDE(s.verlauf[b.dataset.hpano].bis)}`, true));
  $$('[data-hmap]', root).forEach(b => b.onclick = () => {
    const v = s.verlauf[b.dataset.hmap]; closeSheet(); if (!state.view.hist) toggleHist(true);
    switchTab('karte'); setTimeout(() => map.fitBounds(L.latLngBounds([[v.lat, v.lng], [s.lat, s.lng]]).pad(0.5), { maxZoom: 18 }), 60);
  });
  $$('[data-hdel]', root).forEach(b => b.onclick = () => {
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Wirklich entfernen?'; return; }
    const n = clone(s); n.verlauf.splice(Number(b.dataset.hdel), 1); n.geaendert = new Date().toISOString();
    enqueue({ t: 'put', sitzId: s.id, sitzName: s.name, sitz: n, msg: `Alten Standort von „${s.name}“ entfernt` });
    openDetail(s.id);
  });
  wireFlaecheSection(s);
  $('#detEdit')?.addEventListener('click', () => openCapture('bearbeiten', s.id));
  $('#detZustand')?.addEventListener('click', () => openZustand(s.id));
  $('#detMove')?.addEventListener('click', () => openCapture('umstellen', s.id));
  $('#detDel')?.addEventListener('click', e => {
    const b = e.currentTarget;
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Nochmal tippen zum endgültigen Löschen'; return; }
    const files = sitzFiles(s);
    closeSheet();
    enqueue({ t: 'del', sitzId: s.id, sitzName: s.name, msg: `Hochsitz „${s.name}“ gelöscht`, delFiles: files });
  });
}
/** Zustand eines Hochsitzes ändern (Einzelrecht „zustand“ – ohne Bearbeiten-Rechte für alles andere) */
function openZustand(id) {
  const s = sitzById(id); if (!s || !canZustand()) return;
  if (!state.pw) { openPwSheet(() => openZustand(id)); return; }
  let z = s.zustand;
  openSheet(`Zustand: ${s.name}`, `
    <div class="field"><span>Zustand</span><div class="seg" id="zSeg">${Object.entries(ZUSTAND).map(([k, t]) => `<button type="button" data-v="${k}" class="${k === z ? 'on' : ''}">${t}</button>`).join('')}</div></div>
    <label class="field"><span>Bemerkung (z. B. was ist kaputt?)</span><textarea id="zBem" rows="3">${esc(s.bemerkung)}</textarea></label>
    <p class="hint">Die Änderung ist danach für alle sichtbar.</p>`,
    `<button class="btn secondary" data-close>Abbrechen</button><button class="btn" id="zSave">Speichern</button>`);
  $$('#zSeg button').forEach(b => b.onclick = () => { z = b.dataset.v; $$('#zSeg button').forEach(x => x.classList.toggle('on', x === b)); });
  $('#zSave').onclick = () => {
    const bem = $('#zBem').value.trim();
    if (z === s.zustand && bem === s.bemerkung) { closeSheet(); return; }
    const n = clone(s); n.zustand = z; n.bemerkung = bem; n.geaendert = new Date().toISOString();
    closeSheet();
    enqueue({ t: 'put', sitzId: s.id, sitzName: s.name, sitz: n, msg: `Hochsitz „${s.name}“: ${ZUSTAND[z]}${bem ? ` – ${bem}` : ''}`.slice(0, 120) });
    toast(`✓ ${s.name}: ${ZUSTAND[z]}`);
  };
}
function sitzFiles(s) {
  const out = new Set();
  [s, ...(s.verlauf || [])].forEach(x => ['foto', 'pano'].forEach(k => { if (x[k]) { out.add(x[k].f); out.add(x[k].t); } }));
  return [...out];
}

/* ================= Erfassen / Umstellen / Bearbeiten ================= */
function gpsQuality(acc) {
  if (acc == null) return ['', 'warte auf GPS …'];
  if (acc <= 5) return ['', 'sehr gut'];
  if (acc <= 10) return ['', 'gut'];
  if (acc <= 20) return ['bad', 'mäßig – kurz stehen bleiben'];
  return ['bad', 'ungenau – warten oder ins Freie gehen'];
}
/** Mittelwert der besten Messungen (Gewicht 1/Genauigkeit²) */
function estimate(samples) {
  if (!samples.length) return null;
  const best = Math.min(...samples.map(s => s.acc));
  const use = samples.filter(s => s.acc <= Math.max(best * 1.5, best + 3));
  let w = 0, lat = 0, lng = 0;
  use.forEach(s => { const k = 1 / (s.acc * s.acc); w += k; lat += s.lat * k; lng += s.lng * k; });
  return { lat: lat / w, lng: lng / w, acc: best, n: use.length };
}
const dirSeg = deg => `<div class="dir-grid">${DIRS.map((d, i) => `<button type="button" data-dir="${i * 45}" class="${deg != null && dirName(deg) === d ? 'on' : ''}">${d}</button>`).join('')}</div>`;
const roseSvg = `<svg viewBox="0 0 92 92" aria-hidden="true"><g font-size="10" font-weight="700" fill="#66694f" text-anchor="middle" font-family="sans-serif"><text x="46" y="13">N</text><text x="84" y="50">O</text><text x="46" y="87">S</text><text x="8" y="50">W</text></g><g class="needle" id="needle"><path d="M46 46 L37 20 A28 28 0 0 1 55 20 Z" fill="rgba(255,200,60,.6)" stroke="#9b7a32"/><circle cx="46" cy="46" r="4" fill="#1f4a24"/></g></svg>`;

function openCapture(mode, id) {
  if (!isAdmin()) return;
  if (!state.pw) { openPwSheet(() => openCapture(mode, id)); return; }
  const s = id ? sitzById(id) : null;
  const neu = mode === 'neu', move = mode === 'umstellen', edit = mode === 'bearbeiten';
  const f = {
    name: s?.name || '', art: s?.art || 'kanzel', zustand: s?.zustand || 'gut', bemerkung: s?.bemerkung || '',
    richtung: s ? s.richtung : null, foto: edit ? s.foto : null, pano: edit ? s.pano : null,
    newFoto: null, newPano: null, datum: todayISO(),
  };
  const gps = { samples: [], est: null, manual: null, watch: null };
  let mini = null, miniMarker = null, miniCircle = null, compassStop = null, miniDir = null;

  const title = neu ? 'Neuer Hochsitz' : move ? `Umstellen: ${s.name}` : `Bearbeiten: ${s.name}`;
  const posBlock = `<fieldset><legend>${move ? 'Neue Position' : 'Position'}</legend>
      ${edit ? '<p class="hint">Nur zur Korrektur (z. B. Punkt etwas verschieben). Wurde der Sitz versetzt, bitte „Umstellen“ nehmen – dann bleibt der alte Standort im Verlauf.</p>' : ''}
      <div class="gps-box" id="gpsBox" ${edit ? 'hidden' : ''}>
        <div class="gps-live"><span class="gps-dot" id="gpsDot"></span><div class="gps-acc" id="gpsAcc">–<small>Genauigkeit</small></div><div class="gps-txt" id="gpsTxt">Starte GPS …</div></div>
      </div>
      <div class="mini-map" id="miniMap"></div>
      <p class="hint" id="miniHint">${edit ? 'Punkt ziehen oder in die Karte tippen, um ihn zu verschieben.' : 'Der Punkt folgt dem GPS. Du kannst ihn auch ziehen oder in die Karte tippen.'}</p>
      <div class="btn-row">${edit ? '<button type="button" class="btn secondary small" id="gpsStart">An meine GPS-Position setzen</button>' : '<button type="button" class="btn secondary small" id="gpsReset">Neu messen</button>'}</div>
      <div id="nearHint"></div>
    </fieldset>`;
  const dataBlock = move ? '' : `<fieldset><legend>Angaben</legend>
      <label class="field"><span>Name / Nummer</span><input id="fName" value="${esc(f.name)}" placeholder="z. B. Eichenkanzel oder Nr. 7" autocomplete="off"></label>
      <div class="field"><span>Art</span><div class="seg" id="fArt">${Object.entries(ARTEN).map(([k, a]) => `<button type="button" data-v="${k}" class="${f.art === k ? 'on' : ''}">${esc(a.short)}</button>`).join('')}</div></div>
      <div class="field"><span>Zustand</span><div class="seg zst" id="fZst">${Object.entries(ZUSTAND).map(([k, t]) => `<button type="button" data-v="${k}" class="${f.zustand === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
      <label class="field"><span>Bemerkung</span><textarea id="fBem" placeholder="z. B. Sprosse lose, Dach neu 2026, Zugang von Norden">${esc(f.bemerkung)}</textarea></label>
    </fieldset>`;
  const dirBlock = `<fieldset><legend>Blickrichtung</legend>
      <div class="compass"><div class="rose">${roseSvg}</div>
        <div><div class="dir-val" id="dirVal">${f.richtung == null ? '–' : Math.round(f.richtung) + '°'}<small id="dirTxt">${f.richtung == null ? 'nicht angegeben' : dirName(f.richtung)}</small></div></div></div>
      <div class="btn-row"><button type="button" class="btn secondary small" id="cmpStart">🧭 Mit Kompass messen</button></div>
      <p class="hint" id="cmpHint">Handy flach halten, Oberkante in Blickrichtung des Sitzes zeigen, dann „Übernehmen“.</p>
      ${dirSeg(f.richtung)}
      <button type="button" class="btn ghost small" id="dirNone">keine Richtung</button>
    </fieldset>`;
  const photoBlock = `<fieldset><legend>Fotos</legend>
      <div class="photo-slots">
        <button type="button" class="slot" id="slotFoto"></button>
        <button type="button" class="slot" id="slotPano"></button>
      </div>
      <p class="hint">${move ? 'Leer lassen = bisherige Fotos bleiben. Neue Fotos ersetzen die aktuellen, die alten bleiben im Verlauf.' : 'Panorama: in der Kamera-App den Modus „Pano/Panorama“ nehmen und hier aus der Galerie auswählen.'}</p>
    </fieldset>`;
  const dateBlock = move ? `<fieldset><legend>Umgestellt am</legend><label class="field"><span>Datum</span><input type="date" id="fDatum" value="${f.datum}"></label></fieldset>` : '';

  openSheet(title, posBlock + dataBlock + dirBlock + photoBlock + dateBlock,
    `<button class="btn secondary" data-close>Abbrechen</button><button class="btn" id="capSave">Speichern</button>`);

  /* --- Fotos --- */
  const slot = (kind) => {
    const el = $(kind === 'foto' ? '#slotFoto' : '#slotPano');
    const nw = kind === 'foto' ? f.newFoto : f.newPano;
    const cur = kind === 'foto' ? f.foto : f.pano;
    const label = kind === 'foto' ? 'Foto vom Sitz' : 'Panorama vom Sitz';
    if (nw) {
      el.className = 'slot has'; el.innerHTML = `<img src="${nw.url}" alt=""><span class="lbl">${label} · neu</span><span class="x" role="button" aria-label="Entfernen">✕</span>`;
    } else if (cur) {
      el.className = 'slot has'; el.innerHTML = `<img data-img="${esc(cur.t)}" alt=""><span class="lbl">${label}</span><span class="x" role="button" aria-label="Entfernen">✕</span>`;
      hydrateImages(el);
    } else {
      el.className = 'slot'; el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">${kind === 'foto' ? '<path d="M4 8h3l2-2.5h6L17 8h3v11H4Z"/><circle cx="12" cy="13" r="3.5"/>' : '<path d="M2.5 7.5c6-2 13-2 19 0v9c-6-2-13-2-19 0Z"/><path d="m7 14 3-3 2.5 2.5L15 11l3 3"/>'}</svg>${label}<span class="sub" style="font-weight:400">${kind === 'foto' ? 'aufnehmen oder wählen' : 'aus der Galerie'}</span>`;
    }
  };
  const pick = kind => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    if (kind === 'foto') inp.setAttribute('capture', 'environment');
    inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return;
      toast('Bereite Foto vor …', 1500);
      try {
        const p = await prepPhoto(file, kind);
        p.url = URL.createObjectURL(new Blob([p.thumb], { type: 'image/jpeg' }));
        if (kind === 'foto') f.newFoto = p; else f.newPano = p;
        slot(kind);
      } catch (e) { toast(e.message, 4000); }
    };
    // Foto: Auswahl lassen (Kamera oder Galerie) – manche Handys öffnen mit capture sofort die Kamera
    if (kind === 'foto' && !/iPhone|iPad|Android/i.test(navigator.userAgent)) inp.removeAttribute('capture');
    inp.click();
  };
  ['foto', 'pano'].forEach(kind => {
    const el = $(kind === 'foto' ? '#slotFoto' : '#slotPano');
    el.onclick = e => {
      if (e.target.closest('.x')) {
        if (kind === 'foto') { if (f.newFoto) f.newFoto = null; else f.foto = null; } else { if (f.newPano) f.newPano = null; else f.pano = null; }
        slot(kind); return;
      }
      pick(kind);
    };
    slot(kind);
  });
  // Auf dem Handy: Foto-Slot öffnet Auswahl ohne Zwang zur Kamera, wenn lange gedrückt? → einfacher: Hinweis
  /* --- Angaben --- */
  const segWire = (sel, key) => $$(`${sel} button`).forEach(b => b.onclick = () => { f[key] = b.dataset.v; $$(`${sel} button`).forEach(x => x.classList.toggle('on', x === b)); });
  if (!move) { segWire('#fArt', 'art'); segWire('#fZst', 'zustand'); }

  /* --- Richtung --- */
  const setDir = deg => {
    f.richtung = deg == null ? null : ((deg % 360) + 360) % 360;
    $('#dirVal').innerHTML = `${f.richtung == null ? '–' : Math.round(f.richtung) + '°'}<small id="dirTxt">${f.richtung == null ? 'nicht angegeben' : dirName(f.richtung)}</small>`;
    $$('[data-dir]').forEach(b => b.classList.toggle('on', f.richtung != null && dirName(f.richtung) === DIRS[b.dataset.dir / 45]));
    $('#needle').style.transform = `rotate(${f.richtung ?? 0}deg)`;
    $('#needle').style.opacity = f.richtung == null ? .25 : 1;
    if (miniDir) miniDir();
  };
  $$('[data-dir]').forEach(b => b.onclick = () => { stopCompass(); setDir(Number(b.dataset.dir)); });
  $('#dirNone').onclick = () => { stopCompass(); setDir(null); };
  let live = null;
  const stopCompass = () => { if (compassStop) { compassStop(); compassStop = null; } const b = $('#cmpStart'); if (b) { b.textContent = '🧭 Mit Kompass messen'; b.classList.add('secondary'); } };
  $('#cmpStart').onclick = async () => {
    if (compassStop) { // läuft → übernehmen
      if (live != null) setDir(live);
      stopCompass(); toast(`Richtung ${dirTxt(f.richtung)} übernommen`); return;
    }
    compassStop = await startCompass(h => {
      live = h;
      $('#needle').style.transform = `rotate(${h}deg)`; $('#needle').style.opacity = 1;
      $('#dirVal').innerHTML = `${Math.round(h)}°<small>${dirName(h)} · live</small>`;
    });
    if (compassStop) { const b = $('#cmpStart'); b.textContent = '✓ Richtung übernehmen'; b.classList.remove('secondary'); }
  };
  setDir(f.richtung);

  /* --- Mini-Karte & GPS --- */
  const startLL = s ? [s.lat, s.lng] : state.me ? [state.me.lat, state.me.lng] : map.getCenter();
  setTimeout(() => {
    if ($('#sheet').hidden || !$('#miniMap')) return;
    mini = L.map('miniMap', { zoomControl: false, attributionControl: false, center: startLL, zoom: 18 });
    makeTiles(state.view.layer).addTo(mini);
    if (move) { // alter Standort als Orientierung
      L.marker([s.lat, s.lng], { icon: L.divIcon({ className: 'hs-old', iconSize: [12, 12], iconAnchor: [6, 6], html: '<i></i>' }), interactive: false }).addTo(mini)
        .bindTooltip('bisher', { permanent: true, direction: 'top', className: 'hs-label' });
    }
    miniMarker = L.marker(startLL, { draggable: true, icon: sitzIcon({ art: f.art, richtung: f.richtung, zustand: f.zustand }) });
    if (edit) miniMarker.addTo(mini);
    miniCircle = L.circle(startLL, { radius: 0, color: '#1c6fe0', weight: 1, fillOpacity: .12, interactive: false }).addTo(mini);
    miniMarker.on('dragend', () => { const ll = miniMarker.getLatLng(); gps.manual = { lat: ll.lat, lng: ll.lng }; manualHint(); checkNear(); });
    mini.on('click', e => { gps.manual = { lat: e.latlng.lat, lng: e.latlng.lng }; miniMarker.setLatLng(e.latlng).addTo(mini); manualHint(); checkNear(); });
    miniDir = () => { miniMarker.setIcon(sitzIcon({ art: f.art, richtung: f.richtung, zustand: f.zustand })); };
    setTimeout(() => mini.invalidateSize(), 250);
    if (gps.est) showGps();
  }, 60);
  const manualHint = () => { $('#miniHint').textContent = 'Punkt von Hand gesetzt. „Neu messen“ nimmt wieder das GPS.'; };
  const pos = () => gps.manual || gps.est || (edit && s ? { lat: s.lat, lng: s.lng, acc: s.acc } : null);
  const showGps = () => {
    const e = gps.est;
    const [cls, txt] = gpsQuality(e?.acc);
    $('#gpsAcc').className = 'gps-acc ' + cls;
    $('#gpsAcc').innerHTML = `${e ? '±' + Math.round(e.acc) + ' m' : '–'}<small>Genauigkeit</small>`;
    $('#gpsTxt').innerHTML = e ? `<b>${txt}</b><br>${e.n} Messung${e.n === 1 ? '' : 'en'} gemittelt` : txt;
    if (e && mini && !gps.manual) {
      miniMarker.setLatLng([e.lat, e.lng]).addTo(mini);
      miniCircle.setLatLng([e.lat, e.lng]).setRadius(e.acc);
      if (!showGps._c) { showGps._c = 1; mini.setView([e.lat, e.lng], 18); }
    }
  };
  const startGps = () => {
    if (!navigator.geolocation) { $('#gpsTxt').textContent = 'Kein GPS – bitte Position in der Karte antippen.'; return; }
    $('#gpsBox').hidden = false;
    $('#gpsDot').classList.add('live');
    gps.samples = []; gps.est = null; gps.manual = null; showGps._c = 0;
    if (gps.watch != null) navigator.geolocation.clearWatch(gps.watch);
    gps.watch = navigator.geolocation.watchPosition(p => {
      gps.samples.push({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() });
      if (gps.samples.length > 30) gps.samples.shift();
      gps.est = estimate(gps.samples);
      state.me = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
      showGps(); checkNear();
    }, err => {
      $('#gpsDot').classList.remove('live');
      $('#gpsTxt').textContent = err.code === 1 ? 'Standort nicht erlaubt – bitte freigeben oder Position in der Karte antippen.' : 'Kein GPS-Signal – Position in der Karte antippen.';
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  };
  const checkNear = () => {
    if (!neu) return;
    const p = pos(); const box = $('#nearHint'); if (!p || !box) return;
    const near = state.data.sitze.map(x => ({ x, d: distM(p, x) })).filter(o => o.d <= NEAR_M).sort((a, b) => a.d - b.d)[0];
    if (!near) { box.innerHTML = ''; return; }
    if (box.dataset.id === near.x.id) { $('#nearD').textContent = distTxt(near.d); return; }
    box.dataset.id = near.x.id;
    box.innerHTML = `<div class="near-hint">Du bist <b id="nearD">${distTxt(near.d)}</b> von „<b>${esc(near.x.name)}</b>“ entfernt. Wurde dieser Sitz umgestellt?<div class="btn-row"><button type="button" class="btn small" id="nearMove">Ja, „${esc(near.x.name)}“ umstellen</button></div></div>`;
    $('#nearMove').onclick = () => { const keep = { samples: gps.samples }; cleanup(); openCapture('umstellen', near.x.id); };
  };
  if (!edit) startGps();
  $('#gpsReset')?.addEventListener('click', () => { $('#miniHint').textContent = 'Der Punkt folgt dem GPS. Du kannst ihn auch ziehen oder in die Karte tippen.'; startGps(); });
  $('#gpsStart')?.addEventListener('click', () => startGps());

  const cleanup = () => {
    if (gps.watch != null) navigator.geolocation.clearWatch(gps.watch);
    gps.watch = null; stopCompass();
    if (mini) { mini.remove(); mini = null; }
    [f.newFoto, f.newPano].forEach(p => p?.url && URL.revokeObjectURL(p.url));
  };
  sheetCleanup = cleanup;

  /* --- Speichern --- */
  $('#capSave').onclick = async () => {
    const p = pos();
    if (!p) { toast('Noch keine Position – kurz auf GPS warten oder in die Karte tippen.', 3500); return; }
    let name = f.name;
    if (!move) {
      name = $('#fName').value.trim();
      if (!name) { toast('Bitte einen Namen eingeben.'); $('#fName').focus(); return; }
      f.bemerkung = $('#fBem').value.trim();
    }
    if (move && p && distM(p, s) < 3 && !f.newFoto && !f.newPano) {
      if (!$('#capSave').dataset.sure) { $('#capSave').dataset.sure = 1; $('#capSave').textContent = 'Fast gleiche Stelle – trotzdem?'; return; }
    }
    $('#capSave').disabled = true;
    try {
      const sid = s?.id || uid();
      const files = [];
      const store = async (ph, kind) => {
        const base = `${FOTO_DIR}/${sid}-${kind}-${uid()}`;
        const fPath = base + '.bin', tPath = base + '-t.bin';
        await idbSet('bin:' + fPath, await encryptBytes(ph.full, state.pw));
        await idbSet('bin:' + tPath, await encryptBytes(ph.thumb, state.pw));
        imgUrlCache.set(tPath, Promise.resolve(ph.url));
        files.push(fPath, tPath);
        return { f: fPath, t: tPath, w: ph.w, h: ph.h };
      };
      const fotoRef = f.newFoto ? await store(f.newFoto, 'foto') : null;
      const panoRef = f.newPano ? await store(f.newPano, 'pano') : null;
      f.newFoto && (f.newFoto.url = null); f.newPano && (f.newPano.url = null); // URL gehört jetzt dem Cache
      const now = new Date().toISOString();
      let n, msg;
      if (neu) {
        n = { id: sid, name, art: f.art, zustand: f.zustand, bemerkung: f.bemerkung, lat: p.lat, lng: p.lng, acc: p.acc ? Math.round(p.acc * 10) / 10 : null,
          richtung: f.richtung, foto: fotoRef, pano: panoRef, seit: todayISO(), erstellt: now, geaendert: now, verlauf: [] };
        msg = `Hochsitz „${name}“ erfasst`;
      } else if (move) {
        n = clone(s);
        const datum = $('#fDatum').value || todayISO();
        n.verlauf.unshift({ lat: s.lat, lng: s.lng, acc: s.acc, richtung: s.richtung, von: s.seit, bis: datum, foto: s.foto, pano: s.pano });
        Object.assign(n, { lat: p.lat, lng: p.lng, acc: p.acc ? Math.round(p.acc * 10) / 10 : null, richtung: f.richtung, seit: datum, geaendert: now });
        if (fotoRef) n.foto = fotoRef;
        if (panoRef) n.pano = panoRef;
        msg = `Hochsitz „${s.name}“ umgestellt (${distTxt(distM(s, p))})`;
      } else {
        n = clone(s);
        const removed = [];
        const used = new Set(n.verlauf.flatMap(v => [v.foto?.f, v.foto?.t, v.pano?.f, v.pano?.t]).filter(Boolean));
        if ((fotoRef || !f.foto) && s.foto && !used.has(s.foto.f)) removed.push(s.foto.f, s.foto.t);
        if ((panoRef || !f.pano) && s.pano && !used.has(s.pano.f)) removed.push(s.pano.f, s.pano.t);
        Object.assign(n, { name, art: f.art, zustand: f.zustand, bemerkung: f.bemerkung, richtung: f.richtung, foto: fotoRef || f.foto, pano: panoRef || f.pano, geaendert: now });
        if (gps.manual || gps.est) Object.assign(n, { lat: p.lat, lng: p.lng, acc: p.acc ? Math.round(p.acc * 10) / 10 : n.acc });
        msg = `Hochsitz „${name}“ bearbeitet`;
        cleanup(); sheetCleanup = null;
        closeSheet();
        await enqueue({ t: 'put', sitzId: sid, sitzName: name, sitz: n, files, msg, delFiles: removed });
        return;
      }
      cleanup(); sheetCleanup = null;
      closeSheet();
      await enqueue({ t: 'put', sitzId: sid, sitzName: n.name, sitz: n, files, msg });
      if (state.view.tab === 'karte') map.setView([n.lat, n.lng], Math.max(map.getZoom(), 17));
      toast(navigator.onLine === false ? 'Gespeichert auf dem Handy – wird hochgeladen, sobald Netz da ist.' : 'Wird gespeichert …', 2500);
    } catch (e) {
      toast('Fehler: ' + e.message, 5000);
      $('#capSave').disabled = false;
    }
  };
}


/* ---------- Karte nach Handy-Kompass ausrichten (ab 1.8.0) ---------- */
const follow = { stop: null, want: null, raf: 0 };
async function startFollow() {
  const btn = $('#northBtn');
  const stop = await startCompass(h => {
    follow.want = h;
    if (!follow.raf) follow.raf = requestAnimationFrame(() => {
      follow.raf = 0;
      if (!follow.stop || follow.want == null) return;
      const target = -follow.want;                        // Blickrichtung des Handys nach oben
      const cur = map.getBearing();
      const d = ((target - cur) % 360 + 540) % 360 - 180;
      if (Math.abs(d) >= 1) map.setBearing(cur + d);
    });
  });
  if (!stop) return;
  follow.stop = stop;
  btn.classList.add('follow');
  setTimeout(() => { if (follow.stop && follow.want == null) stopFollow(); }, 3500);
  toast('Karte dreht mit dem Handy – Handy flach halten. Nochmal tippen = Norden.', 3200);
}
function stopFollow() {
  if (follow.stop) { follow.stop(); follow.stop = null; }
  if (follow.raf) { cancelAnimationFrame(follow.raf); follow.raf = 0; }
  $('#northBtn').classList.remove('follow');
}

/* ---------- Kompass ---------- */
async function startCompass(cb) {
  if (typeof DeviceOrientationEvent === 'undefined') { toast('Dieses Gerät hat keinen Kompass – bitte Richtung antippen.', 3500); return null; }
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try { if (await DeviceOrientationEvent.requestPermission() !== 'granted') { toast('Kompass nicht erlaubt.', 3000); return null; } }
    catch { toast('Kompass nicht erlaubt.', 3000); return null; }
  }
  const angle = () => (screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : (window.orientation || 0));
  let sx = null, sy = null, got = false;
  const handler = e => {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading + angle();
    else if (e.absolute && e.alpha != null) h = 360 - e.alpha + angle();
    if (h == null || Number.isNaN(h)) return;
    got = true;
    const r = h * Math.PI / 180, x = Math.cos(r), y = Math.sin(r);
    sx = sx == null ? x : sx * 0.75 + x * 0.25; sy = sy == null ? y : sy * 0.75 + y * 0.25;
    cb((Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360);
  };
  const evt = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(evt, handler);
  setTimeout(() => { if (!got) toast('Der Kompass liefert keine Werte – bitte Richtung antippen.', 4000); }, 3000);
  return () => window.removeEventListener(evt, handler);
}

/* ================= Salzlecken & Freiflächen (ab 1.1.0) ================= */
const DAY = 864e5;
/** Fläche eines kleinen Polygons in m² (lokale Projektion um den Mittelpunkt) */
function areaM2(pts) {
  if (!pts || pts.length < 3) return 0;
  const R = 6371008.8, r = Math.PI / 180;
  const lat0 = pts.reduce((a, p) => a + p[0], 0) / pts.length * r;
  const xy = pts.map(p => [p[1] * r * R * Math.cos(lat0), p[0] * r * R]);
  let a = 0;
  for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a / 2);
}
const areaTxt = m2 => m2 >= 10000 ? `${(m2 / 10000).toFixed(2).replace('.', ',')} ha` : `${Math.round(m2).toLocaleString('de-DE')} m²`;
function daysSince(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((t - new Date(y, m - 1, d)) / DAY);
}
const sinceTxt = iso => { const n = daysSince(iso); return n == null ? '' : n <= 0 ? 'heute' : n === 1 ? 'gestern' : `vor ${n} Tagen`; };
const sortWartung = l => l.wartung.slice().sort((a, b) => (b.datum || '').localeCompare(a.datum || '') || (b.zeit || '').localeCompare(a.zeit || ''));
const lastOf = (l, art) => sortWartung(l).find(w => !art || w.art === art) || null;

function leckeIcon(pending) {
  return L.divIcon({ className: 'hs-ico', iconSize: [46, 46], iconAnchor: [23, 23], tooltipAnchor: [0, 16],
    html: `<div class="hs-wrap"><div class="hs-pin lk${pending ? ' pending' : ''}" style="background:${LECKE.color}">${svgIcon(LECKE.icon)}</div></div>` });
}
function kirrIcon() {
  return L.divIcon({ className: 'hs-ico', iconSize: [30, 30], iconAnchor: [15, 15], tooltipAnchor: [0, -10],
    html: `<div class="kirr-pin">${svgIcon(KIRR_ICON)}</div>` });
}
const svgIcon = (inner, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

/* ---------- Auswahl beim Erfassen ---------- */
function openAddChoice() {
  if (!isAdmin()) return;
  openSheet('Was erfassen?', `
    <button class="choice" id="chSitz"><span class="ci" style="background:${ARTEN.kanzel.color}">${artIcon('kanzel')}</span><span><b>Hochsitz</b><small>Kanzel, Leiter, Drückjagdbock …</small></span></button>
    <button class="choice" id="chLecke"><span class="ci" style="background:${LECKE.color}">${svgIcon(LECKE.icon)}</span><span><b>Salzlecke</b><small>mit Wartungsbuch</small></span></button>`);
  $('#chSitz').onclick = () => openCapture('neu');
  $('#chLecke').onclick = () => openLeckeCapture('neu');
}

/* ---------- Liste: Umschalter ---------- */
function listSeg() {
  const v = state.view.liste;
  return `<div class="seg list-seg"><button type="button" data-l="sitze" class="${v !== 'lecken' ? 'on' : ''}">Hochsitze (${state.data.sitze.length})</button><button type="button" data-l="lecken" class="${v === 'lecken' ? 'on' : ''}">Salzlecken (${state.data.lecken.length})</button></div>`;
}
function wireListSeg(el) {
  $$('.list-seg button', el).forEach(b => b.onclick = () => { state.view.liste = b.dataset.l; saveView(); renderList(); });
}
function renderLeckenList(el) {
  const pend = pendingIds();
  const lk = state.data.lecken;
  const q = (state.listQ || '').trim().toLowerCase();
  let rows = lk.filter(l => !q || l.name.toLowerCase().includes(q) || (l.bemerkung || '').toLowerCase().includes(q));
  const sort = state.view.lsort;
  const lb = l => lastOf(l, 'bestueckt')?.datum || '';
  if (sort === 'name') { /* schon nach Name */ }
  else if (sort === 'dist' && state.me) rows = rows.slice().sort((a, b) => distM(state.me, a) - distM(state.me, b));
  else rows = rows.slice().sort((a, b) => lb(a).localeCompare(lb(b)) || a.name.localeCompare(b.name, 'de', { numeric: true }));
  const nie = lk.filter(l => !lastOf(l, 'bestueckt')).length;
  el.innerHTML = `${listSeg()}
    <div class="card pad">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px">
        <div><div style="font:600 30px/1 var(--serif);color:var(--green)">${lk.length}</div><div class="sub">${lk.length === 1 ? 'Salzlecke' : 'Salzlecken'} im Revier</div></div>
        ${nie ? `<span class="badge maengel">${nie} noch nie bestückt</span>` : ''}
      </div>
      ${canLecke() && lk.length ? '<p class="hint" style="margin-top:8px">Mit ✓ hakst du eine Lecke als bestückt ab. Antippen öffnet das Wartungsbuch.</p>' : ''}
    </div>
    ${lk.length ? `<div class="list-tools">
      <input type="search" id="listQ" placeholder="Suchen …" value="${esc(state.listQ || '')}" aria-label="Suchen">
      <select id="listSort" aria-label="Sortierung">
        <option value="alt" ${sort === 'alt' ? 'selected' : ''}>Am längsten her</option>
        <option value="name" ${sort === 'name' ? 'selected' : ''}>Name</option>
        <option value="dist" ${sort === 'dist' ? 'selected' : ''}>Entfernung</option>
      </select>
    </div>` : ''}
    <div id="leckList">${rows.map(l => {
      const b = lastOf(l, 'bestueckt'), w = lastOf(l);
      return `<div class="lk-row">
        <button class="sitz" data-lid="${esc(l.id)}">
          <div class="th" ${l.foto ? `data-img="${esc(l.foto.t)}"` : `style="background:${LECKE.color}"`}>${l.foto ? '' : svgIcon(LECKE.icon)}</div>
          <div style="min-width:0"><div class="nm">${esc(l.name)}</div>
            <div class="mt">${b ? `Bestückt ${dateDE(b.datum)} · <b>${sinceTxt(b.datum)}</b>` : '<b style="color:var(--warn)">noch nicht bestückt</b>'}</div>
            ${w && w !== b ? `<div class="mt">${WARTUNG[w.art] || w.art} ${dateDE(w.datum)}</div>` : ''}
            ${pend.has(l.id) ? '<div style="margin-top:5px"><span class="badge wait">nicht hochgeladen</span></div>' : ''}
          </div>
          <div class="ds" data-dist="${esc(l.id)}"></div>
        </button>
        ${canLecke() ? `<button class="tick${b && daysSince(b.datum) === 0 ? ' done' : ''}" data-tick="${esc(l.id)}" aria-label="Als bestückt abhaken">✓</button>` : ''}
      </div>`;
    }).join('') || (lk.length ? '<div class="card pad empty">Nichts gefunden.</div>' : `<div class="card pad empty"><p>Noch keine Salzlecken erfasst.${isAdmin() ? '<br>Auf der Karte „+ Erfassen“ → „Salzlecke“ tippen, wenn du an der Lecke stehst.' : ''}</p></div>`)}</div>
    <p class="hint" style="text-align:center">v${APP_VERSION}</p>`;
  wireListSeg(el);
  $$('[data-lid]', el).forEach(b => b.onclick = () => openLecke(b.dataset.lid));
  $$('[data-tick]', el).forEach(b => b.onclick = () => openWartung(b.dataset.tick, 'bestueckt'));
  const qi = $('#listQ', el);
  if (qi) qi.oninput = () => { state.listQ = qi.value; const pos = qi.selectionStart; renderList(); const n = $('#listQ'); n.focus(); n.setSelectionRange(pos, pos); };
  const so = $('#listSort', el);
  if (so) so.onchange = () => { state.view.lsort = so.value; saveView(); if (so.value === 'dist' && !state.me) locate(); renderList(); };
  renderListDistances();
  hydrateImages(el);
}

/* ---------- Salzlecke: Details & Wartungsbuch ---------- */
function openLecke(id) {
  const l = leckeById(id); if (!l) return;
  const pend = pendingIds().has(id);
  const b = lastOf(l, 'bestueckt');
  const log = sortWartung(l);
  openSheet(l.name, `
    ${l.foto ? `<div class="det-photo"><img data-img="${esc(l.foto.t)}" alt="Foto ${esc(l.name)}" id="lkFoto"></div>` : ''}
    <div style="display:flex;gap:6px;flex-wrap:wrap"><span class="badge" style="background:${LECKE.color};color:#fff">Salzlecke</span>${pend ? '<span class="badge wait">noch nicht hochgeladen</span>' : ''}</div>
    <div class="card pad lk-status">${b ? `<div class="sub">Zuletzt bestückt</div><div class="big">${dateDE(b.datum)}</div><div class="sub">${sinceTxt(b.datum)}</div>` : '<div class="big" style="color:var(--warn)">Noch nicht bestückt</div>'}</div>
    ${l.bemerkung ? `<div class="note">${esc(l.bemerkung)}</div>` : ''}
    <dl class="facts">
      ${state.me ? `<dt>Entfernung</dt><dd>${distM(state.me, l) <= Math.max(10, state.me.acc || 0) ? 'Du bist an der Lecke' : `${distTxt(distM(state.me, l))} Richtung ${dirName(bearing(state.me, l))}`}</dd>` : ''}
      <dt>Koordinaten</dt><dd>${coordTxt(l)}${l.acc ? ` <span class="sub">(±${Math.round(l.acc)} m)</span>` : ''}</dd>
    </dl>
    <div class="btn-row"><button class="btn secondary small" id="lkMap">📍 Auf Karte zeigen</button><button class="btn secondary small" id="lkCopy">Koordinaten kopieren</button></div>
    <h2 class="section">Wartungsbuch</h2>
    ${log.length ? `<div class="card pad"><ul class="hist">${log.map(w => `<li><i class="w-${esc(w.art)}"></i><div><b>${WARTUNG[w.art] || esc(w.art)}</b> · ${dateDE(w.datum)}${w.notiz ? `<small>${esc(w.notiz)}</small>` : ''}
      ${isAdmin() ? `<div><button class="btn ghost small" data-wdel="${esc(w.id)}" style="color:var(--warn);min-height:30px;padding:2px 0;margin-top:2px">Entfernen</button></div>` : ''}</div></li>`).join('')}</ul></div>` : '<p class="hint">Noch keine Einträge.</p>'}
    ${canLecke() ? `<div class="btn-row"><button class="btn secondary small" id="lkKontr">Kontrolliert</button><button class="btn secondary small" id="lkRep">Repariert</button>${isAdmin() ? '<button class="btn secondary small" id="lkEdit">Bearbeiten</button>' : ''}</div>` : ''}
    ${isAdmin() ? '<button class="btn danger block" id="lkDel" style="margin-top:18px">Salzlecke löschen</button>' : ''}`,
    canLecke() ? `<button class="btn" id="lkBest">✓ Bestückt</button>` : '');
  const root = $('#sheet');
  hydrateImages(root);
  $('#lkFoto')?.addEventListener('click', () => openViewer(l.foto.f, l.name));
  $('#lkMap').onclick = () => { closeSheet(); focusSitz(l); };
  $('#lkCopy').onclick = async () => { try { await navigator.clipboard.writeText(coordTxt(l)); toast('Koordinaten kopiert'); } catch { toast(coordTxt(l), 5000); } };
  $('#lkBest')?.addEventListener('click', () => openWartung(id, 'bestueckt'));
  $('#lkKontr')?.addEventListener('click', () => openWartung(id, 'kontrolliert'));
  $('#lkRep')?.addEventListener('click', () => openWartung(id, 'repariert'));
  $('#lkEdit')?.addEventListener('click', () => openLeckeCapture('bearbeiten', id));
  $$('[data-wdel]', root).forEach(btn => btn.onclick = () => {
    if (!btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = 'Wirklich entfernen?'; return; }
    const n = clone(l); n.wartung = n.wartung.filter(w => w.id !== btn.dataset.wdel); n.geaendert = new Date().toISOString();
    enqueue({ t: 'put', coll: 'lecken', sitzId: id, sitzName: l.name, sitz: n, msg: `Wartungseintrag bei „${l.name}“ entfernt` });
    openLecke(id);
  });
  $('#lkDel')?.addEventListener('click', e => {
    const btn = e.currentTarget;
    if (!btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = 'Nochmal tippen zum endgültigen Löschen'; return; }
    closeSheet();
    enqueue({ t: 'del', coll: 'lecken', sitzId: id, sitzName: l.name, msg: `Salzlecke „${l.name}“ gelöscht`, delFiles: l.foto ? [l.foto.f, l.foto.t] : [] });
  });
}
/** Wartung eintragen (Standard: heute, Bestückt) */
function openWartung(id, art = 'bestueckt') {
  const l = leckeById(id); if (!l || !canLecke()) return;
  if (!state.pw) { openPwSheet(() => openWartung(id, art)); return; }
  let a = art;
  openSheet(l.name, `
    <div class="field"><span>Was wurde gemacht?</span><div class="seg" id="wArt">${Object.entries(WARTUNG).map(([k, t]) => `<button type="button" data-v="${k}" class="${k === a ? 'on' : ''}">${t}</button>`).join('')}</div></div>
    <label class="field"><span>Datum</span><input type="date" id="wDatum" value="${todayISO()}"></label>
    <label class="field"><span>Notiz (optional)</span><input id="wNotiz" placeholder="z. B. neuer Stein, Pfahl erneuert" autocomplete="off"></label>`,
    `<button class="btn secondary" data-close>Abbrechen</button><button class="btn" id="wSave">Abhaken</button>`);
  $$('#wArt button').forEach(b => b.onclick = () => { a = b.dataset.v; $$('#wArt button').forEach(x => x.classList.toggle('on', x === b)); });
  $('#wSave').onclick = () => {
    const datum = $('#wDatum').value || todayISO();
    const n = clone(l);
    n.wartung.push({ id: uid(), datum, art: a, notiz: $('#wNotiz').value.trim(), zeit: new Date().toISOString() });
    n.geaendert = new Date().toISOString();
    closeSheet();
    enqueue({ t: 'put', coll: 'lecken', sitzId: id, sitzName: l.name, sitz: n, msg: `Salzlecke „${l.name}“: ${WARTUNG[a]} ${dateDE(datum)}` });
    toast(`✓ ${l.name}: ${WARTUNG[a]}`);
  };
}

/* ---------- GPS-Helfer (Salzlecke, Freifläche) ---------- */
function gpsTracker(onUpd) {
  const g = { samples: [], est: null, last: null, watch: null };
  g.start = () => {
    if (!navigator.geolocation) { onUpd(g, 'Kein GPS – Position in der Karte antippen.'); return; }
    g.samples = []; g.est = null; g.last = null;
    if (g.watch != null) navigator.geolocation.clearWatch(g.watch);
    g.watch = navigator.geolocation.watchPosition(p => {
      const smp = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
      g.samples.push(smp); if (g.samples.length > 30) g.samples.shift();
      g.last = smp; g.est = estimate(g.samples);
      state.me = { lat: smp.lat, lng: smp.lng, acc: smp.acc };
      onUpd(g);
    }, err => onUpd(g, err.code === 1 ? 'Standort nicht erlaubt – bitte freigeben.' : 'Kein GPS-Signal.'), { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  };
  /** Mittel der Messungen der letzten Sekunden (beim Gehen) */
  g.recent = (ms = 8000) => {
    if (!g.last) return null;
    const r = g.samples.filter(x => Date.now() - x.t <= ms && distM(x, g.last) <= Math.max(3, Math.min(g.last.acc, 8)));
    return estimate(r.length ? r : [g.last]);
  };
  g.stop = () => { if (g.watch != null) navigator.geolocation.clearWatch(g.watch); g.watch = null; };
  return g;
}
const gpsBoxHtml = `<div class="gps-live"><span class="gps-dot" id="gpsDot"></span><div class="gps-acc" id="gpsAcc">–<small>Genauigkeit</small></div><div class="gps-txt" id="gpsTxt">Starte GPS …</div></div>`;
function paintGps(e, err, extra = '') {
  if (!$('#gpsAcc')) return;
  if (err) { $('#gpsDot').classList.remove('live'); $('#gpsTxt').textContent = err; return; }
  $('#gpsDot').classList.add('live');
  const [cls, txt] = gpsQuality(e?.acc);
  $('#gpsAcc').className = 'gps-acc ' + cls;
  $('#gpsAcc').innerHTML = `${e ? '±' + Math.round(e.acc) + ' m' : '–'}<small>Genauigkeit</small>`;
  $('#gpsTxt').innerHTML = `<b>${txt}</b>${extra ? '<br>' + extra : ''}`;
}
function makeMini(id, center, zoom = 18) {
  const m = L.map(id, { zoomControl: false, attributionControl: false, center, zoom });
  makeTiles(state.view.layer).addTo(m);
  setTimeout(() => m.invalidateSize(), 250);
  return m;
}
async function storePhoto(ownerId, kind, ph, files) {
  const base = `${FOTO_DIR}/${ownerId}-${kind}-${uid()}`;
  const fPath = base + '.bin', tPath = base + '-t.bin';
  await idbSet('bin:' + fPath, await encryptBytes(ph.full, state.pw));
  await idbSet('bin:' + tPath, await encryptBytes(ph.thumb, state.pw));
  imgUrlCache.set(tPath, Promise.resolve(ph.url));
  files.push(fPath, tPath);
  return { f: fPath, t: tPath, w: ph.w, h: ph.h };
}

/* ---------- Salzlecke erfassen / bearbeiten ---------- */
function openLeckeCapture(mode, id) {
  if (!isAdmin()) return;
  if (!state.pw) { openPwSheet(() => openLeckeCapture(mode, id)); return; }
  const neu = mode === 'neu', l = id ? leckeById(id) : null;
  const f = { foto: l?.foto || null, newFoto: null };
  let mini = null, mk = null, circ = null, manual = null;
  const g = gpsTracker((g, err) => {
    paintGps(g.est, err, g.est ? `${g.est.n} Messung${g.est.n === 1 ? '' : 'en'} gemittelt` : '');
    if (g.est && mini && !manual) { mk.setLatLng([g.est.lat, g.est.lng]).addTo(mini); circ.setLatLng([g.est.lat, g.est.lng]).setRadius(g.est.acc); if (!g._c) { g._c = 1; mini.setView([g.est.lat, g.est.lng], 18); } }
  });
  openSheet(neu ? 'Neue Salzlecke' : `Bearbeiten: ${l.name}`, `
    <fieldset><legend>Position</legend>
      <div class="gps-box" id="gpsBox" ${neu ? '' : 'hidden'}>${gpsBoxHtml}</div>
      <div class="mini-map" id="lkMini"></div>
      <p class="hint">${neu ? 'Der Punkt folgt dem GPS. Du kannst ihn auch ziehen oder in die Karte tippen.' : 'Punkt ziehen oder in die Karte tippen, um ihn zu verschieben.'}</p>
      <div class="btn-row"><button type="button" class="btn secondary small" id="lkGps">${neu ? 'Neu messen' : 'An meine GPS-Position setzen'}</button></div>
    </fieldset>
    <fieldset><legend>Angaben</legend>
      <label class="field"><span>Name / Nummer</span><input id="lkName" value="${esc(l?.name || '')}" placeholder="z. B. Lecke Eichenkanzel oder Nr. 3" autocomplete="off"></label>
      <label class="field"><span>Bemerkung</span><textarea id="lkBem" placeholder="z. B. am Wildwechsel, Pfahl Eiche">${esc(l?.bemerkung || '')}</textarea></label>
      ${neu ? '<label class="check"><input type="checkbox" id="lkHeute" checked> Heute bestückt</label>' : ''}
    </fieldset>
    <fieldset><legend>Foto</legend><div class="photo-slots"><button type="button" class="slot" id="lkSlot"></button></div></fieldset>`,
    `<button class="btn secondary" data-close>Abbrechen</button><button class="btn" id="lkSave">Speichern</button>`);
  const slot = () => {
    const el = $('#lkSlot');
    if (f.newFoto) { el.className = 'slot has'; el.innerHTML = `<img src="${f.newFoto.url}" alt=""><span class="lbl">neu</span><span class="x">✕</span>`; }
    else if (f.foto) { el.className = 'slot has'; el.innerHTML = `<img data-img="${esc(f.foto.t)}" alt=""><span class="x">✕</span>`; hydrateImages(el); }
    else { el.className = 'slot'; el.innerHTML = `${svgIcon('<path d="M4 8h3l2-2.5h6L17 8h3v11H4Z"/><circle cx="12" cy="13" r="3.5"/>')}Foto<span class="sub" style="font-weight:400">optional</span>`; }
  };
  $('#lkSlot').onclick = e => {
    if (e.target.closest('.x')) { if (f.newFoto) f.newFoto = null; else f.foto = null; slot(); return; }
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => { const file = inp.files[0]; if (!file) return; try { const p = await prepPhoto(file, 'foto'); p.url = URL.createObjectURL(new Blob([p.thumb], { type: 'image/jpeg' })); f.newFoto = p; slot(); } catch (err) { toast(err.message, 4000); } };
    inp.click();
  };
  slot();
  const start = l ? [l.lat, l.lng] : state.me ? [state.me.lat, state.me.lng] : map.getCenter();
  setTimeout(() => {
    if (!$('#lkMini')) return;
    mini = makeMini('lkMini', start);
    mk = L.marker(start, { draggable: true, icon: leckeIcon(false) });
    circ = L.circle(start, { radius: 0, color: '#1c6fe0', weight: 1, fillOpacity: .12, interactive: false }).addTo(mini);
    if (!neu) mk.addTo(mini);
    mk.on('dragend', () => { const ll = mk.getLatLng(); manual = { lat: ll.lat, lng: ll.lng }; });
    mini.on('click', e => { manual = { lat: e.latlng.lat, lng: e.latlng.lng }; mk.setLatLng(e.latlng).addTo(mini); });
    if (g.est) { g._c = 0; paintGps(g.est); mk.setLatLng([g.est.lat, g.est.lng]).addTo(mini); }
  }, 60);
  if (neu) g.start();
  $('#lkGps').onclick = () => { manual = null; $('#gpsBox').hidden = false; g._c = 0; g.start(); };
  sheetCleanup = () => { g.stop(); if (mini) { mini.remove(); mini = null; } };
  $('#lkSave').onclick = async () => {
    const p = manual || g.est || (l ? { lat: l.lat, lng: l.lng, acc: l.acc } : null);
    if (!p) { toast('Noch keine Position – kurz auf GPS warten oder in die Karte tippen.', 3500); return; }
    const name = $('#lkName').value.trim();
    if (!name) { toast('Bitte einen Namen eingeben.'); $('#lkName').focus(); return; }
    $('#lkSave').disabled = true;
    try {
      const lid = l?.id || uid(), files = [], now = new Date().toISOString();
      const fotoRef = f.newFoto ? await storePhoto(lid, 'lecke', f.newFoto, files) : null;
      if (f.newFoto) f.newFoto.url = null;
      const removed = l?.foto && (fotoRef || !f.foto) ? [l.foto.f, l.foto.t] : [];
      const n = l ? clone(l) : { id: lid, erstellt: now, wartung: [] };
      Object.assign(n, { name, bemerkung: $('#lkBem').value.trim(), lat: p.lat, lng: p.lng, acc: p.acc ? Math.round(p.acc * 10) / 10 : (l?.acc ?? null), foto: fotoRef || f.foto, geaendert: now });
      if (neu && $('#lkHeute').checked) n.wartung.push({ id: uid(), datum: todayISO(), art: 'bestueckt', notiz: '', zeit: now });
      sheetCleanup(); sheetCleanup = null; closeSheet();
      await enqueue({ t: 'put', coll: 'lecken', sitzId: lid, sitzName: name, sitz: n, files, delFiles: removed, msg: neu ? `Salzlecke „${name}“ erfasst` : `Salzlecke „${name}“ bearbeitet` });
      if (state.view.tab === 'karte') map.setView([n.lat, n.lng], Math.max(map.getZoom(), 17));
    } catch (e) { toast('Fehler: ' + e.message, 5000); $('#lkSave').disabled = false; }
  };
}

/* ---------- Freifläche & Kirrung (am Hochsitz) ---------- */
function flaecheSection(s) {
  const fl = s.flaeche, k = s.kirrung;
  if (!fl && !k && !isAdmin()) return '';
  return `<h2 class="section">Freifläche & Kirrung</h2>
    <div class="card pad">
      ${fl || k ? `<dl class="facts">
        ${fl ? `<dt>Freifläche</dt><dd>${areaTxt(fl.m2)} <span class="sub">(${fl.pts.length} Ecken, abgelaufen ${dateDE(fl.datum)})</span></dd>` : ''}
        ${k ? `<dt>Kirrung</dt><dd>${distTxt(distM(s, k))} vom Sitz, Richtung ${dirName(bearing(s, k))}${k.datum ? ` <span class="sub">(seit ${dateDE(k.datum)})</span>` : ''}</dd>` : ''}
      </dl>` : '<p class="hint">Noch keine Freifläche eingetragen.</p>'}
      ${isAdmin() ? `<div class="btn-row" style="margin-top:10px"><button class="btn secondary small" id="flEdit">${fl || k ? 'Freifläche / Kirrung bearbeiten' : 'Freifläche ablaufen'}</button></div>` : ''}
    </div>`;
}
function wireFlaecheSection(s) { $('#flEdit')?.addEventListener('click', () => openFlaeche(s.id)); }

function openFlaeche(id) {
  const s = sitzById(id); if (!s || !isAdmin()) return;
  if (!state.pw) { openPwSheet(() => openFlaeche(id)); return; }
  const pts = (s.flaeche?.pts || []).map(p => [p[0], p[1]]);
  let kirr = s.kirrung ? { ...s.kirrung } : null;
  let tapMode = null; // 'kirr' | 'ecke'
  let mini = null, poly = null, vLayer = null, kMk = null, meMk = null, meC = null;
  const g = gpsTracker((g, err) => {
    const r = g.recent();
    paintGps(r, err, 'Kurz stehen bleiben macht die Ecke genauer');
    if (r && mini) {
      if (!meMk) {
        meMk = L.marker([r.lat, r.lng], { icon: L.divIcon({ className: 'me-dot', iconSize: [24, 24], iconAnchor: [12, 12], html: '<i></i>' }), interactive: false, zIndexOffset: 1000 }).addTo(mini);
        meC = L.circle([r.lat, r.lng], { radius: r.acc, color: '#1c6fe0', weight: 1, fillOpacity: .1, interactive: false }).addTo(mini);
      } else { meMk.setLatLng([r.lat, r.lng]); meC.setLatLng([r.lat, r.lng]).setRadius(r.acc); }
    }
  });
  openSheet(`Freifläche: ${s.name}`, `
    <div class="gps-box">${gpsBoxHtml}</div>
    <div class="mini-map tall" id="flMini"></div>
    <div class="fl-info"><span id="flInfo"></span></div>
    <fieldset><legend>Freifläche ablaufen</legend>
      <p class="hint">Am Rand der Fläche entlang gehen und an jeder Ecke bzw. Richtungsänderung „Ecke hier setzen“ tippen. Kurz stehen bleiben macht den Punkt genauer. Ecken lassen sich in der Karte nachträglich ziehen.</p>
      <button type="button" class="btn block" id="flAdd">＋ Ecke hier setzen</button>
      <div class="btn-row"><button type="button" class="btn secondary small" id="flUndo">Letzte Ecke löschen</button><button type="button" class="btn secondary small" id="flTapE">Ecke in Karte antippen</button><button type="button" class="btn ghost small" id="flClear" style="color:var(--warn)">Fläche leeren</button></div>
    </fieldset>
    <fieldset><legend>Kirrung</legend>
      <div class="btn-row"><button type="button" class="btn secondary small" id="kHere">Kirrung an meiner Position</button><button type="button" class="btn secondary small" id="kTap">Kirrung in Karte antippen</button></div>
      <button type="button" class="btn ghost small" id="kDel" style="color:var(--warn)">Kirrung entfernen</button>
    </fieldset>`,
    `<button class="btn secondary" data-close>Abbrechen</button><button class="btn" id="flSave">Speichern</button>`);
  const info = () => {
    const a = areaM2(pts);
    $('#flInfo').innerHTML = `${pts.length} ${pts.length === 1 ? 'Ecke' : 'Ecken'}${pts.length >= 3 ? ` · <b>${areaTxt(a)}</b>` : pts.length ? ' · mindestens 3 Ecken nötig' : ''} · Kirrung: ${kirr ? `<b>${distTxt(distM(s, kirr))}</b> vom Sitz` : 'keine'}${tapMode ? ` · <b style="color:var(--warn)">${tapMode === 'kirr' ? 'Kirrung' : 'Ecke'}: in die Karte tippen</b>` : ''}`;
    $('#kDel').hidden = !kirr; $('#flUndo').disabled = !pts.length; $('#flClear').hidden = !pts.length;
  };
  const draw = () => {
    if (!mini) { info(); return; }
    vLayer.clearLayers();
    if (poly) { mini.removeLayer(poly); poly = null; }
    if (pts.length >= 2) poly = (pts.length >= 3 ? L.polygon(pts, { color: '#e8d24a', weight: 2, fillColor: '#f2e27a', fillOpacity: .25 }) : L.polyline(pts, { color: '#e8d24a', weight: 3 })).addTo(mini);
    pts.forEach((p, i) => {
      const v = L.marker(p, { draggable: true, icon: L.divIcon({ className: 'fl-v', iconSize: [18, 18], iconAnchor: [9, 9], html: `<i>${i + 1}</i>` }) });
      v.on('drag', e => { pts[i] = [e.latlng.lat, e.latlng.lng]; if (poly) poly.setLatLngs(pts); });
      v.on('dragend', () => draw());
      vLayer.addLayer(v);
    });
    if (pts.length && !mini.getBounds().contains(L.latLngBounds(pts))) mini.fitBounds(L.latLngBounds([...pts, [s.lat, s.lng]]).pad(0.2), { maxZoom: 19 });
    if (kMk) { mini.removeLayer(kMk); kMk = null; }
    if (kirr) {
      kMk = L.marker([kirr.lat, kirr.lng], { draggable: true, icon: kirrIcon() }).addTo(mini);
      kMk.on('dragend', () => { const ll = kMk.getLatLng(); kirr = { ...kirr, lat: ll.lat, lng: ll.lng }; info(); });
    }
    info();
  };
  setTimeout(() => {
    if (!$('#flMini')) return;
    mini = makeMini('flMini', [s.lat, s.lng], 18);
    vLayer = L.layerGroup().addTo(mini);
    L.marker([s.lat, s.lng], { icon: sitzIcon(s, false), interactive: false }).addTo(mini);
    if (pts.length >= 3) mini.fitBounds(L.latLngBounds([...pts, [s.lat, s.lng]]).pad(0.2), { maxZoom: 19 });
    mini.on('click', e => {
      if (tapMode === 'kirr') { kirr = { lat: e.latlng.lat, lng: e.latlng.lng, datum: kirr?.datum || todayISO() }; tapMode = null; draw(); }
      else if (tapMode === 'ecke') { pts.push([e.latlng.lat, e.latlng.lng]); draw(); }
    });
    draw();
  }, 60);
  g.start();
  const here = () => { const r = g.recent(); if (!r) toast('Noch kein GPS – kurz warten.', 2500); return r; };
  $('#flAdd').onclick = () => {
    const r = here(); if (!r) return;
    if (pts.length && distM({ lat: pts[pts.length - 1][0], lng: pts[pts.length - 1][1] }, r) < 2) { toast('Zu nah an der letzten Ecke – ein Stück weitergehen.', 2500); return; }
    pts.push([r.lat, r.lng]); draw();
    toast(`Ecke ${pts.length} gesetzt (±${Math.round(r.acc)} m)`, 1500);
    if (navigator.vibrate) navigator.vibrate(40);
  };
  $('#flUndo').onclick = () => { pts.pop(); draw(); };
  $('#flClear').onclick = e => { const b = e.currentTarget; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Wirklich alle Ecken löschen?'; return; } delete b.dataset.sure; b.textContent = 'Fläche leeren'; pts.length = 0; draw(); };
  $('#flTapE').onclick = e => { tapMode = tapMode === 'ecke' ? null : 'ecke'; e.currentTarget.classList.toggle('on-btn', tapMode === 'ecke'); info(); };
  $('#kHere').onclick = () => { const r = here(); if (!r) return; kirr = { lat: r.lat, lng: r.lng, datum: todayISO() }; draw(); toast('Kirrung gesetzt', 1500); };
  $('#kTap').onclick = () => { tapMode = 'kirr'; $('#flTapE').classList.remove('on-btn'); info(); };
  $('#kDel').onclick = () => { kirr = null; draw(); };
  sheetCleanup = () => { g.stop(); if (mini) { mini.remove(); mini = null; } };
  $('#flSave').onclick = () => {
    if (pts.length && pts.length < 3) { toast('Für eine Fläche mindestens 3 Ecken setzen – oder „Fläche leeren“.', 3500); return; }
    const n = clone(s), now = new Date().toISOString();
    const changed = JSON.stringify(s.flaeche?.pts || []) !== JSON.stringify(pts);
    n.flaeche = pts.length >= 3 ? { pts: pts.map(p => [Math.round(p[0] * 1e7) / 1e7, Math.round(p[1] * 1e7) / 1e7]), m2: Math.round(areaM2(pts)), datum: changed ? todayISO() : (s.flaeche?.datum || todayISO()) } : null;
    n.kirrung = kirr ? { lat: Math.round(kirr.lat * 1e7) / 1e7, lng: Math.round(kirr.lng * 1e7) / 1e7, datum: kirr.datum || todayISO() } : null;
    n.geaendert = now;
    sheetCleanup(); sheetCleanup = null; closeSheet();
    enqueue({ t: 'put', sitzId: s.id, sitzName: s.name, sitz: n, msg: `Freifläche/Kirrung „${s.name}“ gespeichert` });
    setTimeout(() => openDetail(s.id), 250);
  };
}

/* ================= Passwort ================= */
/** Sperrbildschirm: „Mit Konto anmelden“ (und ggf. kein Passwort-Feld mehr) */
function refreshLockKonto() {
  if (!window.Konto?.enabled() || !$('#lockForm')) return;
  if (!$('#lockKonto')) {
    $('#lockBtn').insertAdjacentHTML('afterend', '<button type="button" class="btn secondary block" id="lockKonto" style="margin-top:8px">👤 Mit Konto anmelden</button>');
    $('#lockKonto').addEventListener('click', () => Konto.openLogin({ over: true }));
  }
  const nur = Konto.nurKonten();
  $('#lockPw').hidden = nur; $('#lockBtn').hidden = nur;
  $('#lockKonto').className = nur ? 'btn block' : 'btn secondary block';
  if (nur && !$('#lockMsg').classList.contains('err')) $('#lockMsg').textContent = 'Bitte mit deinem Konto anmelden.';
}
function showLock(reason) {
  setTimeout(refreshLockKonto, 0);
  $('#lock').hidden = false;
  $('#lockMsg').textContent = reason === 'falsch' ? 'Passwort falsch oder geändert – bitte (neu) eingeben.' : 'Bitte das Passwort der Jagdgemeinschaft eingeben.';
  $('#lockMsg').classList.toggle('err', reason === 'falsch');
  $('#lockPw').value = '';
  setTimeout(() => $('#lockPw').focus(), 50);
}
$('#lockForm').addEventListener('submit', async e => {
  e.preventDefault();
  const pw = $('#lockPw').value; if (!pw) return;
  state.pw = pw; $('#lockBtn').disabled = true;
  try {
    await load();
    if ($('#lock').hidden) {
      lsSet(LS_PW, pw); flush();
      if (window.Konto?.isAdmin() && Konto.dataPw() !== pw) Konto.setDataPw(pw, true).catch(() => {});
    }
    else { state.pw = ''; }
  } finally { $('#lockBtn').disabled = false; }
});
$('#lockSettings').onclick = () => openSettings(true);

/** Passwort festlegen (erste Einrichtung) oder ändern (alles neu verschlüsseln) */
function openPwSheet(after) {
  const first = !state.remoteEnc;
  openSheet(first ? 'Passwort festlegen' : 'Passwort ändern', `
    <p class="hint">${first
      ? 'Die Hochsitze und Fotos werden mit dem Passwort der Jagdgemeinschaft verschlüsselt. <b>Am besten dasselbe Passwort wie in der Jagd-Thuine-App</b> – dann passt alles, wenn die Hochsitze später in die App wandern.'
      : 'Alle Daten und Fotos werden mit dem neuen Passwort neu verschlüsselt. Danach fragt jedes Gerät einmal nach dem neuen Passwort. Dafür ist Internet nötig.'}</p>
    ${!first ? '<label class="field"><span>Bisheriges Passwort</span><input type="password" id="pwOld" autocomplete="current-password"></label>' : ''}
    <label class="field"><span>${first ? 'Passwort' : 'Neues Passwort'}</span><input type="password" id="pwNew" autocomplete="new-password"></label>
    <label class="field"><span>Wiederholen</span><input type="password" id="pwNew2" autocomplete="new-password"></label>
    <p class="hint" id="pwMsg"></p>`,
    `<button class="btn secondary" data-close>Abbrechen</button><button class="btn" id="pwSave">${first ? 'Festlegen' : 'Ändern'}</button>`, { overLock: true });
  $('#pwSave').onclick = async () => {
    const a = $('#pwNew').value, b = $('#pwNew2').value;
    if (a.length < 6) { $('#pwMsg').textContent = 'Mindestens 6 Zeichen.'; return; }
    if (a !== b) { $('#pwMsg').textContent = 'Die beiden Eingaben sind verschieden.'; return; }
    if (first) {
      state.pw = a; lsSet(LS_PW, a); closeSheet(); toast('Passwort gespeichert ✓');
      if (window.Konto?.isAdmin()) Konto.setDataPw(a, true).catch(() => {});
      if (after) setTimeout(after, 200); else flush();
      return;
    }
    if ($('#pwOld').value !== state.pw) { $('#pwMsg').textContent = 'Bisheriges Passwort stimmt nicht.'; return; }
    $('#pwSave').disabled = true;
    try { await reencryptAll(state.pw, a, t => ($('#pwMsg').textContent = t)); closeSheet(); toast('Passwort geändert ✓ – alles neu verschlüsselt.', 4000); }
    catch (e) { $('#pwMsg').textContent = 'Fehler: ' + e.message + ' – bitte nochmal versuchen.'; $('#pwSave').disabled = false; }
  };
}
async function reencryptAll(oldPw, newPw, progress) {
  if (state.queue.length) { await flush(); if (state.queue.length) throw new Error('Erst die wartenden Änderungen hochladen'); }
  const { raw } = await fetchRemoteRaw();
  const { data } = await openRaw(raw);
  const nd = normalize(data);
  const files = [...new Set([...nd.sitze.flatMap(sitzFiles), ...nd.lecken.flatMap(l => l.foto ? [l.foto.f, l.foto.t] : [])])];
  lsSet(LS_SALT, undefined); // neuer Salt für das neue Passwort
  let i = 0;
  for (const p of files) {
    progress(`Fotos neu verschlüsseln … ${++i}/${files.length}`);
    await idbDel('bin:' + p);
    const plain = await decryptBytes(await fetchBin(p), [oldPw]);
    const enc = await encryptBytes(plain, newPw);
    const r = await putFile(p, bytesToB64(enc), 'Foto neu verschlüsselt', await getSha(p));
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    await idbSet('bin:' + p, enc);
  }
  progress('Daten speichern …');
  const r = await putFile(DATA_PATH, b64encodeUtf8(JSON.stringify(await encryptJSON(data, newPw), null, 1) + '\n'), 'Passwort geändert', await getSha(DATA_PATH));
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  state.pw = newPw; lsSet(LS_PW, newPw);
  if (window.Konto?.isAdmin()) await Konto.setDataPw(newPw, true).catch(() => toast('Neues Passwort konnte nicht im Konten-Server hinterlegt werden – unter „Konten verwalten“ erneut versuchen.', 6000));
  await load();
}

/* ================= Einstellungen ================= */
function openSettings(fromLock = false) {
  const c = state.cfg;
  const voll = c.mode === 'voll';
  const adm = isAdmin();
  openSheet('Einstellungen', `
    ${window.Konto?.settingsHtml() || ''}
    ${CONF.api ? `<details ${voll ? 'open' : ''}><summary style="font-weight:600;cursor:pointer;padding:4px 0">Zugang mit GitHub-Token (bisherige Methode)</summary>` : ''}
    <fieldset><legend>Zugang auf diesem Gerät</legend>
      <div class="seg" id="sMode"><button type="button" data-v="" class="${voll ? '' : 'on'}">Nur ansehen</button><button type="button" data-v="voll" class="${voll ? 'on' : ''}">Voller Zugang</button></div>
      <div id="sVoll" ${voll ? '' : 'hidden'}>
        <label class="field"><span>GitHub-Token (Contents: Read & Write auf „${esc(c.repo || 'Hochsitze')}“)</span><input type="password" id="sToken" value="${esc(c.token)}" autocomplete="off" placeholder="github_pat_…"></label>
        <div class="grid2" style="margin-top:10px">
          <label class="field"><span>GitHub-Konto</span><input id="sOwner" value="${esc(c.owner)}" autocomplete="off"></label>
          <label class="field"><span>Repository</span><input id="sRepo" value="${esc(c.repo)}" autocomplete="off"></label>
        </div>
        <button type="button" class="btn secondary small" id="sTest" style="margin-top:10px">Zugang prüfen</button>
        <p class="hint" id="sTestMsg"></p>
      </div>
    </fieldset>
    ${CONF.api ? '</details>' : ''}
    ${adm && !fromLock ? `<fieldset><legend>Reviergrenze</legend>
      <p class="hint">${state.data.revier ? `Eingetragen: <b>${esc(state.data.revier.name || 'Revier')}</b> · ${areaTxt(state.data.revier.m2)} · Stand ${dateDE(state.data.revier.datum)}` : 'Noch keine Reviergrenze eingetragen.'} Import aus Google My Maps (KML/KMZ) oder GeoJSON.</p>
      <div class="btn-row"><button type="button" class="btn secondary small" id="sRev">${state.data.revier ? 'Neu importieren' : 'Reviergrenze importieren'}</button>${state.data.revier ? '<button type="button" class="btn ghost small" id="sRevDel" style="color:var(--warn)">Entfernen</button>' : ''}</div>
    </fieldset>` : ''}
    ${adm && !fromLock ? `<fieldset><legend>Datenschutz</legend>
      <p class="hint">${state.remoteEnc ? 'Daten und Fotos sind mit dem Passwort der Jagdgemeinschaft verschlüsselt.' : state.pw ? 'Passwort ist festgelegt – die Daten werden beim nächsten Speichern verschlüsselt.' : 'Noch kein Passwort festgelegt.'}</p>
      <button type="button" class="btn secondary small" id="sPw">${state.remoteEnc ? 'Passwort ändern' : state.pw ? 'Passwort neu festlegen' : 'Passwort festlegen'}</button>
    </fieldset>` : ''}
    <fieldset><legend>Dieses Gerät</legend>
      <button type="button" class="btn secondary small" id="sClear">Gespeicherte Fotos auf dem Gerät löschen</button>
      ${state.pw && !fromLock ? '<button type="button" class="btn ghost small" id="sForget" style="color:var(--warn)">Passwort auf diesem Gerät vergessen</button>' : ''}
      <button type="button" class="btn ghost small" id="sReload">App neu laden</button>
      <p class="hint" id="sDevMsg"></p>
    </fieldset>
    <fieldset><legend>Über die App</legend>
      <div class="about"><img src="icons/logo.png" alt=""><div><b>Hochsitze</b><small>Jagdgemeinschaft Thuine · Version ${APP_VERSION}</small><small>Entwickelt von Sebastian Bruns, Thuine · privat, nicht kommerziell</small></div></div>
      <p class="hint">Karten: Luftbild © Esri · TopPlusOpen © BKG · © OpenStreetMap-Mitwirkende</p>
    </fieldset>`,
    `<button class="btn secondary" data-close>Schließen</button><button class="btn" id="sSave">Übernehmen</button>`, { overLock: fromLock });
  window.Konto?.wireSettings($('#sheet'), { over: fromLock });
  let mode = c.mode;
  $$('#sMode button').forEach(b => b.onclick = () => { mode = b.dataset.v; $$('#sMode button').forEach(x => x.classList.toggle('on', x === b)); $('#sVoll').hidden = mode !== 'voll'; });
  const read = () => ({ mode, token: $('#sToken').value.trim(), owner: $('#sOwner').value.trim(), repo: $('#sRepo').value.trim() });
  $('#sTest').onclick = async () => {
    const v = read(); const msg = $('#sTestMsg'); msg.textContent = 'Prüfe …';
    try {
      const r = await fetch(`https://api.github.com/repos/${encodeURIComponent(v.owner)}/${encodeURIComponent(v.repo)}`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${v.token}` }, cache: 'no-store' });
      if (!r.ok) { msg.textContent = r.status === 401 ? '❌ Token ungültig.' : r.status === 404 ? '❌ Repository nicht gefunden oder Token hat keinen Zugriff.' : `❌ GitHub ${r.status}`; return; }
      const j = await r.json();
      msg.textContent = j.permissions?.push ? '✅ Schreibzugriff vorhanden.' : '⚠️ Nur Lesezugriff – Token braucht „Contents: Read and write“.';
    } catch { msg.textContent = '❌ Keine Verbindung.'; }
  };
  $('#sPw')?.addEventListener('click', () => openPwSheet());
  $('#sRev')?.addEventListener('click', () => pickRevierFile());
  $('#sRevDel')?.addEventListener('click', e => {
    const b = e.currentTarget; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Wirklich entfernen?'; return; }
    closeSheet(); enqueue({ t: 'meta', key: 'revier', val: null, msg: 'Reviergrenze entfernt' });
  });
  $('#sClear').onclick = async () => {
    const keep = new Set(state.queue.flatMap(o => o.files));
    const keys = (await idbKeys()) || [];
    let n = 0; for (const k of keys) if (String(k).startsWith('bin:') && !keep.has(k.slice(4))) { await idbDel(k); n++; }
    $('#sDevMsg').textContent = `${n} Dateien gelöscht. Fotos werden bei Bedarf neu geladen.`;
  };
  $('#sForget')?.addEventListener('click', () => { lsSet(LS_PW, undefined); lsSet(LS_DATA, undefined); state.pw = ''; location.reload(); });
  $('#sReload').onclick = async () => {
    try { const regs = await navigator.serviceWorker?.getRegistrations?.(); await Promise.all((regs || []).map(r => r.unregister())); } catch { /* egal */ }
    try { const keys = await caches.keys(); await Promise.all(keys.filter(k => !k.startsWith('hs-tiles')).map(k => caches.delete(k))); } catch { /* egal */ }
    location.replace(location.pathname + '?r=' + Date.now());
  };
  $('#sSave').onclick = () => {
    const v = read();
    Object.assign(state.cfg, v.mode === 'voll' ? v : { mode: '', token: '' });
    if ((v.mode !== 'voll' && location.hostname.endsWith('.github.io')) || CONF.test) { const d = defaultCfg(); state.cfg.owner = d.owner; state.cfg.repo = d.repo; }
    saveCfg(); closeSheet(); toast('Einstellungen gespeichert');
    render(); load();
  };
}
$('#settingsBtn').onclick = () => openSettings();
$('#refreshBtn').onclick = () => { load(); if (state.queue.length) flush(); };
$$('.tab').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

/* ================= Start ================= */
function measureTop() { document.documentElement.style.setProperty('--top-h', $('.topbar').getBoundingClientRect().height + 'px'); }
window.addEventListener('resize', () => { measureTop(); map?.invalidateSize(); });
window.addEventListener('online', () => flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - (load._last || 0) > 60000 && $('#sheet').hidden) { load._last = Date.now(); load({ quiet: true }); }
});
setInterval(() => { if (document.visibilityState === 'visible' && $('#sheet').hidden && $('#viewer').hidden) load({ quiet: true }); }, 5 * 60 * 1000);

(async function start() {
  measureTop();
  window.Konto?.init({
    ui: { openSheet: (t, b, f, over) => openSheet(t, b, f, { overLock: over }), closeSheet: () => closeSheet(), toast },
    getPw: () => state.pw,
    setPw: async pw => { state.pw = pw; lsSet(LS_PW, pw); await load(); },
    onChange: () => { refreshLockKonto(); if (state.loaded) { render(); updateBanner(); if (state.queue.length && canWrite()) flush(); } },
  });
  refreshLockKonto();
  initMap();
  flowInit();
  switchTab(state.view.tab === 'liste' ? 'liste' : 'karte', true);
  await loadCached();
  renderWind();
  renderSun();
  load._last = Date.now();
  await load();
  loadWind(true);
  setInterval(() => { if (document.visibilityState === 'visible') { loadWind(); renderSun(); } }, 60 * 1000);
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            const b = $('#banner'); b.className = 'banner'; b.hidden = false;
            b.innerHTML = '<span>✨ Neue Version verfügbar</span><button class="btn small" id="updBtn">Neu laden</button>';
            $('#updBtn').onclick = () => { nw.postMessage('skipWaiting'); setTimeout(() => location.reload(), 300); };
          }
        });
      });
    }).catch(() => { /* egal */ });
  }
})();
