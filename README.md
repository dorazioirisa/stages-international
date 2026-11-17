# Stages International — Informatique & Numérique

Application web de gestion des stages à l'étranger (thématique informatique / numérique),
développée en HTML/CSS/JavaScript pur avec stockage local (localStorage).

## Rôles

- **Étudiant** : consulte les sujets de stage correspondant à son diplôme, postule avec un
  dossier complet (message de motivation, CV, courriel de l'enseignant référent, bulletins
  de notes, lettres de recommandation) et suit sa candidature étape par étape.
- **Partenaire (entreprise / université)** : dépose des sujets de stage, examine les
  candidatures reçues, retient les dossiers, demande des compléments et clôt la procédure.
- **Administrateur** : valide les comptes, envoie les conditions générales, établit les
  mises en relation, arbitre les situations bloquées et analyse les données
  (statistiques et graphiques : candidatures par statut, par composante, par diplôme,
  sujets par pays, taux d'aboutie).

## Procédure de candidature (par étapes)

1. **Soumise** — l'étudiant postule à un sujet.
2. **Dossier retenu** — le partenaire retient le dossier.
3. **Conditions générales** — l'administrateur envoie les conditions à accepter.
4. **Conditions acceptées** — l'étudiant accepte.
5. **Mise en relation** — l'administrateur établit le contact avec l'entreprise.
6. **Compléments fournis** — l'étudiant transmet les éléments complémentaires.
7. **Aboutie / Refusée** — décision finale du partenaire.

Sans réponse de l'entreprise pendant plus de **7 jours**, une alerte invite l'étudiant à
revenir vers l'administrateur.

## Lancement

Aucune installation ni dépendance : ouvrez simplement `index.html` dans un navigateur
moderne (ou servez le dossier avec n'importe quel serveur statique).

> Les données (comptes, sujets, candidatures, fichiers ≤ 1,2 Mo) sont stockées dans le
> navigateur (localStorage). Il s'agit d'un prototype : l'authentification est simulée et
> ne doit pas être utilisée en production.

## Comptes de démonstration

| Rôle | Email | Mot de passe |
|---|---|---|
| Administrateur | `admin@stages.fr` | `admin123` |
| Partenaire | `contact@techcorp.de` | `partner123` |
| Étudiant | `lea.dupont@iut-grenoble.fr` | `etu123` |
