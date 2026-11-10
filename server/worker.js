/* Jagd Thuine · Konten-Server (Cloudflare Worker)
 * ------------------------------------------------------------
 * Ein Server für beide Apps (Jagd Thuine und Hochsitze):
 *  - Benutzerkonten (Anmelden, Registrieren, Freigabe durch Admin)
 *  - Rechte je App (Rolle „ansehen“/„admin“ + Einzelrechte)
 *  - Schreiben ins GitHub-Repo über den hier hinterlegten Token (GH_TOKEN)
 *  - Änderungsprotokoll (wer, wann, was)
 *  - Push-Benachrichtigungen (Web Push, Schlüssel werden automatisch erzeugt)
 *
 * Einrichtung in Cloudflare (siehe Anleitung):
 *  - KV-Namespace mit dem Variablennamen  DB  verbinden
 *  - Secret  GH_TOKEN  = GitHub-Token (Contents: Read and write auf die unten genannten Repos)
 *
 * Nur der Abschnitt KONFIGURATION unterscheidet sich zwischen Test- und Live-Server.
 */

/* ===================== KONFIGURATION ===================== */
const CONFIG = {
  name: 'Jagd Thuine – TEST',
  owner: 'Grunzelthuine',
  // Webseiten, die den Server benutzen dürfen
  origins: ['https://grunzelthuine.github.io'],
  apps: {
    thuine: {
      name: 'Jagd Thuine',
      rechte: {},
      // Erste passende Regel zählt. write: 'admin' | 'mitglied' | [Einzelrechte]
      regeln: [
        { repo: 'Jagd-Test', pfad: 'thuine/data/meldungen.json', write: 'mitglied' },
        { repo: 'Jagd-Test', pfad: 'thuine/', write: 'admin' },
      ],
    },
    hochsitze: {
      name: 'Hochsitze',
      rechte: {
        zustand: 'Hochsitz-Zustand ändern (Mängel, gesperrt)',
        lecke: 'Salzlecken abhaken (bestückt, kontrolliert)',
      },
      regeln: [
        { repo: 'Jagd-Test', pfad: 'hochsitze/data/hochsitze.json', write: ['zustand', 'lecke'] },
        { repo: 'Jagd-Test', pfad: 'hochsitze/', write: 'admin' },
      ],
    },
  },
  // Foto-Auswertung (Claude). Schlüssel als Secret ANTHROPIC_KEY. Nur Admins dieser App.
  ki: { app: 'thuine', modell: 'claude-opus-5-5', maxTokens: 3000, proTagUndPerson: 20, proTagGesamt: 60 },
};
/* ========================================================= */

const SESSION_DAYS = 400;
const PW_ITER = 20000;
const MAX_LOG = 400;
const MAX_SUBS = 200;
const enc = new TextEncoder(), dec = new TextDecoder();

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(req, env, ctx);
      const h = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors)) h.set(k, v);
      return new Response(res.body, { status: res.status, headers: h });
    } catch (e) {
      const status = e.status || 500;
      return new Response(JSON.stringify({ fehler: e.status ? e.message : 'Serverfehler: ' + (e.message || e) }), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
    }
  },
};

