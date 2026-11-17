/* TRINITY 2.0 : vie personnelle.
   Créneaux et plages, Ma journée (sommeil, pas, eau, repas, sport, social), Progression (personnage,
   branches, objectifs, compétences), bilan du vendredi, verrouillage Face ID et code.
   Ce fichier se branche sur app.js par window.TRI ; l'application fonctionne sans lui. */
(function () {
  'use strict';
  var C = window.Core;
  var T = window.TRI = window.TRI || {};
  T.hooks = T.hooks || {}; T.views = T.views || {};

  function S() { return T.S(); }
  function P() { return T.P ? T.P() : {}; }
  function esc(x) { return T.esc(x); }
  function today() { return T.today(); }
  function num(v) { return C.num(v); }
  function list(k) { return (S()[k] || []); }

  /* Modules : chacun peut être coupé dans les réglages (paramètre synchronisé modules_off) */
  var MODULES = [['creneaux', 'Créneaux et plages horaires'], ['journee', 'Ma journée : sommeil, pas, eau, repas, sport, social'], ['progression', 'Progression : personnage, objectifs, compétences']];
  T.on = function (m) { var off = String((T.P ? P().modules_off : '') || '').split(','); return off.indexOf(m) === -1; };

  var DEF = { eau_verres: 8, social_h_semaine: 6, sport_semaine: 3, cout_repas_maison: 4 };
  /* Les cibles comptées (verres, séances) sont des entiers positifs, quelle que soit la saisie */
  function cible(k) {
    var v = num(P()[k]); if (v === null || v < 0) v = DEF[k];
    if (k === 'eau_verres' || k === 'sport_semaine') v = Math.min(30, Math.max(1, Math.round(v)));
    return v;
  }

  /* Dates */
  function weekDays(d) { var m = C.mondayOf(d), out = []; for (var i = 0; i < 7; i++) out.push(C.addDays(m, i)); return out; }
  function inWeek(day, ref) { var m = C.mondayOf(ref); return day >= m && day <= C.addDays(m, 6); }
  function fmtH(min) { return C.fmtDur(Math.round(min || 0)); }
  function moisLabel(ym) { var p = ym.split('-'); return ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][+p[1] - 1] + ' ' + p[0]; }

  /* ===================== Créneaux ===================== */
  var CATS = {
    bloque: { label: 'Bloqué', aide: 'Tu n\'es pas disponible : TRINITY ne place rien dessus.' },
    travail: { label: 'Travail', aide: 'Du travail qui n\'est pas une tâche (accompagner JSM, salon, chantier) : compté dans ton temps de travail, TRINITY ne place rien dessus.' },
    repos: { label: 'Repos', aide: 'Un temps pour souffler, compté dans ta journée.' },
    social: { label: 'Social', aide: 'Compté dans tes heures sociales de la semaine.' },
    sport: { label: 'Sport', aide: 'Compté dans tes séances de la semaine.' },
    perso: { label: 'Perso', aide: 'Un temps à toi, hors travail.' }
  };
  var CAT_BUDGET = { sport: 'sport', social: 'social', repos: 'perso', perso: 'perso' };
  function catLabel(k) { return (CATS[k] || CATS.bloque).label; }
  function crens() { return list('creneaux').filter(function (c) { return c.statut !== 'supprime' && c.jour_debut; }); }
  function crenById(id) { return list('creneaux').filter(function (c) { return c.id === id; })[0]; }
  function crenFin(c) { return c.jour_fin && c.jour_fin >= c.jour_debut ? c.jour_fin : c.jour_debut; }
  function crenDays(c) { var out = [], d = c.jour_debut, n = 0; while (d <= crenFin(c) && n < 92) { out.push(d); d = C.addDays(d, 1); n++; } return out; }
  function crenMin(c) {
    var a = C.toMin(c.debut), b = C.toMin(c.fin);
    if (a === null || b === null || a === b) return 0;
    return b > a ? b - a : b + 1440 - a;
  }
  function crenEvent(c, day) {
    var cat = CATS[c.categorie] ? c.categorie : 'bloque', titre = c.titre || CATS[cat].label;
    var e = { id: 'cren-' + c.id + '-' + day, titre: titre, source: 'trinity', cat: cat, cid: c.id, bloque: cat === 'bloque', jour_debut: c.jour_debut, jour_fin: crenFin(c) };
    if (c.debut && c.fin) {
      var fin = C.toMin(c.fin) > C.toMin(c.debut) ? c.fin : '23:59';
      e.debut = day + 'T' + c.debut + ':00'; e.fin = day + 'T' + fin + ':00';
    } else { e.journee = true; e.debut = day + 'T00:00:00'; e.fin = day + 'T23:59:00'; }
    return e;
  }
  function crensOn(day) { return crens().filter(function (c) { return c.jour_debut <= day && crenFin(c) >= day; }); }
  T.hooks.events = function (day) { return T.on('creneaux') ? crensOn(day).map(function (c) { return crenEvent(c, day); }) : []; };
  T.hooks.eventsAll = function () {
    if (!T.on('creneaux')) return [];
    var out = [];
    crens().forEach(function (c) { crenDays(c).forEach(function (d) { out.push(crenEvent(c, d)); }); });
    return out;
  };
  T.hooks.creneauxMin = function (day) {
    if (!T.on('creneaux')) return null;
    var o = {};
    var obl = C.ranges(P().obligatoire || '09:00-12:00,14:00-18:00');
    crensOn(day).forEach(function (c) {
      var k = CAT_BUDGET[c.categorie];
      if (k && c.debut && c.fin) o[k] = (o[k] || 0) + crenMin(c);
      // Créneau de travail : compté comme du travail (obligatoire ou additionnel selon l'heure)
      if (c.categorie === 'travail') {
        o.travail_spans = o.travail_spans || [];
        if (c.debut && c.fin) { var ta = C.toMin(c.debut), tb = C.toMin(c.fin) > ta ? C.toMin(c.fin) : 1440; o.travail_spans.push([ta, tb]); }
        else obl.forEach(function (r) { o.travail_spans.push([r[0], r[1]]); });
      }
      // Temps bloqué pendant les heures obligatoires (journée entière : tout l'obligatoire)
      if (c.categorie === 'bloque' || !c.debut) {
        var a = c.debut ? C.toMin(c.debut) : 0, b = c.debut ? (C.toMin(c.fin) > a ? C.toMin(c.fin) : 1440) : 1440;
        o.bloque_oblig = (o.bloque_oblig || 0) + obl.reduce(function (sm, r) { return sm + Math.max(0, Math.min(b, r[1]) - Math.max(a, r[0])); }, 0);
      }
    });
    return o;
  };

  function openCren(c, o) {
    o = o || {};
    var isNew = !c, apres = !!o.apres;
    if (!c) {
      var deb = o.debut || (apres ? '19:00' : '');
      c = { categorie: o.categorie || (apres ? 'repos' : 'bloque'), jour_debut: o.jour || today(), jour_fin: '', debut: deb, fin: deb ? C.fromMin(Math.min(C.toMin(deb) + 120, 23 * 60 + 55)) : '', titre: '', note: '', commentaire: '' };
    }
    var cats = Object.keys(CATS).map(function (k) {
      return '<label class="chip-radio"><input type="radio" name="categorie" value="' + k + '"' + (c.categorie === k ? ' checked' : '') + '><span>' + CATS[k].label + '</span></label>';
    }).join('');
    var passe = c.jour_debut <= today();
    var h = '<form data-form="v-cren" data-cid="' + esc(c.id || '') + '"><h2>' + (isNew ? (apres ? 'Plage après coup' : 'Bloquer un créneau') : 'Modifier le créneau') + '</h2>' +
      '<p class="muted small">Un créneau n\'est pas une tâche : pas de statut, pas de liste. Il occupe ton temps et compte dans ta journée.</p>' +
      '<div class="chip-row" role="radiogroup" aria-label="Catégorie">' + cats + '</div><p class="muted small cat-aide">' + esc(CATS[c.categorie] ? CATS[c.categorie].aide : '') + '</p>' +
      '<label class="field"><span>Titre (facultatif)</span><input name="titre" maxlength="80" value="' + esc(c.titre) + '" placeholder="Ventes privées, soirée chez Tom, footing…"></label>' +
      '<div class="field-row"><label class="field"><span>Du</span><input type="date" name="jour_debut" required value="' + esc(c.jour_debut) + '"></label>' +
      '<label class="field"><span>Au (plusieurs jours)</span><input type="date" name="jour_fin" value="' + esc(c.jour_fin && c.jour_fin !== c.jour_debut ? c.jour_fin : '') + '"></label></div>' +
      '<div class="field-row"><div class="field"><span>De</span>' + T.timeSelect('debut', c.debut, true) + '</div><div class="field"><span>À</span>' + T.timeSelect('fin', c.fin, true) + '</div></div>' +
      '<p class="muted small">Sans heure, le créneau couvre la journée entière. Sur plusieurs jours, les heures valent pour chaque jour.</p>' +
      '<fieldset class="rate"><legend>' + (passe ? 'Comment c\'était ?' : 'Note, après coup') + ' <small>facultatif</small></legend>' + [1, 2, 3, 4, 5].map(function (n) {
        return '<label class="rate-n"><input type="radio" name="note" value="' + n + '"' + (+c.note === n ? ' checked' : '') + '><span>' + n + '</span></label>';
      }).join('') + '<small class="rate-l">1 : à oublier, 5 : excellent</small></fieldset>' +
      '<label class="field"><span>Commentaire</span><textarea name="commentaire" rows="2" placeholder="Avec qui, ce qui a plu ou pas">' + esc(c.commentaire) + '</textarea></label>' +
      '<div class="row-actions"><button class="btn primary" type="submit">Enregistrer</button>' + (isNew ? '' : '<button class="btn ghost" type="button" data-act="v-cren-del" data-cid="' + esc(c.id) + '">Supprimer</button>') + '</div></form>';
    T.closePop(); T.openSheet(h, { noFocus: true });
  }
  function saveCren(f) {
    var id = f.dataset.cid, old = id ? crenById(id) : null;
    var jd = f.jour_debut.value, jf = f.jour_fin.value;
    if (!jd) { T.toast('Indique le jour'); return; }
    if (jf && jf < jd) { T.toast('La fin est avant le début'); return; }
    var deb = T.readTime(f, 'debut'), fin = T.readTime(f, 'fin');
    if (deb && !fin) fin = C.fromMin(Math.min(C.toMin(deb) + 60, 23 * 60 + 55));
    if (!deb) fin = '';
    var cat = (f.querySelector('[name=categorie]:checked') || {}).value || 'bloque';
    var note = (f.querySelector('[name=note]:checked') || {}).value || '';
    var c = {
      id: id || T.uid('c'), titre: f.titre.value.trim(), categorie: cat, jour_debut: jd, jour_fin: jf && jf !== jd ? jf : '',
      debut: deb, fin: fin, note: note, commentaire: f.commentaire.value.trim(), statut: 'actif',
      cree_le: old ? old.cree_le : T.nowIso(), maj_le: T.nowIso()
    };
    T.push('creneau', c); T.closeSheet();
    T.toast(old ? 'Créneau modifié' : (cat === 'bloque' ? 'Créneau bloqué' : 'Plage ajoutée'));
    T.render();
  }

  /* ===================== Données de vie ===================== */
  function sante(day) { return list('sante').filter(function (x) { return String(x.jour).slice(0, 10) === day; })[0] || null; }
  function vie(id) { return list('vie').filter(function (x) { return x.id === id; })[0] || null; }
  function vieOf(type, day) { return list('vie').filter(function (x) { return x.type === type && x.jour === day; }); }
  function setVie(o) { o.horodatage = T.nowIso(); T.push('vie', o); }
  function eau(day) { var v = vie('eau-' + day); return v ? num(v.valeur) || 0 : 0; }
  var REPAS = { equilibre: 'Équilibré', correct: 'Correct', revoir: 'À revoir' };
  var LIEUX = { maison: 'Maison', dehors: 'Dehors', prepare: 'Préparé' };
  function repas(moment, day) { return vie('repas-' + moment + '-' + day); }

  /* Séances de sport : plages Sport et tâches Sport faites */
  function sportDays(from, to) {
    var out = [];
    crens().forEach(function (c) { if (c.categorie !== 'sport') return; crenDays(c).forEach(function (d) { if (d >= from && d <= to && d <= today()) out.push(d); }); });
    list('taches').forEach(function (t) { if (t.entite === 'Sport' && t.statut === 'Fait' && t.jour && t.jour >= from && t.jour <= to) out.push(t.jour); });
    return out;
  }
  function sportWeek(ref) { var m = C.mondayOf(ref); return sportDays(m, C.addDays(m, 6)).length; }
  /* Série tolérante : une semaine manquée est rattrapée si la suivante compte une séance de plus que l'objectif */
  function sportStreak() {
    var cibleS = cible('sport_semaine'), m = C.mondayOf(today()), weeks = [];
    for (var i = 0; i < 26; i++) { var w = C.addDays(m, -7 * i); weeks.push({ m: w, n: sportDays(w, C.addDays(w, 6)).length }); }
    var streak = weeks[0].n >= cibleS ? 1 : 0, repairs = 0;
    for (var k = 1; k < weeks.length; k++) {
      if (weeks[k].n >= cibleS) { streak++; continue; }
      if (weeks[k - 1].n >= cibleS + 1) { streak++; repairs++; continue; }
      break;
    }
    return { semaines: streak, rattrapages: repairs, cetteSemaine: weeks[0].n, cible: cibleS, histo: weeks.slice(0, 8).reverse() };
  }
  /* Heures sociales de la semaine et notes des sorties */
  function social(ref) {
    var days = weekDays(ref), min = 0, notes = [];
    crens().forEach(function (c) {
      if (c.categorie !== 'social') return;
      crenDays(c).forEach(function (d) { if (days.indexOf(d) !== -1) min += crenMin(c) || 180; });
      if (days.indexOf(c.jour_debut) !== -1 && num(c.note)) notes.push(num(c.note));
    });
    list('taches').forEach(function (t) { if (t.entite === 'Social' && t.statut === 'Fait' && days.indexOf(t.jour) !== -1) min += num(t.duree_reelle_min) || num(t.duree_min) || 0; });
    var moy = notes.length ? notes.reduce(function (s, x) { return s + x; }, 0) / notes.length : null;
    return { min: min, cible: cible('social_h_semaine') * 60, notes: notes, moyenne: moy };
  }
  /* Prochaine soirée libre, pour proposer un créneau social quand la semaine est en retard */
  function soireeLibre() {
    for (var i = 0; i < 7; i++) {
      var d = C.addDays(today(), i);
      if (i === 0 && T.nowMin() > 19 * 60) continue;
      var pris = T.hooks.events(d).some(function (e) { return e.journee ? e.bloque : C.toMin(String(e.fin).slice(11, 16)) > 19 * 60; });
      if (!pris) return d;
    }
    return null;
  }

  /* ===================== Ma journée ===================== */
  var SHORTCUT = 'shortcuts://run-shortcut?name=' + encodeURIComponent('TRINITY Santé');
  function eauAttendue() {
    var n = T.nowMin(), a = 8 * 60, b = 21 * 60;
    if (n <= a) return 0;
    return Math.min(cible('eau_verres'), Math.floor((Math.min(n, b) - a) / (b - a) * cible('eau_verres')));
  }
  function tile(cls, label, value, sub, extra) {
    return '<div class="vtile ' + cls + '"><span class="vtile-l">' + label + '</span><span class="vtile-v">' + value + '</span>' + (sub ? '<span class="vtile-s">' + sub + '</span>' : '') + (extra || '') + '</div>';
  }
  function journeeHtml(d) {
    var sa = sante(d), hier = sante(C.addDays(d, -1)), n = eau(d), ce = cible('eau_verres'), du = n < eauAttendue();
    var sp = sportStreak(), so = social(d);
    var h = '<section class="block vie"><div class="block-head"><h2>Ma journée</h2><button class="link" data-act="v-sante-saisie">Saisir à la main</button></div><div class="vtiles">';
    h += sa && num(sa.sommeil_min)
      ? tile('', 'Sommeil', fmtH(num(sa.sommeil_min)), (sa.coucher ? 'couché ' + esc(sa.coucher) : '') + (sa.lever ? ', levé ' + esc(sa.lever) : ''))
      : tile('is-empty', 'Sommeil', 'Pas reçu', '', '<a class="vtile-a" href="' + SHORTCUT + '">Synchroniser Santé</a>');
    var pas = hier && num(hier.pas) !== null ? num(hier.pas) : null;
    h += tile(pas === null ? 'is-empty' : '', 'Pas d\'hier', pas === null ? '—' : pas.toLocaleString('fr-FR'), sa && num(sa.pas) !== null ? num(sa.pas).toLocaleString('fr-FR') + ' aujourd\'hui' : '');
    h += '<div class="vtile vtile-eau' + (du ? ' is-due' : '') + '"><span class="vtile-l">Eau</span><span class="vtile-v">' + n + '<small> / ' + ce + ' verres</small></span>' +
      '<span class="eau-dots" aria-hidden="true">' + Array.apply(null, Array(ce)).map(function (_, i) { return '<i' + (i < n ? ' class="on"' : '') + '></i>'; }).join('') + '</span>' +
      '<span class="eau-btns"><button class="icon sm" data-act="v-eau" data-d="-1" aria-label="Un verre de moins">−</button><button class="icon sm primary" data-act="v-eau" data-d="1" aria-label="Un verre de plus">+</button></span>' +
      (du ? '<span class="vtile-s">Un verre ?</span>' : '') + '</div>';
    h += tile(sp.cetteSemaine >= sp.cible ? 'is-ok' : '', 'Sport', sp.cetteSemaine + '<small> / ' + sp.cible + ' séances</small>', sp.semaines ? 'série de ' + sp.semaines + ' semaine' + (sp.semaines > 1 ? 's' : '') : 'cette semaine',
      '<button class="vtile-a" data-act="v-cren-new" data-apres="1" data-cat="sport">Noter une séance</button>');
    var retard = so.min < so.cible && C.weekday(d) >= 4 && so.min < so.cible * (C.weekday(d) - 1) / 7;
    var libre = retard ? soireeLibre() : null;
    h += tile(so.min >= so.cible ? 'is-ok' : '', 'Social', fmtH(so.min) + '<small> / ' + fmtH(so.cible) + '</small>', so.moyenne ? 'sorties notées ' + String(Math.round(so.moyenne * 10) / 10).replace('.', ',') + ' sur 5' : 'cette semaine',
      libre ? '<button class="vtile-a" data-act="v-cren-new" data-cat="social" data-day="' + libre + '" data-debut="19:30">Prévoir une soirée ' + (libre === today() ? 'ce soir' : C.shortDate(libre)) + '</button>'
        : '<button class="vtile-a" data-act="v-cren-new" data-apres="1" data-cat="social">Noter une sortie</button>');
    h += '</div><div class="repas">' + ['midi', 'soir'].map(function (m) { return repasRow(m, d); }).join('') + '</div></section>';
    return h;
  }
  function repasRow(m, d) {
    var r = repas(m, d), plan = vie('plan-' + m + '-' + d);
    var h = '<div class="repas-row"><span class="repas-l">' + (m === 'midi' ? 'Midi' : 'Soir') + '</span><span class="seg-mini" role="group" aria-label="Repas du ' + m + '">' +
      Object.keys(REPAS).map(function (k) { return '<button data-act="v-repas" data-m="' + m + '" data-v="' + k + '" aria-pressed="' + (r && r.valeur === k) + '">' + REPAS[k] + '</button>'; }).join('') + '</span>';
    if (r) {
      h += '<span class="seg-mini lieux" role="group" aria-label="Où">' + Object.keys(LIEUX).map(function (k) { return '<button data-act="v-lieu" data-m="' + m + '" data-v="' + k + '" aria-pressed="' + (r.lieu === k) + '">' + LIEUX[k] + '</button>'; }).join('') + '</span>';
      if (r.lieu === 'dehors') h += '<button class="link small" data-act="v-prix" data-m="' + m + '">' + (num(r.prix) ? esc(String(r.prix).replace('.', ',')) + ' €' : 'Prix ?') + '</button>';
    } else h += '<button class="link small" data-act="v-plan" data-m="' + m + '">' + (plan && plan.valeur ? 'Prévu : ' + esc(plan.valeur) : 'Prévoir') + '</button>';
    return h + '</div>';
  }
  function santeForm() {
    var d = today(), sa = sante(d) || {}, hi = sante(C.addDays(d, -1)) || {};
    T.openSheet('<form data-form="v-sante"><h2>Sommeil et pas</h2><p class="muted small">Le raccourci « TRINITY Santé » remplit tout seul ces valeurs. Ici, tu corriges ou tu complètes.</p>' +
      '<div class="field-row"><div class="field"><span>Couché à (hier soir)</span>' + T.timeSelect('coucher', sa.coucher || '', true) + '</div><div class="field"><span>Levé à</span>' + T.timeSelect('lever', sa.lever || '', true) + '</div></div>' +
      '<div class="field-row"><label class="field"><span>Pas d\'hier</span><input name="pas_hier" inputmode="numeric" pattern="[0-9 ]*" value="' + esc(hi.pas || '') + '"></label>' +
      '<label class="field"><span>Pas aujourd\'hui</span><input name="pas" inputmode="numeric" pattern="[0-9 ]*" value="' + esc(sa.pas || '') + '"></label></div>' +
      '<div class="row-actions"><button class="btn primary" type="submit">Enregistrer</button><a class="btn ghost" href="' + SHORTCUT + '">Lancer le raccourci</a></div></form>', { noFocus: true });
  }
  function saveSante(f) {
    var d = today(), c = T.readTime(f, 'coucher'), l = T.readTime(f, 'lever'), o = { jour: d, source: 'manuel', maj_le: T.nowIso() };
    if (c) o.coucher = c; if (l) o.lever = l;
    if (c && l) o.sommeil_min = (C.toMin(l) - C.toMin(c) + 1440) % 1440;
    var p = num(String(f.pas.value).replace(/\s/g, '')); if (p !== null) o.pas = Math.round(p);
    T.push('sante', o);
    var ph = num(String(f.pas_hier.value).replace(/\s/g, ''));
    if (ph !== null) T.push('sante', { jour: C.addDays(d, -1), pas: Math.round(ph), source: 'manuel', maj_le: T.nowIso() });
    T.closeSheet(); T.toast('Enregistré'); T.render();
  }

  /* Rappels légers : un petit message quand l'app est ouverte, jamais une notification sonore */
  function rappelLeger() {
    if (!T.on('journee') || !T.LS.get('pp.rappels_legers', true)) return;
    var last = T.LS.get('pp.rappel_eau', 0), n = T.nowMin();
    if (Date.now() - last < 2 * 3600 * 1000 || n < 10 * 60 || n > 21 * 60) return;
    if (eau(today()) >= eauAttendue() - 1) return;
    T.LS.set('pp.rappel_eau', Date.now());
    setTimeout(function () { T.toast('Un verre d\'eau ? Tu en es à ' + eau(today()) + ' sur ' + cible('eau_verres') + '.'); }, 1200);
  }

  /* ===================== Bilan du vendredi ===================== */
  function bilanHtml(d) {
    var w = C.weekday(d);
    if (w < 5) return '';
    var days = weekDays(d).filter(function (x) { return x <= d; });
    var sp = sportWeek(d), so = social(d), ce = cible('eau_verres');
    var eauOk = days.filter(function (x) { return eau(x) >= ce; }).length;
    var rep = list('vie').filter(function (x) { return /^repas_/.test(x.type) && days.indexOf(x.jour) !== -1; });
    var eq = rep.filter(function (x) { return x.valeur === 'equilibre'; }).length;
    var nuits = days.map(sante).filter(function (x) { return x && num(x.sommeil_min); });
    var moyS = nuits.length ? nuits.reduce(function (s, x) { return s + num(x.sommeil_min); }, 0) / nuits.length : null;
    var dehors = rep.filter(function (x) { return x.lieu === 'dehors' && num(x.prix); });
    var cout = dehors.reduce(function (s, x) { return s + num(x.prix); }, 0);
    var li = [];
    li.push('Sport : ' + sp + ' séance' + (sp > 1 ? 's' : '') + ' sur ' + cible('sport_semaine') + '.');
    li.push('Social : ' + fmtH(so.min) + ' sur ' + fmtH(so.cible) + (so.notes.length ? ', ' + so.notes.length + ' sortie' + (so.notes.length > 1 ? 's' : '') + ' notée' + (so.notes.length > 1 ? 's' : '') + ' ' + String(Math.round(so.moyenne * 10) / 10).replace('.', ',') + ' sur 5' : '') + '.');
    li.push('Eau : objectif tenu ' + eauOk + ' jour' + (eauOk > 1 ? 's' : '') + ' sur ' + days.length + '.');
    if (rep.length) li.push('Repas : ' + eq + ' équilibré' + (eq > 1 ? 's' : '') + ' sur ' + rep.length + ' notés.');
    if (moyS) li.push('Sommeil : ' + fmtH(moyS) + ' en moyenne sur ' + nuits.length + ' nuit' + (nuits.length > 1 ? 's' : '') + '.');
    if (dehors.length) {
      var maison = dehors.length * cible('cout_repas_maison');
      li.push('Repas dehors : ' + dehors.length + ' pour ' + cout.toFixed(2).replace('.', ',') + ' €, contre environ ' + maison.toFixed(0) + ' € à la maison.');
    }
    var acc = list('regles').filter(function (r) { return r.statut === 'acceptee' || r.statut === 'suspendue'; });
    var h = '<section class="block bilan"><div class="block-head"><h2>Bilan de la semaine</h2>' + (acc.length ? '<button class="link" data-act="rules">Effet des règles</button>' : '') + '</div><ul class="bilan-l">' +
      li.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>';
    return h;
  }

  T.hooks.aujourdhuiHaut = function (d) {
    var h = '';
    if (T.on('journee')) h += journeeHtml(d);
    h += bilanHtml(d);
    var cr = T.on('creneaux') ? crensOn(d) : [];
    if (cr.length) h += '<section class="block cren-today"><div class="block-head"><h2>Créneaux du jour</h2></div><div class="chip-row">' + cr.map(function (c) {
      return '<button class="chip is-cat-' + esc(c.categorie) + '" data-act="v-cren-edit" data-cid="' + esc(c.id) + '">' + esc(c.titre || catLabel(c.categorie)) + (c.debut ? ' <small>' + esc(c.debut) + '–' + esc(c.fin) + '</small>' : ' <small>journée</small>') + '</button>';
    }).join('') + '</div></section>';
    return h;
  };
  T.hooks.afterRender = function (v) { navLink(); if (v === 'aujourdhui') rappelLeger(); };
  function navLink() {
    var nav = document.querySelector('.nav'); if (!nav) return;
    var a = nav.querySelector('[data-view="progression"]'), on = T.on('progression');
    if (on && !a) {
      a = document.createElement('a'); a.href = '#progression'; a.dataset.view = 'progression';
      a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3.2"/><path d="M5.5 20.5a6.5 6.5 0 0 1 13 0M3 12l3-2M21 12l-3-2"/></svg><span>Progression</span>';
      nav.appendChild(a);
    } else if (!on && a) a.remove();
    if (a && on) a.setAttribute('aria-current', T.ui.view === 'progression' ? 'page' : 'false');
  }

  /* ===================== Règles : suivi et effet réel ===================== */
  T.hooks.ruleInfo = function (r) {
    var st = C.ruleStats(r, list('plan')), ef = C.ruleEffect(r, list('journal'), today()), out = [];
    out.push(st.n ? 'Suivie ' + st.acceptees + ' fois sur ' + st.n + ' propositions (' + Math.round(st.taux * 100) + ' %).' + (st.n < C.SEUILS.suspension_n ? ' Jugée à partir de ' + C.SEUILS.suspension_n + '.' : '') : 'Pas encore de proposition influencée par cette règle.');
    if (ef && ef.avant && ef.apres) {
      var f = function (x) { return x.unite === 'ecart' ? 'écart de ' + Math.round(x.v * 100) + ' % avec le prévu' : Math.round(x.v * 100) + ' % tenues'; };
      out.push('Avant : ' + f(ef.avant) + ' (' + ef.avant.n + '). Après : ' + f(ef.apres) + ' (' + ef.apres.n + ')' + (ef.complet ? '.' : ', mesure en cours.'));
    } else if (ef) out.push('Effet mesuré quand il y aura assez de cas avant et après.');
    return '<p class="proof">' + esc(out.join(' ')) + '</p>';
  };

  /* ===================== Progression ===================== */
  var BRANCHES = {
    endurance: { label: 'Endurance', aide: 'Séances de sport, pas, régularité', trait: 'Carrure' },
    travail: { label: 'Travail', aide: 'Commerce, gestion, management', trait: '' },
    savoir: { label: 'Savoir', aide: 'Master, révisions, lectures', trait: '' },
    equilibre: { label: 'Équilibre', aide: 'Sommeil, eau, repas, vie sociale', trait: '' },
    finances: { label: 'Finances', aide: 'Objectifs d\'argent, repas maison', trait: 'Tenue' }
  };
  function brLabel(b) { return (BRANCHES[b] || { label: b || 'Autre' }).label; }
  var HORIZONS = { '3m': '3 mois', '1a': '1 an', '5a': '5 ans' };
  function seuilNiv(n) { return 50 * n * (n + 1); }
  function niveau(xp) { var n = 0; while (n < 10 && xp >= seuilNiv(n + 1)) n++; return { n: n, xp: xp, bas: seuilNiv(n), haut: n < 10 ? seuilNiv(n + 1) : seuilNiv(10) }; }
  function xpSemaine(m) {
    var days = weekDays(m).filter(function (d) { return d < today() || d === today(); }), x = { endurance: 0, travail: 0, savoir: 0, equilibre: 0, finances: 0 };
    var sp = sportDays(m, C.addDays(m, 6)).length;
    x.endurance += Math.min(sp, 6) * 20 + (sp >= cible('sport_semaine') ? 20 : 0);
    days.forEach(function (d) {
      var sa = sante(d);
      if (sa && num(sa.pas) >= 8000) x.endurance += 3;
      if (sa && num(sa.sommeil_min) >= 420) x.equilibre += 4;
      if (eau(d) >= cible('eau_verres')) x.equilibre += 3;
      if (T.moodOf(d)) x.equilibre += 1;
    });
    var faits = list('journal').filter(function (e) { return e.action === 'fait' && days.indexOf(String(e.horodatage).slice(0, 10)) !== -1 && e.type !== C.PERSO && e.type !== C.INTERSTICE; });
    var w = 0, sv = 0;
    faits.forEach(function (e) { if (e.entite === 'Master') sv++; else if (['Perso', 'Sport', 'Social'].indexOf(e.entite) === -1) w++; });
    x.travail += Math.min(w * 5, 120); x.savoir += Math.min(sv * 8, 120);
    var rep = list('vie').filter(function (v) { return /^repas_/.test(v.type) && days.indexOf(v.jour) !== -1; });
    rep.forEach(function (v) { if (v.valeur === 'equilibre') x.equilibre += 2; if (v.lieu === 'maison' || v.lieu === 'prepare') x.finances += 2; });
    var so = social(m);
    if (so.min >= so.cible) x.equilibre += 20;
    so.notes.forEach(function (n) { if (n >= 4) x.equilibre += 5; });
    return x;
  }
  /* L'XP ne recule jamais : chaque semaine calculée est gardée dans un registre (paramètre xp_semaines),
     même quand ses données sortent de la fenêtre chargée. */
  function registreXp() {
    var reg = {};
    try { reg = JSON.parse(P().xp_semaines || '{}') || {}; } catch (e) { reg = {}; }
    var m = C.mondayOf(today()), changed = false;
    for (var i = 0; i < 16; i++) {
      var w = C.addDays(m, -7 * i), x = xpSemaine(w), old = reg[w] || {};
      Object.keys(x).forEach(function (b) { if ((x[b] || 0) > (old[b] || 0)) { old[b] = x[b]; changed = true; } });
      if (Object.keys(old).length) reg[w] = old;
    }
    // Gains ponctuels gardés au maximum atteint : un niveau de compétence baissé ou un objectif supprimé ne retire rien
    var it = reg._items = reg._items || {};
    function gain(id, b, v) { if (!BRANCHES[b] || !v) return; var o = it[id]; if (!o || o[1] < v) { it[id] = [b, v]; changed = true; } }
    list('objectifs').forEach(function (o) { if (o.statut === 'atteint') gain('o:' + o.id, o.branche, 100); });
    list('competences').forEach(function (c) { gain('k:' + c.id, c.branche, (num(c.niveau) || 0) * 40); });
    list('mesures').forEach(function (me) { var o = objById(me.objectif_id); if (o) gain('m:' + me.id, o.branche, 10); });
    if (changed && T.cfg()) T.push('parametre', { cle: 'xp_semaines', valeur: JSON.stringify(reg) });
    return reg;
  }
  function xpTotal() {
    var reg = registreXp(), tot = { endurance: 0, travail: 0, savoir: 0, equilibre: 0, finances: 0 };
    Object.keys(reg).forEach(function (w) {
      if (w === '_items') { Object.keys(reg._items).forEach(function (id) { var g = reg._items[id]; if (tot[g[0]] !== undefined) tot[g[0]] += g[1]; }); return; }
      Object.keys(reg[w]).forEach(function (b) { if (tot[b] !== undefined) tot[b] += reg[w][b] || 0; });
    });
    return tot;
  }
  function traits(niv) {
    var e = niv.endurance.n, f = niv.finances.n;
    var from = C.addDays(today(), -28);
    var perso = list('taches').filter(function (t) { return t.entite === 'Perso' && !C.isPerso(t) && t.statut === 'Fait' && String(t.fait_le || t.jour || '').slice(0, 10) >= from; }).length;
    var notes = [];
    for (var i = 1; i <= 7; i++) { var m = T.moodOf(C.addDays(today(), -i)); if (m && num(m.note)) notes.push(num(m.note)); }
    var moy = notes.length ? notes.reduce(function (s, x) { return s + x; }, 0) / notes.length : null;
    // Point de départ : mal habillé, mal coiffé, sans lunettes, un peu triste. Tout s'améliore avec ce que tu fais.
    var humeur = moy === null ? 'triste' : (moy >= 4 ? 'joie' : (moy >= 3.3 ? 'calme' : (moy >= 2.5 ? 'neutre' : 'triste')));
    return {
      muscle: Math.min(10, e), tenue: f < 2 ? 'neglige' : (f < 4 ? 'tshirt' : (f < 6 ? 'chemise' : (f < 8 ? 'veste' : 'costume'))),
      lunettes: perso >= 10 ? 'design' : (perso >= 4 ? 'rondes' : ''), perso: perso,
      humeur: humeur, coiffure: humeur === 'joie' ? 'soignee' : (humeur === 'calme' ? 'normale' : 'bataille'), moyenne: moy
    };
  }
  T.avatar = function (t) { return avatar(t); };
  /* Personnage 2D en pied, ombré pour donner du volume */
  function avatar(t) {
    var m = t.muscle, sw = 31 + m * 1.7, aw = 12 + m * 0.7, L = 100 - sw, R = 100 + sw;
    var tenue = {
      neglige: { haut: '#8C8F94', haut2: '#6E7177', bas: '#7E93AD', bas2: '#647A94', shoe: '#9A9A9A', manche: 'courte' },
      tshirt: { haut: '#4F7BE8', haut2: '#3A61C4', bas: '#5E7FB0', bas2: '#4A6896', shoe: '#F2F2F2', manche: 'courte' },
      chemise: { haut: '#EEF2F8', haut2: '#C9D3E2', bas: '#C8B38C', bas2: '#A9946E', shoe: '#7A4E2E', manche: 'longue' },
      veste: { haut: '#2F3A57', haut2: '#20283D', bas: '#3A3F4C', bas2: '#2A2E38', shoe: '#5A3A22', manche: 'longue' },
      costume: { haut: '#1C2233', haut2: '#11151F', bas: '#1C2233', bas2: '#11151F', shoe: '#0E0E10', manche: 'longue' }
    }[t.tenue];
    var g = function (id, a, b, x2, y2) { return '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (x2 || 1) + '" y2="' + (y2 || 1) + '"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>'; };
    var h = '<svg class="avatar" viewBox="0 0 200 320" role="img" aria-label="Ton personnage"><defs>' +
      '<radialGradient id="av-glow" cx=".5" cy=".42" r=".55"><stop offset="0" stop-color="#9B6BFF" stop-opacity=".38"/><stop offset="1" stop-color="#9B6BFF" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="av-skin" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#F8D6B8"/><stop offset=".7" stop-color="#EDBB93"/><stop offset="1" stop-color="#D99E77"/></radialGradient>' +
      g('av-hair', '#5A4032', '#2A1C15', .4, 1) + g('av-haut-' + t.tenue, tenue.haut, tenue.haut2) + g('av-bas-' + t.tenue, tenue.bas, tenue.bas2, 1, .2) +
      '</defs><ellipse cx="100" cy="160" rx="99" ry="155" fill="url(#av-glow)"/><ellipse cx="100" cy="301" rx="52" ry="7" fill="rgba(0,0,0,.35)"/>';
    // Jambes et chaussures
    h += '<rect x="78" y="186" width="20" height="106" rx="8" fill="url(#av-bas-' + t.tenue + ')"/><rect x="102" y="186" width="20" height="106" rx="8" fill="url(#av-bas-' + t.tenue + ')"/>';
    if (t.tenue === 'neglige') h += '<path d="M82 250q6 4 12 0M106 262q6 4 12 0" stroke="rgba(255,255,255,.25)" stroke-width="2" fill="none"/>';
    h += '<path d="M72 296q0-10 14-10h12v12H74q-2 0-2-2zM128 296q0-10-14-10h-12v12h24q2 0 2-2z" fill="' + tenue.shoe + '"/>';
    if (t.tenue === 'neglige') h += '<path d="M84 289l6 4M112 289l-6 4" stroke="#6A6A6A" stroke-width="1.6"/>';
    // Buste
    var hem = t.tenue === 'neglige' ? 'L' + (R - 4) + ' 200Q100 206 ' + (L + 3) + ' 198Z' : 'L' + (R - 8) + ' 194L' + (L + 8) + ' 194Z';
    h += '<path d="M' + L + ' 124Q' + L + ' 109 ' + (L + 12) + ' 107L' + (R - 12) + ' 107Q' + R + ' 109 ' + R + ' 124' + hem + '" fill="url(#av-haut-' + t.tenue + ')"/>';
    if (t.tenue === 'neglige') {
      h += '<path d="M90 107q10 10 20 0" stroke="#6E7177" stroke-width="3" fill="none"/>' +
        '<path d="M86 150q8 5 16 1M104 172q8-4 14 2M84 182q6-3 10 1" stroke="rgba(0,0,0,.18)" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
        '<ellipse cx="110" cy="142" rx="4.5" ry="3.4" fill="rgba(92,70,40,.45)"/><ellipse cx="114" cy="146" rx="2" ry="1.6" fill="rgba(92,70,40,.35)"/>';
    } else if (t.tenue === 'tshirt') {
      h += '<path d="M89 107q11 12 22 0" stroke="#2F4FA6" stroke-width="3" fill="none"/>';
    } else if (t.tenue === 'chemise') {
      h += '<path d="M88 104l12 14 12-14 2 8-14 10-14-10z" fill="#fff" stroke="#C9D3E2" stroke-width="1.2"/><path d="M100 118v74" stroke="#C9D3E2" stroke-width="1.2"/>' +
        [130, 148, 166, 184].map(function (y) { return '<circle cx="102.5" cy="' + y + '" r="1.6" fill="#AEB8CC"/>'; }).join('');
    } else {
      h += '<path d="M88 106L100 160L112 106Z" fill="#F4F6FB"/><path d="M88 104l12 12 12-12" fill="#fff" stroke="#DDE3EE" stroke-width="1"/>';
      if (t.tenue === 'costume') h += '<path d="M100 116l-5 5 5 36 5-36z" fill="#B8293F"/><path d="M96.5 112h7l-3.5 6z" fill="#8E1F31"/>';
      h += '<path d="M' + (L + 12) + ' 107L100 168L86 106Z" fill="rgba(255,255,255,.08)"/><path d="M' + (R - 12) + ' 107L100 168L114 106Z" fill="rgba(0,0,0,.12)"/>' +
        '<circle cx="100" cy="176" r="2" fill="rgba(255,255,255,.35)"/>';
    }
    // Bras : la carrure suit l'Endurance
    [[L + 3, L - 7, -1], [R - 3, R + 7, 1]].forEach(function (a) {
      var x0 = a[0], x1 = a[1];
      h += '<line x1="' + x0 + '" y1="118" x2="' + x1 + '" y2="184" stroke="url(#av-skin)" stroke-width="' + aw + '" stroke-linecap="round"/>';
      var yS = tenue.manche === 'courte' ? 146 : 182, xS = x0 + (x1 - x0) * (yS - 118) / 66;
      h += '<line x1="' + x0 + '" y1="116" x2="' + xS + '" y2="' + yS + '" stroke="url(#av-haut-' + t.tenue + ')" stroke-width="' + (aw + 3) + '" stroke-linecap="round"/>';
      if (tenue.manche === 'longue' && t.tenue === 'chemise') h += '<line x1="' + (xS - a[2] * 0) + '" y1="' + (yS - 2) + '" x2="' + xS + '" y2="' + (yS + 2) + '" stroke="#C9D3E2" stroke-width="' + (aw + 3) + '"/>';
      h += '<ellipse cx="' + (x1 + a[2] * 1) + '" cy="194" rx="' + (aw / 2 + 1) + '" ry="' + (aw / 2 + 3) + '" fill="url(#av-skin)"/>';
    });
    // Cou et tête, proportions et modelé inspirés des avatars 3D (Bitmoji)
    h += '<path d="M90 96h20v16q-10 6-20 0z" fill="#DDA27B"/><path d="M90 100q10 9 20 0v6q-10 6-20 0z" fill="rgba(120,60,40,.22)"/>';
    h += '<path d="M70 72q-6-1-6 6t6 9q3 1 4-2z" fill="#E7AE88"/><path d="M130 72q6-1 6 6t-6 9q-3 1-4-2z" fill="#E7AE88"/>' +
      '<path d="M67 77q2-3 4 0M133 77q-2-3-4 0" stroke="#C98E68" stroke-width="1.4" fill="none"/>';
    h += '<path d="M71 70Q70 43 100 41Q130 43 129 70Q129 88 120 98Q110 107 100 107Q90 107 80 98Q71 88 71 70Z" fill="url(#av-skin)"/>' +
      '<path d="M76 92Q86 106 100 107Q114 106 124 92Q118 103 100 104Q82 103 76 92Z" fill="rgba(150,80,50,.16)"/>';
    // Coiffure : elle suit ton ressenti
    if (t.coiffure === 'bataille') {
      h += '<path d="M70 76Q64 52 78 42Q76 31 88 34Q92 25 102 31Q113 24 118 34Q131 34 128 46Q137 56 130 76Q127 63 121 58Q118 65 111 58Q104 65 98 56Q90 64 84 57Q78 63 74 61Q71 67 70 76Z" fill="url(#av-hair)"/>' +
        '<path d="M88 35q-3-5 1-8M106 30q2-5 7-6M121 37q5-2 8 1M76 46q-5-1-7-5" stroke="#3E2B20" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
        '<path d="M84 44q6-4 10 2M100 40q6-5 12 0M114 44q5-2 8 3" stroke="rgba(255,220,190,.18)" stroke-width="2" fill="none" stroke-linecap="round"/>';
    } else if (t.coiffure === 'normale') {
      h += '<path d="M70 74Q66 44 96 37Q126 34 131 60Q131 68 130 74Q126 60 118 54Q104 58 88 54Q78 60 74 62Q71 66 70 74Z" fill="url(#av-hair)"/>' +
        '<path d="M86 44q14-6 30 0M90 50q12-4 24-1" stroke="rgba(255,220,190,.18)" stroke-width="2" fill="none" stroke-linecap="round"/>';
    } else {
      h += '<path d="M70 72Q66 46 84 38Q92 25 110 27Q129 29 131 50Q132 62 130 72Q126 56 116 50Q100 52 84 52Q76 58 70 72Z" fill="url(#av-hair)"/>' +
        '<path d="M88 36q12-8 28-4M86 44q16-6 34-2" stroke="rgba(255,220,190,.22)" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
    }
    // Yeux en amande, iris coloré, paupières : le visage suit ton ressenti des 7 derniers jours
    var ey = 78, triste = t.humeur === 'triste';
    [89, 111].forEach(function (x, i) {
      var amande = 'M' + (x - 6.5) + ' ' + ey + 'Q' + x + ' ' + (ey - 6.5) + ' ' + (x + 6.5) + ' ' + ey + 'Q' + x + ' ' + (ey + 5) + ' ' + (x - 6.5) + ' ' + ey + 'Z';
      h += '<clipPath id="av-eye' + i + '"><path d="' + amande + '"/></clipPath><path d="' + amande + '" fill="#fff"/>' +
        '<g clip-path="url(#av-eye' + i + ')"><circle cx="' + x + '" cy="' + (ey + .3) + '" r="3.7" fill="#4C7DB3"/><circle cx="' + x + '" cy="' + (ey + .3) + '" r="3.7" fill="none" stroke="#2C4C70" stroke-width="1"/><circle cx="' + x + '" cy="' + (ey + .3) + '" r="1.7" fill="#14100D"/><circle cx="' + (x + 1.3) + '" cy="' + (ey - 1.1) + '" r="1" fill="#fff"/>' +
        (triste ? '<path d="M' + (x - 8) + ' ' + (ey - 7) + 'H' + (x + 8) + 'V' + (ey - 1.4) + 'Q' + x + ' ' + (ey - 2.6) + ' ' + (x - 8) + ' ' + (ey - 0.6) + 'Z" fill="#EDBB93"/>' : '') + '</g>';
      h += triste
        ? '<path d="M' + (x - 6.8) + ' ' + (ey - .4) + 'Q' + x + ' ' + (ey - 2.8) + ' ' + (x + 6.8) + ' ' + (ey - 1.2) + '" stroke="#2A1C15" stroke-width="1.8" fill="none" stroke-linecap="round"/>'
        : '<path d="M' + (x - 6.8) + ' ' + (ey + .2) + 'Q' + x + ' ' + (ey - 7) + ' ' + (x + 6.8) + ' ' + (ey - .4) + '" stroke="#2A1C15" stroke-width="1.8" fill="none" stroke-linecap="round"/>';
      h += '<path d="M' + (x - 5) + ' ' + (ey + 4.2) + 'Q' + x + ' ' + (ey + 6) + ' ' + (x + 5) + ' ' + (ey + 4.2) + '" stroke="rgba(150,90,70,' + (triste ? '.45' : '.2') + ')" stroke-width="1.2" fill="none"/>';
    });
    var brows = {
      triste: 'M81 70Q87 67 95 65M105 65Q113 67 119 70',
      neutre: 'M81 68Q88 66 95 67M105 67Q112 66 119 68',
      calme: 'M81 68Q88 64 95 66M105 66Q112 64 119 68',
      joie: 'M81 67Q88 62 95 64M105 64Q112 62 119 67'
    }[t.humeur];
    h += '<path d="' + brows + '" stroke="#3A291F" stroke-width="3.4" fill="none" stroke-linecap="round"/>';
    // Nez modelé et bouche
    h += '<path d="M101 80Q103 88 104 91" stroke="rgba(170,100,70,.35)" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<path d="M95.5 91.5Q100 95 104.5 91.5" stroke="#C98E68" stroke-width="1.6" fill="none" stroke-linecap="round"/><ellipse cx="99.5" cy="89.5" rx="2.4" ry="1.6" fill="rgba(255,235,220,.45)"/>';
    var mouth = {
      triste: '<path d="M92.5 100.5Q100 97 107.5 100.5" stroke="#9A4A45" stroke-width="2.2" fill="none" stroke-linecap="round"/><ellipse cx="100" cy="102.2" rx="4.2" ry="1.3" fill="#D98C82" opacity=".55"/>',
      neutre: '<path d="M93 99Q100 99.6 107 99" stroke="#9A4A45" stroke-width="2.2" fill="none" stroke-linecap="round"/><ellipse cx="100" cy="101" rx="4" ry="1.2" fill="#D98C82" opacity=".5"/>',
      calme: '<path d="M91.5 98Q100 103 108.5 98" stroke="#9A4A45" stroke-width="2.2" fill="none" stroke-linecap="round"/><ellipse cx="100" cy="102.4" rx="4" ry="1.1" fill="#D98C82" opacity=".45"/>',
      joie: '<path d="M90 97Q100 99 110 97Q107 106 100 106Q93 106 90 97Z" fill="#fff" stroke="#9A4A45" stroke-width="2" stroke-linejoin="round"/>'
    }[t.humeur];
    h += mouth;
    if (t.humeur === 'joie' || t.humeur === 'calme') h += '<ellipse cx="80" cy="90" rx="5.5" ry="3" fill="#F08A8A" opacity=".28"/><ellipse cx="120" cy="90" rx="5.5" ry="3" fill="#F08A8A" opacity=".28"/>';
    // Lunettes : elles suivent les projets perso
    if (t.lunettes === 'rondes') h += '<g stroke="#20242E" stroke-width="2.2" fill="rgba(255,255,255,.12)"><circle cx="89" cy="78" r="9"/><circle cx="111" cy="78" r="9"/><path d="M98 77h4M80 76l-9-2M120 76l9-2" fill="none"/></g>';
    if (t.lunettes === 'design') h += '<g stroke="#111" stroke-width="2.6" fill="rgba(60,240,255,.14)"><rect x="78" y="71" width="21" height="15" rx="4.5"/><rect x="101" y="71" width="21" height="15" rx="4.5"/><path d="M99 77h2M78 75l-7-2M122 75l7-2" fill="none"/></g>';
    return h + '</svg>';
  }
  function objById(id) { return list('objectifs').filter(function (o) { return o.id === id; })[0]; }
  function objs() { return list('objectifs').filter(function (o) { return o.statut !== 'supprime'; }); }
  function comps() { return list('competences').filter(function (c) { return c.statut !== 'supprime'; }); }
  function mesuresOf(o) { return list('mesures').filter(function (m) { return m.objectif_id === o.id && num(parseVal(m.valeur)) !== null; }).sort(function (a, b) { return a.mois < b.mois ? -1 : 1; }); }
  /* Valeurs saisies : « 19:45 » pour un temps donne 19,75 minutes */
  function parseVal(v) {
    v = String(v == null ? '' : v).trim();
    if (/^\d+:\d{1,2}$/.test(v)) { var p = v.split(':'); return +p[0] + (+p[1]) / 60; }
    return num(v);
  }
  function fmtVal(v, unite) {
    if (v === null || v === undefined) return '—';
    if (unite === 'min' && v % 1) { var s = Math.round((v % 1) * 60); return Math.floor(v) + ':' + C.pad(s); }
    return String(Math.round(v * 100) / 100).replace('.', ',');
  }
  function avancement(o) {
    var ms = mesuresOf(o), c = parseVal(o.cible);
    if (!ms.length || c === null) return { pct: null, dernier: ms.length ? parseVal(ms[ms.length - 1].valeur) : null, n: ms.length };
    var v0 = parseVal(ms[0].valeur), v = parseVal(ms[ms.length - 1].valeur), pct;
    if (o.sens === 'baisse') pct = v <= c ? 1 : (ms.length > 1 && v0 > c ? (v0 - v) / (v0 - c) : c / v);
    else pct = v >= c ? 1 : (ms.length > 1 && v0 < c && v0 > 0 ? (v - v0) / (c - v0) : v / c);
    return { pct: Math.max(0, Math.min(1, pct)), dernier: v, n: ms.length };
  }
  function moisCourant() { return today().slice(0, 7); }

  T.views.progression = function () {
    if (!T.on('progression')) return '<section class="org-head"><h1>Progression</h1><p class="muted">Ce module est coupé dans les réglages.</p></section>';
    var xp = xpTotal(), niv = {}, f = T.ui.branche || '';
    Object.keys(BRANCHES).forEach(function (b) { niv[b] = niveau(xp[b]); });
    var tr = traits(niv), sp = sportStreak();
    var h = '<section class="org-head"><h1>Progression</h1><p class="muted">Ton personnage évolue avec ce que tu fais. Il ne recule jamais : une branche peut seulement prendre du retard.</p></section>';
    h += '<div class="constel"><div class="avatar-card">' + avatar(tr) + '<ul class="traits">' +
      '<li><b>Carrure</b> Endurance, niveau ' + niv.endurance.n + '</li>' +
      '<li><b>Tenue</b> Finances, niveau ' + niv.finances.n + '</li>' +
      '<li><b>Coiffure</b> ton ressenti, comme le visage</li>' +
      '<li><b>Lunettes</b> ' + tr.perso + ' projet' + (tr.perso > 1 ? 's' : '') + ' perso avancé' + (tr.perso > 1 ? 's' : '') + ' en 4 semaines</li>' +
      '<li><b>Visage</b> ' + (tr.moyenne !== null ? 'ton ressenti des 7 derniers jours, ' + String(Math.round(tr.moyenne * 10) / 10).replace('.', ',') + ' sur 5' : 'note tes journées pour l\'animer') + '</li></ul></div>';
    Object.keys(BRANCHES).forEach(function (b, i) {
      var n = niv[b], pct = n.n >= 10 ? 1 : (n.xp - n.bas) / (n.haut - n.bas);
      var nObj = objs().filter(function (o) { return o.branche === b && o.statut !== 'atteint' && o.statut !== 'abandonne'; }).length;
      h += '<button class="branche br-' + i + (f === b ? ' is-on' : '') + '" data-act="v-branche" data-b="' + b + '" aria-pressed="' + (f === b) + '"><span class="br-top"><span class="br-name">' + BRANCHES[b].label + '</span><span class="br-niv">Niv. ' + n.n + '</span></span>' +
        '<span class="bar"><i style="width:' + Math.round(pct * 100) + '%"></i></span><span class="br-aide">' + esc(BRANCHES[b].aide) + '</span>' +
        '<span class="br-meta">' + Math.round(n.xp) + ' XP' + (nObj ? ', ' + nObj + ' objectif' + (nObj > 1 ? 's' : '') : '') + '</span></button>';
    });
    h += '</div>';
    // Série de sport
    h += '<section class="block"><div class="block-head"><h2>Série de sport</h2><span class="muted small">' + sp.cible + ' séances par semaine</span></div><div class="streak">' + sp.histo.map(function (w) {
      return '<span class="wk' + (w.n >= sp.cible ? ' ok' : (w.m === C.mondayOf(today()) ? ' cur' : '')) + '" title="Semaine du ' + esc(C.shortDate(w.m)) + ' : ' + w.n + ' séance' + (w.n > 1 ? 's' : '') + '"><i>' + w.n + '</i></span>';
    }).join('') + '</div><p class="muted small">' + (sp.semaines ? 'Série de ' + sp.semaines + ' semaine' + (sp.semaines > 1 ? 's' : '') + (sp.rattrapages ? ', dont ' + sp.rattrapages + ' rattrapée' + (sp.rattrapages > 1 ? 's' : '') : '') + '. ' : '') + 'Une semaine manquée se rattrape avec une séance de plus la semaine suivante.</p></section>';
    // Objectifs
    var mois = moisCourant(), actifs = objs().filter(function (o) { return o.statut !== 'atteint' && o.statut !== 'abandonne'; });
    var manque = actifs.filter(function (o) { return !list('mesures').some(function (m) { return m.objectif_id === o.id && m.mois === mois; }); });
    h += '<section class="block"><div class="block-head"><h2>Objectifs' + (f ? ' : ' + brLabel(f) : '') + '</h2><button class="link" data-act="v-obj-new">Ajouter</button></div>';
    if (actifs.length && manque.length) h += '<button class="props-link" data-act="v-releve"><span>Relevé de ' + moisLabel(mois) + ' : <b>' + manque.length + '</b> objectif' + (manque.length > 1 ? 's' : '') + ' à mesurer</span>' + T.ICON.chevron + '</button>';
    Object.keys(HORIZONS).forEach(function (hz) {
      var os = objs().filter(function (o) { return o.horizon === hz && (!f || o.branche === f); });
      if (!os.length) return;
      h += '<h3 class="hz">' + HORIZONS[hz] + '</h3>' + os.map(function (o) {
        var a = avancement(o);
        return '<button class="obj' + (o.statut === 'atteint' ? ' is-done' : '') + '" data-act="v-obj-edit" data-oid="' + esc(o.id) + '"><span class="obj-t">' + esc(o.titre) + '</span>' +
          '<span class="obj-m">' + esc(o.mesure || '') + (o.cible ? ' : ' + fmtVal(a.dernier, o.unite) + ' → ' + esc(String(o.cible)) + ' ' + esc(o.unite || '') : '') + (o.echeance ? ', d\'ici le ' + esc(C.longDate(o.echeance).replace(/^\S+ /, '')) : '') + '</span>' +
          '<span class="bar"><i style="width:' + Math.round((o.statut === 'atteint' ? 1 : (a.pct || 0)) * 100) + '%"></i></span>' +
          '<span class="obj-b">' + brLabel(o.branche) + (o.statut === 'atteint' ? ', atteint' : (a.n ? ', ' + a.n + ' relevé' + (a.n > 1 ? 's' : '') : ', pas encore mesuré')) + '</span></button>';
      }).join('');
    });
    if (!objs().filter(function (o) { return !f || o.branche === f; }).length) h += '<p class="muted">Aucun objectif' + (f ? ' dans cette branche' : '') + '. Exemple : courir 5 km en moins de 20 min d\'ici 3 mois.</p>';
    h += '</section>';
    // Compétences
    var cs = comps().filter(function (c) { return !f || c.branche === f; });
    h += '<section class="block"><div class="block-head"><h2>Compétences</h2><button class="link" data-act="v-comp-new">Ajouter</button></div>';
    h += cs.length ? cs.map(function (c) {
      var n = num(c.niveau) || 0, nv = niveauxOf(c);
      return '<button class="comp" data-act="v-comp-edit" data-kid="' + esc(c.id) + '"><span class="comp-t">' + esc(c.nom) + '<small>' + brLabel(c.branche) + '</small></span><span class="dots5" aria-label="Niveau ' + n + ' sur 5">' + [1, 2, 3, 4, 5].map(function (k) { return '<i' + (k <= n ? ' class="on"' : '') + '></i>'; }).join('') + '</span>' +
        '<span class="comp-n">' + (n ? esc(nv[n - 1] || 'Niveau ' + n) : 'Pas encore placé') + '</span></button>';
    }).join('') : '<p class="muted">Une compétence se décrit en 5 niveaux, puis tu te places avec une preuve. Exemple : négociation, Excel, prise de parole.</p>';
    h += '</section>';
    return h;
  };
  function niveauxOf(c) { return String(c.niveaux || '').split(/\n|\|/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 5); }

  function horizonDate(hz) { var d = C.parseYmd(today()); if (hz === '3m') d.setMonth(d.getMonth() + 3); else if (hz === '1a') d.setFullYear(d.getFullYear() + 1); else d.setFullYear(d.getFullYear() + 5); return C.ymd(d); }
  function opts(map, v) { return Object.keys(map).map(function (k) { return '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + (map[k].label || map[k]) + '</option>'; }).join(''); }
  function openObj(o) {
    var isNew = !o;
    o = o || { horizon: '3m', branche: T.ui.branche || 'endurance', sens: 'hausse', statut: 'actif', unite: '' };
    var ms = isNew ? [] : mesuresOf(o);
    T.openSheet('<form data-form="v-obj" data-oid="' + esc(o.id || '') + '"><h2>' + (isNew ? 'Nouvel objectif' : 'Objectif') + '</h2>' +
      '<label class="field"><span>Objectif</span><input name="titre" required maxlength="100" value="' + esc(o.titre || '') + '" placeholder="Courir 5 km en moins de 20 min"></label>' +
      '<div class="field-row"><label class="field"><span>Horizon</span><select name="horizon">' + opts(HORIZONS, o.horizon) + '</select></label><label class="field"><span>Branche</span><select name="branche">' + opts(BRANCHES, o.branche) + '</select></label></div>' +
      '<label class="field"><span>Ce qu\'on mesure chaque mois</span><input name="mesure" maxlength="80" value="' + esc(o.mesure || '') + '" placeholder="Temps au 5 km"></label>' +
      '<div class="field-row"><label class="field"><span>Cible</span><input name="cible" value="' + esc(o.cible || '') + '" placeholder="20 ou 19:59"></label><label class="field"><span>Unité</span><input name="unite" maxlength="12" value="' + esc(o.unite || '') + '" placeholder="min, €, kg"></label>' +
      '<label class="field"><span>Sens</span><select name="sens"><option value="hausse"' + (o.sens !== 'baisse' ? ' selected' : '') + '>Monter</option><option value="baisse"' + (o.sens === 'baisse' ? ' selected' : '') + '>Descendre</option></select></label></div>' +
      '<label class="field"><span>Échéance</span><input type="date" name="echeance" value="' + esc(o.echeance || '') + '"></label>' +
      (isNew ? '' : '<label class="field"><span>Statut</span><select name="statut"><option value="actif">En cours</option><option value="atteint"' + (o.statut === 'atteint' ? ' selected' : '') + '>Atteint</option><option value="abandonne"' + (o.statut === 'abandonne' ? ' selected' : '') + '>Abandonné</option></select></label>') +
      (ms.length ? '<h3>Relevés</h3><ul class="releves">' + ms.map(function (m) { return '<li><span>' + esc(moisLabel(m.mois)) + '</span><b>' + esc(fmtVal(parseVal(m.valeur), o.unite)) + ' ' + esc(o.unite || '') + '</b>' + (m.preuve ? '<small>' + esc(m.preuve) + '</small>' : '') + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="row-actions"><button class="btn primary" type="submit">Enregistrer</button>' + (isNew ? '' : '<button class="btn" type="button" data-act="v-releve" data-oid="' + esc(o.id) + '">Relevé du mois</button><button class="btn ghost" type="button" data-act="v-obj-del" data-oid="' + esc(o.id) + '">Supprimer</button>') + '</div></form>', { noFocus: !isNew });
  }
  function saveObj(f) {
    var id = f.dataset.oid, old = id ? objById(id) : null, hz = f.horizon.value;
    var o = {
      id: id || T.uid('o'), titre: f.titre.value.trim(), horizon: hz, branche: f.branche.value, mesure: f.mesure.value.trim(), unite: f.unite.value.trim(),
      cible: f.cible.value.trim(), sens: f.sens.value, echeance: f.echeance.value || horizonDate(hz), statut: f.statut ? f.statut.value : 'actif',
      cree_le: old ? old.cree_le : T.nowIso(), maj_le: T.nowIso()
    };
    if (!o.titre) return;
    T.push('objectif', o); T.closeSheet(); T.toast(old ? 'Objectif modifié' : 'Objectif ajouté'); T.render();
  }
  function openReleve(oid) {
    var mois = moisCourant(), os = oid ? [objById(oid)] : objs().filter(function (o) { return o.statut !== 'atteint' && o.statut !== 'abandonne'; });
    if (!os.length || !os[0]) return;
    T.openSheet('<form data-form="v-releve"><h2>Relevé de ' + moisLabel(mois) + '</h2><p class="muted small">Une valeur par objectif, une fois par mois. Laisse vide ce que tu ne mesures pas.</p>' +
      os.map(function (o) {
        var m = list('mesures').filter(function (x) { return x.objectif_id === o.id && x.mois === mois; })[0] || {};
        return '<fieldset class="releve"><legend>' + esc(o.titre) + '</legend><div class="field-row"><label class="field"><span>' + esc(o.mesure || 'Valeur') + (o.unite ? ' (' + esc(o.unite) + ')' : '') + '</span><input name="v_' + esc(o.id) + '" value="' + esc(m.valeur || '') + '" placeholder="' + (o.unite === 'min' ? '21:30' : '') + '"></label>' +
          '<label class="field"><span>Preuve</span><input name="p_' + esc(o.id) + '" value="' + esc(m.preuve || '') + '" placeholder="Course Strava du 10, relevé bancaire"></label></div></fieldset>';
      }).join('') + '<div class="row-actions"><button class="btn primary" type="submit">Enregistrer</button></div></form>', { noFocus: true });
  }
  function saveReleve(f) {
    var mois = moisCourant(), n = 0;
    objs().forEach(function (o) {
      var vi = f.querySelector('[name="v_' + o.id + '"]'); if (!vi) return;
      var v = vi.value.trim(); if (!v) return;
      if (parseVal(v) === null) return;
      T.push('mesure', { id: 'm-' + o.id + '-' + mois, objectif_id: o.id, mois: mois, valeur: v, preuve: f.querySelector('[name="p_' + o.id + '"]').value.trim(), horodatage: T.nowIso() });
      n++;
    });
    T.closeSheet(); T.toast(n ? n + ' relevé' + (n > 1 ? 's' : '') + ' enregistré' + (n > 1 ? 's' : '') : 'Rien à enregistrer'); T.render();
  }
  function compById(id) { return list('competences').filter(function (c) { return c.id === id; })[0]; }
  function openComp(c) {
    var isNew = !c;
    c = c || { branche: T.ui.branche || 'travail', niveaux: '', niveau: '' };
    var nv = niveauxOf(c);
    T.openSheet('<form data-form="v-comp" data-kid="' + esc(c.id || '') + '"><h2>' + (isNew ? 'Nouvelle compétence' : esc(c.nom)) + '</h2>' +
      '<div class="field-row"><label class="field"><span>Compétence</span><input name="nom" required maxlength="60" value="' + esc(c.nom || '') + '" placeholder="Négociation"></label><label class="field"><span>Branche</span><select name="branche">' + opts(BRANCHES, c.branche) + '</select></label></div>' +
      '<label class="field"><span>Les 5 niveaux, un par ligne</span><textarea name="niveaux" rows="5" placeholder="Découvre les bases&#10;Applique avec aide&#10;Autonome sur les cas courants&#10;Gère les cas difficiles&#10;Forme les autres">' + esc(nv.join('\n')) + '</textarea></label>' +
      '<fieldset class="levels"><legend>Où te places-tu ?</legend>' + [1, 2, 3, 4, 5].map(function (k) {
        return '<label class="lvl"><input type="radio" name="niveau" value="' + k + '"' + (+c.niveau === k ? ' checked' : '') + '><span><b>' + k + '</b> ' + esc(nv[k - 1] || '') + '</span></label>';
      }).join('') + '</fieldset>' +
      '<label class="field"><span>Preuve</span><input name="preuve" maxlength="140" value="' + esc(c.preuve || '') + '" placeholder="Ce qui montre ce niveau : un résultat, un retour, un exemple"></label>' +
      (c.evalue_le ? '<p class="muted small">Dernière évaluation le ' + esc(C.shortDate(String(c.evalue_le).slice(0, 10))) + '.</p>' : '') +
      '<div class="row-actions"><button class="btn primary" type="submit">Enregistrer</button>' + (isNew ? '' : '<button class="btn ghost" type="button" data-act="v-comp-del" data-kid="' + esc(c.id) + '">Supprimer</button>') + '</div></form>', { noFocus: !isNew });
  }
  function saveComp(f) {
    var id = f.dataset.kid, old = id ? compById(id) : null;
    var n = (f.querySelector('[name=niveau]:checked') || {}).value || '';
    var c = {
      id: id || T.uid('k'), nom: f.nom.value.trim(), branche: f.branche.value, niveaux: f.niveaux.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 5).join('\n'),
      niveau: n, preuve: f.preuve.value.trim(), evalue_le: n && (!old || String(old.niveau) !== n) ? T.nowIso() : (old ? old.evalue_le : ''), statut: 'actif',
      cree_le: old ? old.cree_le : T.nowIso(), maj_le: T.nowIso()
    };
    if (!c.nom) return;
    if (n && !c.preuve) { T.toast('Ajoute une preuve pour te placer'); return; }
    T.push('competence', c); T.closeSheet(); T.toast('Compétence enregistrée'); T.render();
  }

  /* ===================== Verrouillage ===================== */
  /* Rideau local : il cache l'écran sur ton téléphone, ce n'est pas une protection des données. */
  var LOCK_MIN = 15, LOCK_FAILS = 5, LOCK_PAUSE = 5;
  var lockCfg = function () { return T.LS.get('pp.lock', null); };
  var locked = false, entry = '', lastAct = 0;
  function rand(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
  function b64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
  function unb64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function sha(salt, code) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + code)).then(b64);
  }
  function lockState() { return T.LS.get('pp.lockstate', { last: 0, fails: 0, until: 0 }); }
  function setLockState(o) { T.LS.set('pp.lockstate', Object.assign(lockState(), o)); }
  function touch() {
    if (locked) return;
    var now = Date.now();
    if (now - lastAct > 20000) setLockState({ last: now });
    lastAct = now;
  }
  function shouldLock() {
    if (!lockCfg()) return false;
    var last = Math.max(lastAct, lockState().last || 0);
    return Date.now() - last > LOCK_MIN * 60000;
  }
  function lock() {
    if (!lockCfg() || locked) return;
    locked = true; entry = '';
    T.closeSheet(); T.closePop();
    var el = document.getElementById('lock');
    if (!el) { el = document.createElement('div'); el.id = 'lock'; el.className = 'lock'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'TRINITY verrouillé'); document.body.appendChild(el); }
    document.body.classList.add('is-locked');
    ['main', '.top', '.nav'].forEach(function (s) { var n = document.querySelector(s.charAt(0) === '.' ? s : '#' + s); if (n) n.inert = true; });
    drawLock();
    if (lockCfg().cred && matchMedia('(pointer: coarse)').matches === false) { /* sur ordinateur, Face ID ou Touch ID se lance par le bouton */ }
  }
  function unlock() {
    locked = false; entry = ''; lastAct = Date.now(); setLockState({ last: lastAct, fails: 0, until: 0 });
    document.body.classList.remove('is-locked');
    ['main', '.top', '.nav'].forEach(function (s) { var n = document.querySelector(s.charAt(0) === '.' ? s : '#' + s); if (n) n.inert = false; });
    var el = document.getElementById('lock'); if (el) el.remove();
    if (T.openTarget) T.openTarget(); // une notification touchée pendant le verrouillage s'ouvre maintenant
  }
  T.locked = function () { return locked; };
  function drawLock(msg, mode) {
    var el = document.getElementById('lock'); if (!el) return;
    var st = lockState(), pause = st.until > Date.now(), cf = lockCfg();
    var h = '<div class="lock-in"><svg class="lock-logo" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4.5L27.5 25H4.5z"/></svg><h2>TRINITY</h2>';
    if (mode === 'cle') {
      h += '<form data-form="v-lock-cle" class="lock-cle"><p>Code oublié : saisis la clé de ta passerelle (celle des réglages).</p><input name="cle" type="password" autocomplete="off" aria-label="Clé de la passerelle"><div class="row-actions"><button class="btn primary" type="submit">Déverrouiller</button><button class="btn ghost" type="button" data-act="v-lock-back">Retour</button></div>' + (msg ? '<p class="lock-msg">' + esc(msg) + '</p>' : '') + '</form></div>';
      el.innerHTML = h; var i = el.querySelector('input'); if (i) i.focus(); return;
    }
    h += '<div class="pin" aria-label="' + entry.length + ' chiffres sur 6">' + [0, 1, 2, 3, 4, 5].map(function (i) { return '<i' + (i < entry.length ? ' class="on"' : '') + '></i>'; }).join('') + '</div>';
    if (pause) h += '<p class="lock-msg">Trop d\'essais. Réessaie dans ' + Math.ceil((st.until - Date.now()) / 60000) + ' min.</p>';
    else if (msg) h += '<p class="lock-msg">' + esc(msg) + '</p>';
    h += '<div class="keypad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'faceid', '0', 'del'].map(function (k) {
      if (k === 'faceid') return cf.cred ? '<button class="key key-fid" data-act="v-lock-fid" aria-label="Face ID"' + (pause ? ' disabled' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9v1.5M15 9v1.5M12 9v4h-1M9.5 15.5q2.5 2 5 0"/></svg></button>' : '<span></span>';
      if (k === 'del') return '<button class="key key-del" data-act="v-lock-del" aria-label="Effacer">⌫</button>';
      return '<button class="key" data-act="v-lock-k" data-k="' + k + '"' + (pause ? ' disabled' : '') + '>' + k + '</button>';
    }).join('') + '</div><button class="link small" data-act="v-lock-oubli">Code oublié ?</button></div>';
    el.innerHTML = h;
  }
  function tryCode() {
    var cf = lockCfg(), code = entry;
    if (lockState().until > Date.now()) { entry = ''; drawLock(); return; }
    sha(cf.salt, code).then(function (hh) {
      if (hh === cf.hash) { unlock(); return; }
      var st = lockState(), fails = (st.fails || 0) + 1;
      entry = '';
      if (fails >= LOCK_FAILS) { setLockState({ fails: 0, until: Date.now() + LOCK_PAUSE * 60000 }); drawLock(); setTimeout(function () { if (locked) drawLock(); }, LOCK_PAUSE * 60000 + 500); }
      else { setLockState({ fails: fails }); drawLock('Code incorrect, encore ' + (LOCK_FAILS - fails) + ' essai' + (LOCK_FAILS - fails > 1 ? 's' : '') + '.'); }
    });
  }
  function faceId() {
    var cf = lockCfg();
    if (!cf || !cf.cred || !window.PublicKeyCredential) return;
    navigator.credentials.get({ publicKey: { challenge: rand(32), allowCredentials: [{ type: 'public-key', id: unb64(cf.cred), transports: ['internal'] }], userVerification: 'required', timeout: 60000 } })
      .then(function (r) { if (r) unlock(); }).catch(function () { drawLock('Face ID n\'a pas abouti. Utilise ton code.'); });
  }
  function registerFaceId() {
    var cf = lockCfg();
    if (!cf || !window.PublicKeyCredential) { T.toast('Face ID n\'est pas disponible ici'); return; }
    navigator.credentials.create({ publicKey: {
      challenge: rand(32), rp: { name: 'TRINITY', id: location.hostname },
      user: { id: rand(16), name: 'trinity', displayName: 'TRINITY' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000, attestation: 'none'
    } }).then(function (cred) {
      cf.cred = b64(cred.rawId); T.LS.set('pp.lock', cf); T.toast('Face ID activé'); T.closeSheet();
    }).catch(function () { T.toast('Face ID n\'a pas été activé'); });
  }
  function setCode(f) {
    var a = f.code1.value.trim(), b = f.code2.value.trim(), cf = lockCfg();
    if (!/^\d{6}$/.test(a)) { T.toast('Le code doit compter 6 chiffres'); return; }
    if (a !== b) { T.toast('Les deux codes ne sont pas identiques'); return; }
    var salt = b64(rand(16));
    sha(salt, a).then(function (hh) {
      T.LS.set('pp.lock', { salt: salt, hash: hh, cred: cf ? cf.cred : '' }); lastAct = Date.now(); setLockState({ last: lastAct, fails: 0, until: 0 });
      T.closeSheet(); T.toast(cf ? 'Code changé' : 'Verrouillage activé : après 15 min sans activité');
    });
  }
  function lockOff(f) {
    var cf = lockCfg(); if (!cf) return;
    sha(cf.salt, f.code.value.trim()).then(function (hh) {
      if (hh !== cf.hash) { T.toast('Code incorrect'); return; }
      T.LS.set('pp.lock', null); T.closeSheet(); T.toast('Verrouillage désactivé');
    });
  }
  document.addEventListener('pointerdown', touch, true);
  document.addEventListener('keydown', function (e) {
    touch();
    if (!locked) return;
    if (/^\d$/.test(e.key) && entry.length < 6 && !(e.target && e.target.name === 'cle')) { entry += e.key; drawLock(); if (entry.length === 6) tryCode(); }
    else if (e.key === 'Backspace' && !(e.target && e.target.name === 'cle')) { entry = entry.slice(0, -1); drawLock(); }
  }, true);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { setLockState({ last: lastAct }); return; }
    if (shouldLock()) lock();
  });
  setInterval(function () { if (!locked && shouldLock()) lock(); }, 30000);

  /* ===================== Réglages ===================== */
  T.hooks.settings = function () {
    var off = String(P().modules_off || '').split(','), cf = lockCfg(), pk = !!window.PublicKeyCredential;
    var h = '<form data-form="v-modules" class="rythme"><h3>Modules de TRINITY 2.0</h3><p class="muted">Chacun se coupe sans rien effacer.</p>' + MODULES.map(function (m) {
      return '<label class="opt"><input type="checkbox" name="' + m[0] + '"' + (off.indexOf(m[0]) === -1 ? ' checked' : '') + '><span>' + esc(m[1]) + '</span></label>';
    }).join('') + '<div class="field-row"><label class="field"><span>Verres d\'eau par jour</span><input name="eau_verres" inputmode="numeric" value="' + cible('eau_verres') + '"></label>' +
      '<label class="field"><span>Heures sociales par semaine</span><input name="social_h_semaine" inputmode="decimal" value="' + cible('social_h_semaine') + '"></label></div>' +
      '<div class="field-row"><label class="field"><span>Séances de sport par semaine</span><input name="sport_semaine" inputmode="numeric" value="' + cible('sport_semaine') + '"></label>' +
      '<label class="field"><span>Coût d\'un repas maison (€)</span><input name="cout_repas_maison" inputmode="decimal" value="' + String(cible('cout_repas_maison')).replace('.', ',') + '"></label></div>' +
      '<label class="opt"><input type="checkbox" name="rappels_legers"' + (T.LS.get('pp.rappels_legers', true) ? ' checked' : '') + '><span>Rappels légers dans l\'app (eau) : un petit message discret, sans son. Les rappels importants restent les notifications des tâches à cloche.</span></label>' +
      '<button class="btn" type="submit">Enregistrer</button></form>';
    h += '<div class="rythme"><h3>Verrouillage</h3><p class="muted">Cache TRINITY après ' + LOCK_MIN + ' min sans activité. C\'est un rideau sur cet appareil, pas un coffre-fort : tes données restent dans ta base Google.</p>';
    if (!cf) h += '<form data-form="v-lock-set"><div class="field-row"><label class="field"><span>Code à 6 chiffres</span><input name="code1" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label><label class="field"><span>Confirmer</span><input name="code2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label></div><button class="btn" type="submit">Activer le verrouillage</button></form>';
    else h += '<div class="row-actions">' + (pk ? (cf.cred ? '<button class="btn" data-act="v-lock-fid-off">Retirer Face ID</button>' : '<button class="btn primary" data-act="v-lock-fid-on">Activer Face ID</button>') : '') + '<button class="btn" data-act="v-lock-now">Verrouiller maintenant</button></div>' +
      '<form data-form="v-lock-set" class="sub"><div class="field-row"><label class="field"><span>Nouveau code</span><input name="code1" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label><label class="field"><span>Confirmer</span><input name="code2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label></div><button class="btn sm" type="submit">Changer le code</button></form>' +
      '<form data-form="v-lock-off" class="sub"><label class="field"><span>Code actuel, pour désactiver</span><input name="code" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password"></label><button class="btn sm ghost" type="submit">Désactiver</button></form>';
    h += '</div>';
    h += '<details class="rythme"><summary><h3>Raccourci « TRINITY Santé »</h3></summary><p class="muted">iOS ne laisse pas une page web lire Santé : un raccourci envoie chaque matin ton sommeil et tes pas à ta passerelle. Santé est illisible téléphone verrouillé, d\'où l\'envoi après le déverrouillage.</p><ol class="steps">' +
      '<li>App Raccourcis, bouton +, nomme le raccourci exactement « TRINITY Santé ».</li>' +
      '<li>Ajoute « Rechercher des échantillons de santé » : type Nombre de pas, date de début aujourd\'hui. Puis « Calculer des statistiques » : Somme. Renomme le résultat Pas.</li>' +
      '<li>Même chose avec la date de début hier et la date de fin aujourd\'hui : résultat Pas hier.</li>' +
      '<li>Ajoute « Rechercher des échantillons de santé » : type Analyse du sommeil, date de début dans les 2 derniers jours. Puis « Obtenir les détails des échantillons » : Date de début, et une seconde fois : Date de fin. Formate les deux en ISO 8601.</li>' +
      '<li>Ajoute « Obtenir le contenu de l\'URL » : l\'adresse de ta passerelle, méthode POST, corps JSON avec key (ta clé) et ops : une opération sante_brut pour aujourd\'hui (jour, pas, sommeil_debuts, sommeil_fins) et une pour hier (jour, pas hier).</li>' +
      '<li>Onglet Automatisation : « Quand j\'ouvre une app » (celle que tu ouvres chaque matin), lancer TRINITY Santé, sans demander. iOS affichera une petite notification, c\'est normal.</li></ol>' +
      '<p class="muted small">Sans montre, l\'iPhone estime le temps au lit, pas le sommeil réel. Une Garmin enverra un sommeil plus juste dans Santé, sans rien changer ici.</p><a class="btn" href="' + SHORTCUT + '">Lancer le raccourci</a></details>';
    return h;
  };

  /* ===================== Formulaires et actions ===================== */
  T.hooks.submit = function (f) {
    var k = f.dataset.form;
    if (k === 'v-cren') saveCren(f);
    else if (k === 'v-sante') saveSante(f);
    else if (k === 'v-obj') saveObj(f);
    else if (k === 'v-releve') saveReleve(f);
    else if (k === 'v-comp') saveComp(f);
    else if (k === 'v-lock-set') setCode(f);
    else if (k === 'v-lock-off') lockOff(f);
    else if (k === 'v-lock-cle') {
      var cfg = T.cfg();
      if (!cfg || (cfg.key && f.cle.value === cfg.key)) { unlock(); T.LS.set('pp.lock', null); T.toast('Déverrouillé. Choisis un nouveau code dans les réglages.'); }
      else drawLock('Clé incorrecte.', 'cle');
    } else if (k === 'v-prix') {
      var r = repas(f.dataset.m, today());
      if (r) { r.prix = String(num(f.prix.value) || ''); setVie(r); }
      T.closePop(); T.render();
    } else if (k === 'v-plan') {
      setVie({ id: 'plan-' + f.dataset.m + '-' + today(), jour: today(), type: 'repas_plan', valeur: f.plan.value.trim(), lieu: '', prix: '', note: f.dataset.m });
      T.closePop(); T.render();
    } else if (k === 'v-modules') {
      var off = MODULES.map(function (m) { return m[0]; }).filter(function (m) { return !f[m].checked; });
      T.push('parametre', { cle: 'modules_off', valeur: off.join(',') });
      ['eau_verres', 'social_h_semaine', 'sport_semaine', 'cout_repas_maison'].forEach(function (c) {
        var v = num(f[c].value); if (v !== null && String(v) !== String(P()[c] || '')) T.push('parametre', { cle: c, valeur: String(v) });
      });
      T.LS.set('pp.rappels_legers', f.rappels_legers.checked);
      T.closeSheet(); T.toast('Réglages enregistrés'); T.render();
    }
  };
  T.hooks.click = function (act, a) {
    var d = today();
    switch (act) {
      case 'v-cren-new': openCren(null, { apres: a.dataset.apres === '1', jour: a.dataset.day || (T.ui.view === 'organisation' ? T.ui.orgDay : d), debut: a.dataset.debut, categorie: a.dataset.cat }); break;
      case 'v-cren-edit': var c = crenById(a.dataset.cid); if (c) openCren(c); break;
      case 'v-cren-del':
        var cd = crenById(a.dataset.cid); if (!cd) break;
        cd.statut = 'supprime'; cd.maj_le = T.nowIso(); T.push('creneau', cd); T.closeSheet();
        T.toast('Créneau supprimé', function () { cd.statut = 'actif'; T.push('creneau', cd); T.render(); }); T.render(); break;
      case 'v-eau':
        var n = Math.max(0, eau(d) + (+a.dataset.d));
        setVie({ id: 'eau-' + d, jour: d, type: 'eau', valeur: String(n), lieu: '', prix: '', note: '' }); T.render(); break;
      case 'v-repas':
        var r = repas(a.dataset.m, d) || { id: 'repas-' + a.dataset.m + '-' + d, jour: d, type: 'repas_' + a.dataset.m, lieu: '', prix: '', note: '' };
        r.valeur = r.valeur === a.dataset.v ? '' : a.dataset.v;
        if (!r.valeur) { r.lieu = ''; r.prix = ''; }
        setVie(r); T.render(); break;
      case 'v-lieu':
        var rl = repas(a.dataset.m, d); if (!rl) break;
        rl.lieu = rl.lieu === a.dataset.v ? '' : a.dataset.v; if (rl.lieu !== 'dehors') rl.prix = '';
        setVie(rl); T.render();
        if (rl.lieu === 'dehors') { var b = document.querySelector('[data-act="v-prix"][data-m="' + a.dataset.m + '"]'); if (b) b.click(); }
        break;
      case 'v-prix':
        var rp = repas(a.dataset.m, d) || {};
        T.openPop(a, '<form data-form="v-prix" data-m="' + esc(a.dataset.m) + '" class="pop-form"><label class="field"><span>Prix du repas (€)</span><input name="prix" inputmode="decimal" value="' + esc(rp.prix || '') + '"></label><button class="btn primary sm" type="submit">OK</button></form>');
        var pi = document.querySelector('#pop input'); if (pi) pi.focus(); break;
      case 'v-plan':
        var pl = vie('plan-' + a.dataset.m + '-' + d) || {};
        T.openPop(a, '<form data-form="v-plan" data-m="' + esc(a.dataset.m) + '" class="pop-form"><label class="field"><span>Repas prévu ' + (a.dataset.m === 'midi' ? 'ce midi' : 'ce soir') + '</span><input name="plan" maxlength="60" value="' + esc(pl.valeur || '') + '" placeholder="Pâtes au thon, salade"></label><button class="btn primary sm" type="submit">OK</button></form>');
        var pli = document.querySelector('#pop input'); if (pli) pli.focus(); break;
      case 'v-sante-saisie': santeForm(); break;
      case 'v-branche': T.ui.branche = T.ui.branche === a.dataset.b ? '' : a.dataset.b; T.render(); break;
      case 'v-obj-new': openObj(null); break;
      case 'v-obj-edit': openObj(objById(a.dataset.oid)); break;
      case 'v-obj-del':
        var od = objById(a.dataset.oid); if (!od) break;
        od.statut = 'supprime'; od.maj_le = T.nowIso(); T.push('objectif', od); T.closeSheet(); T.toast('Objectif supprimé'); T.render(); break;
      case 'v-releve': openReleve(a.dataset.oid); break;
      case 'v-comp-new': openComp(null); break;
      case 'v-comp-edit': openComp(compById(a.dataset.kid)); break;
      case 'v-comp-del':
        var kd = compById(a.dataset.kid); if (!kd) break;
        kd.statut = 'supprime'; kd.maj_le = T.nowIso(); T.push('competence', kd); T.closeSheet(); T.toast('Compétence supprimée'); T.render(); break;
      case 'v-lock-k': if (entry.length < 6) { entry += a.dataset.k; drawLock(); if (entry.length === 6) tryCode(); } break;
      case 'v-lock-del': entry = entry.slice(0, -1); drawLock(); break;
      case 'v-lock-fid': faceId(); break;
      case 'v-lock-oubli': drawLock('', 'cle'); break;
      case 'v-lock-back': drawLock(); break;
      case 'v-lock-now': T.closeSheet(); lastAct = 0; setLockState({ last: 0 }); lock(); break;
      case 'v-lock-fid-on': registerFaceId(); break;
      case 'v-lock-fid-off': var cf = lockCfg(); if (cf) { cf.cred = ''; T.LS.set('pp.lock', cf); T.closeSheet(); T.toast('Face ID retiré'); } break;
    }
  };
  /* La catégorie choisie change l'aide affichée sous les puces */
  document.addEventListener('change', function (e) {
    if (e.target.name === 'categorie' && e.target.closest('[data-form="v-cren"]')) {
      var p = e.target.closest('form').querySelector('.cat-aide'); if (p) p.textContent = CATS[e.target.value].aide;
    }
  });

  /* ===================== Démarrage ===================== */
  T.init = function () {
    var s = S();
    ['sante', 'vie', 'creneaux', 'objectifs', 'mesures', 'competences'].forEach(function (k) { if (!s[k]) s[k] = []; });
    if (!T.cfg() && !s._v2demo) demo(s);
    navLink();
    if (lockCfg() && shouldLock()) lock();
    else { lastAct = Date.now(); if (lockCfg()) setLockState({ last: lastAct }); }
  };

  /* Démo : quelques données de vie pour voir les écrans sans base reliée */
  function demo(s) {
    var t = today(), m = C.mondayOf(t), ago = function (n) { return C.addDays(t, -n); };
    s._v2demo = true;
    s.creneaux = [
      { id: 'c-demo1', titre: 'Ventes privées', categorie: 'bloque', jour_debut: C.addDays(t, 3), jour_fin: C.addDays(t, 5), debut: '', fin: '', statut: 'actif' },
      { id: 'c-demo2', titre: 'Footing 6 km', categorie: 'sport', jour_debut: m <= ago(1) ? ago(1) : t, debut: '18:30', fin: '19:15', statut: 'actif' },
      { id: 'c-demo3', titre: 'Soirée chez Tom', categorie: 'social', jour_debut: ago(2) >= m ? ago(2) : t, debut: '19:30', fin: '23:30', note: '5', statut: 'actif' },
      { id: 'c-demo4', titre: 'Fractionné', categorie: 'sport', jour_debut: ago(8), debut: '18:30', fin: '19:20', statut: 'actif' },
      { id: 'c-demo5', titre: 'Séance', categorie: 'sport', jour_debut: ago(10), debut: '18:30', fin: '19:20', statut: 'actif' },
      { id: 'c-demo6', titre: 'Séance', categorie: 'sport', jour_debut: ago(12), debut: '18:30', fin: '19:20', statut: 'actif' },
      { id: 'c-demo7', titre: 'Séance', categorie: 'sport', jour_debut: ago(15), debut: '18:30', fin: '19:20', statut: 'actif' },
      { id: 'c-demo8', titre: 'Séance', categorie: 'sport', jour_debut: ago(17), debut: '18:30', fin: '19:20', statut: 'actif' },
      { id: 'c-demo9', titre: 'Séance', categorie: 'sport', jour_debut: ago(19), debut: '18:30', fin: '19:20', statut: 'actif' }
    ];
    s.sante = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return { jour: ago(i), pas: String(6000 + i * 1300), sommeil_min: String(400 + (i % 3) * 25), coucher: '23:' + C.pad(20 + i * 5), lever: '07:0' + (i % 6), source: 'demo' }; });
    s.vie = [{ id: 'eau-' + t, jour: t, type: 'eau', valeur: '3' }, { id: 'repas-midi-' + t, jour: t, type: 'repas_midi', valeur: 'correct', lieu: 'dehors', prix: '12.5' }];
    s.objectifs = [
      { id: 'o-demo1', titre: 'Courir 5 km en moins de 20 min', horizon: '3m', branche: 'endurance', mesure: 'Temps au 5 km', unite: 'min', cible: '20', sens: 'baisse', echeance: C.addDays(t, 90), statut: 'actif' },
      { id: 'o-demo2', titre: 'Épargner 3 000 €', horizon: '1a', branche: 'finances', mesure: 'Épargne', unite: '€', cible: '3000', sens: 'hausse', echeance: C.addDays(t, 365), statut: 'actif' }
    ];
    s.mesures = [
      { id: 'm-o-demo1-' + C.addDays(t, -40).slice(0, 7), objectif_id: 'o-demo1', mois: C.addDays(t, -40).slice(0, 7), valeur: '23:40', horodatage: ago(40) },
      { id: 'm-o-demo1-' + C.addDays(t, -10).slice(0, 7), objectif_id: 'o-demo1', mois: C.addDays(t, -10).slice(0, 7), valeur: '22:15', horodatage: ago(10) }
    ];
    s.competences = [{ id: 'k-demo1', nom: 'Négociation', branche: 'travail', niveaux: 'Connaît les bases\nApplique avec aide\nAutonome sur les cas courants\nGère les cas difficiles\nForme les autres', niveau: '2', preuve: 'Remise négociée seul avec un fournisseur', statut: 'actif' }];
  }
})();
