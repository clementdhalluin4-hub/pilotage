/**
 * TRINITY — notifications, cloche et dictée Siri.
 * Fichier à ajouter à côté de Code.gs dans Apps Script (bouton + > Script, nom : Notifications).
 *
 * Principe : la passerelle envoie à l'iPhone un signal sans contenu (« réveille-toi »).
 * TRINITY se réveille, demande ici ce qu'il doit afficher (action=notifs) et affiche la notification.
 * Aucun chiffrement de contenu n'est donc nécessaire ; seule la signature VAPID (P-256) est calculée,
 * une fois toutes les 12 heures environ.
 *
 * Installation : exécuter installerNotifications() une fois, puis redéployer une nouvelle version.
 */

var NOTIF_TZ = 'Europe/Paris';
var NOTIF_SUJET = 'https://clementdhalluin4-hub.github.io/pilotage/';
var ENT_COURT = { 'ETS MAURAGE': 'ETS', 'LRB': 'LRB', '1001 Fenêtres': '1001 Fenêtres', '1001 Travaux': '1001 Travaux', 'Fili Floc': 'Fili Floc', 'Master': 'Master', 'Perso': 'Perso', 'Sport': 'Sport', 'Social': 'Social' };

/* Installation */

function installerNotifications() {
  setup();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('VAPID_PRIVEE')) {
    var kp = p256GenererCles_();
    props.setProperty('VAPID_PRIVEE', kp.privee);
    props.setProperty('VAPID_PUBLIQUE', kp.publique);
  }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'veilleNotifications') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('veilleNotifications').timeBased().everyMinutes(1).create();
  majCloches_();
  var test = verifierSignature();
  Logger.log('Notifications installées. Vérification de la signature : ' + (test ? 'OK' : 'ÉCHEC'));
}

/* Contrôle : signe un message et vérifie la signature avec la clé publique */
function verifierSignature() {
  var props = PropertiesService.getScriptProperties();
  var d = b64uDecode_(props.getProperty('VAPID_PRIVEE'));
  var pub = b64uDecode_(props.getProperty('VAPID_PUBLIQUE'));
  var msg = asciiBytes_('TRINITY ' + new Date().toISOString());
  var sig = p256Signer_(d, msg);
  return p256Verifier_(pub, msg, sig);
}

/* Veille : déclencheur chaque minute. Ne lit le Sheets que s'il y a quelque chose à envoyer. */

function veilleNotifications() {
  var props = PropertiesService.getScriptProperties();
  var now = new Date();
  var jour = Utilities.formatDate(now, NOTIF_TZ, 'yyyy-MM-dd');
  var hm = Utilities.formatDate(now, NOTIF_TZ, 'HH:mm');
  var nowMin = toMin_(hm);
  var aEnvoyer = [];

  var envoyes = JSON.parse(props.getProperty('ENVOYES') || '{}');
  var cloches = JSON.parse(props.getProperty('CLOCHES') || '[]');
  cloches.forEach(function (c) {
    var m = toMin_(c.debut);
    var cle = c.id + '|' + c.jour + '|' + c.debut;
    if (c.jour !== jour || m === null || envoyes[cle]) return;
    // À l'heure, avec une minute d'avance au plus ; rattrapage jusqu'à 15 min si le déclencheur a pris du retard
    if (m <= nowMin + 1 && m >= nowMin - 15) {
      envoyes[cle] = jour;
      aEnvoyer.push({ type: 'cloche', cible: 'tache:' + c.id, titre: '▲ ' + c.titre + ' · ' + (ENT_COURT[c.entite] || c.entite),
        corps: c.debut + ' → ' + c.fin + '. C\'est l\'heure, touche pour lancer le chrono.' });
    }
  });

  // Une fois par heure : index des cloches reconstruit et nouvelles questions de la revue du vendredi
  var maj = +(props.getProperty('CLOCHES_MAJ') || 0);
  if (Date.now() - maj > 3600 * 1000) {
    majCloches_();
    if (nowMin >= 8 * 60 && nowMin <= 21 * 60 + 30) aEnvoyer = aEnvoyer.concat(questionsRegles_(props));
  }

  Object.keys(envoyes).forEach(function (k) { if (envoyes[k] < addDays_(jour, -2)) delete envoyes[k]; });
  props.setProperty('ENVOYES', JSON.stringify(envoyes));
  if (aEnvoyer.length) {
    var lock = LockService.getScriptLock();
    if (lock.tryLock(15000)) { try { creerEtEnvoyer_(aEnvoyer); } finally { lock.releaseLock(); } }
  }
}

