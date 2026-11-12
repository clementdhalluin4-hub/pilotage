/**
 * Sauvegarde hebdomadaire de la base « Poste de pilotage — base ».
 * À coller comme nouveau fichier dans le même projet Apps Script (bouton + > Script, nom « Sauvegarde »).
 * Exécuter installerSauvegarde() une fois et autoriser l'accès à Google Drive :
 * une copie complète de la base est faite chaque dimanche vers 3 h, dans le dossier « TRINITY sauvegardes » de ton Drive.
 * Les 8 dernières copies sont gardées (deux mois). La date de la dernière copie s'affiche dans les réglages du site.
 */

var SAUVEGARDE_DOSSIER = 'TRINITY sauvegardes';
var SAUVEGARDE_GARDER = 8;

function installerSauvegarde() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sauvegarderBase') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sauvegarderBase').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
  sauvegarderBase(); // première copie tout de suite, pour vérifier que tout fonctionne
  Logger.log('Sauvegarde installée : chaque dimanche vers 3 h, dossier « ' + SAUVEGARDE_DOSSIER + ' ».');
}

function sauvegarderBase() {
  var ss = ss_();
  var dossier = dossierSauvegarde_();
  var quand = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd HH:mm');
  DriveApp.getFileById(ss.getId()).makeCopy(ss.getName() + ' (sauvegarde ' + quand + ')', dossier);
  // Ne garder que les copies les plus récentes
  var copies = [], it = dossier.getFiles();
  while (it.hasNext()) copies.push(it.next());
  copies.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  copies.slice(SAUVEGARDE_GARDER).forEach(function (f) { f.setTrashed(true); });
  upsert_('Parametres', 'cle', { cle: 'derniere_sauvegarde', valeur: quand, note: 'Copie automatique de la base, dossier ' + SAUVEGARDE_DOSSIER });
}

function dossierSauvegarde_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SAUVEGARDE_DOSSIER_ID');
  if (id) { try { var d = DriveApp.getFolderById(id); if (!d.isTrashed()) return d; } catch (e) {} }
  var found = DriveApp.getFoldersByName(SAUVEGARDE_DOSSIER);
  var dossier = found.hasNext() ? found.next() : DriveApp.createFolder(SAUVEGARDE_DOSSIER);
  props.setProperty('SAUVEGARDE_DOSSIER_ID', dossier.getId());
  return dossier;
}
