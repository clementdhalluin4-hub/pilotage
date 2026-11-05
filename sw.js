/* Garde le site disponible hors ligne ; les données passent toujours par le réseau. */
var CACHE = 'trinity-v8';
var SHELL = ['./', 'index.html', 'style.css?v=8', 'core.js?v=8', 'app.js?v=8', 'manifest.webmanifest', 'icon.svg', 'icon-192.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE && k !== 'trinity-cfg'; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(function (r) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); return r; })
    .catch(function () { return caches.match(e.request).then(function (r) { return r || caches.match('index.html'); }); }));
});

/* Notifications : la passerelle envoie un signal sans contenu ; TRINITY va chercher le texte à afficher.
   L'iPhone exige qu'une notification soit affichée à chaque signal : en cas d'échec, un rappel générique s'affiche. */
var ICONE = 'icon-192.png';
function cfg() {
  return caches.open('trinity-cfg').then(function (c) { return c.match('cfg'); }).then(function (r) { return r ? r.json() : {}; }).catch(function () { return {}; });
}
function dejaAffichees() {
  return self.registration.getNotifications().then(function (l) { return l.map(function (n) { return n.tag; }); }).catch(function () { return []; });
}
self.addEventListener('push', function (e) {
  e.waitUntil(cfg().then(function (c) {
    if (!c.url) throw new Error('cfg');
    return Promise.all([fetch(c.url + '?key=' + encodeURIComponent(c.key) + '&action=notifs').then(function (r) { return r.json(); }), dejaAffichees()]);
  }).then(function (res) {
    var data = res[0], shown = res[1];
    var list = (data.notifs || []).filter(function (n) { return shown.indexOf(n.id) === -1; });
    if (self.navigator.setAppBadge) self.navigator.setAppBadge(data.compte || list.length).catch(function () {});
    if (!list.length) list = (data.notifs || []).slice(0, 1);
    if (!list.length) throw new Error('vide');
    return Promise.all(list.slice(0, 3).map(function (n) {
      return self.registration.showNotification(n.titre, { body: n.corps, tag: n.id, icon: ICONE, badge: ICONE, data: { cible: n.cible, id: n.id } });
    }));
  }).catch(function () {
    return self.registration.showNotification('Rappel TRINITY', { body: 'Touche pour voir ton rappel.', tag: 'trinity-generique', icon: ICONE, data: { cible: 'aujourdhui' } });
  }));
});
self.addEventListener('notificationclick', function (e) {
  var cible = (e.notification.data && e.notification.data.cible) || 'aujourdhui';
  e.notification.close();
  e.waitUntil(caches.open('trinity-cfg').then(function (c) {
    // Copie de secours : si l'ouverture ne transmet pas la cible, TRINITY la lit ici en se rouvrant
    return c.put('clic', new Response(JSON.stringify({ cible: cible, t: Date.now() })));
  }).catch(function () {}).then(function () {
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  }).then(function (wins) {
    var w = wins[0];
    if (w) {
      w.postMessage({ type: 'notif', cible: cible });
      return w.focus ? w.focus() : null;
    }
    return self.clients.openWindow('./?n=' + encodeURIComponent(cible) + '#aujourdhui');
  }));
});