/* Index des tâches dont la cloche est activée (aujourd'hui et à venir) */
function majCloches_() {
  var jour = Utilities.formatDate(new Date(), NOTIF_TZ, 'yyyy-MM-dd');
  var list = readSheet_('Taches').filter(function (t) {
    return clocheOn_(t.cloche) && (t.statut === 'À faire' || t.statut === 'En cours') && t.jour && t.debut && t.jour >= jour;
  }).map(function (t) {
    var a = toMin_(t.debut), dur = +t.duree_min || 30;
    return { id: String(t.id), jour: t.jour, debut: t.debut, fin: fromMin_(a + dur), titre: String(t.titre), entite: String(t.entite || '') };
  });
  var props = PropertiesService.getScriptProperties();
  props.setProperty('CLOCHES', JSON.stringify(list));
  props.setProperty('CLOCHES_MAJ', String(Date.now()));
}

function clocheOn_(v) { return v === true || String(v) === '1' || String(v).toLowerCase() === 'true'; }

/* Règles proposées par Claude (revue du vendredi) : une notification par nouvelle question */
function questionsRegles_(props) {
  var deja = JSON.parse(props.getProperty('REGLES_NOTIFIEES') || '[]');
  var out = [];
  readSheet_('Regles').forEach(function (r) {
    if (r.statut !== 'proposee' || deja.indexOf(String(r.id)) !== -1) return;
    deja.push(String(r.id));
    var txt = String(r.texte || '');
    if (txt.length > 150) txt = txt.slice(0, 147) + '…';
    out.push({ type: 'regle', cible: 'regle:' + r.id, titre: 'Une question rapide', corps: txt + ' Réponds en un appui.' });
  });
  props.setProperty('REGLES_NOTIFIEES', JSON.stringify(deja.slice(-200)));
  return out;
}

function creerEtEnvoyer_(items) {
  var maintenant = Utilities.formatDate(new Date(), NOTIF_TZ, "yyyy-MM-dd'T'HH:mm:ss");
  var rows = items.map(function (it) {
    return { id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type: it.type, cible: it.cible,
      titre: it.titre, corps: it.corps, cree_le: maintenant, envoye_le: maintenant, vue_le: '', resultat: '' };
  });
  append_('Notifications', rows);
  SpreadsheetApp.flush(); // la ligne doit être lisible avant que l'iPhone ne vienne la chercher
  return envoyerATous_();
}

/* Envoi du signal à chaque appareil abonné ; les abonnements expirés sont retirés */
function envoyerATous_() {
  var subs = readSheet_('Abonnements');
  var res = [];
  var morts = [];
  subs.forEach(function (s) {
    var code = envoyerSignal_(String(s.endpoint));
    res.push(code);
    if (code === 404 || code === 410) morts.push(String(s.endpoint));
  });
  if (morts.length) supprimerAbonnements_(morts);
  return { appareils: subs.length, codes: res };
}

function envoyerSignal_(endpoint) {
  var m = endpoint.match(/^https:\/\/[^\/]+/);
  if (!m) return 0;
  var jwt = jetonVapid_(m[0]);
  var pub = PropertiesService.getScriptProperties().getProperty('VAPID_PUBLIQUE');
  var r = UrlFetchApp.fetch(endpoint, {
    method: 'post', muteHttpExceptions: true, payload: '',
    headers: { TTL: '3600', Urgency: 'high', Authorization: 'vapid t=' + jwt + ', k=' + pub }
  });
  var code = r.getResponseCode();
  if (code === 403) PropertiesService.getScriptProperties().deleteProperty('JWT_' + m[0]); // jeton refusé : recalculé au prochain envoi
  if (code >= 300) Logger.log('Envoi ' + code + ' : ' + r.getContentText().slice(0, 300));
  return code;
}

