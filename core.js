/* Poste de pilotage : fonctions pures (dates, ajout rapide, apprentissage, planification).
   Utilisable dans le navigateur (window.Core) et dans Node (module.exports) pour les tests. */
(function (root) {
  'use strict';

  var ENTITES = ['ETS MAURAGE', 'LRB', '1001 Fenêtres', '1001 Travaux', 'Fili Floc', 'Master', 'Perso', 'Sport', 'Social'];
  var TYPES = ['Fond', 'Rapide', 'Relance', 'Terrain', 'Rendez-vous', 'Prospection mail', 'Prospection tél', 'Temps perso'];
  /* Genres hors tâche de travail : les temps perso se placent comme des tâches mais ne comptent pas
     dans le travail ; les interstices (café, route, appel reçu) servent seulement à l'analyse. */
  var PERSO = 'Temps perso', INTERSTICE = 'Interstice';
  var INTERSTICES = ['Café', 'Route', 'Appel reçu', 'Pause', 'Imprévu'];
  function isPerso(t) { return t && t.type === PERSO; }
  function isInterstice(t) { return t && t.type === INTERSTICE; }
  function isWork(t) { return t && !isPerso(t) && !isInterstice(t); }
  function rootId(t) { return (t && (t.suite_de || t.id)) || ''; }
  var STATUTS = ['À faire', 'En cours', 'En attente', 'Fait'];
  var PRIOS = { 1: 'Rouge', 2: 'Orange', 3: 'Vert', 4: 'Noir' };
  var PRIO_LABELS = { 1: 'P1 cette semaine', 2: 'P2 à planifier', 3: 'P3 à regrouper', 4: 'P4 plus tard' };

  /* Dates et heures, toujours en heure locale */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function toMin(hhmm) { if (!hhmm) return null; var p = String(hhmm).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function fromMin(m) { m = Math.round(m); return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function weekday(s) { var d = parseYmd(s).getDay(); return d === 0 ? 7 : d; } // 1 = lundi
  function mondayOf(s) { return addDays(s, 1 - weekday(s)); }
  function diffDays(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 864e5); }
  var JOURS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function longDate(s) { var d = parseYmd(s); return JOURS[weekday(s)] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()]; }
  function shortDate(s) { var d = parseYmd(s); return JOURS[weekday(s)].slice(0, 3) + '. ' + d.getDate(); }
  function fmtDur(min) {
    min = Math.round(min || 0);
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60), m = min % 60;
    return h + ' h' + (m ? ' ' + pad(m) : '');
  }

  /* Ajout rapide : « relance fournisseur demain 10 min 1001F p3 » */
  function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  var ENT_WORDS = [
    [/^(1001f|1001fenetres|fenetres|fenetre)$/, '1001 Fenêtres'],
    [/^(1001t|1001travaux|travaux)$/, '1001 Travaux'],
    [/^(1001)$/, '1001 Fenêtres'],
    [/^(lrb|resto|restaurant|roses)$/, 'LRB'],
    [/^(fili|filifloc|fili-floc)$/, 'Fili Floc'],
    [/^(ets|maurage|groupe)$/, 'ETS MAURAGE'],
    [/^(master)$/, 'Master'],
    [/^(perso)$/, 'Perso'],
    [/^(sport|course|piscine)$/, 'Sport'],
    [/^(social|amis)$/, 'Social']
  ];
  var TYPE_WORDS = [[/^(relance|relancer|rappeler)$/, 'Relance'], [/^(rapide)$/, 'Rapide'], [/^(fond)$/, 'Fond'],
                    [/^(terrain|deplacement)$/, 'Terrain'], [/^(rdv|rendez-vous)$/, 'Rendez-vous'],
                    [/^(emailing|e-mailing|prospmail)$/, 'Prospection mail'], [/^(phoning|prosptel)$/, 'Prospection tél'],
                    [/^(bloc|perso-bloc)$/, 'Temps perso']];
  var DAY_WORDS = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 7 };

  function parseQuick(text, today) {
    var out = { titre: '', jour: '', debut: '', duree_min: null, entite: '', prio: null, type: '' };
    var tokens = text.trim().split(/\s+/);
    var keep = [];
    for (var i = 0; i < tokens.length; i++) {
      var raw = tokens[i], t = norm(raw), next = tokens[i + 1] ? norm(tokens[i + 1]) : '';
      var m;
      if (t === "aujourd'hui" || t === 'auj') { out.jour = today; continue; }
      if (t === 'demain') { out.jour = addDays(today, 1); continue; }
      if (t === 'apres-demain') { out.jour = addDays(today, 2); continue; }
      if (DAY_WORDS[t]) {
        var w = DAY_WORDS[t], cur = weekday(today), delta = (w - cur + 7) % 7 || 7;
        out.jour = addDays(today, delta); continue;
      }
      if ((m = t.match(/^(\d{1,2})\/(\d{1,2})$/))) {
        var y = +today.slice(0, 4), cand = y + '-' + pad(+m[2]) + '-' + pad(+m[1]);
        if (cand < today) cand = (y + 1) + cand.slice(4);
        out.jour = cand; continue;
      }
      if (t === 'a' && /^\d{1,2}h(\d{2})?$/.test(next)) { continue; }
      if (t === 'prospection' && !out.type && /^(mail|mails|email|e-mail|tel|telephone|telephonique|appels?)$/.test(next)) {
        out.type = /^(mail|mails|email|e-mail)$/.test(next) ? 'Prospection mail' : 'Prospection tél';
        keep.push(raw); keep.push(tokens[i + 1]); i++; continue;
      }
      if ((m = t.match(/^(\d+)\s?(min|mn|m)$/))) { out.duree_min = +m[1]; continue; }
      if ((m = t.match(/^(\d+)$/)) && /^(min|mn|minutes?)$/.test(next)) { out.duree_min = +m[1]; i++; continue; }
      if ((m = t.match(/^(\d{1,2})h(\d{2})?$/))) {
        var h = +m[1], mm = m[2] ? +m[2] : 0;
        var prev = i > 0 ? norm(tokens[i - 1]) : '';
        if (prev === 'a' || h >= 7) { out.debut = pad(h) + ':' + pad(mm); }
        else { out.duree_min = h * 60 + mm; }
        continue;
      }
      if ((m = t.match(/^p([1-4])$/))) { out.prio = +m[1]; continue; }
      if (t === 'rouge') { out.prio = 1; continue; }
      if (t === 'orange') { out.prio = 2; continue; }
      if (t === 'vert') { out.prio = 3; continue; }
      if (t === 'noir') { out.prio = 4; continue; }
      var hit = null;
      ENT_WORDS.forEach(function (e) { if (!hit && e[0].test(t)) hit = e[1]; });
      if (hit && !out.entite) { out.entite = hit; if (/^(piscine|course)$/.test(t)) keep.push(raw); continue; }
      var ty = null;
      TYPE_WORDS.forEach(function (e) { if (!ty && e[0].test(t)) ty = e[1]; });
      if (ty && !out.type) { out.type = ty; keep.push(raw); continue; }
      keep.push(raw);
    }
    out.titre = keep.join(' ').replace(/\s+/g, ' ').trim();
    if (out.titre) out.titre = out.titre.charAt(0).toUpperCase() + out.titre.slice(1);
    return out;
  }

  /* Apprentissage */
  function median(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; }), k = Math.floor(s.length / 2);
    return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
  }
  function bucketOf(hhmm) {
    var m = toMin(hhmm); if (m === null) return null;
    var h = Math.floor(m / 60);
    if (h < 10) return '8-10'; if (h < 12) return '10-12'; if (h < 14) return '12-14';
    if (h < 16) return '14-16'; if (h < 18) return '16-18'; return '18-20';
  }
  var BUCKET_LABEL = { '8-10': 'avant 10 h', '10-12': 'entre 10 h et 12 h', '12-14': 'entre 12 h et 14 h',
                       '14-16': 'entre 14 h et 16 h', '16-18': 'entre 16 h et 18 h', '18-20': 'après 18 h' };
  var SEUILS = { coef: 5, jours_capacite: 2, fond_places: 10, glisse: 5 };

  function num(v) { var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }

  function stats(journal, params, today) {
    var marge = num(params.marge); if (marge === null) marge = 0.3;
    var res = { coef: {}, capacite: {}, creneaux: {}, glisse: {}, n_faits: 0 };
    // Les temps perso et les interstices n'entrent pas dans l'apprentissage des tâches
    journal = journal.filter(function (e) { return e.type !== PERSO && e.type !== INTERSTICE; });
    var done = journal.filter(function (e) { return e.action === 'fait' && num(e.duree_reelle) && num(e.duree_prevue); });
    res.n_faits = done.length;
    ['type', 'entite'].forEach(function (dim) {
      var groups = {};
      done.forEach(function (e) { var k = e[dim]; if (!k) return; (groups[k] = groups[k] || []).push(num(e.duree_reelle) / num(e.duree_prevue)); });
      Object.keys(groups).forEach(function (k) {
        res.coef[dim + ':' + k] = { n: groups[k].length, ratio: median(groups[k]) };
      });
    });
    // Capacité réelle par jour de la semaine, sur 28 jours
    var from = addDays(today, -28), perDay = {};
    journal.forEach(function (e) {
      if (e.action !== 'fait' || !num(e.duree_reelle)) return;
      var j = String(e.horodatage).slice(0, 10);
      if (j < from || j >= today) return;
      perDay[j] = (perDay[j] || 0) + num(e.duree_reelle);
    });
    var byWd = {};
    Object.keys(perDay).forEach(function (j) { var w = weekday(j); (byWd[w] = byWd[w] || []).push(perDay[j]); });
    Object.keys(byWd).forEach(function (w) {
      var a = byWd[w];
      res.capacite[w] = { n: a.length, moyenne: a.reduce(function (s, x) { return s + x; }, 0) / a.length };
    });
    // Créneaux : une tâche placée (jour + début) est-elle faite ce jour-là ?
    var placements = {};
    journal.forEach(function (e) {
      if ((e.action === 'place' || e.action === 'deplace') && e.jour && e.debut) placements[e.tache_id + '|' + e.jour] = e;
    });
    var doneOn = {};
    journal.forEach(function (e) { if (e.action === 'fait') doneOn[e.tache_id + '|' + String(e.horodatage).slice(0, 10)] = true; });
    Object.keys(placements).forEach(function (k) {
      var e = placements[k];
      if (e.jour >= today) return; // la journée n'est pas finie
      var b = bucketOf(e.debut); if (!b) return;
      var key = (e.type || 'Autre') + ':' + b;
      var g = res.creneaux[key] = res.creneaux[key] || { places: 0, faits: 0 };
      g.places++; if (doneOn[k]) g.faits++;
    });
    Object.keys(res.creneaux).forEach(function (k) {
      var g = res.creneaux[k]; g.taux = g.places ? g.faits / g.places : null;
      res.glisse[k] = { places: g.places, reportes: g.places - g.faits, taux: g.places ? 1 - g.taux : null };
    });
    res.marge = marge;
    return res;
  }

  function ruleIndex(regles) {
    var idx = {};
    regles.forEach(function (r) { idx[r.cle] = idx[r.cle] || []; idx[r.cle].push(r); });
    return idx;
  }
  function acceptedRule(regles, cle) {
    var found = null;
    regles.forEach(function (r) { if (r.cle === cle && r.statut === 'acceptee') found = r; });
    return found;
  }

  function suggestions(st, regles, params) {
    var out = [], idx = ruleIndex(regles);
    function already(cle, val) {
      return (idx[cle] || []).some(function (r) {
        var v = num(r.valeur), w = num(val);
        if (r.statut === 'refusee' && (v === null || w === null || Math.abs(v - w) < 0.15)) return true;
        if (r.statut === 'proposee') return true;
        if (r.statut === 'acceptee' && (v === null || w === null ? String(r.valeur) === String(val) : Math.abs(v - w) < 0.08)) return true;
        return false;
      });
    }
    var typeRatios = Object.keys(st.coef).filter(function (k) { return k.indexOf('type:') === 0 && st.coef[k].n >= SEUILS.coef; })
      .map(function (k) { return st.coef[k].ratio; });
    Object.keys(st.coef).forEach(function (k) {
      var c = st.coef[k];
      if (c.n < SEUILS.coef) return;
      // Un coefficient par entité n'est proposé que s'il dit autre chose que celui du type
      if (k.indexOf('entite:') === 0 && typeRatios.some(function (r) { return Math.abs(r - c.ratio) < 0.2; })) return;
      var r = Math.round(c.ratio * 10) / 10;
      if (Math.abs(r - (1 + st.marge)) < 0.1) return;
      var cle = 'coef:' + k;
      if (already(cle, r)) return;
      var parts = k.split(':'), label = parts[0] === 'type' ? 'de type ' + parts[1] : 'pour ' + parts[1];
      out.push({
        cle: cle, categorie: 'duree', valeur: String(r),
        texte: 'Tes tâches ' + label + ' prennent ' + String(r).replace('.', ',') + ' fois le temps prévu. Utiliser ce coefficient à la place de la marge de ' + Math.round(st.marge * 100) + ' % ?',
        preuve: c.n + ' tâches terminées, médiane des durées réelles divisées par les durées prévues'
      });
    });
    // Plus de plafond fixe : la capacité est calculée chaque jour (dayBudget), elle ne s'apprend plus ici.
    // Meilleur créneau pour le fond
    var fond = Object.keys(st.creneaux).filter(function (k) { return k.indexOf('Fond:') === 0; });
    var totalFond = fond.reduce(function (s, k) { return s + st.creneaux[k].places; }, 0);
    if (totalFond >= SEUILS.fond_places) {
      var best = null, worst = null;
      fond.forEach(function (k) {
        var g = st.creneaux[k]; if (g.places < 3) return;
        if (!best || g.taux > best.g.taux) best = { k: k, g: g };
        if (!worst || g.taux < worst.g.taux) worst = { k: k, g: g };
      });
      if (best && worst && best.k !== worst.k && best.g.taux - worst.g.taux >= 0.2) {
        var b = best.k.split(':')[1];
        if (!already('creneau:Fond', b)) {
          out.push({
            cle: 'creneau:Fond', categorie: 'creneau', valeur: b,
            texte: 'Ton travail de fond placé ' + BUCKET_LABEL[b] + ' est terminé ' + best.g.faits + ' fois sur ' + best.g.places + ', contre ' + worst.g.faits + ' sur ' + worst.g.places + ' ' + BUCKET_LABEL[worst.k.split(':')[1]] + '. Placer le fond ' + BUCKET_LABEL[b] + ' en priorité ?',
            preuve: totalFond + ' tâches de fond placées sur des journées terminées'
          });
        }
      }
    }
    Object.keys(st.glisse).forEach(function (k) {
      var g = st.glisse[k];
      if (g.places < SEUILS.glisse || g.taux < 0.5) return;
      var p = k.split(':'), cle = 'eviter:' + k;
      if (already(cle, 1)) return;
      out.push({
        cle: cle, categorie: 'glisse', valeur: '1',
        texte: 'Tes tâches de type ' + p[0] + ' placées ' + BUCKET_LABEL[p[1]] + ' sont reportées ' + g.reportes + ' fois sur ' + g.places + '. Éviter ce créneau pour elles ?',
        preuve: g.places + ' placements sur des journées terminées'
      });
    });
    return out;
  }

  function coefFor(task, regles, marge) {
    var r = acceptedRule(regles, 'coef:type:' + task.type) || acceptedRule(regles, 'coef:entite:' + task.entite);
    if (r && num(r.valeur)) return num(r.valeur);
    return 1 + marge;
  }
  function correctedDuration(task, regles, params) {
    var marge = num(params.marge); if (marge === null) marge = 0.3;
    var d = num(task.duree_min) || 30;
    return d * coefFor(task, regles, marge);
  }
  function capacityFor(day, isCours, regles, params) {
    // Ancien plafond, gardé pour la compatibilité : la page utilise dayBudget().conseille
    if (isCours) return num(params.capacite_cours_min) || 60;
    return weekday(day) > 5 ? 0 : 420;
  }

  /* Journée sur 24 h : sommeil, travail obligatoire, travail conseillé et le reste de la vie */
  function ranges(spec) {
    return String(spec || '').split(',').map(function (r) {
      var p = r.trim().split('-'); var a = toMin(p[0]), b = toMin(p[1]);
      return a === null || b === null || b <= a ? null : [a, b];
    }).filter(Boolean);
  }
  function overlap(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }
  function evSpan(e, day) {
    if (!e.debut || e.journee) return null;
    var s = new Date(e.debut), f = new Date(e.fin || e.debut);
    if (ymd(s) !== day) return null;
    var a = s.getHours() * 60 + s.getMinutes(), b = ymd(f) === day ? f.getHours() * 60 + f.getMinutes() : 1440;
    return b > a ? [a, b] : null;
  }
  function sleepSpan(params) {
    var lever = toMin(params.lever || '07:00'), coucher = toMin(params.coucher || '23:30');
    return { lever: lever, coucher: coucher, duree: (lever - coucher + 1440) % 1440 || 480 };
  }
  function category(t) {
    if (isInterstice(t)) return 'interstices';
    if (t.entite === 'Sport') return 'sport';
    if (t.entite === 'Social') return 'social';
    if (isPerso(t)) return 'perso';
    if (t.entite === 'Master') return 'revision';
    if (t.entite === 'Perso') return 'projets';
    return 'travail';
  }
  /* opts.humeurVeille : note de la veille (1 à 5) ; opts.routeMin : temps de route appris par jour travaillé */
  function dayBudget(day, events, tasks, regles, params, opts) {
    opts = opts || {};
    var w = weekday(day), cours = isCoursDay(day, events, params);
    var coursSpans = events.filter(function (e) { return e.source === 'ecole'; }).map(function (e) { return evSpan(e, day); }).filter(Boolean);
    var coursMin = coursSpans.reduce(function (s, x) { return s + x[1] - x[0]; }, 0);
    var workday = w <= 5 && !cours;
    var obl = workday ? ranges(params.obligatoire || '09:00-12:00,14:00-18:00') : [];
    var oblig = obl.reduce(function (s, r) { return s + r[1] - r[0]; }, 0);
    var sl = sleepSpan(params);
    var c = { travail_oblig: 0, travail_add: 0, revision: 0, projets: 0, sport: 0, social: 0, perso: 0, interstices: 0 };
    var horsSommeil = false;
    tasks.forEach(function (t) {
      if (t.jour !== day || t.statut === 'Supprimée') return;
      var d = t.statut === 'Fait' ? (num(t.duree_reelle_min) || num(t.duree_min) || 0)
        : (isWork(t) ? correctedDuration(t, regles, params) : (num(t.duree_min) || 30));
      var cat = category(t);
      var a = toMin(t.debut);
      if (a !== null && (a < sl.lever || (sl.coucher > sl.lever && a + d > sl.coucher))) horsSommeil = horsSommeil || cat !== 'interstices';
      if (cat !== 'travail') { c[cat] += d; return; }
      if (a === null) { c.travail_oblig += d; return; }
      var inside = obl.reduce(function (s, r) { return s + overlap(a, a + d, r[0], r[1]); }, 0);
      c.travail_oblig += inside; c.travail_add += d - inside;
    });
    // Le travail sans heure remplit d'abord l'obligatoire, le surplus devient additionnel
    if (c.travail_oblig > oblig) { c.travail_add += c.travail_oblig - oblig; c.travail_oblig = oblig; }
    var repas = (w <= 5 ? Math.max(0, toMin(params.midi_fin || '13:30') - toMin(params.midi_debut || '12:00')) : 60) + (num(params.repas_soir_min) || 45);
    var route = workday ? (num(opts.routeMin) || num(params.trajet_min) || 0) : 0;
    var eveil = 1440 - sl.duree;
    var cibleRev = Math.round((num(params.master_h_semaine) || 0) * 60 / 7);
    var cibleProj = Math.round((num(params.projets_h_semaine) || 0) * 60 / 7);
    var repos = num(params.repos_min) || 90;
    var fixe = oblig + coursMin + repas + route + c.sport + c.social + c.perso + c.interstices;
    var reste = eveil - fixe - repos - Math.max(c.revision, cibleRev) - Math.max(c.projets, cibleProj);
    var addMax = num(workday ? params.additionnel_max_min : params.additionnel_libre_max_min);
    if (addMax === null) addMax = workday ? 180 : 120;
    var add = Math.max(0, Math.min(reste, addMax));
    var allege = opts.humeurVeille != null && +opts.humeurVeille <= 2;
    if (allege) add = add / 2;
    add = Math.floor(add / 15) * 15;
    var travail = c.travail_oblig + c.travail_add;
    var occupe = travail + coursMin + repas + route + c.revision + c.projets + c.sport + c.social + c.perso + c.interstices;
    return {
      jour: day, workday: workday, cours: cours, weekend: w > 5,
      sommeil: sl.duree, lever: sl.lever, coucher: sl.coucher, eveil: eveil,
      obligatoire: oblig, obligSpans: obl, coursMin: coursMin, coursSpans: coursSpans,
      conseilAdd: add, conseille: oblig + add, allege: allege,
      travail: travail, travailOblig: c.travail_oblig, travailAdd: c.travail_add,
      revision: c.revision, cibleRevision: cibleRev, projets: c.projets, cibleProjets: cibleProj,
      sport: c.sport, social: c.social, perso: c.perso, interstices: c.interstices,
      repas: repas, route: route, libre: Math.max(0, eveil - occupe),
      depasse: travail > oblig + add, horsSommeil: horsSommeil
    };
  }

  /* Priorité de planification, d'après les Règles du brief */
  function rank(task, today, params) {
    var s = 0, ech = task.echeance || '';
    var mots = String((params && params.mots_prioritaires) || '').split(',').map(function (m) { return norm(m.trim()); }).filter(Boolean);
    var late = ech && ech < today;
    var p = +task.prio || 3;
    if (late && p === 1) s -= 1000;
    if (ech && ech <= addDays(today, 1)) s -= 500;
    var txt = norm((task.origine || '') + ' ' + (task.contexte || ''));
    if (mots.some(function (m) { return txt.indexOf(m) !== -1; })) s -= 300;
    s += p * 100;
    if (ech) s += Math.min(diffDays(today, ech), 60);
    else s += 80;
    return s;
  }

  /* Intervalles libres d'une journée */
  function freeSlots(day, events, tasks, params, from) {
    var start = toMin(params.journee_debut || '09:00'), end = toMin(params.journee_fin || '19:00');
    if (from != null && from > start) start = from; // aujourd'hui : on ne propose rien dans le passé
    var busy = [];
    var md = toMin(params.midi_debut), mf = toMin(params.midi_fin);
    if (md !== null && mf !== null) busy.push([md, mf]);
    events.forEach(function (e) {
      if (e.journee || !e.debut) return;
      var s = new Date(e.debut), f = new Date(e.fin);
      if (ymd(s) !== day) return;
      busy.push([s.getHours() * 60 + s.getMinutes(), f.getHours() * 60 + f.getMinutes()]);
    });
    tasks.forEach(function (t) {
      if (t.jour === day && t.debut && !isInterstice(t) && t.statut !== 'Supprimée') busy.push([toMin(t.debut), toMin(t.debut) + (num(t.duree_min) || 30)]);
    });
    busy.sort(function (a, b) { return a[0] - b[0]; });
    var free = [], cur = start;
    busy.forEach(function (b) {
      if (b[1] <= cur) return;
      if (b[0] > cur) free.push([cur, Math.min(b[0], end)]);
      cur = Math.max(cur, b[1]);
    });
    if (cur < end) free.push([cur, end]);
    return free.filter(function (f) { return f[1] - f[0] >= 10; });
  }

  function isCoursDay(day, events, params) {
    var mot = norm(params.mot_cours || 'Cours');
    return events.some(function (e) {
      if (!e.debut) return false;
      if (e.source === 'ecole') return ymd(new Date(e.debut)) === day; // emploi du temps de l'université
      if (!e.titre) return false;
      return ymd(new Date(e.debut)) === day && norm(e.titre).indexOf(mot) !== -1;
    });
  }

  /* Proposition de plan pour une journée */
  /* opts.exclude : tâches refusées pour ce jour ; opts.from : minute à partir de laquelle proposer ;
     opts.extraUsed : minutes déjà réalisées ce jour ; opts.cap : travail conseillé du jour (dayBudget) */
  function proposePlan(day, tasks, events, regles, params, today, opts) {
    opts = opts || {};
    var exclude = opts.exclude || [];
    var cours = isCoursDay(day, events, params);
    var cap = num(opts.cap) !== null ? num(opts.cap) : capacityFor(day, cours, regles, params);
    var used = num(opts.extraUsed) || 0;
    tasks.forEach(function (t) { if (t.jour === day && t.debut && t.statut !== 'Fait' && isWork(t)) used += correctedDuration(t, regles, params); });
    var telMin = toMin(params.tel_debut || '17:00');
    var free = freeSlots(day, events, tasks, params, opts.from);
    var fondRule = acceptedRule(regles, 'creneau:Fond');
    var avoid = regles.filter(function (r) { return r.statut === 'acceptee' && r.cle.indexOf('eviter:') === 0; })
                      .map(function (r) { return r.cle.slice(7); });
    var cands = tasks.filter(function (t) {
      return isWork(t) && (t.statut === 'À faire' || t.statut === 'En cours') && !(t.jour && t.debut) && exclude.indexOf(t.id) === -1;
    }).sort(function (a, b) { return rank(a, today, params) - rank(b, today, params); });
    var plan = [];
    var groupables = [], others = [];
    cands.forEach(function (t) { (t.type === 'Relance' || t.type === 'Rapide' ? groupables : others).push(t); });
    function place(t, prefBucket, raison) {
      var d = num(t.duree_min) || 30;
      if (cours && t.type === 'Fond') return false;
      var dc = correctedDuration(t, regles, params);
      if (used + dc > cap) return false;
      var order = free.map(function (f, i) { return i; });
      if (prefBucket) {
        order.sort(function (a, b) {
          var ba = bucketOf(fromMin(free[a][0])) === prefBucket ? 0 : 1, bb = bucketOf(fromMin(free[b][0])) === prefBucket ? 0 : 1;
          return ba - bb || free[a][0] - free[b][0];
        });
      }
      // Prospection téléphonique : jamais avant l'heure fixée (17 h par défaut)
      var minStart = t.type === 'Prospection tél' && telMin !== null ? telMin : null;
      for (var k = 0; k < order.length; k++) {
        var f = free[order[k]], s0 = minStart !== null ? Math.max(f[0], minStart) : f[0];
        if (f[1] - s0 < d) continue;
        if (avoid.indexOf(t.type + ':' + bucketOf(fromMin(s0))) !== -1) continue;
        plan.push({ tache_id: t.id, debut: fromMin(s0), duree_min: d, raison: raison });
        if (s0 > f[0]) { free.push([s0 + d, f[1]]); f[1] = s0; } else f[0] += d;
        used += dc;
        return true;
      }
      return false;
    }
    others.forEach(function (t) {
      var raison = t.echeance && t.echeance < today ? 'En retard' : (t.echeance && t.echeance <= addDays(today, 1) ? 'Échéance proche' : (+t.prio === 1 ? 'Priorité rouge' : 'À avancer'));
      if (t.type === 'Prospection mail') raison += ', envoi programmé à ' + (params.envoi_mail || '08:00');
      if (t.type === 'Prospection tél') raison += ', appels après ' + (params.tel_debut || '17:00');
      var pref = t.type === 'Fond' ? (fondRule ? fondRule.valeur : '8-10') : null;
      if (t.type === 'Fond' && !fondRule && free.length) pref = bucketOf(fromMin(free[0][0]));
      place(t, pref, raison);
    });
    // Relances et tâches rapides regroupées en un seul bloc, de préférence en fin de matinée
    var bloc = groupables.slice(0, 6);
    var total = bloc.reduce(function (s, t) { return s + (num(t.duree_min) || 10); }, 0);
    if (bloc.length) {
      var pref = acceptedRule(regles, 'creneau:Relance');
      var target = pref ? pref.valeur : '10-12';
      var slot = null;
      free.forEach(function (f) { if (!slot && f[1] - f[0] >= total && bucketOf(fromMin(f[0])) === target) slot = f; });
      if (!slot) free.forEach(function (f) { if (!slot && f[1] - f[0] >= total) slot = f; });
      if (slot) {
        bloc.forEach(function (t) {
          var dc = correctedDuration(t, regles, params);
          if (used + dc > cap) return;
          var d = num(t.duree_min) || 10;
          plan.push({ tache_id: t.id, debut: fromMin(slot[0]), duree_min: d, raison: 'Bloc de relances' });
          slot[0] += d; used += dc;
        });
      }
    }
    plan.sort(function (a, b) { return toMin(a.debut) - toMin(b.debut); });
    return { plan: plan, capacite: cap, cours: cours, charge: used };
  }

  /* Recaler une journée quand une tâche commence en retard : les tâches suivantes glissent
     juste après, en contournant les créneaux occupés (agenda, midi, temps perso). Rend la liste des déplacements. */
  function cascade(day, startedId, startMin, tasks, events, params) {
    var busy = [];
    var md = toMin(params.midi_debut), mf = toMin(params.midi_fin);
    if (md !== null && mf !== null && weekday(day) <= 5) busy.push([md, mf]);
    events.forEach(function (e) { var sp = evSpan(e, day); if (sp) busy.push(sp); });
    tasks.forEach(function (t) { if (t.jour === day && t.debut && isPerso(t) && t.statut !== 'Supprimée') busy.push([toMin(t.debut), toMin(t.debut) + (num(t.duree_min) || 30)]); });
    function fit(a, d) {
      var moved = true;
      while (moved) {
        moved = false;
        for (var i = 0; i < busy.length; i++) if (a < busy[i][1] && busy[i][0] < a + d) { a = busy[i][1]; moved = true; }
      }
      return a;
    }
    var started = null;
    tasks.forEach(function (t) { if (t.id === startedId) started = t; });
    var cur = startMin + (num(started && started.duree_min) || 30), moves = [];
    tasks.filter(function (t) {
      return t.id !== startedId && t.jour === day && t.debut && isWork(t) && t.statut !== 'Fait' && t.statut !== 'Supprimée' && toMin(t.debut) >= (toMin(started && started.debut) || 0);
    }).sort(function (a, b) { return toMin(a.debut) - toMin(b.debut); }).forEach(function (t) {
      var a = toMin(t.debut), d = num(t.duree_min) || 30;
      if (a >= cur) { cur = Math.max(cur, a + d); return; }
      var n = fit(Math.ceil(cur / 5) * 5, d);
      moves.push({ id: t.id, de: t.debut, vers: fromMin(n) });
      cur = n + d;
    });
    return moves;
  }

  var api = {
    ENTITES: ENTITES, TYPES: TYPES, STATUTS: STATUTS, PRIOS: PRIOS, PRIO_LABELS: PRIO_LABELS, SEUILS: SEUILS,
    pad: pad, ymd: ymd, parseYmd: parseYmd, addDays: addDays, toMin: toMin, fromMin: fromMin, weekday: weekday,
    mondayOf: mondayOf, diffDays: diffDays, longDate: longDate, shortDate: shortDate, fmtDur: fmtDur, JOURS: JOURS,
    parseQuick: parseQuick, stats: stats, suggestions: suggestions, correctedDuration: correctedDuration,
    capacityFor: capacityFor, dayBudget: dayBudget, ranges: ranges, sleepSpan: sleepSpan, category: category, cascade: cascade,
    PERSO: PERSO, INTERSTICE: INTERSTICE, INTERSTICES: INTERSTICES, isPerso: isPerso, isInterstice: isInterstice, isWork: isWork, rootId: rootId,
    freeSlots: freeSlots, isCoursDay: isCoursDay, proposePlan: proposePlan, rank: rank,
    bucketOf: bucketOf, acceptedRule: acceptedRule, num: num, norm: norm
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Core = api;
})(this);
