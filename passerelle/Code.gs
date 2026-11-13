/**
 * Passerelle du Poste de pilotage.
 * À coller dans le Google Sheets « Poste de pilotage — base » : Extensions > Apps Script.
 * 1. Exécuter la fonction setup() une fois (autoriser l'accès), puis lire la clé dans le journal d'exécution.
 * 2. Déployer > Nouveau déploiement > Application Web : exécuter en tant que « Moi », accès « Tout le monde ».
 * 3. Coller l'URL du déploiement et la clé dans les réglages du site.
 * Notifications : voir le fichier Notifications (exécuter installerNotifications() une fois).
 */

var COLUMNS = {
  Taches: ['id', 'titre', 'statut', 'prio', 'entite', 'type', 'duree_min', 'echeance', 'jour', 'debut', 'ordre',
           'contexte', 'origine', 'cree_le', 'maj_le', 'fait_le', 'duree_reelle_min', 'notion_url', 'suite_de', 'etape', 'cloche'],
  Journal: ['horodatage', 'tache_id', 'action', 'jour', 'debut', 'duree_prevue', 'duree_reelle', 'type', 'entite', 'prio', 'detail'],
  Regles: ['id', 'texte', 'categorie', 'cle', 'valeur', 'preuve', 'statut', 'source', 'cree_le', 'decide_le'],
  Plan: ['id', 'jour', 'tache_id', 'debut', 'duree_min', 'raison', 'statut', 'auteur', 'cree_le', 'regle'],
  Humeur: ['jour', 'note', 'pourquoi', 'horodatage'],
  Parametres: ['cle', 'valeur', 'note'],
  Notifications: ['id', 'type', 'cible', 'titre', 'corps', 'cree_le', 'envoye_le', 'vue_le', 'resultat'],
  Abonnements: ['endpoint', 'appareil', 'cree_le', 'maj_le', 'echecs'],
  // TRINITY 2.0 : vie personnelle
  Sante: ['jour', 'pas', 'sommeil_min', 'coucher', 'lever', 'source', 'maj_le'],
  Vie: ['id', 'jour', 'type', 'valeur', 'lieu', 'prix', 'note', 'horodatage'],
  Creneaux: ['id', 'titre', 'categorie', 'jour_debut', 'jour_fin', 'debut', 'fin', 'note', 'commentaire', 'statut', 'cree_le', 'maj_le'],
  Objectifs: ['id', 'titre', 'horizon', 'branche', 'mesure', 'unite', 'cible', 'sens', 'echeance', 'statut', 'cree_le', 'maj_le'],
  Mesures: ['id', 'objectif_id', 'mois', 'valeur', 'preuve', 'horodatage'],
  Competences: ['id', 'nom', 'branche', 'niveaux', 'niveau', 'preuve', 'evalue_le', 'statut', 'cree_le', 'maj_le']
};
var VERSION = 2;
var EXTRA = { sante: ['Sante', 'jour'], vie: ['Vie', 'id'], creneau: ['Creneaux', 'id'], objectif: ['Objectifs', 'id'], mesure: ['Mesures', 'id'], competence: ['Competences', 'id'] };

var DEFAULT_PARAMS = [
  ['journee_debut', '09:00', 'Début de la journée de travail'],
  ['journee_fin', '19:00', 'Fin de la journée de travail'],
  ['capacite_travail_min', '300', 'Tâches par journée de travail (5 h)'],
  ['capacite_cours_min', '60', 'Tâches un jour de cours (1 h)'],
  ['marge', '0.3', 'Marge ajoutée aux durées tant que le coefficient appris manque'],
  ['midi_debut', '12:00', 'Pause du midi, protégée'],
  ['midi_fin', '13:30', ''],
  ['master_h_semaine', '7', 'Hors temps de travail'],
  ['projets_h_semaine', '2', 'Hors temps de travail'],
  ['mot_cours', 'Cours', 'Mot qui identifie un cours dans l\'agenda'],
  ['agenda_id', '', 'Vide = agenda principal'],
  ['outlook_ics', '', 'Lien ICS publié de l\'agenda Outlook (facultatif)'],
  ['ecole_ics', '', 'Lien iCalendar de l\'emploi du temps de l\'université (ADE)'],
  ['mots_prioritaires', 'JSM', 'Mots qui signalent une demande prioritaire, séparés par des virgules']
];

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function setup() {
  var ss = ss_();
  ss.setSpreadsheetTimeZone('Europe/Paris');
  Object.keys(COLUMNS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var head = COLUMNS[name];
    var current = sh.getRange(1, 1, 1, head.length).getValues()[0];
    if (current.join('|') !== head.join('|')) sh.getRange(1, 1, 1, head.length).setValues([head]);
    sh.setFrozenRows(1);
  });
  var p = ss.getSheetByName('Parametres');
  var existing = readSheet_('Parametres').map(function (r) { return r.cle; });
  DEFAULT_PARAMS.forEach(function (row) {
    if (existing.indexOf(row[0]) === -1) p.appendRow(row);
  });
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('KEY')) props.setProperty('KEY', Utilities.getUuid().replace(/-/g, ''));
  Logger.log('Clé du site : ' + props.getProperty('KEY'));
}

