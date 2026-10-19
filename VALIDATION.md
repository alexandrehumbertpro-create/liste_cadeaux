# Validation de la première application

Vérifications exécutées dans cet environnement le 10 octobre 2026 :

- Installation reproductible avec `npm ci`, vérification TypeScript et compilation de production Next.js réussies.
- 6 tests de domaine réussis : fourchettes de budget, prix inconnus, validation des réservations, publication, adresses interdites pour l’import de liens.
- 17 scénarios PostgreSQL réussis sur des bases jetables. Ils testent notamment les rôles, l’isolation des idées privées et de leur historique, l’absence de données privées dans la vue invitée, les réservations concurrentes, le plafond des participations, les restaurations, les droits de modification et la duplication des idées globales sans ancienne réservation. Un changement vers « Moi uniquement » ne dévoile aucun nouveau titre dans le lien de réservation ou les emails suivants.
- 13 parcours Chromium réussis sur l’application compilée : connexion réelle, création des destinataires/listes, brouillon, conservation d’un lien partagé pendant la connexion, publication, confidentialité, réservation invitée, révélation volontaire des noms, modification depuis une liste, archivage/annulation et annulation par l’invité. Affichage à 390 et 1440 pixels, bouton d’ajout fixe et absence de débordement horizontal vérifiés.
- Démarrage et reprise des services locaux d’authentification (GoTrue), de données (PostgREST) et de l’application vérifiés par des requêtes fonctionnelles. Les clés locales sont uniquement destinées aux tests et ne doivent pas servir au déploiement.

Les tests SQL utilisent des fixtures pour les schémas `auth` et `storage`. Les tests navigateur utilisent GoTrue et PostgREST réels. Aucun de ces tests ne valide le stockage Supabase réel, la caméra d’un téléphone physique, la livraison Resend ou les réponses de l’API Unsplash : les comptes et clés correspondants ne sont pas encore fournis.

Le démarrage standard de Supabase local a échoué sur la taille de l’image PostgreSQL dans cet environnement ; les vérifications ont utilisé une image PostgreSQL 17 plus légère. Le premier téléchargement de Chromium Playwright était interdit par le réseau ; le navigateur Chromium déjà installé a permis les tests. L’essai d’import externe de `https://example.com` a échoué à la résolution DNS dans cet environnement. La protection des adresses est testée, mais l’extraction d’un vrai produit reste à vérifier sur l’hébergement final. Le formulaire permet de compléter les champs à la main en cas d’échec.

Les emails sont enregistrés dans une file transactionnelle ; sans Resend ils restent en attente. Leur livraison réelle, leur domaine d’envoi et les relances planifiées doivent être testés avant ouverture aux invités. Les préférences proposent les emails à chaque réservation ou leur désactivation ; aucun résumé quotidien ni notification push n’est livré.

L’application n’est pas publiée. La configuration réutilisable de l’environnement cloud (installation, reprise des services et variables nécessaires) est enregistrée dans un brouillon de paramètres ; sa publication et la restauration dans une nouvelle tâche ne sont pas vérifiées.

## Mise à jour du 13 octobre 2026

- TypeScript et compilation de production : vérifiés.
- 9 tests unitaires, dont extraction JSON-LD, prix français et images relatives.
- 19 scénarios PostgreSQL sur base jetable : confidentialité, réservations concurrentes, création atomique de cadeaux indépendants et capture publique sans destinataire exclue des liens invités.
- 13 parcours navigateur de régression avec GoTrue/PostgREST réels en local.
- 2 parcours supplémentaires à 390 et 1440 px : nouvel accueil, grilles, clic sur image, aperçu de récupération, absence des anciens champs, attribution multiple, À classer et raccourci invité. La réponse metadata est simulée pour les contrôles UI ; le parseur est testé séparément. L’extraction sur un site marchand réel n’a pas été vérifiée dans cette session.
- Migration distante et déploiement : à faire après application du fichier `202610130001_simplify_capture.sql`. Aucun changement appliqué au projet Supabase distant ni à Vercel dans cette session.

## Correction des cartes et des fiches produit

- 15 tests unitaires passent : priorité aux données Product JSON-LD et microdata, sélection du produit correspondant à l’URL, titre HTML de la fiche, exclusion des logos, signalement d’une page générale, retrait des paramètres publicitaires tout en conservant l’offre.
- Les parcours à 390 et 1440 px vérifient les clics sur image, destinataire, espace de la carte et ouverture au clavier, sans ouvrir la fiche lors de la sélection d’une case. Les boutons et liens restent indépendants.
- Cdiscount : fiche fournie par l’utilisateur non consultée dans cette session, car le proxy Codex refuse le domaine (HTTP 403 CONNECT). Accès ajouté au brouillon réseau Codex ; publication de l’environnement nécessaire avant validation sur la fiche réelle. Ne pas présenter la récupération Cdiscount comme vérifiée.

## Vérification du lien Cdiscount De’Longhi — 19 octobre 2026

Le lien fourni a été demandé sans son fragment de navigation. Le tunnel HTTPS a abouti ; la réponse de la destination est HTTP 403 avec une page HTML intitulée « Accès bloquéCdiscount.fr », sans données Open Graph, JSON-LD ni titre de produit. L’extraction automatique de ce produit n’est donc pas validée. Le code distingue maintenant les blocages HTTP 401/403/429 et les pages de vérification servies en HTML ; ces pages ne doivent jamais préremplir une idée avec leur titre. Aucun prix ni image n’a été déduit du lien ou inventé.
