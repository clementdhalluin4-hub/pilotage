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
    journee_debut: '09:00', journee_fin: '19:00', capacite_cours_min: '60', marge: '0.3',
    midi_debut: '12:00', midi_fin: '13:30', mot_cours: 'Cours',
    obligatoire: '09:00-12:00,14:00-18:00', lever: '07:00', coucher: '23:30', envoi_mail: '08:00', tel_debut: '17:00',
    repos_min: '90', additionnel_max_min: '180', additionnel_libre_max_min: '120', repas_soir_min: '45', trajet_min: ''
  };

  var cfg = LS.get('pp.cfg', null);
  var S = LS.get(cfg ? 'pp.cache' : 'pp.demo', null) || (cfg ? emptyState() : demoState());
  var queue = LS.get('pp.queue', []);
  var timer = LS.get('pp.timer', null);
  var inter = LS.get('pp.inter', null); // interstice en cours : { label, start, entite }
  var ui = { view: 'aujourdhui', orgDay: today(), dayRef: today(), orgMode: 'jour', filtre: { entite: '', prio: '', statut: 'actives', q: '' }, groupe: 'entite', syncState: cfg ? 'chargement' : 'demo',
    auto: {}, fresh: [], undo: null, pick: null, trayOpen: window.innerWidth > 860, focusTri: null };

  var ICON = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>',
    cross: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.6L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.6L20 16M20 20v-4h-4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>'
  };

  function P() { var o = {}; Object.keys(DEFAULT_PARAMS).forEach(function (k) { o[k] = DEFAULT_PARAMS[k]; }); Object.keys(S.parametres || {}).forEach(function (k) { if (S.parametres[k] !== '') o[k] = S.parametres[k]; }); return o; }
  function persist() { LS.set(cfg ? 'pp.cache' : 'pp.demo', S); LS.set('pp.queue', queue); LS.set('pp.timer', timer); LS.set('pp.inter', inter); }
  /* Changement de jour : l'app installée sur l'iPhone reste ouverte des jours en arrière-plan,
     la journée affichée suit donc la vraie date dès que l'on revient dessus. */
  function checkDay() {
    var t = today();
    if (ui.dayRef === t) return false;
    if (ui.orgDay === ui.dayRef || ui.orgDay < t) ui.orgDay = t;
    ui.dayRef = t; ui.auto = {};
    return true;
  }

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
    else if (op.type === 'parametre') { S.parametres = S.parametres || {}; S.parametres[d.cle] = d.valeur; }
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
      if (task.jour && task.jour < t && C.isPerso(task) && task.statut !== 'Fait' && task.statut !== 'Supprimée') {
        // Un temps perso passé reste sur son jour : on le considère comme tenu
        task.statut = 'Fait'; task.fait_le = task.jour + 'T23:59:00'; task.maj_le = nowIso(); push('tache', task);
        return;
      }
      if (task.jour && task.jour < t && task.statut !== 'Fait' && task.statut !== 'En attente' && task.statut !== 'Supprimée' && !C.isInterstice(task)) {
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

  /* Cours de l'université : salle et enseignant en sous-titre */
  function evCls(e) { return e.source === 'outlook' ? ' is-outlook' : (e.source === 'ecole' ? ' is-ecole' : ''); }
  function evInfo(e) { return e.source === 'ecole' ? [e.salle ? 'Salle ' + e.salle : '', e.prof || ''].filter(Boolean).join(', ') : ''; }

  /* Calculs du jour */
  function events(day) {
    return (S.evenements || []).filter(function (e) { return e.debut && C.ymd(new Date(e.debut)) === day; })
      .sort(function (a, b) { return new Date(a.debut) - new Date(b.debut); });
  }
  function dayTasks(day) {
    return S.taches.filter(function (t) { return t.jour === day && t.statut !== 'Supprimée' && !C.isInterstice(t); })
      .sort(function (a, b) { return (C.toMin(a.debut) == null ? 9999 : C.toMin(a.debut)) - (C.toMin(b.debut) == null ? 9999 : C.toMin(b.debut)); });
  }
  function dayInter(day) {
    return S.taches.filter(function (t) { return t.jour === day && C.isInterstice(t) && t.statut !== 'Supprimée'; })
      .sort(function (a, b) { return (C.toMin(a.debut) || 0) - (C.toMin(b.debut) || 0); });
  }
  // Temps de route appris : moyenne des interstices « Route » sur les jours travaillés des 3 dernières semaines
  function routeLearned() {
    var from = C.addDays(today(), -21), per = {};
    S.taches.forEach(function (t) { if (C.isInterstice(t) && C.norm(t.titre) === 'route' && t.jour >= from && t.jour < today() && C.weekday(t.jour) <= 5) per[t.jour] = (per[t.jour] || 0) + (C.num(t.duree_reelle_min) || C.num(t.duree_min) || 0); });
    var k = Object.keys(per); if (k.length < 3) return null;
    return Math.round(k.reduce(function (s, j) { return s + per[j]; }, 0) / k.length);
  }
  function moodOf(day) { var m = null; S.humeur.forEach(function (h) { if (h.jour === day) m = h; }); return m; }
  function budget(day) {
    var mv = moodOf(C.addDays(day, -1));
    return C.dayBudget(day, events(day).concat((S.evenements || []).filter(function (e) { return e.journee; })), S.taches, S.regles, P(),
      { humeurVeille: mv ? mv.note : null, routeMin: routeLearned() });
  }
  function dayLoad(day) {
    var B = budget(day);
    return { cap: B.conseille, charge: Math.round(B.travail / 5) * 5, cours: B.cours, B: B };
  }
  function active(t) { return (t.statut === 'À faire' || t.statut === 'En cours') && !C.isInterstice(t); }
  function overdue() { var d = today(); return S.taches.filter(function (t) { return active(t) && t.echeance && t.echeance < d; }); }
  function reportCount(id) { return S.journal.filter(function (e) { return e.tache_id === id && e.action === 'reporte'; }).length; }
  /* Suites : une mission est la tâche d'origine et ses étapes (suite_de = id d'origine) */
  function chainOf(t) {
    var root = C.rootId(t);
    return S.taches.filter(function (x) { return x.statut !== 'Supprimée' && (x.id === root || x.suite_de === root); })
      .sort(function (a, b) { return (C.num(a.etape) || 1) - (C.num(b.etape) || 1) || (a.cree_le < b.cree_le ? -1 : 1); });
  }
  function nextStep(t) {
    var ch = chainOf(t), e = C.num(t.etape) || 1, n = null;
    ch.forEach(function (x) { if (!n && x.id !== t.id && (C.num(x.etape) || 1) > e) n = x; });
    if (!n) S.journal.forEach(function (j) { if (j.tache_id === t.id && j.action === 'suite') n = { jour: String(j.detail || '').replace(/^suite le /, '') }; });
    return n;
  }

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
    if (C.num(t.etape) > 1) meta.push('<span class="m-suite">étape ' + esc(t.etape) + '</span>');
    var nx = nextStep(t); if (nx && t.statut === 'Fait') meta.push('<span class="m-suite">à continuer ' + esc(nx.jour ? 'le ' + C.shortDate(nx.jour) : 'plus tard') + '</span>');
    var pp = P();
    if (t.type === 'Prospection mail' && t.statut !== 'Fait') meta.push('<span>envoi programmé à ' + esc(pp.envoi_mail) + '</span>');
    if (t.type === 'Prospection tél' && t.debut && C.toMin(t.debut) < C.toMin(pp.tel_debut)) meta.push('<span class="m-late">avant ' + esc(pp.tel_debut) + '</span>');
    return '<div class="strip' + (t.statut === 'Fait' ? ' is-done' : '') + (C.isPerso(t) ? ' is-perso' : '') + (opts.compact ? ' is-compact' : '') + (opts.cls ? ' ' + opts.cls : '') + '" data-id="' + esc(t.id) + '" style="--p:var(--p' + prio + ');--e:var(--e-' + ent + ')"' + (opts.style ? ' data-style="1"' : '') + '>' +
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
    checkDay();
    var v = ui.view;
    $all('.nav a').forEach(function (a) { a.setAttribute('aria-current', a.dataset.view === v ? 'page' : 'false'); });
    var main = $('#main');
    if (v === 'aujourdhui' || (v === 'organisation' && ui.orgMode === 'jour' && ui.orgDay === today())) maybeAuto();
    var keepScroll = ui.view === ui.lastView && ui.orgDay === ui.lastDay;
    var gw = $('.grid-wrap'), gScroll = gw ? gw.scrollTop : null;
    if (v === 'organisation') main.innerHTML = viewOrganisation();
    else if (v === 'listes') main.innerHTML = viewListes();
    else main.innerHTML = viewAujourdhui();
    renderTimerBar();
    if (v === 'organisation' && ui.orgMode === 'jour') { if (keepScroll && gScroll != null && $('.grid-wrap')) $('.grid-wrap').scrollTop = gScroll; else scrollGridToNow(); }
    ui.lastView = v; ui.lastDay = ui.orgDay;
    if (ui.focusTri != null) {
      var cards = $all('.tri-card'), c = cards[Math.min(ui.focusTri, cards.length - 1)];
      if (c) c.focus({ preventScroll: true });
      ui.focusTri = null;
    }
    ui.fresh = [];
  }

  /* Tri des propositions : une liste verticale, ✓ pour placer, ✕ pour refuser.
     Chaque refus est remplacé automatiquement en fonction du temps libre restant. */
  function doneMinutes(d) { var m = 0; dayTasks(d).forEach(function (t) { if (t.statut === 'Fait' && C.isWork(t)) m += C.num(t.duree_reelle_min) || C.num(t.duree_min) || 0; }); return m; }
  function fromFor(d) { return d === today() ? Math.ceil(nowMin() / 5) * 5 : null; }
  function planById(id) { for (var i = 0; i < S.plan.length; i++) if (S.plan[i].id === id) return S.plan[i]; return null; }
  function proposals(d) {
    return S.plan.filter(function (r) {
      if (r.jour !== d || r.statut !== 'propose') return false;
      var t = getTask(r.tache_id); return t && active(t) && !(t.jour && t.debut);
    }).sort(function (a, b) { return C.toMin(a.debut) - C.toMin(b.debut); });
  }
  // Les propositions en attente occupent leur créneau, pour que les remplaçantes ne se chevauchent pas.
  function virtualTasks(d, skipPid) {
    var map = {};
    proposals(d).forEach(function (r) { if (r.id !== skipPid) map[r.tache_id] = r; });
    return S.taches.filter(function (t) { return t.statut !== 'Supprimée'; }).map(function (t) {
      var r = map[t.id];
      return r ? Object.assign({}, t, { jour: d, debut: r.debut, duree_min: C.num(r.duree_min) || t.duree_min }) : t;
    });
  }
  function refusedIds(d) { return S.plan.filter(function (r) { return r.jour === d && r.statut === 'refuse'; }).map(function (r) { return r.tache_id; }); }
  function freeOf(d, skipPid) { return C.freeSlots(d, S.evenements || [], virtualTasks(d, skipPid), P(), fromFor(d)); }
  function refill(d) {
    var res = C.proposePlan(d, virtualTasks(d), S.evenements || [], S.regles, P(), today(),
      { exclude: refusedIds(d), from: fromFor(d), extraUsed: d === today() ? doneMinutes(d) : 0, cap: budget(d).conseille });
    var ids = [];
    res.plan.forEach(function (r) {
      var id = uid('pl'); ids.push(id);
      push('plan', { id: id, jour: d, tache_id: r.tache_id, debut: r.debut, duree_min: r.duree_min, raison: r.raison, statut: 'propose', auteur: 'site', cree_le: nowIso() });
    });
    ui.fresh = ids;
    return { ids: ids, res: res };
  }
  // Le matin, la journée se propose toute seule : il ne reste qu'à trier.
  function maybeAuto() {
    var d = today();
    if (['ok', 'demo', 'envoi'].indexOf(ui.syncState) === -1 || ui.auto[d]) return;
    ui.auto[d] = true;
    if (C.weekday(d) > 5 || S.plan.some(function (r) { return r.jour === d; })) return;
    if (!S.taches.some(function (t) { return active(t) && !(t.jour && t.debut); })) return;
    refill(d);
  }
  function startOptions(d, dur, skipPid) {
    var out = [];
    freeOf(d, skipPid).forEach(function (f) {
      var m = f[0];
      while (m + dur <= f[1] && out.length < 24) { out.push(m); m = Math.floor(m / 15) * 15 + 15; }
    });
    return out;
  }
  function decide(pid, ok) {
    var r = planById(pid); if (!r) return;
    var t = getTask(r.tache_id), d = r.jour;
    var prev = t ? { jour: t.jour, debut: t.debut, duree_min: t.duree_min } : null;
    if (ok) {
      acceptPlan(r, true);
      toast('Placée à ' + r.debut, function () { r.statut = 'propose'; push('plan', r); if (t) saveTask(t, prev, { detail: 'annulation' }); render(); });
    } else {
      r.statut = 'refuse'; push('plan', r);
      var out = refill(d), first = out.ids.length ? getTask(planById(out.ids[0]).tache_id) : null;
      var msg = !out.ids.length ? 'Refusée. Plus rien ne rentre dans le temps restant' : (out.ids.length === 1 ? 'Remplacée par « ' + first.titre + ' »' : out.ids.length + ' nouvelles propositions');
      toast(msg, function () {
        out.ids.forEach(function (id) { var x = planById(id); if (x && x.statut === 'propose') { x.statut = 'remplace'; push('plan', x); } });
        r.statut = 'propose'; push('plan', r); render();
      });
    }
    render();
  }
  function acceptAll(d) {
    var done = [];
    proposals(d).forEach(function (r) { var t = getTask(r.tache_id); done.push({ r: r, t: t, prev: { jour: t.jour, debut: t.debut, duree_min: t.duree_min } }); acceptPlan(r, true); });
    if (!done.length) return;
    toast(done.length + ' tâches placées', function () { done.forEach(function (x) { x.r.statut = 'propose'; push('plan', x.r); saveTask(x.t, x.prev, { detail: 'annulation' }); }); render(); });
    render();
  }
  function placeAt(t, d, debut) {
    var prev = { jour: t.jour, debut: t.debut };
    S.plan.filter(function (r) { return r.tache_id === t.id && r.jour === d && r.statut === 'propose'; })
      .forEach(function (r) { r.statut = r.debut === debut ? 'accepte' : 'remplace'; push('plan', r); });
    saveTask(t, { jour: d, debut: debut, statut: t.statut === 'En attente' ? 'À faire' : t.statut });
    return prev;
  }
  function leave(card, dir, fn) {
    if (!card || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { fn(); return; }
    card.classList.add(dir > 0 ? 'is-out-yes' : 'is-out-no');
    setTimeout(fn, 170);
  }
  function triageHtml(d, opts) {
    opts = opts || {};
    var props = proposals(d), free = freeOf(d);
    var freeMin = free.reduce(function (s, f) { return s + f[1] - f[0]; }, 0);
    var h = '<section class="triage" data-day="' + d + '">' + (d === today() ? moodYesterdayHtml() : '') + '<div class="tri-head"><div><p class="kicker">Propositions</p><h2>' +
      (props.length ? props.length + ' à trier' : 'Tout est trié') + '</h2></div><div class="tri-tools">' +
      '<button class="btn sm ghost" data-act="propose" data-day="' + d + '" aria-label="Proposer à nouveau">' + ICON.refresh + '<span>Regénérer</span></button>' +
      (props.length > 1 ? '<button class="btn sm primary" data-act="plan-all" data-day="' + d + '">' + ICON.check + '<span>Tout placer</span></button>' : '') + '</div></div>';
    if (props.length) {
      h += '<div class="tri-list" role="list">' + props.map(triCard).join('') + '</div>' +
        '<p class="tri-hint"><span class="hint-touch">Glisse à droite pour placer, à gauche pour refuser.</span><span class="hint-keys">Flèche droite pour placer, flèche gauche pour refuser.</span> Un refus est remplacé automatiquement. Touche l\'heure pour la changer.</p>';
    } else {
      h += '<p class="tri-empty">' + (freeMin >= 15 ? 'Il te reste ' + C.fmtDur(freeMin) + ' de temps libre. Touche un créneau pour le remplir, ou regénère des propositions.' : 'Ta journée est pleine.') + '</p>';
    }
    if (free.length && opts.free !== false) {
      h += '<div class="free"><p class="kicker">Créneaux libres</p><div class="free-list">' + free.map(function (f) {
        return '<button class="fs-chip" data-act="gap" data-day="' + d + '" data-a="' + f[0] + '" data-b="' + f[1] + '"><b>' + C.fromMin(f[0]) + '</b><span>' + C.fromMin(f[1]) + '</span><em>' + C.fmtDur(f[1] - f[0]) + '</em></button>';
      }).join('') + '</div></div>';
    }
    return h + '</section>';
  }
  function triCard(r) {
    var t = getTask(r.tache_id), ent = ENT_KEY[t.entite] || 'p', prio = +t.prio || 3;
    var fresh = ui.fresh.indexOf(r.id) !== -1;
    return '<div class="tri-row" role="listitem"><div class="tri-bg" aria-hidden="true"><span class="bg-yes">' + ICON.check + 'Placer</span><span class="bg-no">Refuser' + ICON.cross + '</span></div>' +
      '<div class="tri-card' + (fresh ? ' is-new' : '') + '" tabindex="0" data-pid="' + esc(r.id) + '" style="--p:var(--p' + prio + ');--e:var(--e-' + ent + ')" aria-label="' + esc(t.titre) + ', proposée à ' + esc(r.debut) + '">' +
        '<button class="tri-time" data-act="tri-time" data-pid="' + esc(r.id) + '" aria-label="Changer l\'heure, ' + esc(r.debut) + '">' + esc(r.debut) + '</button>' +
        '<div class="tri-main" data-act="tri-open" data-pid="' + esc(r.id) + '"><div class="tri-title">' + esc(t.titre) + '</div><div class="tri-meta"><span class="tri-ent">' + esc(ENT_SHORT[t.entite] || t.entite) + '</span><span>' + esc(C.fmtDur(C.num(r.duree_min) || C.num(t.duree_min) || 30)) + '</span>' + (r.raison ? '<span class="tri-why">' + esc(r.raison) + '</span>' : '') + '</div></div>' +
        '<button class="tri-btn no" data-act="plan-no" data-pid="' + esc(r.id) + '" aria-label="Refuser">' + ICON.cross + '</button>' +
        '<button class="tri-btn yes" data-act="plan-yes" data-pid="' + esc(r.id) + '" aria-label="Placer">' + ICON.check + '</button>' +
      '</div></div>';
  }
  function timesHtml(m0List, act, attrs) {
    var first = m0List.length ? m0List[0] : Math.ceil(nowMin() / 5) * 5;
    return '<div class="pop-times">' + m0List.map(function (m) { return '<button class="pop-time" data-act="' + act + '" ' + attrs + ' data-v="' + C.fromMin(m) + '">' + C.fromMin(m) + '</button>'; }).join('') + '</div>' +
      '<div class="pop-precise"><span>Heure précise</span>' + timeSelect('pp', C.fromMin(first), false) + '<button class="btn sm primary" data-act="' + act + '" data-precise="1" ' + attrs + '>OK</button></div>';
  }
  /* Choix d'une heure par pas de 5 minutes : deux menus, l'heure puis les minutes */
  function timeSelect(name, value, allowEmpty) {
    var hv = value ? value.split(':')[0] : '', mv = value ? String(Math.round((+value.split(':')[1] || 0) / 5) * 5).padStart(2, '0') : '00';
    if (mv === '60') mv = '55';
    var hs = (allowEmpty ? '<option value=""' + (!value ? ' selected' : '') + '>Aucune</option>' : '');
    for (var h = 5; h <= 23; h++) { var hh = C.pad(h); hs += '<option value="' + hh + '"' + (hh === hv ? ' selected' : '') + '>' + hh + ' h</option>'; }
    var ms = '';
    for (var m = 0; m < 60; m += 5) { var mm = C.pad(m); ms += '<option value="' + mm + '"' + (mm === mv ? ' selected' : '') + '>' + mm + '</option>'; }
    return '<span class="tsel"><select name="' + name + '_h" aria-label="Heure">' + hs + '</select><b>:</b><select name="' + name + '_m" aria-label="Minutes">' + ms + '</select></span>';
  }
  function readTime(root, name) {
    var h = root.querySelector('[name="' + name + '_h"]'), m = root.querySelector('[name="' + name + '_m"]');
    return h && h.value ? h.value + ':' + (m ? m.value : '00') : '';
  }
  /* Humeur de la veille, à noter au moment de trier la journée */
  function moodYesterdayHtml() {
    var y = C.addDays(today(), -1);
    if (moodOf(y) || ui.moodSkip === y) return '';
    var labels = ['Très difficile', 'Difficile', 'Correcte', 'Facile', 'Très facile'];
    return '<div class="mood-y"><div class="mood-y-head"><p class="kicker">Hier, ' + esc(C.longDate(y)) + '</p><button class="link sm" data-act="mood-skip">Plus tard</button></div><h3>Comment s\'est passée ta journée d\'hier ?</h3><input id="mood-y-why" class="mood-y-why" placeholder="Pourquoi ? (facultatif)" autocomplete="off"><div class="faces sm" role="radiogroup" aria-label="Note de la veille">' +
      [1, 2, 3, 4, 5].map(function (n) { return '<button role="radio" aria-checked="false" class="face" data-act="mood-y" data-n="' + n + '" aria-label="' + labels[n - 1] + '">' + face(n) + '<span>' + labels[n - 1] + '</span></button>'; }).join('') +
      '</div></div>';
  }
  function placePop(anchor, t, d) {
    var dur = C.num(t.duree_min) || 30, opts = startOptions(d, dur);
    openPop(anchor, '<div class="pop-title">Placer ' + (d === today() ? 'aujourd\'hui' : C.shortDate(d)) + ', ' + C.fmtDur(dur) + '</div>' +
      (opts.length ? timesHtml(opts, 'place-at', 'data-id="' + esc(t.id) + '" data-day="' + d + '"') : '<p class="pop-none">Aucun créneau libre de ' + C.fmtDur(dur) + '.</p>') +
      '<button class="pop-opt" data-act="edit-id" data-id="' + esc(t.id) + '">Modifier la tâche</button>');
  }

  /* Créneau vers tâches : on choisit l'heure, puis le titre dans une liste */
  function openPicker(d, a, b) { ui.pick = { d: d, a: a, b: b, q: '' }; openSheet(pickerHtml(), { noFocus: true }); }
  function pickerHtml() {
    var k = ui.pick, room = k.b - k.a;
    return '<div class="pick-head"><p class="kicker">' + (k.d === today() ? 'Aujourd\'hui' : esc(cap1(C.longDate(k.d)))) + '</p><h2>Placer à ' + C.fromMin(k.a) + '</h2><p class="muted">Libre jusqu\'à ' + C.fromMin(k.b) + ', soit ' + C.fmtDur(room) + '.</p></div>' +
      '<div class="pick-tools"><input id="pick-q" type="search" placeholder="Filtrer par titre" autocomplete="off" aria-label="Filtrer les tâches" value="' + esc(k.q) + '"><button class="btn sm" data-act="pick-new">' + ICON.plus + '<span>Nouvelle</span></button></div>' +
      '<div id="pick-list" class="pick-list">' + pickList() + '</div><div class="row-actions"><button class="btn" data-act="close">Fermer</button></div>';
  }
  function pickList() {
    var k = ui.pick, room = k.b - k.a, d = today();
    var cands = S.taches.filter(function (t) { return active(t) && !(t.jour && t.debut) && (!k.q || C.norm(t.titre).indexOf(C.norm(k.q)) !== -1); })
      .sort(function (a, b) { return C.rank(a, d, P()) - C.rank(b, d, P()); });
    var proposedIds = proposals(k.d).map(function (r) { return r.tache_id; });
    function item(t) {
      var dur = C.num(t.duree_min) || 30;
      return '<button class="pick-item' + (dur > room ? ' is-long' : '') + '" data-act="pick" data-id="' + esc(t.id) + '" style="--p:var(--p' + (+t.prio || 3) + ');--e:var(--e-' + (ENT_KEY[t.entite] || 'p') + ')"><i class="pi-p"></i><span class="pi-title">' + esc(t.titre) + (proposedIds.indexOf(t.id) !== -1 ? '<small>proposée</small>' : '') + '</span><span class="pi-ent">' + esc(ENT_SHORT[t.entite] || t.entite) + '</span><span class="pi-dur">' + C.fmtDur(dur) + '</span></button>';
    }
    var fit = cands.filter(function (t) { return (C.num(t.duree_min) || 30) <= room; }), long = cands.filter(function (t) { return (C.num(t.duree_min) || 30) > room; });
    if (!cands.length) return '<p class="empty">' + (k.q ? 'Aucune tâche ne correspond.' : 'Toutes tes tâches sont placées.') + '</p>';
    return fit.map(item).join('') + (long.length ? '<p class="pick-sub">Plus longues que le créneau</p>' + long.map(item).join('') : '');
  }
  function pickTask(t) {
    var k = ui.pick, dur = C.num(t.duree_min) || 30, debut = C.fromMin(k.a), prev = placeAt(t, k.d, debut);
    toast('« ' + t.titre + ' » placée à ' + debut, function () { saveTask(t, prev, { detail: 'annulation' }); render(); });
    k.a += dur;
    if (k.b - k.a >= 10) { $('#sheet .sheet-body').innerHTML = pickerHtml(); }
    else closeSheet();
    render();
  }

  function viewAujourdhui() {
    var d = today(), p = P(), L = dayLoad(d), B = L.B, tasks = dayTasks(d), evs = events(d);
    var phrase;
    if (B.weekend) phrase = 'Week-end : aucun travail obligatoire.' + (B.travail ? ' Tu as prévu ' + C.fmtDur(B.travail) + ' de travail.' : '') + ' Si tu veux avancer, jusqu\'à ' + C.fmtDur(B.conseilAdd) + ' sans entamer ton repos.';
    else if (B.cours) phrase = 'Journée de cours : ' + C.fmtDur(B.coursMin) + ' de présence obligatoire. Travail conseillé en plus : ' + C.fmtDur(B.conseilAdd) + (B.travail ? ', ' + C.fmtDur(B.travail) + ' prévues.' : '.');
    else phrase = 'Journée de travail : ' + C.fmtDur(B.obligatoire) + ' obligatoires, conseillé jusqu\'à ' + C.fmtDur(B.conseille) + ' de travail. ' + (B.travail ? C.fmtDur(B.travail) + ' prévues pour l\'instant.' : 'Rien n\'est encore placé.');
    var alertes = [];
    if (B.allege) alertes.push('Journée d\'hier notée difficile : le travail en plus conseillé est réduit de moitié.');
    if (B.depasse) alertes.push('Au-delà du conseillé : ' + C.fmtDur(B.travail - B.conseille) + ' de plus, pris sur ton repos ou tes projets.');
    if (B.horsSommeil) alertes.push('Une tâche empiète sur ton sommeil (coucher ' + esc(p.coucher) + ', lever ' + esc(p.lever) + ').');

    var now = nowMin(), running = timer ? getTask(timer.id) : null, current = null, late = false, nextTask = null;
    tasks.forEach(function (t) {
      if (!C.isWork(t) || t.statut === 'Fait' || !t.debut) return;
      var a = C.toMin(t.debut);
      if (a <= now && !current) current = t;
      else if (a > now && !nextTask) nextTask = t;
    });
    if (current) late = now - C.toMin(current.debut) > 5;
    var focus = running || current || nextTask;

    var rows = [];
    evs.forEach(function (e) {
      var s = new Date(e.debut), f = new Date(e.fin);
      rows.push({ m: e.journee ? -1 : s.getHours() * 60 + s.getMinutes(), html: '<div class="agenda-row ev"><span class="t">' + (e.journee ? 'Journée' : C.pad(s.getHours()) + ':' + C.pad(s.getMinutes())) + '</span><div class="ev-box' + evCls(e) + '"><span>' + (e.source === 'ecole' ? '<i class="ev-tag">Cours</i>' : '') + esc(e.titre) + (evInfo(e) ? '<small class="ev-info">' + esc(evInfo(e)) + '</small>' : '') + '</span><span class="ev-end">' + (e.journee ? '' : 'jusqu\'à ' + C.pad(f.getHours()) + ':' + C.pad(f.getMinutes())) + '</span></div></div>' });
    });
    if (!B.weekend && p.midi_debut) rows.push({ m: C.toMin(p.midi_debut), html: '<div class="agenda-row"><span class="t">' + esc(p.midi_debut) + '</span><div class="protect">Midi protégé jusqu\'à ' + esc(p.midi_fin) + '</div></div>' });
    tasks.forEach(function (t) { rows.push({ m: t.debut ? C.toMin(t.debut) : 2000, html: '<div class="agenda-row"><span class="t">' + (t.debut ? esc(t.debut) : 'Sans heure') + '</span>' + strip(t, { check: t.statut !== 'Fait' }) + '</div>' }); });
    dayInter(d).forEach(function (t) { rows.push({ m: C.toMin(t.debut) || 0, html: '<div class="agenda-row"><span class="t">' + esc(t.debut) + '</span><div class="inter-row"><span>' + esc(t.titre) + '</span><em>' + C.fmtDur(C.num(t.duree_reelle_min) || C.num(t.duree_min)) + '</em><button class="link sm" data-act="inter-del" data-id="' + esc(t.id) + '" aria-label="Retirer cet interstice">Retirer</button></div></div>' }); });
    rows.sort(function (a, b) { return a.m - b.m; });

    var od = overdue();
    var sugg = C.suggestions(C.stats(S.journal, p, d), S.regles, p).slice(0, 3);
    var accepted = S.regles.filter(function (r) { return r.statut === 'acceptee'; }).length;
    var proposes = proposals(d).length;
    var mood = moodOf(d);

    var h = '';
    h += '<section class="hero"><p class="hero-kicker">Aujourd\'hui</p><h1>' + esc(cap1(C.longDate(d))) + '</h1><p class="hero-line">' + esc(phrase) + '</p>' + ribbonHtml(d, B) +
      (alertes.length ? '<div class="alerts">' + alertes.map(function (x) { return '<p>' + x + '</p>'; }).join('') + '</div>' : '') + '</section>';

    if (focus) {
      var t = focus, title = running ? 'En cours' : (current ? 'Tâche actuelle' : 'Ensuite');
      h += '<section class="block now"><div class="block-head"><h2>' + title + '</h2>' + (late && !running ? '<span class="late-tag">Prévue à ' + esc(current.debut) + ', ' + C.fmtDur(now - C.toMin(current.debut)) + ' de retard</span>' : '') + '</div>' + strip(t, { time: true }) +
        '<div class="row-actions">' + (running ? '<button class="btn primary" data-act="finish" data-id="' + esc(t.id) + '">J\'ai terminé</button><button class="btn" data-act="suite" data-id="' + esc(t.id) + '">Suite le…</button><button class="btn" data-act="stop">Arrêter le chrono</button>'
          : '<button class="btn primary" data-act="start-now" data-id="' + esc(t.id) + '">' + (current ? 'Commencer maintenant' : 'Commencer') + '</button><button class="btn" data-act="done" data-id="' + esc(t.id) + '">Déjà faite</button><button class="btn" data-act="suite" data-id="' + esc(t.id) + '">Suite le…</button>') + '</div>' +
        (current && late && !running ? '<p class="muted small">Commencer maintenant recale cette tâche à l\'heure actuelle et décale les suivantes de la journée.</p>' : '') + '</section>';
    }
    if (proposes) h += triageHtml(d, { free: false });
    else { var my = moodYesterdayHtml(); if (my) h += '<section class="block triage">' + my + '</section>'; }

    h += interBlockHtml();

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

  /* Schéma de la journée sur 24 h : ce que la journée contient, sans rapport écrit */
  var CAT = {
    sommeil: ['Sommeil', 'var(--c-sleep)'], travail: ['Travail', 'var(--c-work)'], cours: ['Cours', 'var(--cyan)'],
    revision: ['Révision', 'var(--e-m)'], projets: ['Projets perso', 'var(--e-p)'], sport: ['Sport', 'var(--e-s)'],
    social: ['Social', 'var(--e-so)'], perso: ['Temps perso', 'var(--c-perso)'], interstices: ['Interstices', 'var(--c-inter)'],
    agenda: ['Agenda', 'var(--c-agenda)'], repas: ['Repas', 'var(--c-meal)'], libre: ['Libre', 'transparent']
  };
  function ribbonHtml(d, B) {
    var segs = [], p = P();
    function add(a, b, cat, title) { a = Math.max(0, a); b = Math.min(1440, b); if (b > a) segs.push({ a: a, b: b, cat: cat, title: title }); }
    if (B.coucher > B.lever) { add(0, B.lever, 'sommeil', 'Sommeil'); add(B.coucher, 1440, 'sommeil', 'Sommeil'); }
    else add(B.coucher, B.lever, 'sommeil', 'Sommeil');
    if (!B.weekend) add(C.toMin(p.midi_debut), C.toMin(p.midi_fin), 'repas', 'Midi');
    events(d).forEach(function (e) { if (e.journee) return; var s = new Date(e.debut), f = new Date(e.fin); add(s.getHours() * 60 + s.getMinutes(), f.getHours() * 60 + f.getMinutes(), e.source === 'ecole' ? 'cours' : 'agenda', e.titre); });
    dayTasks(d).concat(dayInter(d)).forEach(function (t) {
      if (!t.debut) return; var a = C.toMin(t.debut), dur = t.statut === 'Fait' ? (C.num(t.duree_reelle_min) || C.num(t.duree_min) || 30) : (C.num(t.duree_min) || 30);
      add(a, a + dur, C.category(t), t.titre);
    });
    var html = '<div class="ribbon" role="img" aria-label="Schéma de la journée sur 24 heures">' +
      B.obligSpans.map(function (r) { return '<i class="rb-oblig" style="left:' + (r[0] / 14.4) + '%;width:' + ((r[1] - r[0]) / 14.4) + '%"></i>'; }).join('') +
      segs.map(function (g) { return '<i class="rb-seg" title="' + esc(g.title + ', ' + C.fromMin(g.a) + '–' + C.fromMin(g.b)) + '" style="left:' + (g.a / 14.4) + '%;width:' + ((g.b - g.a) / 14.4) + '%;--c:' + CAT[g.cat][1] + '"></i>'; }).join('') +
      (d === today() ? '<i class="rb-now" style="left:' + (nowMin() / 14.4) + '%"></i>' : '') +
      '</div><div class="rb-ticks"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>24 h</span></div>';
    var leg = [
      ['travail', B.travail, (B.weekend ? '' : 'sur ' + C.fmtDur(B.conseille) + ' conseillées')],
      ['cours', B.coursMin, ''], ['revision', B.revision, B.cibleRevision ? 'objectif ' + C.fmtDur(B.cibleRevision) : ''],
      ['projets', B.projets, ''], ['sport', B.sport, ''], ['social', B.social, ''], ['perso', B.perso, ''],
      ['interstices', B.interstices, ''], ['sommeil', B.sommeil, ''], ['libre', B.libre, '']
    ].filter(function (x) { return x[1] > 0 || x[0] === 'travail'; });
    html += '<div class="rb-legend">' + leg.map(function (x) {
      return '<span class="rb-key' + (x[0] === 'travail' && B.depasse ? ' is-over' : '') + '"><i style="--c:' + CAT[x[0]][1] + '"></i>' + CAT[x[0]][0] + ' <b>' + C.fmtDur(x[1]) + '</b>' + (x[2] ? ' <em>' + x[2] + '</em>' : '') + '</span>';
    }).join('') + '</div>';
    return html;
  }

  /* Interstices : café, route, appel reçu, chronométrés ou notés après coup */
  function interBlockHtml() {
    var h = '<section class="block inter"><div class="block-head"><h2>Interstices</h2><button class="link" data-act="inter-late">Noter après coup</button></div>';
    if (inter) h += '<p class="muted">En cours : ' + esc(inter.label) + ' depuis ' + C.fmtDur(Math.max(0, Math.round((Date.now() - inter.start) / 60000))) + '. Termine-le dans la barre du bas.</p>';
    h += '<div class="chips inter-chips">' + C.INTERSTICES.map(function (l) { return '<button class="chip" data-act="inter-go" data-v="' + esc(l) + '"' + (inter && inter.label === l ? ' aria-pressed="true"' : '') + '>' + esc(l) + '</button>'; }).join('') +
      '<button class="chip" data-act="perso-new">' + ICON.plus + 'Temps perso</button></div>';
    var list = dayInter(today()), tot = list.reduce(function (s, t) { return s + (C.num(t.duree_reelle_min) || C.num(t.duree_min) || 0); }, 0);
    h += '<p class="muted small">' + (list.length ? list.length + ' aujourd\'hui, ' + C.fmtDur(tot) + ' au total. Ils sont retirés du chrono de la tâche en cours.' : 'Touche un interstice quand il commence, puis Terminé quand il s\'arrête.') + '</p>';
    return h + '</section>';
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
      h += '<div class="daynav"><button class="icon" data-act="day" data-delta="-1" aria-label="Jour précédent">‹</button><h1>' + esc(cap1(C.longDate(d))) + '</h1><button class="icon" data-act="day" data-delta="1" aria-label="Jour suivant">›</button>' + todayMark(d) + '</div>';
      h += '<p class="hero-line">' + (L.cours ? 'Jour de cours. ' : '') + (L.B.weekend ? 'Week-end. ' : '') + C.fmtDur(L.charge) + ' de travail prévues, conseillé jusqu\'à ' + C.fmtDur(L.cap) + ' de travail' + (L.charge > L.cap ? ' : au-delà du conseillé.' : '.') + '</p>' + ribbonHtml(d, L.B);
      h += '</section>';
      h += '<div class="org"><div class="org-side">' + triageHtml(d) + trayHtml(d) + '<button class="btn wide ghost" data-act="ask">Demander à Claude</button></div>' + gridHtml(d) + '</div>';
    } else {
      var mon = C.mondayOf(d);
      h += '<div class="daynav"><button class="icon" data-act="week" data-delta="-7" aria-label="Semaine précédente">‹</button><h1>Semaine du ' + esc(C.longDate(mon).replace(/^lundi /, '')) + '</h1><button class="icon" data-act="week" data-delta="7" aria-label="Semaine suivante">›</button>' + (C.mondayOf(today()) !== mon ? '<button class="today-mark is-link" data-act="day" data-delta="0">Aujourd\'hui</button>' : '') + '</div></section>';
      h += weekHtml(mon);
    }
    return h;
  }
  // Repère « Aujourd'hui » toujours visible : pastille quand on y est, lien pour y revenir sinon
  function todayMark(d) {
    return d === today() ? '<span class="today-mark">Aujourd\'hui</span>' : '<button class="today-mark is-link" data-act="day" data-delta="0">Aujourd\'hui</button>';
  }
  function trayHtml(d) {
    var f = ui.filtre;
    var noHour = S.taches.filter(function (t) { return t.jour === d && !t.debut && active(t); });
    var toPlace = S.taches.filter(function (t) { return active(t) && !t.jour && (!f.entite || t.entite === f.entite); })
      .sort(function (a, b) { return C.rank(a, today(), P()) - C.rank(b, today(), P()); });
    var h = '<aside class="tray' + (ui.trayOpen ? ' is-open' : '') + '" data-drop="tray"><button class="tray-toggle" data-act="tray-toggle" aria-expanded="' + ui.trayOpen + '"><span class="kicker">Réserve</span><h2>À placer <span class="count">' + toPlace.length + '</span></h2>' + ICON.chevron + '</button>';
    if (!ui.trayOpen) return h + '</aside>';
    h += '<p class="tray-tip">Touche une tâche pour choisir son heure, ou fais-la glisser sur la grille.</p>' + entChips(f.entite, 'tray-ent') + '<div class="tray-list">';
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
      h += '<div class="ev-block' + evCls(e) + '" style="top:' + yOf(a) + 'px;height:' + Math.max(18, yOf(b) - yOf(a)) + 'px" title="' + esc(e.titre + (evInfo(e) ? ', ' + evInfo(e) : '')) + '"><span>' + esc(e.titre) + '</span>' + (evInfo(e) ? '<small class="ev-info">' + esc(evInfo(e)) + '</small>' : '') + '</div>';
    });
    freeOf(d).forEach(function (f) {
      if (f[1] - f[0] < 15) return;
      h += '<button class="gap" data-act="gap" data-day="' + d + '" data-a="' + f[0] + '" data-b="' + f[1] + '" style="top:' + (yOf(f[0]) + 2) + 'px;height:' + Math.max(20, yOf(f[1]) - yOf(f[0]) - 4) + 'px" aria-label="Créneau libre de ' + C.fromMin(f[0]) + ' à ' + C.fromMin(f[1]) + ', le remplir"><span>' + ICON.plus + 'Libre, ' + C.fmtDur(f[1] - f[0]) + '</span></button>';
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
    dayInter(d).forEach(function (t) {
      var a = C.toMin(t.debut); if (a === null) return;
      var dur = C.num(t.duree_reelle_min) || C.num(t.duree_min) || 5;
      h += '<div class="inter-block" style="top:' + yOf(a) + 'px;height:' + Math.max(6, dur / 60 * HPX) + 'px" title="' + esc(t.titre + ', ' + C.fmtDur(dur)) + '"><span>' + esc(t.titre) + '</span></div>';
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
      h += '<div class="wday' + (d === today() ? ' is-today' : '') + '" data-drop="day" data-day="' + d + '"><div class="wday-head">' + (d === today() ? '<span class="today-mark sm">Aujourd\'hui</span>' : '') + '<button class="link" data-act="openday" data-day="' + d + '">' + esc(cap1(C.shortDate(d))) + '</button><span class="muted">' + (L.cap || L.charge ? C.fmtDur(L.charge) + ' sur ' + C.fmtDur(L.cap) + ' conseillées' : '') + '</span></div>' +
        (L.cap ? '<div class="gauge sm' + (L.charge > L.cap ? ' is-over' : '') + '"><div class="gauge-fill" style="width:' + pct + '%"></div></div>' : '');
      events(d).forEach(function (e) { var s = new Date(e.debut); h += '<div class="wev' + evCls(e) + '">' + (e.journee ? '' : C.pad(s.getHours()) + ':' + C.pad(s.getMinutes()) + ' ') + esc(e.titre) + (e.salle ? '<small class="ev-info">' + esc(e.salle) + '</small>' : '') + '</div>'; });
      dayTasks(d).forEach(function (t) { h += strip(t, { compact: true, time: true }); });
      h += '</div>';
    }
    return h + '</div><p class="muted center">Glisse une tâche d\'un jour à l\'autre. Ouvre un jour pour la placer à l\'heure.</p>';
  }

  /* Listes */
  function viewListes() {
    var f = ui.filtre, d = today();
    var list = S.taches.filter(function (t) {
      if (t.statut === 'Supprimée' || C.isInterstice(t)) return false;
      if (f.statut === 'actives' && !active(t)) return false;
      if (f.statut === 'attente' && t.statut !== 'En attente') return false;
      if (f.statut === 'faites' && t.statut !== 'Fait') return false;
      if (f.statut === 'retard' && !(active(t) && t.echeance && t.echeance < d)) return false;
      if (f.entite && t.entite !== f.entite) return false;
      if (f.prio && +t.prio !== +f.prio) return false;
      if (f.q && C.norm(t.titre + ' ' + (t.contexte || '')).indexOf(C.norm(f.q)) === -1) return false;
      return true;
    });
    var h = '<section class="org-head"><h1>Listes</h1><form class="quick" data-form="quick"><input id="quick" autocomplete="off" placeholder="Ajouter : relance fournisseur demain 10 min 1001F p3" aria-label="Ajouter une tâche"><button class="btn primary" type="submit">Ajouter</button></form><p class="quick-tip">Écris une phrase et touche Ajouter, ou touche Ajouter sans rien écrire pour ouvrir la fiche complète.</p><div id="quick-preview" class="quick-preview"></div>';
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

  /* Chrono : tâche en cours et interstice en cours, une ligne chacun */
  function renderTimerBar() {
    var bar = $('#timerbar');
    var t = timer ? getTask(timer.id) : null;
    if (!t && !inter) { bar.hidden = true; return; }
    bar.hidden = false;
    var h = '';
    if (inter) {
      var ie = Math.max(0, Math.round((Date.now() - inter.start) / 60000));
      h += '<div class="tb-row is-inter"><span class="tb-dot"></span><span class="tb-title">Interstice : ' + esc(inter.label) + '</span><span class="tb-time">' + C.fmtDur(ie) + '</span><button class="btn sm" data-act="inter-cancel">Annuler</button><button class="btn primary sm" data-act="inter-stop">Terminé</button></div>';
    }
    if (t) {
      var el = Math.max(0, Math.round((Date.now() - timer.start) / 60000));
      h += '<div class="tb-row"><span class="tb-dot"></span><span class="tb-title">' + esc(t.titre) + '</span><span class="tb-time">' + C.fmtDur(el) + ' sur ' + C.fmtDur(C.num(t.duree_min) || 30) + '</span><button class="btn primary sm" data-act="finish" data-id="' + esc(t.id) + '">J\'ai terminé</button></div>';
    }
    bar.innerHTML = h;
  }
  function startTask(t) {
    if (timer && timer.id !== t.id) { var prev = getTask(timer.id); if (prev && prev.statut === 'En cours') saveTask(prev, { statut: 'À faire' }, { silent: true }); }
    timer = { id: t.id, start: Date.now() }; persist();
    saveTask(t, { statut: 'En cours' }, { action: 'commence' });
    if (!t.jour || !t.debut) saveTask(t, { jour: today(), debut: fromNowRounded() });
    toast('Chrono lancé pour « ' + t.titre + ' »');
    render();
  }
  /* Commencer maintenant : la tâche ratée est recalée à l'heure actuelle, les suivantes glissent juste après */
  function startNow(t) {
    var d = today(), n = Math.floor(nowMin() / 5) * 5;
    if (t.jour !== d || !t.debut || C.toMin(t.debut) === n) { startTask(t); return; }
    var late = n > C.toMin(t.debut);
    var moves = late ? C.cascade(d, t.id, n, S.taches, S.evenements || [], P()) : [];
    var undo = [{ t: t, debut: t.debut }];
    saveTask(t, { debut: C.fromMin(n) }, { detail: late ? 'commencée en retard' : 'commencée en avance' });
    moves.forEach(function (m) { var x = getTask(m.id); if (!x) return; undo.push({ t: x, debut: x.debut }); saveTask(x, { debut: m.vers }, { detail: 'recalage après retard' }); });
    timer = { id: t.id, start: Date.now() }; persist();
    saveTask(t, { statut: 'En cours' }, { action: 'commence' });
    toast('Chrono lancé' + (moves.length ? ', ' + moves.length + ' tâche' + (moves.length > 1 ? 's décalées' : ' décalée') : ''), function () {
      timer = null; persist();
      undo.forEach(function (u) { saveTask(u.t, { debut: u.debut, statut: 'À faire' }, { detail: 'annulation' }); });
      render();
    });
    render();
  }
  function fromNowRounded() { return C.fromMin(Math.floor(nowMin() / 5) * 5); }
  function finishTask(t, reel, quiet) {
    if (timer && timer.id === t.id) { timer = null; persist(); }
    var changes = { statut: 'Fait', fait_le: nowIso(), duree_reelle_min: Math.max(1, Math.round(reel)) };
    if (!t.jour) { changes.jour = today(); }
    Object.assign(t, changes); t.maj_le = nowIso(); push('tache', t);
    log(t, 'fait', { duree_reelle: Math.max(1, Math.round(reel)) });
    if (!quiet) toast(C.isPerso(t) ? 'Temps perso fait' : 'Faite en ' + C.fmtDur(reel) + ' (prévu ' + C.fmtDur(C.num(t.duree_min) || 30) + ')');
    render();
  }
  function askDuration(t) {
    if (C.isPerso(t)) { finishTask(t, C.num(t.duree_min) || 30); return; }
    var plan = C.num(t.duree_min) || 30;
    var opts = [0.5, 0.75, 1, 1.5, 2].map(function (k) { return Math.max(5, Math.round(plan * k / 5) * 5); })
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    openSheet('<h2>Combien de temps ça t\'a pris ?</h2><p class="muted">' + esc(t.titre) + ', prévu ' + C.fmtDur(plan) + '. Cette mesure sert à corriger tes estimations.</p><div class="chips big">' +
      opts.map(function (v) { return '<button class="chip" data-act="dur-pick" data-v="' + v + '" aria-pressed="' + (v === plan) + '">' + C.fmtDur(v) + '</button>'; }).join('') +
      '</div><label class="field"><span>Autre durée, en minutes</span><input id="dur-custom" type="number" inputmode="numeric" min="1" value="' + plan + '"></label><div class="row-actions"><button class="btn primary" data-act="dur-ok" data-id="' + esc(t.id) + '">Valider</button><button class="btn" data-act="dur-suite" data-id="' + esc(t.id) + '">Valider, avec une suite</button><button class="btn" data-act="close">Annuler</button></div>');
  }

  /* Suite de mission : l'étape du jour est faite, la mission continue à une autre date (ce n'est pas un report) */
  function baseTitle(t) { return String(t.titre || '').replace(/^(suite|retour|étape \d+)\s*:\s*/i, ''); }
  function openSuite(t, reel) {
    var d = today(), nextMon = C.addDays(C.mondayOf(d), 7);
    var spent = reel != null ? Math.max(1, Math.round(reel)) : (C.num(t.duree_min) || 30);
    var choices = [[C.addDays(d, 1), 'Demain'], [C.addDays(d, 2), 'Après-demain'], [nextMon, 'Lundi prochain']];
    openSheet('<h2>Suite de la mission</h2><p class="muted">« ' + esc(t.titre) + ' » est marquée faite pour aujourd\'hui. La mission continue à la date choisie, sans compter comme un report.</p>' +
      '<form data-form="suite" data-id="' + esc(t.id) + '">' +
      '<label class="field"><span>Prochaine étape</span><input name="titre" required value="' + esc('Suite : ' + baseTitle(t)) + '"></label>' +
      '<div class="field"><span>À continuer le</span><div class="chips">' + choices.map(function (c, i) { return '<label class="chip"><input type="radio" name="jour_choix" value="' + c[0] + '"' + (i === 0 ? ' checked' : '') + '>' + c[1] + ' <small>' + esc(C.shortDate(c[0])) + '</small></label>'; }).join('') +
      '<label class="chip"><input type="radio" name="jour_choix" value="autre">Autre date</label></div><input name="jour_autre" type="date" min="' + C.addDays(d, 1) + '" aria-label="Autre date"></div>' +
      '<div class="field-row"><div class="field"><span>À (facultatif)</span>' + timeSelect('debut', '', true) + '</div>' +
      '<label class="field"><span>Durée prévue (min)</span><input name="duree_min" type="number" inputmode="numeric" min="5" step="5" value="' + (t.type === 'Relance' || t.type === 'Rapide' ? 10 : (C.num(t.duree_min) || 30)) + '"></label></div>' +
      '<label class="field"><span>Temps passé aujourd\'hui (min)</span><input name="spent" type="number" inputmode="numeric" min="1" value="' + spent + '"></label>' +
      '<div class="row-actions"><button class="btn primary" type="submit">Enregistrer la suite</button><button class="btn" type="button" data-act="close">Annuler</button></div></form>');
  }
  function saveSuite(f) {
    var t = getTask(f.dataset.id); if (!t) return;
    var fd = new FormData(f), choix = fd.get('jour_choix'), jour = choix === 'autre' ? String(fd.get('jour_autre') || '') : String(choix || '');
    if (!jour) { toast('Choisis la date de la suite'); return; }
    var spent = C.num(fd.get('spent')) || C.num(t.duree_min) || 30;
    var root = C.rootId(t), etape = (C.num(t.etape) || 1) + 1;
    if (!C.num(t.etape)) t.etape = 1;
    if (timer && timer.id === t.id) { timer = null; persist(); }
    Object.assign(t, { statut: 'Fait', fait_le: nowIso(), duree_reelle_min: Math.round(spent), maj_le: nowIso() }); push('tache', t);
    log(t, 'fait', { duree_reelle: Math.round(spent) });
    log(t, 'suite', { detail: 'suite le ' + jour });
    var child = createTask({ titre: String(fd.get('titre') || 'Suite : ' + baseTitle(t)).trim(), entite: t.entite, prio: t.prio, type: t.type,
      duree_min: C.num(fd.get('duree_min')) || 30, echeance: t.echeance && t.echeance >= jour ? t.echeance : '', jour: jour, debut: readTime(f, 'debut'),
      contexte: t.contexte, origine: t.origine, suite_de: root, etape: etape });
    closeSheet();
    toast('Suite prévue le ' + C.shortDate(jour), function () {
      saveTask(child, { statut: 'Supprimée', jour: '', debut: '' }, { action: 'supprime', detail: 'suite annulée' });
      saveTask(t, { statut: 'À faire', fait_le: '', duree_reelle_min: '' }, { action: 'modifie', detail: 'suite annulée' });
      render();
    });
    render();
  }

  /* Interstices */
  function interStart(label) {
    if (inter) interStop(true);
    inter = { label: label, start: Date.now(), entite: label === 'Appel reçu' ? 'ETS MAURAGE' : 'Perso' }; persist();
    toast(label + ' : chrono lancé'); render();
  }
  function interSave(label, startMs, dur, entite) {
    var s0 = new Date(startMs), d = C.ymd(s0);
    var task = { id: uid('i'), titre: label, statut: 'Fait', prio: 4, entite: entite || 'Perso', type: C.INTERSTICE, duree_min: dur, echeance: '',
      jour: d, debut: C.pad(s0.getHours()) + ':' + C.pad(s0.getMinutes()), ordre: 0, contexte: '', origine: 'Interstice',
      cree_le: nowIso(), maj_le: nowIso(), fait_le: nowIso(), duree_reelle_min: dur };
    push('tache', task); log(task, 'interstice', { duree_reelle: dur, detail: label });
    return task;
  }
  function interStop(silent) {
    if (!inter) return;
    var dur = Math.max(1, Math.round((Date.now() - inter.start) / 60000)), it = inter;
    inter = null;
    interSave(it.label, it.start, dur, it.entite);
    // Le temps de l'interstice ne compte pas dans la tâche chronométrée
    var paused = timer && timer.start < it.start ? getTask(timer.id) : null;
    if (paused) timer.start += dur * 60000;
    persist();
    if (!silent) toast(it.label + ' : ' + C.fmtDur(dur) + (paused ? ', retiré du chrono de « ' + paused.titre + ' »' : ''));
    render();
  }
  function interLate() {
    var n = Math.floor(nowMin() / 5) * 5;
    openSheet('<h2>Noter un interstice</h2><p class="muted">Un temps qui s\'est glissé dans ta journée, pour l\'analyse de tes journées.</p><form data-form="inter">' +
      '<div class="field"><span>Quoi</span><div class="chips">' + C.INTERSTICES.map(function (l, i) { return '<label class="chip"><input type="radio" name="label" value="' + esc(l) + '"' + (i === 0 ? ' checked' : '') + '>' + esc(l) + '</label>'; }).join('') + '</div></div>' +
      '<div class="field"><span>Durée</span><div class="chips">' + [5, 10, 15, 20, 30, 45, 60].map(function (v, i) { return '<label class="chip"><input type="radio" name="dur" value="' + v + '"' + (v === 10 ? ' checked' : '') + '>' + C.fmtDur(v) + '</label>'; }).join('') + '</div></div>' +
      '<div class="field"><span>Commencé à</span>' + timeSelect('debut', C.fromMin(Math.max(0, n - 10)), false) + '</div>' +
      '<div class="field"><span>Entité</span><div class="chips">' + ['Perso'].concat(C.ENTITES.filter(function (e) { return e !== 'Perso'; })).map(function (e, i) { return '<label class="chip"><input type="radio" name="entite" value="' + esc(e) + '"' + (i === 0 ? ' checked' : '') + '><i style="--e:var(--e-' + ENT_KEY[e] + ')"></i>' + esc(ENT_SHORT[e]) + '</label>'; }).join('') + '</div></div>' +
      '<div class="row-actions"><button class="btn primary" type="submit">Enregistrer</button><button class="btn" type="button" data-act="close">Annuler</button></div></form>');
  }

  /* Éditeur */
  function openEditor(t, preset) {
    var isNew = !t;
    t = t || Object.assign({ titre: '', prio: 2, entite: 'ETS MAURAGE', type: 'Fond', duree_min: 30, statut: 'À faire', echeance: '', jour: '', debut: '', contexte: '' }, preset || {});
    var chain = isNew ? [] : chainOf(t);
    var h = '<h2>' + (isNew ? (C.isPerso(t) ? 'Nouveau temps perso' : 'Nouvelle tâche') : 'Modifier ' + (C.isPerso(t) ? 'le temps perso' : 'la tâche')) + '</h2><form data-form="edit" data-id="' + esc(t.id || '') + '">' +
      '<label class="field"><span>Titre</span><input name="titre" required value="' + esc(t.titre) + '" placeholder="' + (C.isPerso(t) ? 'Piscine, repas chez Nana…' : '') + '"></label>' +
      '<div class="field"><span>Priorité</span><div class="chips">' + [1, 2, 3, 4].map(function (n) { return '<label class="chip"><input type="radio" name="prio" value="' + n + '"' + (+t.prio === n ? ' checked' : '') + '><i style="--e:var(--p' + n + ')"></i>' + PRIO_NAME[n] + '</label>'; }).join('') + '</div></div>' +
      '<div class="field"><span>Entité</span><div class="chips">' + C.ENTITES.map(function (e) { return '<label class="chip"><input type="radio" name="entite" value="' + esc(e) + '"' + (t.entite === e ? ' checked' : '') + '><i style="--e:var(--e-' + ENT_KEY[e] + ')"></i>' + esc(ENT_SHORT[e]) + '</label>'; }).join('') + '</div></div>' +
      '<div class="field-row"><label class="field"><span>Type</span><select name="type">' + C.TYPES.map(function (x) { return '<option' + (t.type === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Durée prévue (min)</span><input name="duree_min" type="number" inputmode="numeric" min="5" step="5" value="' + esc(t.duree_min) + '"></label></div>' +
      '<div class="field-row"><label class="field"><span>Échéance</span><input name="echeance" type="date" value="' + esc(t.echeance) + '"></label>' +
      '<label class="field"><span>Statut</span><select name="statut">' + C.STATUTS.map(function (x) { return '<option' + (t.statut === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="field-row"><label class="field"><span>Prévue le</span><input name="jour" type="date" value="' + esc(t.jour) + '"></label>' +
      '<div class="field"><span>À</span>' + timeSelect('debut', t.debut, true) + '</div></div>' +
      '<label class="field"><span>Contexte</span><textarea name="contexte" rows="3">' + esc(t.contexte) + '</textarea></label>' +
      (chain.length > 1 ? '<div class="field"><span>Fil de la mission</span><ol class="chain">' + chain.map(function (x) {
        return '<li class="' + (x.id === t.id ? 'is-cur' : '') + (x.statut === 'Fait' ? ' is-done' : '') + '"><b>' + esc(x.titre) + '</b><em>' + (x.statut === 'Fait' ? 'faite' + (x.fait_le ? ' le ' + esc(C.shortDate(String(x.fait_le).slice(0, 10))) : '') : (x.jour ? 'prévue le ' + esc(C.shortDate(x.jour)) : 'à placer')) + '</em></li>';
      }).join('') + '</ol></div>' : '') +
      '<div class="row-actions"><button class="btn primary" type="submit">Enregistrer</button>' + (!isNew && active(t) && C.isWork(t) ? '<button class="btn" type="button" data-act="suite" data-id="' + esc(t.id) + '">Suite le…</button>' : '') + '<button class="btn" type="button" data-act="close">Annuler</button>' + (isNew ? '' : '<button class="btn danger" type="button" data-act="delete" data-id="' + esc(t.id) + '">Supprimer</button>') + '</div></form>';
    openSheet(h);
  }

  /* Feuille modale, menu et notifications */
  function openSheet(html, o) {
    var s = $('#sheet');
    s.querySelector('.sheet-body').innerHTML = html;
    if (!s.open) s.showModal();
    // Sur téléphone, ne pas ouvrir le clavier d'office quand on choisit dans une liste
    var first = (o && o.noFocus && matchMedia('(pointer: coarse)').matches) ? s.querySelector('.sheet-body') : s.querySelector('input:not([type=radio]), select, textarea, button');
    if (first) { if (first.classList.contains('sheet-body')) first.setAttribute('tabindex', '-1'); first.focus(); }
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
  function toast(msg, undo) {
    var t = $('#toast'); ui.undo = undo || null;
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button data-act="undo">Annuler</button>' : '');
    t.hidden = false; clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; ui.undo = null; }, undo ? 5500 : 3200);
  }

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
  function proposeLocal(d) {
    d = d || ui.orgDay;
    S.plan.filter(function (r) { return r.jour === d && r.statut === 'propose'; }).forEach(function (r) { r.statut = 'remplace'; push('plan', r); });
    var out = refill(d);
    if (!out.ids.length) toast(out.res.charge >= out.res.capacite ? 'Ta journée est déjà pleine' : 'Aucune tâche ne rentre dans le temps libre restant');
    else toast(out.ids.length + ' proposition' + (out.ids.length > 1 ? 's' : '') + ' prête' + (out.ids.length > 1 ? 's' : ''));
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
    var prompt = 'TRINITY (Poste de pilotage). Ma base de tâches : ' + base + ' (onglets Taches, Journal, Regles, Plan, Humeur, Parametres, Consignes ; l\'onglet Consignes contient mes règles d\'organisation). Nous sommes ' + C.longDate(today()) + ', il est ' + C.fromMin(nowMin()) + '. ' + q.trim() +
      ' Si tu modifies mon planning, écris tes propositions dans l\'onglet Plan (statut propose, auteur claude) pour que je les valide sur le site.';
    window.open('https://claude.ai/new?q=' + encodeURIComponent(prompt), '_blank', 'noopener');
    closeSheet();
  }

  function openSettings() {
    openSheet('<h2>Réglages</h2><form data-form="cfg"><label class="field"><span>Adresse de la passerelle (Apps Script)</span><input name="url" type="url" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(cfg ? cfg.url : '') + '"></label>' +
      '<label class="field"><span>Clé</span><input name="key" autocomplete="off" value="' + esc(cfg ? cfg.key : '') + '"></label>' +
      '<div class="row-actions"><button class="btn primary" type="submit">Relier la base</button>' + (cfg ? '<button class="btn" type="button" data-act="unlink">Délier</button>' : '') + '<button class="btn" type="button" data-act="close">Fermer</button></div></form>' +
      (function () {
        var p = P();
        return '<form data-form="rythme" class="rythme"><h3>Mon rythme</h3><p class="muted">Sert au schéma de la journée et au travail conseillé.</p>' +
          '<div class="field-row"><div class="field"><span>Lever</span>' + timeSelect('lever', p.lever, false) + '</div><div class="field"><span>Coucher</span>' + timeSelect('coucher', p.coucher, false) + '</div></div>' +
          '<div class="field-row"><div class="field"><span>Envoi des mails de prospection</span>' + timeSelect('envoi_mail', p.envoi_mail, false) + '</div><div class="field"><span>Appels de prospection après</span>' + timeSelect('tel_debut', p.tel_debut, false) + '</div></div>' +
          '<div class="field-row"><label class="field"><span>Travail en plus, au plus (min)</span><input name="additionnel_max_min" type="number" inputmode="numeric" min="0" step="15" value="' + esc(p.additionnel_max_min) + '"></label><label class="field"><span>Repos minimum (min)</span><input name="repos_min" type="number" inputmode="numeric" min="0" step="15" value="' + esc(p.repos_min) + '"></label></div>' +
          '<div class="row-actions"><button class="btn primary sm" type="submit">Enregistrer mon rythme</button></div></form>';
      })() +
      (S.base_id ? '<p class="muted"><a href="https://docs.google.com/spreadsheets/d/' + esc(S.base_id) + '" target="_blank" rel="noopener">Ouvrir la base Google Sheets</a></p>' : '') +
      '<p class="muted">Sur téléphone, ajoute le site à l\'écran d\'accueil depuis le menu de partage du navigateur : il s\'ouvrira en plein écran.</p>' +
      '<p class="muted">Dernière synchronisation : ' + esc(S.synchro || 'jamais') + '. Envois en attente : ' + queue.length + '.</p>');
  }

  /* Glisser-déposer : souris immédiat, doigt après un appui long */
  var drag = null, swipe = null, SWIPE = 84;
  function swipeReset(s) {
    s.el.classList.remove('is-swiping'); s.el.style.transform = '';
    var row = s.el.parentNode; row.removeAttribute('data-dir'); row.classList.remove('is-armed');
  }
  function onPointerDown(e) {
    if (e.button && e.button !== 0) return;
    var card = e.target.closest('.tri-card');
    if (card) {
      if (e.target.closest('button')) return;
      swipe = { el: card, x0: e.clientX, y0: e.clientY, dx: 0, on: false };
      return;
    }
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
    if (swipe) {
      var sx = e.clientX - swipe.x0, sy = e.clientY - swipe.y0;
      if (!swipe.on) {
        if (Math.abs(sy) > 10 && Math.abs(sy) > Math.abs(sx)) { swipe = null; return; }
        if (Math.abs(sx) < 10) return;
        swipe.on = true; swipe.el.classList.add('is-swiping');
      }
      e.preventDefault();
      swipe.dx = sx;
      swipe.el.style.transform = 'translateX(' + sx + 'px)';
      var row = swipe.el.parentNode;
      row.setAttribute('data-dir', sx > 0 ? 'yes' : 'no');
      var armed = Math.abs(sx) > SWIPE;
      if (armed !== row.classList.contains('is-armed')) { row.classList.toggle('is-armed', armed); if (armed && navigator.vibrate) navigator.vibrate(8); }
      return;
    }
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
      var min = H0 * 60 + Math.round(((y - drag.offY - gr.top) / HPX * 60) / 5) * 5;
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
    if (swipe) {
      var s = swipe; swipe = null;
      if (!s.on) return;
      suppressClick = true; setTimeout(function () { suppressClick = false; }, 60);
      if (Math.abs(s.dx) > SWIPE) {
        var ok = s.dx > 0, pid = s.el.dataset.pid;
        s.el.style.transform = 'translateX(' + (ok ? 110 : -110) + '%)';
        setTimeout(function () { decide(pid, ok); }, 150);
      } else swipeReset(s);
      return;
    }
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
      toast(telWarn(t, tg.debut) || ('Placée ' + C.shortDate(tg.day) + ' à ' + tg.debut));
    } else if (tg.kind === 'day') {
      if (t.jour !== tg.day) saveTask(t, { jour: tg.day, debut: t.debut && !conflict(tg.day, t) ? t.debut : '' });
    } else if (tg.kind === 'tray') {
      if (t.jour || t.debut) saveTask(t, { jour: '', debut: '' });
    } else if (tg.kind === 'list') {
      reorder(t, tg);
    }
    render();
  }
  function telWarn(t, debut) {
    var p = P();
    return t.type === 'Prospection tél' && C.toMin(debut) < C.toMin(p.tel_debut) ? 'Placée à ' + debut + '. Rappel : les appels de prospection passent mieux après ' + p.tel_debut : '';
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
    var dur = Math.max(5, Math.round((resize.dur0 + (e.clientY - resize.y0) / HPX * 60) / 5) * 5);
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
    var gridEl = e.target.closest('[data-drop="grid"]');
    if (gridEl && !e.target.closest('.slot, .ev-block, [data-act]')) {
      var gr = gridEl.getBoundingClientRect(), gd = gridEl.dataset.day;
      var gm = H0 * 60 + Math.floor((e.clientY - gr.top) / HPX * 60 / 5) * 5;
      var inF = freeOf(gd).filter(function (f) { return f[0] <= gm && gm < f[1]; })[0];
      openPicker(gd, gm, inF ? inF[1] : gm + 60);
      return;
    }
    var a = e.target.closest('[data-act]'); if (!a) return;
    var act = a.dataset.act, stripEl = a.closest('.strip'), t = stripEl ? getTask(stripEl.dataset.id) : (a.dataset.id ? getTask(a.dataset.id) : null);
    switch (act) {
      case 'edit':
        var ps = a.closest('.is-proposed');
        if (ps) {
          var pl = S.plan.filter(function (r) { return r.id === ps.dataset.pid; })[0];
          openPop(a, '<div class="pop-title">' + esc((pl && pl.raison ? pl.raison + ', ' : '') + 'proposée à ' + (pl ? pl.debut : '')) + '</div><button class="pop-opt" data-act="plan-yes" data-pid="' + esc(ps.dataset.pid) + '">Accepter</button><button class="pop-opt" data-act="plan-no" data-pid="' + esc(ps.dataset.pid) + '">Refuser</button><button class="pop-opt" data-act="edit-id" data-id="' + esc(t.id) + '">Ouvrir la tâche</button>');
        } else if (t && a.closest('.tray') && ui.view === 'organisation') placePop(a, t, ui.orgDay);
        else if (t && !a.closest('#pop')) openEditor(t);
        break;
      case 'place-at':
        if (t) { var pvv = a.dataset.precise ? readTime($('#pop'), 'pp') : a.dataset.v; var pv = placeAt(t, a.dataset.day, pvv), pt = t; closePop(); toast(telWarn(t, pvv) || ('Placée à ' + pvv), function () { saveTask(pt, pv, { detail: 'annulation' }); render(); }); render(); }
        break;
      case 'tri-time':
        var tr = planById(a.dataset.pid), tt = tr && getTask(tr.tache_id);
        if (tt) {
          var tdur = C.num(tr.duree_min) || C.num(tt.duree_min) || 30, topts = startOptions(tr.jour, tdur, tr.id);
          openPop(a, '<div class="pop-title">Placer à une autre heure, ' + C.fmtDur(tdur) + '</div>' + (topts.length ? timesHtml(topts, 'tri-set', 'data-pid="' + esc(tr.id) + '"') : '<p class="pop-none">Aucun autre créneau libre.</p>'));
        }
        break;
      case 'tri-set': var ts = planById(a.dataset.pid); if (ts) { ts.debut = a.dataset.precise ? readTime($('#pop'), 'pp') : a.dataset.v; closePop(); decide(ts.id, true); } break;
      case 'start-now': if (t) startNow(t); break;
      case 'suite': if (t) { closeSheet(); openSuite(t, timer && timer.id === t.id ? (Date.now() - timer.start) / 60000 : null); } break;
      case 'dur-suite': if (t) { var dsv = C.num($('#dur-custom').value); closeSheet(); openSuite(t, dsv); } break;
      case 'inter-go': if (inter && inter.label === a.dataset.v) interStop(); else interStart(a.dataset.v); break;
      case 'inter-stop': interStop(); break;
      case 'inter-cancel': inter = null; persist(); toast('Interstice annulé'); render(); break;
      case 'inter-late': interLate(); break;
      case 'inter-del': if (t) { saveTask(t, { statut: 'Supprimée' }, { action: 'supprime', detail: 'interstice retiré' }); toast('Interstice retiré'); render(); } break;
      case 'perso-new': openEditor(null, { type: C.PERSO, entite: 'Sport', prio: 3, duree_min: 60, jour: ui.view === 'organisation' ? ui.orgDay : today() }); break;
      case 'mood-y': saveMood(+a.dataset.n, true, C.addDays(today(), -1), ($('#mood-y-why') || {}).value || ''); render(); break;
      case 'mood-skip': ui.moodSkip = C.addDays(today(), -1); render(); break;
      case 'tri-open': var to = planById(a.dataset.pid); if (to && getTask(to.tache_id)) openEditor(getTask(to.tache_id)); break;
      case 'gap': openPicker(a.dataset.day, +a.dataset.a, +a.dataset.b); break;
      case 'pick': if (t && ui.pick) pickTask(t); break;
      case 'pick-new': var pk = ui.pick; closeSheet(); openEditor(null, { jour: pk.d, debut: C.fromMin(pk.a), duree_min: Math.min(60, Math.max(15, pk.b - pk.a)) }); break;
      case 'tray-toggle': ui.trayOpen = !ui.trayOpen; render(); break;
      case 'undo': var u = ui.undo; ui.undo = null; $('#toast').hidden = true; if (u) u(); break;
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
      case 'propose': proposeLocal(a.dataset.day || ui.orgDay); break;
      case 'plan-yes': case 'plan-no':
        var pid = a.dataset.pid, yes = act === 'plan-yes'; closePop();
        var card = a.closest('.tri-card'); if (card) ui.focusTri = $all('.tri-card').indexOf(card);
        leave(card, yes ? 1 : -1, function () { decide(pid, yes); });
        break;
      case 'plan-all': acceptAll(a.dataset.day || ui.orgDay); break;
      case 'tray-ent': case 'list-ent': ui.filtre.entite = a.dataset.v; render(); break;
      case 'list-prio': ui.filtre.prio = +ui.filtre.prio === +a.dataset.v ? '' : a.dataset.v; render(); break;
      case 'statut': ui.filtre.statut = a.dataset.v; render(); break;
      case 'groupe': ui.groupe = a.dataset.v; render(); break;
      case 'settings': openSettings(); break;
      case 'unlink': cfg = null; LS.set('pp.cfg', null); S = LS.get('pp.demo', null) || demoState(); closeSheet(); load(); break;
      case 'new': openEditor(null); break;
    }
  });
  function saveMood(n, withToast, jour, why) {
    if (why == null) why = ($('#mood-why') || {}).value || '';
    push('humeur', { jour: jour || today(), note: n, pourquoi: String(why).trim(), horodatage: nowIso() });
    if (withToast) toast(jour && jour !== today() ? 'Journée d\'hier notée' : 'Journée notée');
  }

  document.addEventListener('submit', function (e) {
    var f = e.target; e.preventDefault();
    if (f.dataset.form === 'quick') {
      var q = $('#quick').value.trim(); if (!q) { openEditor(null); return; }
      var p = C.parseQuick(q, today());
      var fields = { titre: p.titre || q };
      ['jour', 'debut', 'entite', 'type'].forEach(function (k) { if (p[k]) fields[k] = p[k]; });
      if (p.duree_min) fields.duree_min = p.duree_min; if (p.prio) fields.prio = p.prio;
      if (fields.debut && !fields.jour) fields.jour = today();
      if (!fields.type) fields.type = (fields.entite === 'Sport' || fields.entite === 'Social') ? C.PERSO : (/relanc|rappel|appel/i.test(q) ? 'Relance' : 'Fond');
      if (!fields.duree_min) fields.duree_min = fields.type === 'Relance' ? 10 : (fields.type === C.PERSO ? 60 : 30);
      if (fields.type === C.PERSO && !p.prio) fields.prio = 3;
      var t = createTask(fields);
      $('#quick').value = ''; $('#quick-preview').innerHTML = '';
      toast('Ajoutée : ' + t.titre); render(); setTimeout(function () { var i = $('#quick'); if (i) i.focus(); }, 0);
    } else if (f.dataset.form === 'edit') {
      var fd = new FormData(f), ch = {};
      ['titre', 'type', 'echeance', 'statut', 'jour', 'contexte', 'entite'].forEach(function (k) { ch[k] = (fd.get(k) || '').toString(); });
      ch.debut = readTime(f, 'debut');
      ch.prio = +fd.get('prio') || 2; ch.duree_min = C.num(fd.get('duree_min')) || 30;
      if (ch.debut && !ch.jour) ch.jour = today();
      var id = f.dataset.id, task = id ? getTask(id) : null;
      if (task) {
        var wasDone = task.statut === 'Fait';
        saveTask(task, ch, { action: 'modifie' });
        if (ch.statut === 'Fait' && !wasDone) { closeSheet(); askDuration(task); render(); return; }
      } else createTask(ch);
      closeSheet(); render();
    } else if (f.dataset.form === 'suite') {
      saveSuite(f);
    } else if (f.dataset.form === 'inter') {
      var ifd = new FormData(f), dur = C.num(ifd.get('dur')) || 10, deb = readTime(f, 'debut') || fromNowRounded();
      var st = C.parseYmd(today()); st.setHours(+deb.split(':')[0], +deb.split(':')[1], 0, 0);
      interSave(String(ifd.get('label') || 'Imprévu'), st.getTime(), dur, String(ifd.get('entite') || 'Perso'));
      closeSheet(); toast('Interstice noté : ' + C.fmtDur(dur)); render();
    } else if (f.dataset.form === 'rythme') {
      var rp = {};
      ['lever', 'coucher', 'envoi_mail', 'tel_debut'].forEach(function (k) { var v = readTime(f, k); if (v) rp[k] = v; });
      ['additionnel_max_min', 'repos_min'].forEach(function (k) { var v = C.num(f[k].value); if (v !== null) rp[k] = String(v); });
      var notes = { lever: 'Heure de lever habituelle', coucher: 'Heure de coucher habituelle', envoi_mail: 'Heure d\'envoi programmé des mails de prospection', tel_debut: 'Pas d\'appel de prospection avant cette heure', additionnel_max_min: 'Travail en plus conseillé, au plus, un jour travaillé', repos_min: 'Repos minimum gardé chaque jour' };
      Object.keys(rp).forEach(function (k) { push('parametre', { cle: k, valeur: rp[k], note: notes[k] || '' }); });
      closeSheet(); toast('Rythme enregistré'); render();
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
    } else if (e.target.id === 'pick-q' && ui.pick) {
      ui.pick.q = e.target.value; $('#pick-list').innerHTML = pickList();
    } else if (e.target.id === 'search') {
      ui.filtre.q = e.target.value;
      clearTimeout(ui.st); ui.st = setTimeout(function () { var pos = e.target.selectionStart; render(); var s = $('#search'); if (s) { s.focus(); s.setSelectionRange(pos, pos); } }, 250);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePop();
    var card = e.target.classList && e.target.classList.contains('tri-card') ? e.target : null;
    if (card) {
      var cards = $all('.tri-card'), i = cards.indexOf(card), k = e.key;
      if (k === 'ArrowRight' || k === 'Enter' || k === 'v') { e.preventDefault(); ui.focusTri = i; leave(card, 1, function () { decide(card.dataset.pid, true); }); }
      else if (k === 'ArrowLeft' || k === 'Delete' || k === 'Backspace' || k === 'x') { e.preventDefault(); ui.focusTri = i; leave(card, -1, function () { decide(card.dataset.pid, false); }); }
      else if (k === 'ArrowDown' && cards[i + 1]) { e.preventDefault(); cards[i + 1].focus(); }
      else if (k === 'ArrowUp' && cards[i - 1]) { e.preventDefault(); cards[i - 1].focus(); }
      return;
    }
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('strip-body')) openEditor(getTask(e.target.closest('.strip').dataset.id));
  });
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove, { passive: false });
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', function () {
    if (swipe) { if (swipe.on) swipeReset(swipe); swipe = null; return; }
    if (drag && drag.started) onPointerUp(); else if (drag) { clearTimeout(drag.hold); drag = null; }
  });
  document.addEventListener('contextmenu', function (e) { if (drag && drag.touch) e.preventDefault(); });
  document.addEventListener('touchmove', function (e) { if ((drag && drag.started) || resize || (swipe && swipe.on)) e.preventDefault(); }, { passive: false });

  function route() {
    var h = (location.hash || '#aujourdhui').slice(1);
    ui.view = ['aujourdhui', 'organisation', 'listes'].indexOf(h) === -1 ? 'aujourdhui' : h;
    closePop(); render(); window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('click', function (e) { var f = e.target.closest('[data-filter="retard"]'); if (f) { ui.filtre.statut = 'retard'; } }, true);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { checkDay(); load(); } });
  window.addEventListener('pageshow', function () { if (checkDay()) load(); });
  setInterval(function () {
    if (document.hidden) return;
    if (checkDay()) { load(); return; }
    if (timer || inter) renderTimerBar();
    var nl = $('.nowline'); if (nl) nl.style.top = yOf(nowMin()) + 'px';
    var rn = $('.rb-now'); if (rn) rn.style.left = (nowMin() / 14.4) + '%';
  }, 30000);
  setInterval(function () { if (!document.hidden && cfg && !drag && !resize && !$('#sheet').open) load(); }, 120000);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* hors ligne indisponible */ });
  route();
  load();
  window.__pp = { S: function () { return S; }, queue: function () { return queue; } };
})();
