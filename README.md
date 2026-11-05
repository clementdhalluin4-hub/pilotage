# Poste de pilotage

Mini-site personnel d'organisation : synthèse du jour, organisation heure par heure, listes de tâches bicolores (priorité à gauche, entité à droite), apprentissage des habitudes.

Le code ne contient aucune donnée. Les tâches vivent dans un Google Sheets privé, lu par une passerelle Apps Script protégée par une clé, que l'on saisit dans les réglages du site.

## Passerelle

Le dossier `passerelle` contient le code Apps Script (Code.gs et Notifications.gs), à coller dans le Google Sheets « Poste de pilotage — base » : Extensions > Apps Script. Aucune clé ni donnée n'y figure : elles restent dans les propriétés du script.
