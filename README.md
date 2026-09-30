# Magazine GFDJ United — suivi de production

Outil de suivi de production du magazine trimestriel de Groupama-FDJ United :
chemin de fer de 72 pages par numéro, desk d'idées (cards à 3 phases), planning de prod, administration.

- Hébergement : GitHub Pages (site statique : `index.html`, `app.js`, `logic.js`, `store.js`, `seed.js`, `styles.css`)
- Données : Firebase, projet `groupama-fdj-united` (Auth Google + Firestore), collections `magConfig`, `magIssues`, `magCards`
- Le premier compte connecté (l'admin racine des règles) initialise la structure, l'équipe et les 4 numéros.
- **Règles Firestore** : `firestore.rules` contient les règles du planning **et** celles du magazine. Firestore n'accepte qu'un seul
  jeu de règles par projet : à publier tel quel dans la console Firebase (Firestore → Règles).
- **Mode démo** : `index.html?demo` — données fictives en mémoire, rien n'est écrit.
- Tests de la logique métier : `node --test tests/logic.test.mjs`

## Modèle
- Numéro : 72 emplacements (`pages`) de type À attribuer / Rubrique / Intercalaire / Publireportage / Publicité.
- Card : rubrique + numéro + 3 phases (1A rédactionnel, 1B iconographique, 2 conception), chacune désactivable.
- Avancement : chaque phase active pèse autant (1/3, ou 1/2 si une est désactivée) ; les pages d'ajustement sont hors calcul.
- Retard : échéance dépassée non clôturée → alerte nominative sur la personne attribuée.
- Conflit : une échéance 1A/1B non antérieure au début de conception, ou postérieure à la date de sortie.