/* Jeton VAPID : signé une fois, réutilisé environ 12 h pour le même service (Apple, Google…) */
function jetonVapid_(aud) {
  var props = PropertiesService.getScriptProperties();
  var cached = props.getProperty('JWT_' + aud);
  if (cached) {
    var c = JSON.parse(cached);
    if (c.exp - 3600 > Date.now() / 1000) return c.jwt;
  }
  var exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  var head = b64uEncode_(asciiBytes_(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  var body = b64uEncode_(asciiBytes_(JSON.stringify({ aud: aud, exp: exp, sub: NOTIF_SUJET })));
  var sig = p256Signer_(b64uDecode_(props.getProperty('VAPID_PRIVEE')), asciiBytes_(head + '.' + body));
  var jwt = head + '.' + body + '.' + b64uEncode_(sig);
  props.setProperty('JWT_' + aud, JSON.stringify({ jwt: jwt, exp: exp }));
  return jwt;
}

/* Points d'entrée appelés depuis doGet et doPost (Code.gs) */

function notifGet_(p) {
  if (p.action === 'vapid') return { ok: true, cle_publique: PropertiesService.getScriptProperties().getProperty('VAPID_PUBLIQUE') || '' };
  if (p.action === 'notifs') {
    var limite = Utilities.formatDate(new Date(Date.now() - 24 * 3600 * 1000), NOTIF_TZ, "yyyy-MM-dd'T'HH:mm:ss");
    var list = readSheet_('Notifications').filter(function (n) { return !n.vue_le && String(n.cree_le) >= limite; })
      .sort(function (a, b) { return String(b.cree_le) < String(a.cree_le) ? -1 : 1; });
    return { ok: true, notifs: list.slice(0, 8), compte: list.length };
  }
  if (p.action === 'dictee') return dictee_(p.texte);
  return null;
}

function notifOp_(op) {
  var d = op.data || {};
  if (op.type === 'abonnement') {
    var now = Utilities.formatDate(new Date(), NOTIF_TZ, "yyyy-MM-dd'T'HH:mm:ss");
    var exist = readSheet_('Abonnements').some(function (s) { return String(s.endpoint) === String(d.endpoint); });
    upsert_('Abonnements', 'endpoint', exist ? { endpoint: d.endpoint, appareil: d.appareil || '', maj_le: now }
      : { endpoint: d.endpoint, appareil: d.appareil || '', cree_le: now, maj_le: now });
    return true;
  }
  if (op.type === 'desabonnement') { supprimerAbonnements_([String(d.endpoint)]); return true; }
  if (op.type === 'notif_vue') { upsert_('Notifications', 'id', { id: d.id, vue_le: d.vue_le || Utilities.formatDate(new Date(), NOTIF_TZ, "yyyy-MM-dd'T'HH:mm:ss") }); return true; }
  if (op.type === 'test_notif') {
    var r = creerEtEnvoyer_([{ type: 'test', cible: 'aujourdhui', titre: '▲ Test TRINITY', corps: 'Les notifications fonctionnent. Touche pour ouvrir TRINITY.' }]);
    op.resultat = r;
    return true;
  }
  if (op.type === 'dictee') { dictee_(d.texte, true); return true; }
  return false;
}

function supprimerAbonnements_(endpoints) {
  var sh = ss_().getSheetByName('Abonnements');
  var data = sh.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) if (endpoints.indexOf(String(data[i][0])) !== -1) sh.deleteRow(i + 1);
}

/* Dictée Siri : la phrase brute devient une tâche « à trier », découpée par TRINITY à la prochaine ouverture */
function dictee_(texte, dejaVerrouille) {
  texte = String(texte || '').trim();
  if (!texte) return { ok: false, message: 'Je n\'ai rien entendu.' };
  var now = Utilities.formatDate(new Date(), NOTIF_TZ, "yyyy-MM-dd'T'HH:mm:ss");
  var lock = dejaVerrouille ? null : LockService.getScriptLock();
  if (lock) lock.waitLock(20000);
  try {
    upsert_('Taches', 'id', { id: 's' + Date.now().toString(36), titre: texte, statut: 'À faire', prio: 2, entite: 'ETS MAURAGE', type: 'Fond',
      duree_min: 30, echeance: '', jour: '', debut: '', ordre: '', contexte: '', origine: 'Siri à trier', cree_le: now, maj_le: now });
  } finally { if (lock) lock.releaseLock(); }
  return { ok: true, message: 'Ajouté à TRINITY : ' + texte };
}

/* Outils */

function toMin_(hm) { var m = String(hm || '').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; }
function fromMin_(m) { m = Math.max(0, Math.min(m, 23 * 60 + 59)); return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2); }
function addDays_(ymd, n) {
  var p = ymd.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return d.toISOString().slice(0, 10);
}
function asciiBytes_(s) { var out = []; for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 255); return out; }
function signed_(bytes) { return bytes.map(function (b) { return b > 127 ? b - 256 : b; }); }
function unsigned_(bytes) { return bytes.map(function (b) { return b & 255; }); }
function b64uEncode_(bytes) { return Utilities.base64EncodeWebSafe(signed_(bytes)).replace(/=+$/, ''); }
function b64uDecode_(s) { s = String(s); while (s.length % 4) s += '='; return unsigned_(Utilities.base64DecodeWebSafe(s)); }
function sha256_(bytes) { return unsigned_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, signed_(bytes))); }
function hmac256_(key, data) { return unsigned_(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, signed_(data), signed_(key))); }