function corsHeaders(origin, env) {
  const extra = (env.EXTRA_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = CONFIG.origins.includes(origin) || extra.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : CONFIG.origins[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-GitHub-Api-Version',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
async function body(req) { try { return await req.json(); } catch { fail(400, 'Ungültige Anfrage'); } }

async function route(req, env, ctx) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const m = req.method;
  if (!env.DB) fail(500, 'KV-Speicher „DB“ ist nicht verbunden (Einstellungen → Bindungen).');

  if (p === '/' || p === '/info') return json(await info(env));
  if (p.startsWith('/gh/')) return proxy(req, env, url, ctx);

  if (p === '/konto/registrieren' && m === 'POST') return registrieren(req, env);
  if (p === '/konto/anmelden' && m === 'POST') return anmelden(req, env);
  if (p === '/konto/ich' && m === 'GET') { const u = await auth(req, env); return json(await ichAntwort(u, env)); }
  if (p === '/konto/passwort' && m === 'POST') return passwortAendern(req, env);

  if (p === '/admin/konten' && m === 'GET') return adminKonten(req, env);
  if (p === '/admin/konto' && m === 'POST') return adminKontoAendern(req, env);
  if (p === '/admin/konto-neu' && m === 'POST') return adminKontoNeu(req, env);
  if (p === '/admin/konto' && m === 'DELETE') return adminKontoLoeschen(req, env, url);
  if (p === '/admin/protokoll' && m === 'GET') return adminProtokoll(req, env, url);
  if (p === '/admin/datenpw' && m === 'POST') return adminDatenPw(req, env);
  if (p === '/admin/einstellungen' && m === 'POST') return adminEinstellungen(req, env);

  if (p === '/ki/erlegerliste' && m === 'POST') return kiErlegerliste(req, env, ctx);
  if (p === '/push/abo' && m === 'POST') return pushAbo(req, env);
  if (p === '/push/abmelden' && m === 'POST') return pushAbmelden(req, env);
  if (p === '/push/senden' && m === 'POST') return pushSendenRoute(req, env, ctx);
  if (p === '/push/test' && m === 'POST') return pushTest(req, env);
  fail(404, 'Unbekannte Adresse');
}

/* ===================== Speicher (KV) ===================== */
const kvGet = async (env, k, fb) => { const v = await env.DB.get(k, 'json'); return v ?? fb; };
const kvPut = (env, k, v) => env.DB.put(k, JSON.stringify(v));
const getUsers = env => kvGet(env, 'users', {});
const putUsers = (env, u) => kvPut(env, 'users', u);
const getSettings = env => kvGet(env, 'settings', { nurKonten: false });

async function info(env) {
  const [users, settings, vapid] = await Promise.all([getUsers(env), getSettings(env), getVapid(env)]);
  return {
    name: CONFIG.name,
    apps: Object.fromEntries(Object.entries(CONFIG.apps).map(([k, a]) => [k, { name: a.name, rechte: a.rechte }])),
    nurKonten: !!settings.nurKonten,
    ersterNutzer: !Object.keys(users).length,
    vapid: vapid.pub,
    ki: !!(env.ANTHROPIC_KEY && CONFIG.ki),
  };
}

/* ===================== Helfer: Kodierung ===================== */
const b64u = bytes => { let s = ''; const b = new Uint8Array(bytes); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const concat = (...arr) => { const out = new Uint8Array(arr.reduce((a, b) => a + b.length, 0)); let o = 0; for (const a of arr) { out.set(a, o); o += a.length; } return out; };
const normName = s => String(s || '').trim().replace(/\s+/g, ' ');
const nameKey = s => normName(s).toLowerCase();
function eq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i]; return r === 0; }

/* ===================== Passwörter & Sitzungen ===================== */
async function hashPw(pw, salt = rand(16), iter = PW_ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256));
  return { salt: b64u(salt), hash: b64u(bits), iter };
}
async function checkPw(pw, rec) {
  if (!rec?.pw) return false;
  const h = await hashPw(pw, unb64u(rec.pw.salt), rec.pw.iter);
  return eq(unb64u(h.hash), unb64u(rec.pw.hash));
}
async function hmacKey(env) {
  let s = await env.DB.get('cfg:secret');
  if (!s) { s = b64u(rand(32)); await env.DB.put('cfg:secret', s); }
  return crypto.subtle.importKey('raw', unb64u(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function makeToken(env, u) {
  const payload = b64u(enc.encode(JSON.stringify({ u: u.id, v: u.sv || 0, exp: Date.now() + SESSION_DAYS * 864e5 })));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(payload)));
  return `${payload}.${b64u(sig)}`;
}
/** Prüft die Sitzung; liefert das Konto (aktiv) – sonst Fehler 401/403 */
async function auth(req, env, { optional = false } = {}) {
  const h = req.headers.get('Authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!t) { if (optional) return null; fail(401, 'Nicht angemeldet'); }
  const [payload, sig] = t.split('.');
  let ok = false, data;
  try {
    ok = await crypto.subtle.verify('HMAC', await hmacKey(env), unb64u(sig || ''), enc.encode(payload || ''));
    data = JSON.parse(dec.decode(unb64u(payload)));
  } catch { ok = false; }
  if (!ok || !data || data.exp < Date.now()) { if (optional) return null; fail(401, 'Anmeldung abgelaufen – bitte neu anmelden'); }
  const users = await getUsers(env);
  const u = users[data.u];
  if (!u || (u.sv || 0) !== data.v) { if (optional) return null; fail(401, 'Anmeldung ungültig – bitte neu anmelden'); }
  if (u.status !== 'aktiv') { if (optional) return null; fail(403, u.status === 'wartend' ? 'Dein Konto wartet noch auf die Freigabe.' : 'Dein Konto ist gesperrt.'); }
  return u;
}
const appRolle = (u, app) => u.super ? 'admin' : (u.apps?.[app]?.rolle || 'ansehen');
const isAppAdmin = (u, app) => u.status === 'aktiv' && appRolle(u, app) === 'admin';
const hatZugang = (u, app) => u.status === 'aktiv' && appRolle(u, app) !== 'kein';
const hatRecht = (u, app, r) => isAppAdmin(u, app) || (hatZugang(u, app) && (u.apps?.[app]?.rechte || []).includes(r));
const isAnyAdmin = u => u.super || Object.keys(CONFIG.apps).some(a => isAppAdmin(u, a));

function publicUser(u) {
  return {
    id: u.id, name: u.name, status: u.status, super: !!u.super, erstellt: u.erstellt, zuletzt: u.zuletzt || null,
    apps: Object.fromEntries(Object.keys(CONFIG.apps).map(a => [a, { rolle: appRolle(u, a), rechte: u.apps?.[a]?.rechte || [] }])),
  };
}
async function ichAntwort(u, env) {
  const pws = await kvGet(env, 'datenpw', {});
  const pw = {}, fehlt = [];
  for (const a of Object.keys(CONFIG.apps)) {
    if (!hatZugang(u, a)) continue;
    if (pws[a]) pw[a] = pws[a]; else fehlt.push(a);
  }
  return { user: publicUser(u), pw, pwFehlt: fehlt };
}

/* ===================== Konto: registrieren / anmelden ===================== */
function checkNewPw(pw) { if (typeof pw !== 'string' || pw.length < 6) fail(400, 'Das Passwort braucht mindestens 6 Zeichen.'); if (pw.length > 200) fail(400, 'Passwort zu lang.'); }
function checkName(n) { if (n.length < 3 || n.length > 60) fail(400, 'Bitte Vor- und Nachnamen eintragen (3–60 Zeichen).'); }

async function registrieren(req, env) {
  const b = await body(req);
  const name = normName(b.name); checkName(name); checkNewPw(b.pw);
  const users = await getUsers(env);
  if (Object.values(users).some(u => nameKey(u.name) === nameKey(name))) fail(409, 'Diesen Namen gibt es schon. Bitte anmelden oder Sebastian fragen.');
  const pending = Object.values(users).filter(u => u.status === 'wartend').length;
  if (pending >= 30) fail(429, 'Zu viele offene Anfragen – bitte später erneut versuchen.');
  const first = !Object.keys(users).length;
  const u = { id: 'u' + b64u(rand(9)), name, pw: await hashPw(b.pw), status: first ? 'aktiv' : 'wartend', super: first, apps: {}, erstellt: new Date().toISOString(), sv: 0 };
  users[u.id] = u;
  await putUsers(env, users);
  await log(env, u, first ? 'Erstes Konto (Haupt-Admin) angelegt' : 'Konto beantragt', { app: '-' });
  if (first) return json({ token: await makeToken(env, u), ...(await ichAntwort(u, env)) });
  return json({ wartend: true, user: publicUser(u) });
}

async function anmelden(req, env) {
  const b = await body(req);
  const name = normName(b.name);
  const users = await getUsers(env);
  const u = Object.values(users).find(x => nameKey(x.name) === nameKey(name));
  if (!u) fail(401, 'Name oder Passwort falsch.');
  if (u.sperrBis && u.sperrBis > Date.now()) fail(429, 'Zu viele Fehlversuche – bitte in 15 Minuten erneut versuchen.');
  if (!(await checkPw(String(b.pw || ''), u))) {
    u.fehl = (u.fehl || 0) + 1;
    if (u.fehl >= 8) { u.sperrBis = Date.now() + 15 * 60e3; u.fehl = 0; }
    await putUsers(env, users);
    fail(401, 'Name oder Passwort falsch.');
  }
  if (u.status === 'wartend') fail(403, 'Dein Konto wartet noch auf die Freigabe durch Sebastian.');
  if (u.status !== 'aktiv') fail(403, 'Dein Konto ist gesperrt.');
  u.fehl = 0; delete u.sperrBis; u.zuletzt = new Date().toISOString();
  await putUsers(env, users);
  return json({ token: await makeToken(env, u), ...(await ichAntwort(u, env)) });
}

async function passwortAendern(req, env) {
  const u = await auth(req, env);
  const b = await body(req);
  if (!(await checkPw(String(b.alt || ''), u))) fail(400, 'Bisheriges Passwort stimmt nicht.');
  checkNewPw(b.neu);
  const users = await getUsers(env);
  const x = users[u.id];
  x.pw = await hashPw(b.neu); x.sv = (x.sv || 0) + 1;
  await putUsers(env, users);
  await log(env, u, 'Eigenes Passwort geändert', { app: '-' });
  return json({ token: await makeToken(env, x), ...(await ichAntwort(x, env)) });
}

/* ===================== Verwaltung ===================== */
async function adminAuth(req, env) {
  const u = await auth(req, env);
  if (!isAnyAdmin(u)) fail(403, 'Nur für Admins.');
  return u;
}
async function adminKonten(req, env) {
  await adminAuth(req, env);
  const users = await getUsers(env);
  const settings = await getSettings(env);
  const pws = await kvGet(env, 'datenpw', {});
  return json({
    konten: Object.values(users).map(publicUser).sort((a, b) => (a.status === 'wartend' ? 0 : 1) - (b.status === 'wartend' ? 0 : 1) || a.name.localeCompare(b.name, 'de')),
    einstellungen: settings,
    datenPw: Object.fromEntries(Object.keys(CONFIG.apps).map(a => [a, !!pws[a]])),
  });
}
/** Ändern: status, apps (nur Apps, in denen der Admin selbst Admin ist), neuesPw, name */
async function adminKontoAendern(req, env) {
  const me = await adminAuth(req, env);
  const b = await body(req);
  const users = await getUsers(env);
  const u = users[b.id]; if (!u) fail(404, 'Konto nicht gefunden.');
  if (u.super && !me.super) fail(403, 'Das Haupt-Admin-Konto kann nur der Haupt-Admin ändern.');
  const was = [];
  if (b.status && b.status !== u.status) {
    if (!['aktiv', 'gesperrt'].includes(b.status)) fail(400, 'Ungültiger Status.');
    if (u.super) fail(400, 'Das Haupt-Admin-Konto kann nicht gesperrt werden.');
    if (b.status === 'gesperrt' && !me.super) fail(403, 'Sperren darf nur der Haupt-Admin.');
    if (u.status === 'wartend' && b.status === 'aktiv') was.push('freigegeben');
    else was.push(b.status === 'aktiv' ? 'entsperrt' : 'gesperrt');
    u.status = b.status;
    if (b.status === 'gesperrt') u.sv = (u.sv || 0) + 1; // alle Sitzungen ungültig
  }
  if (b.apps && typeof b.apps === 'object') {
    for (const [a, v] of Object.entries(b.apps)) {
      if (!CONFIG.apps[a] || u.super) continue;
      if (!isAppAdmin(me, a)) fail(403, `Keine Admin-Rechte für ${CONFIG.apps[a].name}.`);
      const rolle = ['ansehen', 'admin', 'kein'].includes(v.rolle) ? v.rolle : 'ansehen';
      const rechte = (Array.isArray(v.rechte) ? v.rechte : []).filter(r => r in CONFIG.apps[a].rechte);
      const alt = JSON.stringify({ rolle: appRolle(u, a), rechte: u.apps?.[a]?.rechte || [] });
      u.apps ||= {}; u.apps[a] = { rolle, rechte };
      if (alt !== JSON.stringify({ rolle, rechte })) was.push(`${CONFIG.apps[a].name}: ${rolle}${rechte.length ? ' + ' + rechte.join(', ') : ''}`);
    }
  }
  if (b.neuesPw) { checkNewPw(b.neuesPw); u.pw = await hashPw(b.neuesPw); u.sv = (u.sv || 0) + 1; u.fehl = 0; delete u.sperrBis; was.push('Passwort neu gesetzt'); }
  if (b.name && normName(b.name) !== u.name) {
    const n = normName(b.name); checkName(n);
    if (Object.values(users).some(x => x.id !== u.id && nameKey(x.name) === nameKey(n))) fail(409, 'Diesen Namen gibt es schon.');
    was.push(`umbenannt (vorher ${u.name})`); u.name = n;
  }
  await putUsers(env, users);
  if (was.length) await log(env, me, `Konto ${u.name}: ${was.join('; ')}`, { app: '-' });
  return json({ ok: true, konto: publicUser(u) });
}
async function adminKontoNeu(req, env) {
  const me = await adminAuth(req, env);
  const b = await body(req);
  const name = normName(b.name); checkName(name); checkNewPw(b.pw);
  const users = await getUsers(env);
  if (Object.values(users).some(u => nameKey(u.name) === nameKey(name))) fail(409, 'Diesen Namen gibt es schon.');
  const u = { id: 'u' + b64u(rand(9)), name, pw: await hashPw(b.pw), status: 'aktiv', super: false, apps: {}, erstellt: new Date().toISOString(), sv: 0 };
  for (const [a, v] of Object.entries(b.apps || {})) {
    if (!CONFIG.apps[a] || !isAppAdmin(me, a)) continue;
    u.apps[a] = { rolle: ['ansehen', 'admin', 'kein'].includes(v.rolle) ? v.rolle : 'ansehen', rechte: (v.rechte || []).filter(r => r in CONFIG.apps[a].rechte) };
  }
  users[u.id] = u;
  await putUsers(env, users);
  await log(env, me, `Konto ${name} angelegt`, { app: '-' });
  return json({ ok: true, konto: publicUser(u) });
}
async function adminKontoLoeschen(req, env, url) {
  const me = await adminAuth(req, env);
  const users = await getUsers(env);
  const u = users[url.searchParams.get('id')]; if (!u) fail(404, 'Konto nicht gefunden.');
  if (u.super) fail(400, 'Das Haupt-Admin-Konto kann nicht gelöscht werden.');
  // Wartende Anfragen darf jeder Admin ablehnen, alles andere nur der Haupt-Admin
  if (!me.super && u.status !== 'wartend') fail(403, 'Löschen darf nur der Haupt-Admin.');
  delete users[u.id];
  await putUsers(env, users);
  await log(env, me, u.status === 'wartend' ? `Anfrage von ${u.name} abgelehnt` : `Konto ${u.name} gelöscht`, { app: '-' });
  return json({ ok: true });
}
async function adminProtokoll(req, env, url) {
  const me = await adminAuth(req, env);
  const n = Math.min(Number(url.searchParams.get('n')) || 150, MAX_LOG);
  const list = (await kvGet(env, 'log', [])).filter(e => me.super || e.app === '-' || isAppAdmin(me, e.app));
  return json({ eintraege: list.slice(0, n) });
}
async function adminDatenPw(req, env) {
  const me = await adminAuth(req, env);
  const b = await body(req);
  if (!CONFIG.apps[b.app]) fail(400, 'Unbekannte App.');
  if (!isAppAdmin(me, b.app)) fail(403, 'Keine Admin-Rechte für diese App.');
  if (typeof b.pw !== 'string' || b.pw.length < 6) fail(400, 'Passwort fehlt.');
  const pws = await kvGet(env, 'datenpw', {});
  if (pws[b.app] === b.pw) return json({ ok: true, unveraendert: true });
  pws[b.app] = b.pw;
  await kvPut(env, 'datenpw', pws);
  await log(env, me, `Daten-Passwort im Server hinterlegt`, { app: b.app });
  return json({ ok: true });
}
async function adminEinstellungen(req, env) {
  const me = await adminAuth(req, env);
  if (!me.super) fail(403, 'Nur der Haupt-Admin.');
  const b = await body(req);
  const s = await getSettings(env);
  if ('nurKonten' in b) s.nurKonten = !!b.nurKonten;
  await kvPut(env, 'settings', s);
  await log(env, me, `Einstellung: ${s.nurKonten ? 'nur noch mit Konto' : 'Passwort-Zugang erlaubt'}`, { app: '-' });
  return json({ ok: true, einstellungen: s });
}

/* ===================== Protokoll ===================== */
async function log(env, u, was, { app, pfad } = {}) {
  const list = await kvGet(env, 'log', []);
  list.unshift({ zeit: new Date().toISOString(), wer: u?.name || '?', app: app || '-', was, ...(pfad ? { pfad } : {}) });
  if (list.length > MAX_LOG) list.length = MAX_LOG;
  await kvPut(env, 'log', list);
}

/* ===================== GitHub-Weiterleitung ===================== */
/** Sucht App + Regel für repo/pfad */
function findeRegel(repo, pfad) {
  for (const [app, a] of Object.entries(CONFIG.apps)) {
    for (const r of a.regeln) {
      if (r.repo.toLowerCase() !== repo.toLowerCase()) continue;
      const hit = r.pfad === '' || (r.pfad.endsWith('/') ? pfad.startsWith(r.pfad) : pfad === r.pfad);
      if (hit) return { app, regel: r };
    }
  }
  return null;
}
async function proxy(req, env, url, ctx) {
  // /gh/repos/{owner}/{repo}/contents/{pfad}
  const mm = url.pathname.match(/^\/gh\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);
  if (!mm) fail(404, 'Nicht erlaubt');
  const owner = decodeURIComponent(mm[1]), repo = decodeURIComponent(mm[2]);
  const pfad = mm[3].split('/').map(decodeURIComponent).join('/');
  if (owner.toLowerCase() !== CONFIG.owner.toLowerCase() || pfad.includes('..')) fail(403, 'Nicht erlaubt');
  const treffer = findeRegel(repo, pfad);
  if (!treffer) fail(403, 'Dieser Bereich ist für Konten nicht freigegeben.');
  const { app, regel } = treffer;
  const u = await auth(req, env);
  if (!hatZugang(u, app)) fail(403, `Kein Zugang zu ${CONFIG.apps[app].name}.`);
  const m = req.method;
  let text = null, payload = null;
  if (m === 'PUT' || m === 'DELETE') {
    const darf = isAppAdmin(u, app)
      || (m === 'PUT' && regel.write === 'mitglied')
      || (m === 'PUT' && Array.isArray(regel.write) && regel.write.some(r => hatRecht(u, app, r)));
    if (!darf) fail(403, 'Dafür fehlt dir das Recht. Bitte Sebastian fragen.');
    text = await req.text();
    try { payload = JSON.parse(text); } catch { fail(400, 'Ungültige Anfrage'); }
    // Das Repo ist öffentlich: Commit-Text ohne Namen und Inhalte.
    // Der echte Text (wer, was) steht nur im geschützten Protokoll des Servers.
    payload._orig = String(payload.message || '');
    const neutral = m === 'DELETE' ? 'Datei entfernt (App)' : 'Daten aktualisiert (App)';
    text = JSON.stringify({ ...payload, message: neutral, _orig: undefined });
  } else if (m !== 'GET') fail(405, 'Nicht erlaubt');
  if (!env.GH_TOKEN) fail(500, 'GH_TOKEN fehlt im Server (Einstellungen → Variablen und Geheimnisse).');
  const api = (env.GH_API || 'https://api.github.com').replace(/\/$/, '');
  const target = `${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${pfad.split('/').map(encodeURIComponent).join('/')}${url.search}`;
  const h = {
    Accept: req.headers.get('Accept') || 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${env.GH_TOKEN}`,
    'User-Agent': 'jagd-thuine-konten',
  };
  if (text) h['Content-Type'] = 'application/json';
  const r = await fetch(target, { method: m, headers: h, body: text });
  if (r.ok && (m === 'PUT' || m === 'DELETE')) {
    const was = String(payload?._orig || (m === 'DELETE' ? 'Datei gelöscht' : 'Änderung')).slice(0, 200);
    ctx.waitUntil(log(env, u, was, { app, pfad }));
  }
  const out = new Headers();
  for (const k of ['Content-Type', 'ETag']) if (r.headers.get(k)) out.set(k, r.headers.get(k));
  out.set('Cache-Control', 'no-store');
  if (r.status === 401) return json({ fehler: 'GitHub-Token im Server ungültig oder abgelaufen – bitte Sebastian Bescheid geben.' }, 502);
  return new Response(r.body, { status: r.status, headers: out });
}

/* ===================== Foto-Auswertung (Claude) =====================
   Der Schlüssel bleibt im Server. Erlaubt ist nur: ein Foto + Auslese-Anweisung,
   festes Modell, begrenzte Antwortlänge, Tageslimit je Person und gesamt. */
async function kiErlegerliste(req, env, ctx) {
  const K = CONFIG.ki;
  if (!K || !env.ANTHROPIC_KEY) fail(501, 'Foto-Auswertung ist im Server nicht eingerichtet (ANTHROPIC_KEY fehlt).');
  const u = await auth(req, env);
  if (!isAppAdmin(u, K.app)) fail(403, 'Die Foto-Auswertung dürfen nur Admins nutzen.');
  const b = await body(req);
  const bild = String(b.bild || ''), text = String(b.text || '');
  if (!/^[A-Za-z0-9+/=]+$/.test(bild) || bild.length < 1000) fail(400, 'Kein gültiges Foto.');
  if (bild.length > 4_500_000) fail(413, 'Foto zu groß.');
  if (!text.startsWith('Du liest eine handschriftlich ausgefüllte "Erlegerliste"') || text.length > 15000) fail(400, 'Ungültige Anweisung.');
  // Tageslimits
  const tag = new Date().toISOString().slice(0, 10);
  const zaehler = await kvGet(env, `ki:${tag}`, {});
  if ((zaehler[u.id] || 0) >= K.proTagUndPerson) fail(429, `Tageslimit erreicht (${K.proTagUndPerson} Auswertungen pro Tag).`);
  const gesamt = Object.values(zaehler).reduce((a, n) => a + n, 0);
  if (gesamt >= K.proTagGesamt) fail(429, 'Tageslimit der Jagdgemeinschaft erreicht – bitte morgen erneut versuchen.');
  zaehler[u.id] = (zaehler[u.id] || 0) + 1;
  await env.DB.put(`ki:${tag}`, JSON.stringify(zaehler), { expirationTtl: 3 * 86400 });
  const api = (env.ANTHROPIC_API || 'https://api.anthropic.com').replace(/\/$/, '');
  const r = await fetch(`${api}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: K.modell, max_tokens: K.maxTokens,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: bild } },
        { type: 'text', text },
      ] }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  ctx.waitUntil(log(env, u, `Foto-Auswertung${r.ok ? '' : ' fehlgeschlagen'} (${zaehler[u.id]}/${K.proTagUndPerson} heute)`, { app: K.app }));
  if (!r.ok) fail(502, r.status === 401 ? 'Claude-Schlüssel im Server ungültig – bitte Sebastian Bescheid geben.' : `Claude-Fehler: ${j?.error?.message || r.status}`);
  return json({ text: (j.content || []).filter(c => c.type === 'text').map(c => c.text).join(''), heute: zaehler[u.id], limit: K.proTagUndPerson });
}

