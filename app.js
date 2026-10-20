(function () {
  'use strict';
  var C = window.Core;

  /* Stockage local */
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
  };

  function today() { return C.ymd(new Date()); }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function nowIso() { var d = new Date(); return C.ymd(d) + 'T' + C.pad(d.getHours()) + ':' + C.pad(d.getMinutes()) + ':' + C.pad(d.getSeconds()); }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }

  var ENT_KEY = { 'ETS MAURAGE': 'ets', 'LRB': 'lrb', '1001 Fenêtres': 'f', '1001 Travaux': 't', 'Fili Floc': 'ff', 'Master': 'm', 'Perso': 'p', 'Sport': 's', 'Social': 'so' };
  var ENT_SHORT = { 'ETS MAURAGE': 'ETS', 'LRB': 'LRB', '1001 Fenêtres': '1001F', '1001 Travaux': '1001T', 'Fili Floc': 'Fili Floc', 'Master': 'Master', 'Perso': 'Perso', 'Sport': 'Sport', 'Social': 'Social' };
  var PRIO_NAME = { 1: 'Rouge', 2: 'Orange', 3: 'Vert', 4: 'Noir' };

  function emptyState() {
    return { taches: [], journal: [], regles: [], plan: [], humeur: [], parametres: {}, evenements: [], base_id: '', synchro: '' };
  }
  var DEFAULT_PARAMS = {
    journee_debut: '09:00', journee_fin: '19:00', capacite_travail_min: '300', capacite_cours_min: '60', marge: '0.3',
    midi_debut: '12:00', midi_fin: '13:30', mot_cours: 'Cours'
  };

  var cfg = LS.get('pp.cfg', null);
  var S = LS.get(cfg ? 'pp.cache' : 'pp.demo', null) || (cfg ? emptyState() : demoState());
  var queue = LS.get('pp.queue', []);
  var timer = LS.get('pp.timer', null);
  var ui = { view: 'aujourdhui', orgDay: today(), orgMode: 'jour', filtre: { entite: '', prio: '', statut: 'actives', q: '' }, groupe: 'entite', syncState: 'ok' };

  function P() { var o = {}; Object.keys(DEFAULT_PARAMS).forEach(function (k) { o[k] = DEFAULT_PARAMS[k]; }); Object.keys(S.parametres || {}).forEach(function (k) { if (S.parametres[k] !== '') o[k] = S.parametres[k]; }); return o; }
  function persist() { LS.set(cfg ? 'pp.cache' : 'pp.demo', S); LS.set('pp.queue', queue); LS.set('pp.timer', timer); }

  /* Données de démonstration : rien de réel, pour essayer le site avant de relier la base */
  function demoState() {
    var t = today(), s = emptyState();
    var rows = [
      ['Préparer le devis de démonstration', 1, '1001 Fenêtres', 'Fond', 60, t],
      ['Relancer un fournisseur', 3, 'ETS MAURAGE', 'Relance', 10, ''],
      ['Fiche produit du restaurant', 2, 'LRB', 'Fond', 90, C.addDays(t, 3)],
      ['Appeler un client grand compte', 2, 'Fili Floc', 'Relance', 15, C.addDays(t, -9)],
      ['Lecture pour le master', 2, 'Master', 'Fond', 45, ''],
      ['Courir 8 km', 3, 'Sport', 'Terrain', 50, ''],
      ['Visite de chantier', 2, '1001 Travaux', 'Terrain', 60, ''],
      ['Idée à creuser plus tard', 4, 'Perso', 'Rapide', 15, '']
    ];
    rows.forEach(function (r, i) {
      s.taches.push({ id: 'demo' + i, titre: r[0], statut: 'À faire', prio: r[1], entite: r[2], type: r[3], duree_min: r[4], echeance: r[5], jour: '', debut: '', ordre: (i + 1) * 10, contexte: '', origine: 'Démo', cree_le: nowIso(), maj_le: nowIso() });
    });
    s.parametres = {};
    return s;
  }

  /* Synchronisation */
  function applyOp(op) {
    var d = op.data;
    if (op.type === 'tache') upsertLocal(S.taches, 'id', d);
    else if (op.type === 'journal') { if (!S.journal.some(function (e) { return e.horodatage === d.horodatage && e.tache_id === d.tache_id && e.action === d.action; })) S.journal.push(d); }
    else if (op.type === 'regle') upsertLocal(S.regles, 'id', d);
    else if (op.type === 'plan') upsertLocal(S.plan, 'id', d);
    else if (op.type === 'humeur') upsertLocal(S.humeur, 'jour', d);
  }
  function upsertLocal(arr, key, obj) {
    for (var i = 0; i < arr.length; i++) if (String(arr[i][key]) === String(obj[key])) { Object.assign(arr[i], obj); return arr[i]; }
    arr.push(Object.assign({}, obj)); return obj;
  }
  function push(type, data) { queue.push({ type: type, data: JSON.parse(JSON.stringify(data)) }); applyOp({ type: type, data: data }); persist(); scheduleFlush(); }

  var flushTimer = null, flushing = false, retryDelay = 2000;
  function scheduleFlush(delay) { if (!cfg) return; clearTimeout(flushTimer); flushTimer = setTimeout(flush, delay == null ? 700 : delay); }
  function flush() {
    if (!cfg || flushing || !queue.length) return;
    flushing = true; setSync('envoi');
    var batch = queue.slice(0, 40);
    fetch(cfg.url, { method: 'POST', body: JSON.stringify({ key: cfg.key, ops: batch }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        flushing = false;
        if (!res.ok) { setSync(res.erreur === 'cle' ? 'cle' : 'erreur'); return; }
        queue = queue.slice(batch.length); persist(); retryDelay = 2000;
        setSync(queue.length ? 'envoi' : 'ok');
        if (queue.length) scheduleFlush(0);
      })
      .catch(function () { flushing = false; setSync('horsligne'); scheduleFlush(retryDelay); retryDelay = Math.min(retryDelay * 2, 60000); });
  }
  function load() {
    if (!cfg) { setSync('demo'); afterLoad(); return Promise.resolve(); }
    setSync('chargement');
    var t = today(), from = C.addDays(C.mondayOf(t), -7), to = C.addDays(t, 21);
    var url = cfg.url + '?key=' + encodeURIComponent(cfg.key) + '&from=' + from + '&to=' + to + '&journal_depuis=' + C.addDays(t, -70);
    return fetch(url).then(function (r) { return r.json(); }).then(function (res) {
      if (!res.ok) { setSync(res.erreur === 'cle' ? 'cle' : 'erreur'); return; }
      ['taches', 'journal', 'regles', 'plan', 'humeur'].forEach(function (k) { S[k] = res[k] || []; });
      S.parametres = res.parametres || {}; S.evenements = res.evenements || []; S.base_id = res.base_id || ''; S.synchro = nowIso();
      queue.forEach(applyOp);
      persist(); setSync(queue.length ? 'envoi' : 'ok'); afterLoad(); scheduleFlush(0);
    }).catch(function () { setSync('horsligne'); afterLoad(); });
  }
  function setSync(st) {
    ui.syncState = st;
    var el = $('#sync'); if (!el) return;
    var txt = { ok: 'À jour', envoi: 'Enregistrement…', chargement: 'Chargement…', horsligne: 'Hors ligne, enregistré sur cet appareil', erreur: 'La base ne répond pas', cle: 'Clé refusée : vérifie les réglages', demo: 'Mode démo : relie ta base dans Réglages' }[st] || '';
    el.textContent = txt; el.dataset.state = st;
  }

  /* Tâches reportées : une tâche prévue un jour passé et non faite revient dans la liste à placer */
  function afterLoad() {
    var t = today();
    S.taches.forEach(function (task) {
      if (task.jour && task.jour < t && task.statut !== 'Fait' && task.statut !== 'En attente' && task.statut !== 'Supprimée') {
        log(task, 'reporte', { detail: 'prévue le ' + task.jour + (task.debut ? ' à ' + task.debut : '') });
        task.jour = ''; task.debut = ''; task.maj_le = nowIso();
        push('tache', task);
      }
    });
    render();
  }

  /* Journal et modifications */
  function log(task, action, extra) {
    extra = extra || {};
    push('journal', {
      horodatage: nowIso(), tache_id: task.id, action: action, jour: task.jour || '', debut: task.debut || '',
      duree_prevue: task.duree_min || '', duree_reelle: extra.duree_reelle || '', type: task.type || '', entite: task.entite || '',
      prio: task.prio || '', detail: extra.detail || ''
    });
  }
  function getTask(id) { for (var i = 0; i < S.taches.length; i++) if (S.taches[i].id === id) return S.taches[i]; return null; }
  function saveTask(task, changes, opts) {
    opts = opts || {};
    var wasPlaced = !!(task.jour && task.debut);
    var before = { jour: task.jour, debut: task.debut };
    Object.assign(task, changes); task.maj_le = nowIso();
    push('tache', task);
    var placed = !!(task.jour && task.debut);
    if (opts.silent) return;
    if (placed && (before.jour !== task.jour || before.debut !== task.debut)) {
      var reporte = wasPlaced && before.jour && before.jour < task.jour && before.jour <= today();
      log(task, reporte ? 'reporte' : (wasPlaced ? 'deplace' : 'place'), { detail: opts.detail || '' });
      if (reporte) log(task, 'place', { detail: 'replacée' });
    } else if (!placed && wasPlaced) {
      log(task, 'retire', { detail: 'retirée du planning' });
    } else if (opts.action) {
      log(task, opts.action, { detail: opts.detail || '' });
    }
  }
  function createTask(fields) {
    var maxOrdre = S.taches.reduce(function (m, t) { return Math.max(m, C.num(t.ordre) || 0); }, 0);
    var task = Object.assign({ id: uid('t'), titre: 'Sans titre', statut: 'À faire', prio: 2, entite: 'ETS MAURAGE', type: 'Fond', duree_min: 30,
      echeance: '', jour: '', debut: '', ordre: maxOrdre + 10, contexte: '', origine: 'Site', cree_le: nowIso(), maj_le: nowIso(), fait_le: '', duree_reelle_min: '' }, fields);
    push('tache', task); log(task, 'cree');
    if (task.jour && task.debut) log(task, 'place');
    return task;
  }

  /* Calculs du jour */
  function events(day) {
    return (S.evenements || []).filter(function (e) { return e.debut && C.ymd(new Date(e.debut)) === day; })
      .sort(function (a, b) { return new Date(a.debut) - new Date(b.debut); });
  }
  function dayTasks(day) {
    return S.taches.filter(function (t) { return t.jour === day && t.statut !== 'Supprimée'; })
      .sort(function (a, b) { return (C.toMin(a.debut) == null ? 9999 : C.toMin(a.debut)) - (C.toMin(b.debut) == null ? 9999 : C.toMin(b.debut)); });
  }
  function dayLoad(day) {
    var p = P(), cours = C.isCoursDay(day, S.evenements || [], p);
    var cap = C.capacityFor(day, cours, S.regles, p);
    var charge = 0, fait = 0;
    dayTasks(day).forEach(function (t) {
      if (t.statut === 'Fait') fait += C.num(t.duree_reelle_min) || C.num(t.duree_min) || 0;
      else charge += C.correctedDuration(t, S.regles, p);
    });
    return { cap: cap, charge: Math.round(charge / 5) * 5, fait: fait, cours: cours };
  }
  function active(t) { return t.statut === 'À faire' || t.statut === 'En cours'; }
  function overdue() { var d = today(); return S.taches.filter(function (t) { return active(t) && t.echeance && t.echeance < d; }); }
  function reportCount(id) { return S.journal.filter(function (e) { return e.tache_id === id && e.action === 'reporte'; }).length; }

  /* Bandes de vol (tâches bicolores) */
  function strip(t, opts) {
    opts = opts || {};
    var ent = ENT_KEY[t.entite] || 'p', prio = +t.prio || 3, d = today();
    var meta = [];
    if (opts.time && t.debut) meta.push('<span class="m-time">' + esc(t.debut) + '</span>');
    meta.push('<span>' + esc(t.type || '') + '</span>');
    if (t.echeance) meta.push('<span class="' + (t.echeance < d && t.statut !== 'Fait' ? 'm-late' : '') + '">' + (t.echeance < d ? 'en retard, ' : 'pour ') + esc(C.shortDate(t.echeance)) + '</span>');
    var rc = reportCount(t.id); if (rc && !opts.compact) meta.push('<span class="m-late">reportée ' + rc + ' fois</span>');
    if (t.statut === 'En attente') meta.push('<span>en attente</span>');
    return '<div class="strip' + (t.statut === 'Fait' ? ' is-done' : '') + (opts.compact ? ' is-compact' : '') + (opts.cls ? ' ' + opts.cls : '') + '" data-id="' + esc(t.id) + '" style="--p:var(--p' + prio + ');--e:var(--e-' + ent + ')"' + (opts.style ? ' data-style="1"' : '') + '>' +
      '<button class="band-p" data-act="prio" aria-label="Priorité ' + PRIO_NAME[prio] + ', changer"></button>' +
      '<div class="strip-body" data-act="edit">' +
        '<div class="strip-title">' + esc(t.titre) + '</div>' +
        (opts.compact ? '' : '<div class="strip-meta">' + meta.join('') + '</div>') +
      '</div>' +
      '<div class="strip-dur">' + esc(C.fmtDur(C.num(t.duree_min) || 30)) + '</div>' +
      (opts.check ? '<button class="check" data-act="done" aria-label="Marquer comme faite"><svg viewBox="0 0 20 20"><path d="M5 10.5l3.2 3.2L15 7"/></svg></button>' : '') +
      '<button class="band-e" data-act="ent" aria-label="Entité ' + esc(t.entite) + ', changer"><span>' + esc(ENT_SHORT[t.entite] || t.entite) + '</span></button>' +
    '</div>';
  }

  /* Rendu */
  function render() {
    var v = ui.view;
    $all('.nav a').forEach(function (a) { a.setAttribute('aria-current', a.dataset.view === v ? 'page' : 'false'); });
    var main = $('#main');
    if (v === 'organisation') main.innerHTML = viewOrganisation();
    else if (v === 'listes') main.innerHTML = viewListes();
    else main.innerHTML = viewAujourdhui();
    renderTimerBar();
    if (v === 'organisation' && ui.orgMode === 'jour') scrollGridToNow();
  }

  function viewAujourdhui() {
    var d = today(), p = P(), L = dayLoad(d), tasks = dayTasks(d), evs = events(d);
    var weekend = C.weekday(d) > 5;
    var reste = Math.max(0, L.cap - L.charge);
    var phrase;
    if (weekend) phrase = 'Week-end : aucune tâche de travail prévue par défaut.';
    else if (!tasks.length) phrase = (L.cours ? 'Journée de cours : ' : 'Journée de travail : ') + 'rien n\'est encore placé. Tu disposes de ' + C.fmtDur(L.cap) + ' de tâches.';
    else if (L.charge > L.cap) phrase = 'Journée trop chargée : ' + C.fmtDur(L.charge) + ' prévues pour ' + C.fmtDur(L.cap) + ' disponibles. Allège avant de commencer.';
    else phrase = (L.cours ? 'Journée de cours : ' : 'Journée de travail : ') + C.fmtDur(L.charge) + ' prévues sur ' + C.fmtDur(L.cap) + '. Il reste de la place pour ' + C.fmtDur(reste) + '.';
    var pct = L.cap ? Math.min(140, Math.round(L.charge / L.cap * 100)) : 0;

    var now = nowMin(), nextTask = null, running = timer ? getTask(timer.id) : null;
    tasks.forEach(function (t) { if (!nextTask && t.statut !== 'Fait' && t.debut && C.toMin(t.debut) + (C.num(t.duree_min) || 30) > now) nextTask = t; });

    var rows = [];
    evs.forEach(function (e) {
      var s = new Date(e.debut), f = new Date(e.fin);
      rows.push({ m: e.journee ? -1 : s.getHours() * 60 + s.getMinutes(), html: '<div class="agenda-row ev"><span class="t">' + (e.journee ? 'Journée' : C.pad(s.getHours()) + ':' + C.pad(s.getMinutes())) + '</span><div class="ev-box' + (e.source === 'outlook' ? ' is-outlook' : '') + '"><span>' + esc(e.titre) + '</span><span class="ev-end">' + (e.journee ? '' : 'jusqu\'à ' + C.pad(f.getHours()) + ':' + C.pad(f.getMinutes())) + '</span></div></div>' });
    });
    if (!weekend && p.midi_debut) rows.push({ m: C.toMin(p.midi_debut), html: '<div class="agenda-row"><span class="t">' + esc(p.midi_debut) + '</span><div class="protect">Midi protégé jusqu\'à ' + esc(p.midi_fin) + '</div></div>' });
    tasks.forEach(function (t) { rows.push({ m: t.debut ? C.toMin(t.debut) : 2000, html: '<div class="agenda-row"><span class="t">' + (t.debut ? esc(t.debut) : 'Sans heure') + '</span>' + strip(t, { check: t.statut !== 'Fait' }) + '</div>' }); });
    rows.sort(function (a, b) { return a.m - b.m; });

    var od = overdue();
    var sugg = C.suggestions(C.stats(S.journal, p, d), S.regles, p).slice(0, 3);
    var accepted = S.regles.filter(function (r) { return r.statut === 'acceptee'; }).length;
    var proposes = S.plan.filter(function (r) { return r.jour === d && r.statut === 'propose'; }).length;
    var mood = null; S.humeur.forEach(function (h) { if (h.jour === d) mood = h; });

    var h = '';
    h += '<section class="hero"><p class="hero-kicker">Aujourd\'hui</p><h1>' + esc(cap1(C.longDate(d))) + '</h1><p class="hero-line">' + esc(phrase) + '</p>';
    if (!weekend) h += '<div class="gauge' + (L.charge > L.cap ? ' is-over' : '') + '" role="img" aria-label="Charge ' + pct + ' % de la capacité"><div class="gauge-fill" style="width:' + Math.min(100, pct) + '%"></div>' + (pct > 100 ? '<div class="gauge-over" style="width:' + (pct - 100) + '%"></div>' : '') + '</div><div class="gauge-legend"><span>' + C.fmtDur(L.charge) + ' prévues, marge comprise</span><span>' + C.fmtDur(L.cap) + ' disponibles</span></div>';
    h += '</section>';

    if (running || nextTask) {
      var t = running || nextTask;
      h += '<section class="block now"><h2>' + (running ? 'En cours' : 'Ensuite') + '</h2>' + strip(t, { time: true }) +
        '<div class="row-actions">' + (running ? '<button class="btn primary" data-act="finish" data-id="' + esc(t.id) + '">J\'ai terminé</button><button class="btn" data-act="stop">Arrêter le chrono</button>'
          : '<button class="btn primary" data-act="start" data-id="' + esc(t.id) + '">Commencer</button><button class="btn" data-act="done" data-id="' + esc(t.id) + '">Déjà faite</button>') + '</div></section>';
    }
    if (proposes) h += '<a class="notice" href="#organisation">Un plan t\'attend pour aujourd\'hui (' + proposes + ' tâche' + (proposes > 1 ? 's' : '') + ') : ouvre Organisation pour l\'accepter ou le modifier.</a>';

    h += '<section class="block"><div class="block-head"><h2>Au programme</h2><a class="link" href="#organisation">Organiser</a></div>';
    h += rows.length ? '<div class="agenda">' + rows.map(function (r) { return r.html; }).join('') + '</div>' : '<p class="empty">Rien de prévu. Ouvre Organisation pour placer tes tâches ou demander un plan.</p>';
    h += '</section>';

    if (od.length) h += '<section class="block"><div class="block-head"><h2>En retard</h2><a class="link" href="#listes" data-filter="retard">Voir les ' + od.length + '</a></div><p class="muted">' + od.length + ' tâche' + (od.length > 1 ? 's ont' : ' a') + ' dépassé leur échéance. La plus ancienne : ' + esc(od.sort(function (a, b) { return a.echeance < b.echeance ? -1 : 1; })[0].titre) + '.</p></section>';

    h += '<section class="block"><div class="block-head"><h2>Ce que j\'apprends de toi</h2>' + (accepted ? '<button class="link" data-act="rules">' + accepted + ' règle' + (accepted > 1 ? 's' : '') + ' appliquée' + (accepted > 1 ? 's' : '') + '</button>' : '') + '</div>';
    var fromClaude = S.regles.filter(function (r) { return r.statut === 'proposee'; });
    h += fromClaude.map(function (r) { return '<div class="insight"><p>' + esc(r.texte) + '</p><p class="proof">' + esc(r.preuve) + ', proposée par Claude</p><div class="row-actions"><button class="btn primary sm" data-act="rule-c" data-ok="1" data-rid="' + esc(r.id) + '">Appliquer</button><button class="btn sm" data-act="rule-c" data-ok="0" data-rid="' + esc(r.id) + '">Ignorer</button></div></div>'; }).join('');
    if (sugg.length) h += sugg.map(function (s, i) { return '<div class="insight"><p>' + esc(s.texte) + '</p><p class="proof">' + esc(s.preuve) + '</p><div class="row-actions"><button class="btn primary sm" data-act="rule-yes" data-i="' + i + '">Appliquer</button><button class="btn sm" data-act="rule-no" data-i="' + i + '">Ignorer</button></div></div>'; }).join('');
    else if (!fromClaude.length) h += '<p class="muted">' + learningStatus() + '</p>';
    h += '</section>';

    h += '<section class="block"><button class="btn wide" data-act="ask">Demander à Claude</button></section>';

    h += '<section class="block mood"><h2>Comment s\'est passée ta journée ?</h2><div class="faces" role="radiogroup" aria-label="Note de la journée">' + [1, 2, 3, 4, 5].map(function (n) {
      return '<button role="radio" aria-checked="' + (mood && +mood.note === n ? 'true' : 'false') + '" class="face" data-act="mood" data-n="' + n + '" aria-label="' + ['Très difficile', 'Difficile', 'Correcte', 'Facile', 'Très facile'][n - 1] + '">' + face(n) + '<span>' + ['Très difficile', 'Difficile', 'Correcte', 'Facile', 'Très facile'][n - 1] + '</span></button>';
    }).join('') + '</div><label class="field"><span>Pourquoi ?</span><textarea id="mood-why" rows="2" placeholder="Ce qui a pesé ou aidé aujourd\'hui">' + esc(mood ? mood.pourquoi : '') + '</textarea></label><button class="btn sm" data-act="mood-save">Enregistrer</button></section>';
    S._sugg = sugg;
    return h;
  }
  function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function learningStatus() {
    var faits = S.journal.filter(function (e) { return e.action === 'fait' && C.num(e.duree_reelle); }).length;
    var s = C.SEUILS.coef;
    if (faits < s) return 'J\'observe encore. ' + faits + ' tâche' + (faits > 1 ? 's' : '') + ' terminée' + (faits > 1 ? 's' : '') + ' avec sa durée réelle sur ' + s + ' nécessaires pour une première règle. Pense à appuyer sur Commencer puis J\'ai terminé.';
    return 'Rien de nouveau à te proposer pour l\'instant : tes habitudes correspondent aux règles en place.';
  }

  function face(n) {
    var mouth = { 1: 'M7 16.5q5-4 10 0', 2: 'M7.5 16q4.5-2 9 0', 3: 'M8 15.5h8', 4: 'M7.5 14.5q4.5 2.5 9 0', 5: 'M7 14q5 4.5 10 0' }[n];
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="8.6" cy="9.8" r="1.1" class="dot"/><circle cx="15.4" cy="9.8" r="1.1" class="dot"/><path d="' + mouth + '"/></svg>';
  }

  /* Organisation */
  var H0 = 7, H1 = 21, HPX = 64;
  function viewOrganisation() {
    var d = ui.orgDay;
    var h = '<section class="org-head"><div class="seg" role="tablist"><button role="tab" aria-selected="' + (ui.orgMode === 'jour') + '" data-act="mode" data-mode="jour">Jour</button><button role="tab" aria-selected="' + (ui.orgMode === 'semaine') + '" data-act="mode" data-mode="semaine">Semaine</button></div>';
    if (ui.orgMode === 'jour') {
      var L = dayLoad(d);
      h += '<div class="daynav"><button class="icon" data-act="day" data-delta="-1" aria-label="Jour précédent">‹</button><h1>' + esc(cap1(C.longDate(d))) + '</h1><button class="icon" data-act="day" data-delta="1" aria-label="Jour suivant">›</button>' + (d !== today() ? '<button class="link" data-act="day" data-delta="0">Aujourd\'hui</button>' : '') + '</div>';
      h += '<p class="hero-line">' + (L.cours ? 'Jour de cours. ' : '') + C.fmtDur(L.charge) + ' prévues sur ' + C.fmtDur(L.cap) + (L.charge > L.cap ? ', au-delà de ta capacité.' : '.') + '</p>';
      h += '<div class="row-actions"><button class="btn primary" data-act="propose">Proposer un plan</button><button class="btn" data-act="ask">Demander à Claude</button></div></section>';
      h += planBanner(d);
      h += '<div class="org">' + trayHtml(d) + gridHtml(d) + '</div>';
    } else {
      var mon = C.mondayOf(d);
      h += '<div class="daynav"><button class="icon" data-act="week" data-delta="-7" aria-label="Semaine précédente">‹</button><h1>Semaine du ' + esc(C.longDate(mon).replace(/^lundi /, '')) + '</h1><button class="icon" data-act="week" data-delta="7" aria-label="Semaine suivante">›</button></div></section>';
      h += weekHtml(mon);
    }
    return h;
  }
  function planBanner(d) {
    var props = S.plan.filter(function (r) { return r.jour === d && r.statut === 'propose' && getTask(r.tache_id); });
    if (!props.length) return '';
    var auteur = props.some(function (r) { return r.auteur === 'claude'; }) ? 'Claude propose' : 'Proposition';
    return '<div class="plan-banner"><p>' + auteur + ' ' + props.length + ' tâche' + (props.length > 1 ? 's' : '') + ' pour ce jour, en pointillés sur la grille. Accepte-les, déplace-les ou retire celles qui ne te vont pas.</p><div class="row-actions"><button class="btn primary sm" data-act="plan-all">Tout accepter</button><button class="btn sm" data-act="plan-none">Tout refuser</button></div></div>';
  }
  function trayHtml(d) {
    var f = ui.filtre;
    var noHour = S.taches.filter(function (t) { return t.jour === d && !t.debut && active(t); });
    var toPlace = S.taches.filter(function (t) { return active(t) && !t.jour && (!f.entite || t.entite === f.entite); })
      .sort(function (a, b) { return C.rank(a, today(), P()) - C.rank(b, today(), P()); });
    var h = '<aside class="tray" data-drop="tray"><div class="tray-head"><h2>À placer <span class="count">' + toPlace.length + '</span></h2>' + entChips(f.entite, 'tray-ent') + '</div><div class="tray-list">';
    if (noHour.length) h += '<p class="tray-sub">Prévues ce jour, sans heure</p>' + noHour.map(function (t) { return strip(t, { compact: false }); }).join('') + '<p class="tray-sub">Toutes les autres</p>';
    h += toPlace.map(function (t) { return strip(t); }).join('') || '<p class="empty">Tout est placé.</p>';
    return h + '</div></aside>';
  }
  function entChips(cur, act) {
    return '<div class="chips"><button class="chip" aria-pressed="' + (!cur) + '" data-act="' + act + '" data-v="">Toutes</button>' + C.ENTITES.map(function (e) {
      return '<button class="chip" aria-pressed="' + (cur === e) + '" data-act="' + act + '" data-v="' + esc(e) + '" style="--e:var(--e-' + ENT_KEY[e] + ')"><i></i>' + esc(ENT_SHORT[e]) + '</button>';
    }).join('') + '</div>';
  }
  function yOf(min) { return (min - H0 * 60) / 60 * HPX; }
  function gridHtml(d) {
    var p = P(), h = '<div class="grid-wrap"><div class="grid" data-drop="grid" data-day="' + d + '" style="height:' + ((H1 - H0) * HPX) + 'px">';
    for (var hr = H0; hr < H1; hr++) h += '<div class="hour" style="top:' + yOf(hr * 60) + 'px"><span>' + C.pad(hr) + ':00</span></div>';
    var js = C.toMin(p.journee_debut), je = C.toMin(p.journee_fin);
    h += '<div class="offhours" style="top:0;height:' + yOf(js) + 'px"></div><div class="offhours" style="top:' + yOf(je) + 'px;height:' + (yOf(H1 * 60) - yOf(je)) + 'px"></div>';
    if (C.weekday(d) <= 5 && p.midi_debut) h += '<div class="midi" style="top:' + yOf(C.toMin(p.midi_debut)) + 'px;height:' + (yOf(C.toMin(p.midi_fin)) - yOf(C.toMin(p.midi_debut))) + 'px"><span>Midi protégé</span></div>';
    events(d).forEach(function (e) {
      if (e.journee) return;
      var s = new Date(e.debut), f = new Date(e.fin), a = s.getHours() * 60 + s.getMinutes(), b = f.getHours() * 60 + f.getMinutes();
      h += '<div class="ev-block' + (e.source === 'outlook' ? ' is-outlook' : '') + '" style="top:' + yOf(a) + 'px;height:' + Math.max(18, yOf(b) - yOf(a)) + 'px"><span>' + esc(e.titre) + '</span></div>';
    });
    // Les tâches courtes s'empilent : une tâche de 10 min reste lisible sans masquer la suivante.
    var items = [];
    S.plan.filter(function (r) { return r.jour === d && r.statut === 'propose'; }).forEach(function (r) {
      var t = getTask(r.tache_id); if (!t || t.jour === d && t.debut) return;
      var dur = C.num(r.duree_min) || C.num(t.duree_min) || 30;
      items.push({ a: C.toMin(r.debut), dur: dur, html: function (top, hgt) {
        return '<div class="slot is-proposed" data-pid="' + esc(r.id) + '" style="top:' + top + 'px;height:' + hgt + 'px" title="' + esc(r.raison || '') + '">' + strip(t, { compact: hgt < 46 }) + '</div>';
      } });
    });
    dayTasks(d).forEach(function (t) {
      if (!t.debut) return;
      var dur = C.num(t.duree_min) || 30;
      items.push({ a: C.toMin(t.debut), dur: dur, html: function (top, hgt) {
        return '<div class="slot" data-slot="' + esc(t.id) + '" style="top:' + top + 'px;height:' + hgt + 'px">' + strip(t, { compact: hgt < 46, check: t.statut !== 'Fait', time: true }) + '<div class="resize" data-act="resize" aria-hidden="true"></div></div>';
      } });
    });
    items.sort(function (x, y) { return x.a - y.a; });
    var prevEnd = -1, prevBottom = -1;
    items.forEach(function (it) {
      var top = yOf(it.a), hgt = Math.max(26, it.dur / 60 * HPX - 2);
      if (it.a >= prevEnd && top < prevBottom) top = prevBottom;
      h += it.html(top, hgt);
      prevEnd = Math.max(prevEnd, it.a + it.dur); prevBottom = Math.max(prevBottom, top + hgt + 2);
    });
    if (d === today()) h += '<div class="nowline" style="top:' + yOf(nowMin()) + 'px"></div>';
    h += '<div class="ghost-slot" hidden></div>';
    return h + '</div></div>';
  }
  function scrollGridToNow() {
    var g = $('.grid-wrap'); if (!g) return;
    var target = ui.orgDay === today() ? yOf(nowMin()) - 120 : yOf(C.toMin(P().journee_debut)) - 20;
    g.scrollTop = Math.max(0, target);
  }
  function weekHtml(mon) {
    var h = '<div class="week">';
    for (var i = 0; i < 7; i++) {
      var d = C.addDays(mon, i), L = dayLoad(d), pct = L.cap ? Math.min(100, Math.round(L.charge / L.cap * 100)) : 0;
      h += '<div class="wday' + (d === today() ? ' is-today' : '') + '" data-drop="day" data-day="' + d + '"><div class="wday-head"><button class="link" data-act="openday" data-day="' + d + '">' + esc(cap1(C.shortDate(d))) + '</button><span class="muted">' + (L.cap ? C.fmtDur(L.charge) + ' sur ' + C.fmtDur(L.cap) : '') + '</span></div>' +
        (L.cap ? '<div class="gauge sm' + (L.charge > L.cap ? ' is-over' : '') + '"><div class="gauge-fill" style="width:' + pct + '%"></div></div>' : '');
      events(d).forEach(function (e) { var s = new Date(e.debut); h += '<div class="wev' + (e.source === 'outlook' ? ' is-outlook' : '') + '">' + (e.journee ? '' : C.pad(s.getHours()) + ':' + C.pad(s.getMinutes()) + ' ') + esc(e.titre) + '</div>'; });
      dayTasks(d).forEach(function (t) { h += strip(t, { compact: true, time: true }); });
      h += '</div>';
    }
    return h + '</div><p class="muted center">Glisse une tâche d\'un jour à l\'autre. Ouvre un jour pour la placer à l\'heure.</p>';
  }

  /* Listes */
  function viewListes() {
    var f = ui.filtre, d = today();
    var list = S.taches.filter(function (t) {
      if (t.statut === 'Supprimée') return false;
      if (f.statut === 'actives' && !active(t)) return false;
      if (f.statut === 'attente' && t.statut !== 'En attente') return false;
      if (f.statut === 'faites' && t.statut !== 'Fait') return false;
      if (f.statut === 'retard' && !(active(t) && t.echeance && t.echeance < d)) return false;
      if (f.entite && t.entite !== f.entite) return false;
      if (f.prio && +t.prio !== +f.prio) return false;
      if (f.q && C.norm(t.titre + ' ' + (t.contexte || '')).indexOf(C.norm(f.q)) === -1) return false;
      return true;
    });
    var h = '<section class="org-head"><h1>Listes</h1><form class="quick" data-form="quick"><input id="quick" autocomplete="off" placeholder="Ajouter : relance fournisseur demain 10 min 1001F p3" aria-label="Ajouter une tâche"><button class="btn primary" type="submit">Ajouter</button></form><div id="quick-preview" class="quick-preview"></div>';
    h += '<div class="filters"><div class="seg">' + [['actives', 'À faire'], ['attente', 'En attente'], ['retard', 'En retard'], ['faites', 'Faites']].map(function (s) { return '<button aria-pressed="' + (f.statut === s[0]) + '" data-act="statut" data-v="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div>' +
      '<input class="search" id="search" type="search" placeholder="Rechercher" value="' + esc(f.q) + '" aria-label="Rechercher une tâche">' +
      '<div class="seg">' + [['entite', 'Par entité'], ['prio', 'Par priorité']].map(function (g) { return '<button aria-pressed="' + (ui.groupe === g[0]) + '" data-act="groupe" data-v="' + g[0] + '">' + g[1] + '</button>'; }).join('') + '</div></div>';
    h += entChips(f.entite, 'list-ent') + '<div class="chips">' + [1, 2, 3, 4].map(function (n) { return '<button class="chip" aria-pressed="' + (+f.prio === n) + '" data-act="list-prio" data-v="' + n + '" style="--e:var(--p' + n + ')"><i></i>' + PRIO_NAME[n] + '</button>'; }).join('') + '</div></section>';
    var groups = {}, keys;
    if (ui.groupe === 'prio') { keys = ['1', '2', '3', '4']; list.forEach(function (t) { (groups[String(+t.prio || 3)] = groups[String(+t.prio || 3)] || []).push(t); }); }
    else { keys = C.ENTITES.slice(); list.forEach(function (t) { (groups[t.entite] = groups[t.entite] || []).push(t); }); Object.keys(groups).forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); }); }
    var any = false;
    keys.forEach(function (k) {
      var g = groups[k]; if (!g || !g.length) return; any = true;
      g.sort(function (a, b) { return (C.num(a.ordre) || 0) - (C.num(b.ordre) || 0); });
      var label = ui.groupe === 'prio' ? C.PRIO_LABELS[k] : k;
      h += '<section class="group" data-drop="list" data-group="' + esc(k) + '"><h2 style="--e:' + (ui.groupe === 'prio' ? 'var(--p' + k + ')' : 'var(--e-' + (ENT_KEY[k] || 'p') + ')') + '"><i></i>' + esc(label) + ' <span class="count">' + g.length + '</span></h2>' + g.map(function (t) { return strip(t, { check: active(t) }); }).join('') + '</section>';
    });
    if (!any) h += '<p class="empty">Aucune tâche ne correspond à ces filtres.</p>';
    return h;
  }

  /* Chrono */
  function renderTimerBar() {
    var bar = $('#timerbar');
    var t = timer ? getTask(timer.id) : null;
    if (!t) { bar.hidden = true; return; }
    bar.hidden = false;
    var el = Math.max(0, Math.round((Date.now() - timer.start) / 60000));
    bar.innerHTML = '<span class="tb-dot"></span><span class="tb-title">' + esc(t.titre) + '</span><span class="tb-time">' + C.fmtDur(el) + ' sur ' + C.fmtDur(C.num(t.duree_min) || 30) + '</span><button class="btn primary sm" data-act="finish" data-id="' + esc(t.id) + '">J\'ai terminé</button>';
  }
  function startTask(t) {
    if (timer && timer.id !== t.id) { var prev = getTask(timer.id); if (prev && prev.statut === 'En cours') saveTask(prev, { statut: 'À faire' }, { silent: true }); }
    timer = { id: t.id, start: Date.now() }; persist();
    saveTask(t, { statut: 'En cours' }, { action: 'commence' });
    if (!t.jour) saveTask(t, { jour: today(), debut: fromNowRounded() });
    toast('Chrono lancé pour « ' + t.titre + ' »');
    render();
  }
  function fromNowRounded() { return C.fromMin(Math.floor(nowMin() / 15) * 15); }
  function finishTask(t, reel) {
    if (timer && timer.id === t.id) { timer = null; persist(); }
    var changes = { statut: 'Fait', fait_le: nowIso(), duree_reelle_min: Math.max(1, Math.round(reel)) };
    if (!t.jour) { changes.jour = today(); }
    Object.assign(t, changes); t.maj_le = nowIso(); push('tache', t);
    log(t, 'fait', { duree_reelle: Math.max(1, Math.round(reel)) });
    toast('Faite en ' + C.fmtDur(reel) + ' (prévu ' + C.fmtDur(C.num(t.duree_min) || 30) + ')');
    render();
  }
  function askDuration(t) {
    var plan = C.num(t.duree_min) || 30;
    var opts = [0.5, 0.75, 1, 1.5, 2].map(function (k) { return Math.max(5, Math.round(plan * k / 5) * 5); })
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    openSheet('<h2>Combien de temps ça t\'a pris ?</h2><p class="muted">' + esc(t.titre) + ', prévu ' + C.fmtDur(plan) + '. Cette mesure sert à corriger tes estimations.</p><div class="chips big">' +
      opts.map(function (v) { return '<button class="chip" data-act="dur-pick" data-v="' + v + '" aria-pressed="' + (v === plan) + '">' + C.fmtDur(v) + '</button>'; }).join('') +
      '</div><label class="field"><span>Autre durée, en minutes</span><input id="dur-custom" type="number" inputmode="numeric" min="1" value="' + plan + '"></label><div class="row-actions"><button class="btn primary" data-act="dur-ok" data-id="' + esc(t.id) + '">Valider</button><button class="btn" data-act="close">Annuler</button></div>');
  }

  /* Éditeur */
  function openEditor(t) {
    var isNew = !t;
    t = t || { titre: '', prio: 2, entite: 'ETS MAURAGE', type: 'Fond', duree_min: 30, statut: 'À faire', echeance: '', jour: '', debut: '', contexte: '' };
    var h = '<h2>' + (isNew ? 'Nouvelle tâche' : 'Modifier la tâche') + '</h2><form data-form="edit" data-id="' + esc(t.id || '') + '">' +
      '<label class="field"><span>Titre</span><input name="titre" required value="' + esc(t.titre) + '"></label>' +
      '<div class="field"><span>Priorité</span><div class="chips">' + [1, 2, 3, 4].map(function (n) { return '<label class="chip"><input type="radio" name="prio" value="' + n + '"' + (+t.prio === n ? ' checked' : '') + '><i style="--e:var(--p' + n + ')"></i>' + PRIO_NAME[n] + '</label>'; }).join('') + '</div></div>' +
      '<div class="field"><span>Entité</span><div class="chips">' + C.ENTITES.map(function (e) { return '<label class="chip"><input type="radio" name="entite" value="' + esc(e) + '"' + (t.entite === e ? ' checked' : '') + '><i style="--e:var(--e-' + ENT_KEY[e] + ')"></i>' + esc(ENT_SHORT[e]) + '</label>'; }).join('') + '</div></div>' +
      '<div class="field-row"><label class="field"><span>Type</span><select name="type">' + C.TYPES.map(function (x) { return '<option' + (t.type === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Durée prévue (min)</span><input name="duree_min" type="number" inputmode="numeric" min="5" step="5" value="' + esc(t.duree_min) + '"></label></div>' +
      '<div class="field-row"><label class="field"><span>Échéance</span><input name="echeance" type="date" value="' + esc(t.echeance) + '"></label>' +
      '<label class="field"><span>Statut</span><select name="statut">' + C.STATUTS.map(function (x) { return '<option' + (t.statut === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="field-row"><label class="field"><span>Prévue le</span><input name="jour" type="date" value="' + esc(t.jour) + '"></label>' +
      '<label class="field"><span>À</span><input name="debut" type="time" step="900" value="' + esc(t.debut) + '"></label></div>' +
      '<label class="field"><span>Contexte</span><textarea name="contexte" rows="3">' + esc(t.contexte) + '</textarea></label>' +
      (t.notion_url ? '<p class="muted"><a href="' + esc(t.notion_url) + '" target="_blank" rel="noopener">Ancienne fiche Notion</a></p>' : '') +
      '<div class="row-actions"><button class="btn primary" type="submit">Enregistrer</button><button class="btn" type="button" data-act="close">Annuler</button>' + (isNew ? '' : '<button class="btn danger" type="button" data-act="delete" data-id="' + esc(t.id) + '">Supprimer</button>') + '</div></form>';
    openSheet(h);
  }

  /* Feuille modale, menu et notifications */
  function openSheet(html) {
    var s = $('#sheet');
    s.querySelector('.sheet-body').innerHTML = html;
    if (!s.open) s.showModal();
    var first = s.querySelector('input:not([type=radio]), select, textarea, button'); if (first) first.focus();
  }
  function closeSheet() { var s = $('#sheet'); if (s.open) s.close(); }
  function openPop(anchor, html) {
    var pop = $('#pop'); pop.innerHTML = html; pop.hidden = false;
    var r = anchor.getBoundingClientRect(), w = pop.offsetWidth, hgt = pop.offsetHeight;
    var x = Math.min(window.innerWidth - w - 12, Math.max(12, r.left));
    var y = r.bottom + 6; if (y + hgt > window.innerHeight - 12) y = r.top - hgt - 6;
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
    var b = pop.querySelector('button'); if (b) b.focus();
  }
  function closePop() { $('#pop').hidden = true; }
  var toastTimer;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3200); }

  /* Règles apprises */
  function decideRule(s, ok) {
    push('regle', { id: uid('r'), texte: s.texte, categorie: s.categorie, cle: s.cle, valeur: s.valeur, preuve: s.preuve, statut: ok ? 'acceptee' : 'refusee', source: 'site', cree_le: nowIso(), decide_le: nowIso() });
    toast(ok ? 'Règle appliquée' : 'Proposition ignorée');
    render();
  }
  function showRules() {
    var acc = S.regles.filter(function (r) { return r.statut === 'acceptee'; });
    openSheet('<h2>Règles appliquées</h2>' + (acc.map(function (r) {
      return '<div class="insight"><p>' + esc(r.texte) + '</p><p class="proof">' + esc(r.preuve) + ', ' + (r.source === 'claude' ? 'proposée par Claude' : 'calculée par le site') + '</p><button class="btn sm" data-act="rule-off" data-rid="' + esc(r.id) + '">Ne plus appliquer</button></div>';
    }).join('') || '<p class="muted">Aucune règle pour l\'instant.</p>') + '<div class="row-actions"><button class="btn" data-act="close">Fermer</button></div>');
  }

  /* Plans */
  function proposeLocal() {
    var d = ui.orgDay;
    S.plan.filter(function (r) { return r.jour === d && r.statut === 'propose'; }).forEach(function (r) { r.statut = 'remplace'; push('plan', r); });
    var res = C.proposePlan(d, S.taches, S.evenements || [], S.regles, P(), today());
    if (!res.plan.length) { toast(res.charge >= res.capacite ? 'La journée est déjà pleine' : 'Aucune tâche à placer dans les créneaux libres'); render(); return; }
    res.plan.forEach(function (r) { push('plan', { id: uid('pl'), jour: d, tache_id: r.tache_id, debut: r.debut, duree_min: r.duree_min, raison: r.raison, statut: 'propose', auteur: 'site', cree_le: nowIso() }); });
    toast(res.plan.length + ' tâches proposées');
    render();
  }
  function acceptPlan(r, ok) {
    var t = getTask(r.tache_id);
    r.statut = ok ? 'accepte' : 'refuse'; push('plan', r);
    if (ok && t) saveTask(t, { jour: r.jour, debut: r.debut, duree_min: r.duree_min || t.duree_min }, { detail: 'plan ' + (r.auteur || '') + ' accepté' });
  }

  function askClaude() {
    var d = today();
    openSheet('<h2>Demander à Claude</h2><p class="muted">La question s\'ouvre dans Claude avec le lien vers ta base, pour qu\'il lise et réorganise tes tâches.</p><label class="field"><span>Ta question</span><textarea id="ask-q" rows="4" placeholder="Je suis absent jeudi après-midi, réorganise ma semaine"></textarea></label><div class="row-actions"><button class="btn primary" data-act="ask-go">Ouvrir dans Claude</button><button class="btn" data-act="close">Annuler</button></div>');
    S._askDay = d;
  }
  function askGo() {
    var q = ($('#ask-q') || {}).value || '';
    var base = S.base_id ? 'https://docs.google.com/spreadsheets/d/' + S.base_id : 'ma base Google Sheets « Poste de pilotage — base »';
    var prompt = 'Poste de pilotage. Ma base de tâches : ' + base + ' (onglets Taches, Journal, Regles, Plan, Humeur, Parametres). Nous sommes ' + C.longDate(today()) + ', il est ' + C.fromMin(nowMin()) + '. ' + q.trim() +
      ' Si tu modifies mon planning, écris tes propositions dans l\'onglet Plan (statut propose, auteur claude) pour que je les valide sur le site.';
    window.open('https://claude.ai/new?q=' + encodeURIComponent(prompt), '_blank', 'noopener');
    closeSheet();
  }

  function openSettings() {
    openSheet('<h2>Réglages</h2><form data-form="cfg"><label class="field"><span>Adresse de la passerelle (Apps Script)</span><input name="url" type="url" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(cfg ? cfg.url : '') + '"></label>' +
      '<label class="field"><span>Clé</span><input name="key" autocomplete="off" value="' + esc(cfg ? cfg.key : '') + '"></label>' +
      '<div class="row-actions"><button class="btn primary" type="submit">Relier la base</button>' + (cfg ? '<button class="btn" type="button" data-act="unlink">Délier</button>' : '') + '<button class="btn" type="button" data-act="close">Fermer</button></div></form>' +
      (S.base_id ? '<p class="muted"><a href="https://docs.google.com/spreadsheets/d/' + esc(S.base_id) + '" target="_blank" rel="noopener">Ouvrir la base Google Sheets</a></p>' : '') +
      '<p class="muted">Sur téléphone, ajoute le site à l\'écran d\'accueil depuis le menu de partage du navigateur : il s\'ouvrira en plein écran.</p>' +
      '<p class="muted">Dernière synchronisation : ' + esc(S.synchro || 'jamais') + '. Envois en attente : ' + queue.length + '.</p>');
  }

  /* Glisser-déposer : souris immédiat, doigt après un appui long */
  var drag = null;
  function onPointerDown(e) {
    if (e.button && e.button !== 0) return;
    var rz = e.target.closest('[data-act="resize"]');
    if (rz) { startResize(e, rz.parentNode); return; }
    if (e.target.closest('button, input, textarea, select, a')) return;
    var el = e.target.closest('.strip'); if (!el) return;
    if (el.closest('#sheet')) return;
    var id = el.dataset.id;
    drag = { id: id, el: el, x0: e.clientX, y0: e.clientY, started: false, pointerId: e.pointerId, touch: e.pointerType !== 'mouse', armed: e.pointerType === 'mouse', fromSlot: !!el.closest('.slot:not(.is-proposed)') };
    if (drag.touch) drag.hold = setTimeout(function () { if (drag) { drag.armed = true; beginDrag(e.clientX, e.clientY); if (navigator.vibrate) navigator.vibrate(12); } }, 260);
  }
  function onPointerMove(e) {
    if (resize) { moveResize(e); return; }
    if (!drag) return;
    var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.started) {
      if (!drag.armed) { if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { clearTimeout(drag.hold); drag = null; } return; }
      if (Math.abs(dx) + Math.abs(dy) < 5) return;
      beginDrag(e.clientX, e.clientY);
    }
    e.preventDefault();
    moveDrag(e.clientX, e.clientY);
  }
  function beginDrag(x, y) {
    if (drag.started) return;
    drag.started = true;
    var r = drag.el.getBoundingClientRect();
    var g = drag.el.cloneNode(true); g.classList.add('drag-ghost'); g.style.width = Math.min(r.width, 340) + 'px';
    document.body.appendChild(g); drag.ghost = g; drag.offX = Math.min(x - r.left, 300); drag.offY = Math.min(y - r.top, 24);
    drag.el.classList.add('is-dragging'); document.body.classList.add('dragging');
    moveDrag(x, y);
  }
  function moveDrag(x, y) {
    drag.ghost.style.transform = 'translate(' + (x - drag.offX) + 'px,' + (y - drag.offY) + 'px)';
    drag.ghost.style.visibility = 'hidden';
    var under = document.elementFromPoint(x, y);
    drag.ghost.style.visibility = '';
    $all('.drop-hover').forEach(function (n) { n.classList.remove('drop-hover'); });
    var gs = $('.ghost-slot');
    drag.target = null;
    if (!under) { if (gs) gs.hidden = true; return; }
    var grid = under.closest('[data-drop="grid"]');
    if (grid) {
      var gr = grid.getBoundingClientRect();
      var t = getTask(drag.id), dur = C.num(t && t.duree_min) || 30;
      var min = H0 * 60 + Math.round(((y - drag.offY - gr.top) / HPX * 60) / 15) * 15;
      min = Math.max(H0 * 60, Math.min(H1 * 60 - dur, min));
      gs.hidden = false; gs.style.top = yOf(min) + 'px'; gs.style.height = Math.max(22, dur / 60 * HPX) + 'px'; gs.textContent = C.fromMin(min);
      drag.target = { kind: 'grid', day: grid.dataset.day, debut: C.fromMin(min) };
      autoScroll(grid.parentNode, y);
      return;
    }
    if (gs) gs.hidden = true;
    var day = under.closest('[data-drop="day"]');
    if (day) { day.classList.add('drop-hover'); drag.target = { kind: 'day', day: day.dataset.day }; return; }
    var tray = under.closest('[data-drop="tray"]');
    if (tray) { tray.classList.add('drop-hover'); drag.target = { kind: 'tray' }; return; }
    var grp = under.closest('[data-drop="list"]');
    if (grp) {
      var over = under.closest('.strip');
      drag.target = { kind: 'list', group: grp.dataset.group, before: over && over.dataset.id !== drag.id ? over.dataset.id : null, after: false };
      if (over) { var orr = over.getBoundingClientRect(); drag.target.after = y > orr.top + orr.height / 2; over.classList.add('drop-hover'); }
      else grp.classList.add('drop-hover');
    }
    autoScroll(null, y);
  }
  function autoScroll(box, y) {
    var edge = 60;
    if (box) { var r = box.getBoundingClientRect(); if (y < r.top + edge) box.scrollTop -= 12; else if (y > r.bottom - edge) box.scrollTop += 12; }
    if (y < edge) window.scrollBy(0, -12); else if (y > window.innerHeight - edge) window.scrollBy(0, 12);
  }
  function onPointerUp() {
    if (resize) { endResize(); return; }
    if (!drag) return;
    clearTimeout(drag.hold);
    var d = drag; drag = null;
    if (!d.started) return;
    d.ghost.remove(); d.el.classList.remove('is-dragging'); document.body.classList.remove('dragging');
    $all('.drop-hover').forEach(function (n) { n.classList.remove('drop-hover'); });
    var gs = $('.ghost-slot'); if (gs) gs.hidden = true;
    suppressClick = true; setTimeout(function () { suppressClick = false; }, 50);
    var t = getTask(d.id); if (!t || !d.target) return;
    var tg = d.target;
    if (tg.kind === 'grid') {
      var pr = S.plan.filter(function (r) { return r.tache_id === t.id && r.jour === tg.day && r.statut === 'propose'; });
      pr.forEach(function (r) { r.statut = 'accepte'; push('plan', r); });
      saveTask(t, { jour: tg.day, debut: tg.debut, statut: t.statut === 'En attente' ? 'À faire' : t.statut });
      toast('Placée ' + C.shortDate(tg.day) + ' à ' + tg.debut);
    } else if (tg.kind === 'day') {
      if (t.jour !== tg.day) saveTask(t, { jour: tg.day, debut: t.debut && !conflict(tg.day, t) ? t.debut : '' });
    } else if (tg.kind === 'tray') {
      if (t.jour || t.debut) saveTask(t, { jour: '', debut: '' });
    } else if (tg.kind === 'list') {
      reorder(t, tg);
    }
    render();
  }
  function conflict(day, t) {
    var a = C.toMin(t.debut), b = a + (C.num(t.duree_min) || 30);
    return dayTasks(day).some(function (o) { if (o.id === t.id || !o.debut) return false; var x = C.toMin(o.debut), y = x + (C.num(o.duree_min) || 30); return x < b && a < y; });
  }
  function reorder(t, tg) {
    var changes = {};
    if (ui.groupe === 'prio' && String(+t.prio) !== tg.group) changes.prio = +tg.group;
    if (ui.groupe === 'entite' && t.entite !== tg.group) changes.entite = tg.group;
    var list = S.taches.filter(function (x) { return x.id !== t.id && (ui.groupe === 'prio' ? String(+x.prio) === tg.group : x.entite === tg.group); })
      .sort(function (a, b) { return (C.num(a.ordre) || 0) - (C.num(b.ordre) || 0); });
    var idx = tg.before ? list.findIndex(function (x) { return x.id === tg.before; }) : list.length;
    if (tg.before && tg.after) idx++;
    list.splice(Math.max(0, idx), 0, t);
    list.forEach(function (x, i) {
      var o = (i + 1) * 10;
      if (x === t) { changes.ordre = o; }
      else if (C.num(x.ordre) !== o) { x.ordre = o; x.maj_le = nowIso(); push('tache', x); }
    });
    saveTask(t, changes, { silent: true });
    if (changes.prio || changes.entite) log(t, 'modifie', { detail: changes.prio ? 'priorité' : 'entité' });
  }
  var resize = null, suppressClick = false;
  function startResize(e, slot) {
    e.preventDefault();
    var t = getTask(slot.dataset.slot); if (!t) return;
    resize = { t: t, slot: slot, y0: e.clientY, h0: slot.offsetHeight, dur0: C.num(t.duree_min) || 30 };
    document.body.classList.add('dragging');
  }
  function moveResize(e) {
    e.preventDefault();
    var dur = Math.max(15, Math.round((resize.dur0 + (e.clientY - resize.y0) / HPX * 60) / 15) * 15);
    resize.dur = dur; resize.slot.style.height = Math.max(22, dur / 60 * HPX) + 'px';
    var lbl = resize.slot.querySelector('.strip-dur'); if (lbl) lbl.textContent = C.fmtDur(dur);
  }
  function endResize() {
    var r = resize; resize = null; document.body.classList.remove('dragging');
    suppressClick = true; setTimeout(function () { suppressClick = false; }, 50);
    if (r.dur && r.dur !== r.dur0) { saveTask(r.t, { duree_min: r.dur }, { action: 'modifie', detail: 'durée ' + r.dur0 + ' vers ' + r.dur }); }
    render();
  }

  /* Clics */
  document.addEventListener('click', function (e) {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
    var pop = $('#pop');
    if (!pop.hidden && !e.target.closest('#pop')) closePop();
    var a = e.target.closest('[data-act]'); if (!a) return;
    var act = a.dataset.act, stripEl = a.closest('.strip'), t = stripEl ? getTask(stripEl.dataset.id) : (a.dataset.id ? getTask(a.dataset.id) : null);
    switch (act) {
      case 'edit':
        var ps = a.closest('.is-proposed');
        if (ps) {
          var pl = S.plan.filter(function (r) { return r.id === ps.dataset.pid; })[0];
          openPop(a, '<div class="pop-title">' + esc((pl && pl.raison ? pl.raison + ', ' : '') + 'proposée à ' + (pl ? pl.debut : '')) + '</div><button class="pop-opt" data-act="plan-yes" data-pid="' + esc(ps.dataset.pid) + '">Accepter</button><button class="pop-opt" data-act="plan-no" data-pid="' + esc(ps.dataset.pid) + '">Refuser</button><button class="pop-opt" data-act="edit-id" data-id="' + esc(t.id) + '">Ouvrir la tâche</button>');
        } else if (t && !a.closest('#pop')) openEditor(t);
        break;
      case 'edit-id': closePop(); if (t) openEditor(t); break;
      case 'prio':
        openPop(a, '<div class="pop-title">Priorité</div>' + [1, 2, 3, 4].map(function (n) { return '<button class="pop-opt" data-act="set-prio" data-id="' + esc(t.id) + '" data-v="' + n + '"><i style="--e:var(--p' + n + ')"></i>' + C.PRIO_LABELS[n] + '</button>'; }).join(''));
        break;
      case 'ent':
        openPop(a, '<div class="pop-title">Entité</div>' + C.ENTITES.map(function (en) { return '<button class="pop-opt" data-act="set-ent" data-id="' + esc(t.id) + '" data-v="' + esc(en) + '"><i style="--e:var(--e-' + ENT_KEY[en] + ')"></i>' + esc(en) + '</button>'; }).join(''));
        break;
      case 'set-prio': saveTask(t, { prio: +a.dataset.v }, { action: 'modifie', detail: 'priorité' }); closePop(); render(); break;
      case 'set-ent': saveTask(t, { entite: a.dataset.v }, { action: 'modifie', detail: 'entité' }); closePop(); render(); break;
      case 'done': if (t) { if (timer && timer.id === t.id) finishTask(t, (Date.now() - timer.start) / 60000); else askDuration(t); } break;
      case 'start': if (t) startTask(t); break;
      case 'finish': if (t && timer) finishTask(t, (Date.now() - timer.start) / 60000); else if (t) askDuration(t); break;
      case 'stop': if (timer) { var rt = getTask(timer.id); timer = null; persist(); if (rt) saveTask(rt, { statut: 'À faire' }, { silent: true }); render(); } break;
      case 'dur-pick': $all('[data-act="dur-pick"]').forEach(function (b) { b.setAttribute('aria-pressed', b === a); }); $('#dur-custom').value = a.dataset.v; break;
      case 'dur-ok': if (t) { var v = C.num($('#dur-custom').value); if (v) { closeSheet(); finishTask(t, v); } } break;
      case 'close': closeSheet(); break;
      case 'delete': if (t && confirm('Supprimer « ' + t.titre + ' » ?')) { saveTask(t, { statut: 'Supprimée', jour: '', debut: '' }, { action: 'supprime' }); closeSheet(); toast('Tâche supprimée'); render(); } break;
      case 'rule-yes': decideRule(S._sugg[+a.dataset.i], true); break;
      case 'rule-no': decideRule(S._sugg[+a.dataset.i], false); break;
      case 'rules': showRules(); break;
      case 'rule-c': var rc = S.regles.filter(function (r) { return r.id === a.dataset.rid; })[0]; if (rc) { rc.statut = a.dataset.ok === '1' ? 'acceptee' : 'refusee'; rc.decide_le = nowIso(); push('regle', rc); toast(a.dataset.ok === '1' ? 'Règle appliquée' : 'Proposition ignorée'); render(); } break;
      case 'rule-off': var rr = S.regles.filter(function (r) { return r.id === a.dataset.rid; })[0]; if (rr) { rr.statut = 'refusee'; rr.decide_le = nowIso(); push('regle', rr); showRules(); } break;
      case 'ask': askClaude(); break;
      case 'ask-go': askGo(); break;
      case 'mood': $all('.face').forEach(function (b) { b.setAttribute('aria-checked', b === a); }); saveMood(+a.dataset.n); break;
      case 'mood-save': var sel = $('.face[aria-checked="true"]'); if (sel) saveMood(+sel.dataset.n, true); else toast('Choisis d\'abord une note'); break;
      case 'mode': ui.orgMode = a.dataset.mode; render(); break;
      case 'day': ui.orgDay = +a.dataset.delta === 0 ? today() : C.addDays(ui.orgDay, +a.dataset.delta); render(); break;
      case 'week': ui.orgDay = C.addDays(ui.orgDay, +a.dataset.delta); render(); break;
      case 'openday': ui.orgDay = a.dataset.day; ui.orgMode = 'jour'; render(); break;
      case 'propose': proposeLocal(); break;
      case 'plan-yes': case 'plan-no': var pr = S.plan.filter(function (r) { return r.id === a.dataset.pid; })[0]; if (pr) { acceptPlan(pr, act === 'plan-yes'); closePop(); toast(act === 'plan-yes' ? 'Placée à ' + pr.debut : 'Proposition retirée'); render(); } break;
      case 'plan-all': case 'plan-none': S.plan.filter(function (r) { return r.jour === ui.orgDay && r.statut === 'propose'; }).forEach(function (r) { acceptPlan(r, act === 'plan-all'); }); toast(act === 'plan-all' ? 'Plan accepté' : 'Plan refusé'); render(); break;
      case 'tray-ent': case 'list-ent': ui.filtre.entite = a.dataset.v; render(); break;
      case 'list-prio': ui.filtre.prio = +ui.filtre.prio === +a.dataset.v ? '' : a.dataset.v; render(); break;
      case 'statut': ui.filtre.statut = a.dataset.v; render(); break;
      case 'groupe': ui.groupe = a.dataset.v; render(); break;
      case 'settings': openSettings(); break;
      case 'unlink': cfg = null; LS.set('pp.cfg', null); S = LS.get('pp.demo', null) || demoState(); closeSheet(); load(); break;
      case 'new': openEditor(null); break;
    }
  });
  function saveMood(n, withToast) {
    var why = ($('#mood-why') || {}).value || '';
    push('humeur', { jour: today(), note: n, pourquoi: why.trim(), horodatage: nowIso() });
    if (withToast) toast('Journée notée');
  }

  document.addEventListener('submit', function (e) {
    var f = e.target; e.preventDefault();
    if (f.dataset.form === 'quick') {
      var q = $('#quick').value.trim(); if (!q) return;
      var p = C.parseQuick(q, today());
      var fields = { titre: p.titre || q };
      ['jour', 'debut', 'entite', 'type'].forEach(function (k) { if (p[k]) fields[k] = p[k]; });
      if (p.duree_min) fields.duree_min = p.duree_min; if (p.prio) fields.prio = p.prio;
      if (fields.debut && !fields.jour) fields.jour = today();
      if (!fields.type) fields.type = /relanc|rappel|appel/i.test(q) ? 'Relance' : 'Fond';
      if (!fields.duree_min) fields.duree_min = fields.type === 'Relance' ? 10 : 30;
      var t = createTask(fields);
      $('#quick').value = ''; $('#quick-preview').innerHTML = '';
      toast('Ajoutée : ' + t.titre); render(); setTimeout(function () { var i = $('#quick'); if (i) i.focus(); }, 0);
    } else if (f.dataset.form === 'edit') {
      var fd = new FormData(f), ch = {};
      ['titre', 'type', 'echeance', 'statut', 'jour', 'debut', 'contexte', 'entite'].forEach(function (k) { ch[k] = (fd.get(k) || '').toString(); });
      ch.prio = +fd.get('prio') || 2; ch.duree_min = C.num(fd.get('duree_min')) || 30;
      if (ch.debut && !ch.jour) ch.jour = today();
      var id = f.dataset.id, task = id ? getTask(id) : null;
      if (task) {
        var wasDone = task.statut === 'Fait';
        saveTask(task, ch, { action: 'modifie' });
        if (ch.statut === 'Fait' && !wasDone) { closeSheet(); askDuration(task); render(); return; }
      } else createTask(ch);
      closeSheet(); render();
    } else if (f.dataset.form === 'cfg') {
      var url = f.url.value.trim(), key = f.key.value.trim();
      if (!/^https:\/\/script\.google\.com\//.test(url)) { toast('L\'adresse doit commencer par https://script.google.com/'); return; }
      cfg = { url: url, key: key }; LS.set('pp.cfg', cfg);
      S = LS.get('pp.cache', null) || emptyState(); queue = [];
      closeSheet(); load().then(function () { if (ui.syncState === 'ok') toast('Base reliée : ' + S.taches.length + ' tâches'); });
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'quick') {
      var p = C.parseQuick(e.target.value, today()), bits = [];
      if (p.jour) bits.push(C.shortDate(p.jour)); if (p.debut) bits.push('à ' + p.debut); if (p.duree_min) bits.push(C.fmtDur(p.duree_min));
      if (p.entite) bits.push(p.entite); if (p.prio) bits.push(PRIO_NAME[p.prio]); if (p.type) bits.push(p.type);
      $('#quick-preview').textContent = bits.length ? 'Compris : ' + bits.join(', ') : '';
    } else if (e.target.id === 'search') {
      ui.filtre.q = e.target.value;
      clearTimeout(ui.st); ui.st = setTimeout(function () { var pos = e.target.selectionStart; render(); var s = $('#search'); if (s) { s.focus(); s.setSelectionRange(pos, pos); } }, 250);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePop();
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('strip-body')) openEditor(getTask(e.target.closest('.strip').dataset.id));
  });
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove, { passive: false });
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', function () { if (drag && drag.started) onPointerUp(); else if (drag) { clearTimeout(drag.hold); drag = null; } });
  document.addEventListener('contextmenu', function (e) { if (drag && drag.touch) e.preventDefault(); });
  document.addEventListener('touchmove', function (e) { if ((drag && drag.started) || resize) e.preventDefault(); }, { passive: false });

  function route() {
    var h = (location.hash || '#aujourdhui').slice(1);
    ui.view = ['aujourdhui', 'organisation', 'listes'].indexOf(h) === -1 ? 'aujourdhui' : h;
    closePop(); render(); window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('click', function (e) { var f = e.target.closest('[data-filter="retard"]'); if (f) { ui.filtre.statut = 'retard'; } }, true);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { load(); } });
  setInterval(function () { if (!document.hidden) { if (timer) renderTimerBar(); var nl = $('.nowline'); if (nl) nl.style.top = yOf(nowMin()) + 'px'; } }, 30000);
  setInterval(function () { if (!document.hidden && cfg && !drag && !resize && !$('#sheet').open) load(); }, 120000);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* hors ligne indisponible */ });
  route();
  load();
  window.__pp = { S: function () { return S; }, queue: function () { return queue; } };
})();