/* Courbe P-256 (ECDSA, signature ES256) en JavaScript pur */

var P256 = {
  p: BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff'),
  n: BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'),
  b: BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b'),
  gx: BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
  gy: BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')
};

function mod_(a, m) { var r = a % m; return r < BigInt(0) ? r + m : r; }
function powMod_(b, e, m) {
  var r = BigInt(1); b = mod_(b, m);
  while (e > BigInt(0)) { if (e & BigInt(1)) r = r * b % m; b = b * b % m; e >>= BigInt(1); }
  return r;
}
function inv_(a, m) { return powMod_(mod_(a, m), m - BigInt(2), m); }

/* Points en coordonnées jacobiennes [X, Y, Z] ; Z = 0 pour le point à l'infini */
function jDouble_(P) {
  var p = P256.p, X = P[0], Y = P[1], Z = P[2];
  if (Y === BigInt(0) || Z === BigInt(0)) return [BigInt(0), BigInt(1), BigInt(0)];
  var YY = Y * Y % p, S = BigInt(4) * X * YY % p, ZZ = Z * Z % p;
  var M = BigInt(3) * (X - ZZ) * (X + ZZ) % p;
  var X3 = mod_(M * M - BigInt(2) * S, p);
  var Y3 = mod_(M * (S - X3) - BigInt(8) * YY * YY, p);
  var Z3 = mod_(BigInt(2) * Y * Z, p);
  return [X3, Y3, Z3];
}
function jAdd_(P, Q) {
  var p = P256.p;
  if (P[2] === BigInt(0)) return Q;
  if (Q[2] === BigInt(0)) return P;
  var Z1Z1 = P[2] * P[2] % p, Z2Z2 = Q[2] * Q[2] % p;
  var U1 = P[0] * Z2Z2 % p, U2 = Q[0] * Z1Z1 % p;
  var S1 = P[1] * Q[2] % p * Z2Z2 % p, S2 = Q[1] * P[2] % p * Z1Z1 % p;
  if (U1 === U2) return S1 === S2 ? jDouble_(P) : [BigInt(0), BigInt(1), BigInt(0)];
  var H = mod_(U2 - U1, p), R = mod_(S2 - S1, p);
  var HH = H * H % p, HHH = H * HH % p, V = U1 * HH % p;
  var X3 = mod_(R * R - HHH - BigInt(2) * V, p);
  var Y3 = mod_(R * (V - X3) - S1 * HHH, p);
  var Z3 = H * P[2] % p * Q[2] % p;
  return [X3, Y3, Z3];
}
function jMul_(k, P) {
  var R = [BigInt(0), BigInt(1), BigInt(0)], A = P;
  while (k > BigInt(0)) { if (k & BigInt(1)) R = jAdd_(R, A); A = jDouble_(A); k >>= BigInt(1); }
  return R;
}
function toAffine_(P) {
  var p = P256.p, zi = inv_(P[2], p), zi2 = zi * zi % p;
  return [P[0] * zi2 % p, P[1] * zi2 % p * zi % p];
}
function G_() { return [P256.gx, P256.gy, BigInt(1)]; }