/* Lecture et écriture des onglets */

function readSheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) return [];
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0];
  var tz = ss_().getSpreadsheetTimeZone();
  return values.slice(1).filter(function (r) { return r.join('') !== ''; }).map(function (r) {
    var o = {};
    head.forEach(function (h, i) {
      var v = r[i];
      if (v instanceof Date) {
        // Les cellules jour et échéance sont des dates, debut est une heure.
        if (h === 'debut' || h === 'fin' || h === 'coucher' || h === 'lever') v = Utilities.formatDate(v, tz, 'HH:mm');
        else if (h === 'jour' || h === 'echeance' || h === 'jour_debut' || h === 'jour_fin') v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
        else v = Utilities.formatDate(v, tz, "yyyy-MM-dd'T'HH:mm:ss");
      }
      o[h] = v;
    });
    return o;
  });
}

/* Un onglet manquant (setup() pas encore relancé) est créé à la première écriture */
function onglet_(name) {
  var sh = ss_().getSheetByName(name);
  if (sh) return sh;
  sh = ss_().insertSheet(name);
  sh.getRange(1, 1, 1, COLUMNS[name].length).setValues([COLUMNS[name]]);
  sh.setFrozenRows(1);
  return sh;
}

function upsert_(name, keyField, obj) {
  var sh = onglet_(name);
  var head = COLUMNS[name];
  if (sh.getLastColumn() < head.length) sh.getRange(1, 1, 1, head.length).setValues([head]); // nouvelle colonne ajoutée
  var data = sh.getDataRange().getValues();
  var keyIdx = head.indexOf(keyField);
  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][keyIdx]) === String(obj[keyField])) { rowIdx = i + 1; break; }
  }
  var base = rowIdx > 0 ? data[rowIdx - 1] : head.map(function () { return ''; });
  var row = head.map(function (h, i) {
    if (Object.prototype.hasOwnProperty.call(obj, h)) return obj[h] === null || obj[h] === undefined ? '' : obj[h];
    return base[i] === undefined ? '' : base[i];
  });
  // Texte brut pour les dates et heures : évite les conversions automatiques de Sheets.
  if (rowIdx > 0) sh.getRange(rowIdx, 1, 1, head.length).setNumberFormat('@').setValues([row]);
  else {
    sh.appendRow(row);
    sh.getRange(sh.getLastRow(), 1, 1, head.length).setNumberFormat('@').setValues([row]);
  }
}

function append_(name, objs) {
  if (!objs.length) return;
  var sh = onglet_(name);
  var head = COLUMNS[name];
  var rows = objs.map(function (o) { return head.map(function (h) { return o[h] === undefined || o[h] === null ? '' : o[h]; }); });
  var start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, head.length).setNumberFormat('@').setValues(rows);
}

/* Agenda */

function events_(from, to, params) {
  var out = [];
  var start = new Date(from + 'T00:00:00');
  var end = new Date(to + 'T23:59:59');
  try {
    var cal = params.agenda_id ? CalendarApp.getCalendarById(params.agenda_id) : CalendarApp.getDefaultCalendar();
    cal.getEvents(start, end).forEach(function (ev) {
      out.push({
        id: ev.getId(), titre: ev.getTitle(), debut: ev.getStartTime().toISOString(), fin: ev.getEndTime().toISOString(),
        journee: ev.isAllDayEvent(), source: 'google'
      });
    });
  } catch (err) {
    out.push({ erreur: 'Google Agenda : ' + err.message });
  }
  if (params.outlook_ics) {
    try { out = out.concat(ics_(params.outlook_ics, start, end)); }
    catch (err2) { out.push({ erreur: 'Agenda Outlook : ' + err2.message }); }
  }
  if (params.ecole_ics) {
    try { out = out.concat(ics_(params.ecole_ics, start, end, 'ecole')); }
    catch (err3) { out.push({ erreur: 'Emploi du temps de l\'université : ' + err3.message }); }
  }
  return out;
}