/* ===================== Push (Web Push mit VAPID) ===================== */
async function getVapid(env) {
  let v = await kvGet(env, 'cfg:vapid', null);
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    v = { priv: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)) };
    await kvPut(env, 'cfg:vapid', v);
  }
  return v;
}
const subKey = app => `push:${app}`;
async function pushAbo(req, env) {
  const b = await body(req);
  if (!CONFIG.apps[b.app]) fail(400, 'Unbekannte App.');
  const s = b.sub;
  if (!s?.endpoint || !(/^https:\/\//.test(s.endpoint) || env.TEST_HTTP_PUSH) || !s.keys?.p256dh || !s.keys?.auth) fail(400, 'Ungültiges Abo.');
  // Nur freigegebene Konten (die Nachrichten enthalten Namen)
  const u = await auth(req, env);
  if (!hatZugang(u, b.app)) fail(403, `Kein Zugang zu ${CONFIG.apps[b.app].name}.`);
  const subs = await kvGet(env, subKey(b.app), {});
  const id = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s.endpoint)))).slice(0, 22);
  subs[id] = { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, user: u.id, seit: subs[id]?.seit || new Date().toISOString() };
  const ids = Object.keys(subs);
  if (ids.length > MAX_SUBS) ids.sort((a, c) => subs[a].seit.localeCompare(subs[c].seit)).slice(0, ids.length - MAX_SUBS).forEach(k => delete subs[k]);
  await kvPut(env, subKey(b.app), subs);
  return json({ ok: true, anzahl: Object.keys(subs).length });
}
async function pushAbmelden(req, env) {
  const b = await body(req);
  if (!CONFIG.apps[b.app]) fail(400, 'Unbekannte App.');
  const subs = await kvGet(env, subKey(b.app), {});
  for (const [k, v] of Object.entries(subs)) if (v.endpoint === b.endpoint) delete subs[k];
  await kvPut(env, subKey(b.app), subs);
  return json({ ok: true });
}
async function pushSendenRoute(req, env, ctx) {
  const u = await auth(req, env);
  const b = await body(req);
  if (!CONFIG.apps[b.app]) fail(400, 'Unbekannte App.');
  if (!isAppAdmin(u, b.app)) fail(403, 'Nur Admins können Benachrichtigungen senden.');
  const msg = { title: String(b.title || CONFIG.apps[b.app].name).slice(0, 80), body: String(b.body || '').slice(0, 300), tag: String(b.tag || '').slice(0, 40), url: String(b.url || '').slice(0, 300) };
  const res = await sendeAnAlle(env, b.app, msg);
  ctx.waitUntil(log(env, u, `Benachrichtigung: ${msg.title} – ${msg.body}`.slice(0, 200), { app: b.app }));
  return json(res);
}
async function pushTest(req, env) {
  const b = await body(req);
  if (!CONFIG.apps[b.app]) fail(400, 'Unbekannte App.');
  const subs = await kvGet(env, subKey(b.app), {});
  const s = Object.values(subs).find(x => x.endpoint === b.endpoint);
  if (!s) fail(404, 'Dieses Gerät ist nicht angemeldet.');
  const st = await sendePush(env, s, { title: CONFIG.apps[b.app].name, body: 'Test – Benachrichtigungen funktionieren ✓', tag: 'test' });
  return json({ ok: st >= 200 && st < 300, status: st });
}
async function sendeAnAlle(env, app, msg) {
  const subs = await kvGet(env, subKey(app), {});
  const users = await getUsers(env);
  // nur Geräte von Konten, die (noch) Zugang haben
  for (const [k, v] of Object.entries(subs)) { const u = users[v.user]; if (!u || !hatZugang(u, app)) delete subs[k]; }
  const ids = Object.keys(subs).slice(0, 45); // Grenze kostenloser Plan: 50 Anfragen je Aufruf
  let ok = 0, weg = 0, fehler = 0;
  const results = await Promise.all(ids.map(id => sendePush(env, subs[id], msg).catch(() => 0)));
  results.forEach((st, i) => {
    if (st >= 200 && st < 300) ok++;
    else if (st === 404 || st === 410) { delete subs[ids[i]]; weg++; }
    else fehler++;
  });
  await kvPut(env, subKey(app), subs);
  return { ok, entfernt: weg, fehler, gesamt: Object.keys(subs).length };
}
async function vapidHeader(env, endpoint) {
  const v = await getVapid(env);
  const aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://grunzelthuine.github.io/' })));
  const key = await crypto.subtle.importKey('jwk', v.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${claims}`)));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${v.pub}`;
}
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}
/** Verschlüsselt die Nachricht nach RFC 8291 (aes128gcm) */
async function encryptPayload(sub, text) {
  const uaPub = unb64u(sub.keys.p256dh), authSecret = unb64u(sub.keys.auth);
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, kp.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = rand(16);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(enc.encode(text), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}
async function sendePush(env, sub, msg) {
  const payload = await encryptPayload(sub, JSON.stringify(msg));
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidHeader(env, sub.endpoint), TTL: '172800', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Urgency: 'normal' },
    body: payload,
  });
  return r.status;
}
