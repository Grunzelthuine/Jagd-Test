/* Einstellungen dieser Installation – TEST-Umgebung (Repo Jagd-Test).
   api: Adresse des Konten-Servers (Cloudflare Worker). Leer = ohne Konten (wie bisher). */
self.JAGD_CFG = {
  app: 'hochsitze',
  api: '',
  test: true,
  lsPrefix: 'test.',          // eigener Gerätespeicher – getrennt von der echten App
  owner: 'Grunzelthuine',
  repo: 'Jagd-Test',
  base: 'hochsitze/',
};