function ics_(url, start, end, source) {
  source = source || 'outlook';
  var cache = CacheService.getScriptCache();
  var cacheKey = 'ics_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, url));
  var text = cache.get(cacheKey);
  if (!text) {
    text = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();
    if (text.length < 95000) cache.put(cacheKey, text, 900);
  }
  var lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  var res = [], cur = null;
  lines.forEach(function (l) {
    if (l === 'BEGIN:VEVENT') cur = {};
    else if (l === 'END:VEVENT' && cur) {
      if (cur.debut && cur.debut <= end && (cur.fin || cur.debut) >= start) {
        var ev = { id: cur.uid, titre: cur.titre || (source === 'ecole' ? 'Cours' : 'Rendez-vous'), debut: cur.debut.toISOString(),
                   fin: (cur.fin || cur.debut).toISOString(), journee: !!cur.journee, source: source };
        if (source === 'ecole') {
          var info = adeInfo_(cur.description || '');
          ev.salle = cur.lieu || ''; ev.prof = info.prof; ev.groupe = info.groupe;
        }
        res.push(ev);
      }
      cur = null;
    } else if (cur) {
      var m = l.match(/^([A-Z-]+)([^:]*):(.*)$/);
      if (!m) return;
      if (m[1] === 'SUMMARY') cur.titre = icsText_(m[3]);
      if (m[1] === 'UID') cur.uid = m[3];
      if (m[1] === 'LOCATION') cur.lieu = icsText_(m[3]);
      if (m[1] === 'DESCRIPTION') cur.description = icsText_(m[3]);
      if (m[1] === 'DTSTART' || m[1] === 'DTEND') {
        var d = icsDate_(m[3], m[2]);
        if (m[1] === 'DTSTART') { cur.debut = d; cur.journee = /VALUE=DATE(;|$)/.test(m[2]); } else cur.fin = d;
      }
    }
  });
  return res;
}

function icsText_(v) {
  return String(v).replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
}

/* ADE : la description mélange groupes, statuts techniques et enseignants, une information par ligne */
function adeInfo_(desc) {
  var profs = [], groupes = [];
  desc.split('\n').forEach(function (l) {
    l = l.trim();
    if (!l || /^\(Export/i.test(l) || /^#/.test(l)) return;
    if (/^(Transf[ée]r[ée]|A Attester|Attest[ée]|Annul[ée])$/i.test(l)) return;
    if (/^(L|M|DU|LP|BUT)\s?\d/i.test(l) || /\d/.test(l)) { groupes.push(l); return; }
    profs.push(l);
  });
  return { prof: profs.join(', '), groupe: groupes.join(', ') };
}

function icsDate_(v, attrs) {
  var y = +v.substr(0, 4), mo = +v.substr(4, 2) - 1, d = +v.substr(6, 2);
  if (v.length === 8) return new Date(y, mo, d);
  var h = +v.substr(9, 2), mi = +v.substr(11, 2);
  if (v.charAt(v.length - 1) === 'Z') return new Date(Date.UTC(y, mo, d, h, mi));
  return new Date(y, mo, d, h, mi); // heure locale du script (Europe/Paris)
}

/* Points d'entrée */

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function checkKey_(k) {
  var key = PropertiesService.getScriptProperties().getProperty('KEY');
  return key && k === key;
}

function paramsObj_() {
  var o = {};
  readSheet_('Parametres').forEach(function (r) { o[r.cle] = String(r.valeur); });
  return o;
}

function doGet(e) {
  var p = e.parameter || {};
  if (!checkKey_(p.key)) return json_({ ok: false, erreur: 'cle' });
  if (p.action) { var rn = notifGet_(p); return json_(rn || { ok: false, erreur: 'action' }); }
  var params = paramsObj_();
  var from = p.from, to = p.to;
  var sinceJournal = p.journal_depuis || '';
  return json_({
    ok: true,
    serveur: new Date().toISOString(),
    taches: readSheet_('Taches'),
    journal: readSheet_('Journal').filter(function (r) { return !sinceJournal || String(r.horodatage) >= sinceJournal; }),
    regles: readSheet_('Regles'),
    plan: readSheet_('Plan').filter(function (r) { return !from || (r.jour >= from && r.jour <= to); }),
    humeur: readSheet_('Humeur'),
    sante: readSheet_('Sante').filter(function (r) { return String(r.jour) >= jourMoins_(120); }),
    vie: readSheet_('Vie').filter(function (r) { return String(r.jour) >= jourMoins_(120); }),
    creneaux: readSheet_('Creneaux'),
    objectifs: readSheet_('Objectifs'),
    mesures: readSheet_('Mesures'),
    competences: readSheet_('Competences'),
    version: VERSION,
    parametres: params,
    evenements: from ? events_(from, to, params) : [],
    base_id: ss_().getId()
  });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, erreur: 'json' }); }
  if (!checkKey_(body.key)) return json_({ ok: false, erreur: 'cle' });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ops = body.ops || [], taches = false, resultat = null;
    ops.forEach(function (op) {
      if (notifOp_(op)) { if (op.resultat) resultat = op.resultat; return; }
      if (op.type === 'tache') { upsert_('Taches', 'id', op.data); taches = true; }
      else if (op.type === 'journal') append_('Journal', [op.data]);
      else if (op.type === 'regle') upsert_('Regles', 'id', op.data);
      else if (op.type === 'plan') upsert_('Plan', 'id', op.data);
      else if (op.type === 'humeur') upsert_('Humeur', 'jour', op.data);
      else if (op.type === 'parametre') upsert_('Parametres', 'cle', op.data);
      else if (op.type === 'sante_brut') santeBrute_(op.data);
      else if (EXTRA[op.type]) upsert_(EXTRA[op.type][0], EXTRA[op.type][1], op.data);
    });
    if (taches) majCloches_(); // une cloche activée, déplacée ou une tâche faite : la veille suit tout de suite
    return json_({ ok: true, traites: ops.length, resultat: resultat });
  } finally {
    lock.releaseLock();
  }
}
function jourMoins_(n) { var d = new Date(); d.setDate(d.getDate() - n); return Utilities.formatDate(d, 'Europe/Paris', 'yyyy-MM-dd'); }

