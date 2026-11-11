/* Einstellungen dieser Installation – TEST-Umgebung (Repo Jagd-Test).
   api: Adresse des Konten-Servers (Cloudflare Worker). Leer = ohne Konten (wie bisher). */
self.JAGD_CFG = {
  app: 'thuine',
  api: 'https://jagd-test.sebastian-bruns.workers.dev',
  push: true,
  test: true,
  lsPrefix: 'test.',          // eigener Gerätespeicher – getrennt von der echten App
  owner: 'Grunzelthuine',
  repo: 'Jagd-Test',
  base: 'thuine/',
  repo2: 'Jagd-Test',
  schalenPath: 'thuine/data/schalenwild.json',
  meldRepo: 'Jagd-Test',
  meldPath: 'thuine/data/meldungen.json',
  ntfy: false,                // keine ntfy-Nachrichten aus der Test-App
};