function bytesToInt_(b) { var x = BigInt(0); for (var i = 0; i < b.length; i++) x = (x << BigInt(8)) + BigInt(b[i]); return x; }
function intToBytes_(x, len) { var out = new Array(len); for (var i = len - 1; i >= 0; i--) { out[i] = Number(x & BigInt(255)); x >>= BigInt(8); } return out; }

function p256GenererCles_() {
  var seed = [];
  for (var i = 0; i < 8; i++) seed = seed.concat(asciiBytes_(Utilities.getUuid() + Date.now() + Math.random()));
  var d = mod_(bytesToInt_(sha256_(seed)), P256.n - BigInt(1)) + BigInt(1);
  var Q = toAffine_(jMul_(d, G_()));
  return { privee: b64uEncode_(intToBytes_(d, 32)), publique: b64uEncode_([4].concat(intToBytes_(Q[0], 32), intToBytes_(Q[1], 32))) };
}

/* k déterministe (RFC 6979) : aucune dépendance au hasard au moment de signer */
function rfc6979k_(dBytes, hBytes) {
  var n = P256.n;
  var h1 = intToBytes_(mod_(bytesToInt_(hBytes), n), 32);
  var V = [], K = [];
  for (var i = 0; i < 32; i++) { V.push(1); K.push(0); }
  K = hmac256_(K, V.concat([0], dBytes, h1)); V = hmac256_(K, V);
  K = hmac256_(K, V.concat([1], dBytes, h1)); V = hmac256_(K, V);
  for (;;) {
    V = hmac256_(K, V);
    var k = bytesToInt_(V);
    if (k > BigInt(0) && k < n) return k;
    K = hmac256_(K, V.concat([0])); V = hmac256_(K, V);
  }
}

function p256Signer_(dBytes, msgBytes) {
  var n = P256.n, d = bytesToInt_(dBytes), h = sha256_(msgBytes), e = bytesToInt_(h);
  var k = rfc6979k_(dBytes, h);
  var R = toAffine_(jMul_(k, G_()));
  var r = mod_(R[0], n);
  var s = mod_(inv_(k, n) * (e + r * d), n);
  return intToBytes_(r, 32).concat(intToBytes_(s, 32));
}

function p256Verifier_(pubBytes, msgBytes, sig) {
  var n = P256.n, r = bytesToInt_(sig.slice(0, 32)), s = bytesToInt_(sig.slice(32));
  if (r <= BigInt(0) || r >= n || s <= BigInt(0) || s >= n) return false;
  var Q = [bytesToInt_(pubBytes.slice(1, 33)), bytesToInt_(pubBytes.slice(33, 65)), BigInt(1)];
  var e = bytesToInt_(sha256_(msgBytes)), w = inv_(s, n);
  var X = jAdd_(jMul_(mod_(e * w, n), G_()), jMul_(mod_(r * w, n), Q));
  if (X[2] === BigInt(0)) return false;
  return mod_(toAffine_(X)[0], n) === r;
}