/* Données envoyées par le raccourci iPhone « TRINITY Santé ».
   data : { jour, pas, sommeil_debuts: [dates ISO], sommeil_fins: [dates ISO], source }
   Le sommeil de la nuit qui précède « jour » : premier coucher, dernier lever, durée sans double compte.
   Sans montre, l'iPhone n'enregistre que le temps au lit : la durée est alors une estimation. */
function santeBrute_(d) {
  var jour = String(d.jour || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return;
  var row = { jour: jour, maj_le: Utilities.formatDate(new Date(), 'Europe/Paris', "yyyy-MM-dd'T'HH:mm:ss") };
  var pas = parseFloat(String(d.pas == null ? '' : d.pas).replace(',', '.'));
  if (!isNaN(pas)) row.pas = Math.round(pas);
  var deb = liste_(d.sommeil_debuts), fin = liste_(d.sommeil_fins), spans = [];
  // Fenêtre de la nuit, à l'heure de Paris : de la veille 18 h au jour même 14 h (une sieste de l'après-midi n'est pas comptée)
  var midi = Utilities.parseDate(jour + ' 14:00', 'Europe/Paris', 'yyyy-MM-dd HH:mm'), veille = new Date(midi.getTime() - 20 * 3600 * 1000);
  for (var i = 0; i < Math.min(deb.length, fin.length); i++) {
    var a = new Date(deb[i]), b = new Date(fin[i]);
    if (isNaN(a) || isNaN(b) || b <= a) continue;
    if (b <= veille || a >= midi) continue; // seulement la nuit qui précède ce jour
    spans.push([a.getTime(), b.getTime()]);
  }
  if (spans.length) {
    spans.sort(function (x, y) { return x[0] - y[0]; });
    var tot = 0, cur = null;
    spans.forEach(function (s) {
      if (!cur || s[0] > cur[1]) { if (cur) tot += cur[1] - cur[0]; cur = [s[0], s[1]]; } else cur[1] = Math.max(cur[1], s[1]);
    });
    tot += cur[1] - cur[0];
    row.sommeil_min = Math.round(tot / 60000);
    row.coucher = Utilities.formatDate(new Date(spans[0][0]), 'Europe/Paris', 'HH:mm');
    row.lever = Utilities.formatDate(new Date(Math.max.apply(null, spans.map(function (s) { return s[1]; }))), 'Europe/Paris', 'HH:mm');
  }
  row.source = String(d.source || 'iphone');
  upsert_('Sante', 'jour', row);
}
function liste_(v) {
  if (!v) return [];
  if (Object.prototype.toString.call(v) === '[object Array]') return v;
  return String(v).split(/\n|;/).map(function (x) { return x.trim(); }).filter(String);
}
