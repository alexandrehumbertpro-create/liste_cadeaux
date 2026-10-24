# Kad’Humbert

Pour les âmes en panne d’inspiration.

Application web responsive : Next.js 16, React 19, TypeScript, Supabase (authentification, PostgreSQL, stockage privé), Resend et Unsplash. L’application réelle est dans `src/`. La maquette autonome historique reste dans `maquette/`.

## Démarrer

Node.js 22 ou 24, npm et un projet Supabase sont nécessaires. Docker permet de démarrer Supabase localement si vous préférez développer sans compte.

```sh
npm ci
cp .env.example .env.local
```

Configurez les variables dans `.env.local` ou dans les paramètres sécurisés de votre hébergeur :

| Variable | Utilisation |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | URL publique du projet |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Clé publique du projet |
| SUPABASE_SERVICE_ROLE_KEY | Clé serveur ; ne jamais mettre dans une variable NEXT_PUBLIC |
| APP_URL | URL de l’application (HTTPS en production) |
| RESEND_API_KEY | Envoi des emails |
| EMAIL_FROM | Adresse d’envoi sur un domaine vérifié dans Resend |
| UNSPLASH_ACCESS_KEY | Recherche et sélection d’illustrations |
| CRON_SECRET | Secret aléatoire protégeant les relances email |

Appliquez `supabase/migrations/202610100001_initial.sql` dans le SQL Editor d’un nouveau projet Supabase, ou utilisez `supabase db push` après avoir associé le projet. La migration crée les tables, les règles de confidentialité, les transactions de réservation et le bucket privé `gift-images`.

Créez les deux utilisateurs dans Supabase → Authentication → Users (Alex et Elise), avec emails confirmés et mots de passe. Autorisez chacun en utilisant son UUID :

```sh
node scripts/allow-admin.mjs UUID_ALEX "Alex"
node scripts/allow-admin.mjs UUID_ELISE "Elise"
npm run dev
```

Aucun compte créé librement ne devient gestionnaire : il faut être inscrit dans `profiles`. Les invités utilisent `/l/[jeton]`, sans connexion. Le lien personnel `/reservation/[jeton]` leur permet d’annuler leur réservation.

Pour Supabase local standard : `SUPABASE_HOME=/tmp/kad-supabase npm run db:start`, configurez les clés locales sans les publier, puis appliquez les migrations avec `supabase db reset` **uniquement sur une base locale jetable**. Les variables SUPABASE_HOME et le cache npm dans `/tmp` évitent les répertoires personnels en lecture seule de l’environnement cloud.

## Fonctions

- Carnet partagé avec idées privées au créateur, visibilité « Nous deux » ou « Public ».
- Accueil Pour qui, puis Mes listes, Mes idées, À classer et Archives. Une idée attribuée à plusieurs personnes crée un cadeau indépendant pour chacune ; Commun reste distinct.
- Capture publique par défaut, listes facultatives, À classer pour les idées sans destinataire. Aperçu image après récupération d’un lien.
- Listes illustrées, message d’accueil, lien invité unique, partage préparé WhatsApp/Gmail/SMS et carnet de destinataires du partage.
- Capture express, brouillon personnel sur l’appareil, import de liens, photo importée ou caméra, illustrations Unsplash avec attribution.
- Priorités, budget exact ou fourchette, filtres, filtres enregistrés, favoris et ordre personnel.
- Notes de gestion séparées, modification depuis une liste, historique des changements, sélection groupée, archives motivées et restauration.
- Réservation immédiate, noms familiaux et email requis, participation collective plafonnée sans paiement. Identités masquées et découverte volontaire.
- Réservés en bas dans une section dédiée, duplication et réutilisation avec de nouvelles réservations, export JSON des données accessibles au gestionnaire.
- Installation PWA, réception des liens via le menu de partage sur les navigateurs compatibles, bouton `+ Idée` fixe. Aucun contenu privé mis en cache par le service worker.

Les brouillons sont propres au compte **et à l’appareil**, pas synchronisés entre appareils. L’import d’un lien reste un essai : certains sites le bloquent ; l’édition manuelle reste disponible. Le partage depuis le téléphone dépend du navigateur et de l’installation PWA, principalement Android ; le copier-coller reste disponible sur iOS. Les idées « Public » ne sont pas indexées : elles sont accessibles aux personnes possédant le lien d’une liste.

## Emails

Une file transactionnelle enregistre les emails au moment de la réservation, de l’annulation et des changements importants. Sans clé Resend, les tâches restent en attente ; aucun email n’est prétendu envoyé. Chaque envoi utilise une clé d’idempotence, avec dix tentatives maximum. Configurez un appel planifié régulier à `GET /api/mail` avec `Authorization: Bearer CRON_SECRET` pour traiter les reprises et les tâches restantes. Les actions traitent aussi un lot immédiatement. Les notifications gestionnaire n’affichent pas les noms des réservants. La fréquence disponible est à chaque réservation ou désactivée ; aucun résumé quotidien ni notification push n’est implémenté. Le choix de recevoir ces notifications se fait dans le compte.

Avant publication : renseignez vos services, vérifiez une vraie livraison d’email, la recherche Unsplash, l’import d’une photo et l’ouverture du lien depuis un téléphone externe. Configurez les URL d’authentification Supabase, le domaine Resend et un hébergement HTTPS Next.js. `npm run build` puis `npm start` démarrent la version de production ; la publication reste à effectuer sur votre hébergeur.

## Vérifier

```sh
npm run typecheck
npm test
npm run build
```

Tests PostgreSQL sur une base dédiée jetable, jamais sur votre projet réel :

```sh
docker run -d --name kad-postgres-tests -p 127.0.0.1:55432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine
docker exec kad-postgres-tests pg_isready -U postgres
npm run test:db
```

`test:db` crée et supprime sa propre base, teste les droits des rôles et les transactions avec des connexions concurrentes. Les schémas `auth` et `storage` de ces tests sont des fixtures ; ce test ne valide pas le fournisseur de stockage.

Pour les parcours navigateur, `scripts/local-test-stack.mjs` démarre GoTrue et PostgREST réels autour du PostgreSQL de test, crée des comptes locaux jetables et garde leurs identifiants dans un fichier privé de `/tmp`. Il refuse d’écraser un `.env.local` existant. Après un arrêt, `node scripts/resume-local.mjs` redémarre ses conteneurs, renouvelle les clés de développement et relance le routage local, sans toucher à un projet distant. Cette pile est destinée à un premier lancement dans un environnement isolé ; elle ne remplace pas Supabase pour les photos. Lancez ensuite l’application et `node scripts/browser-check.mjs` (Chromium système ou `CHROMIUM_PATH`). Ne réutilisez pas cette pile, ses clés ou ses comptes pour publier. Les ports de cette pile sont liés à l’interface locale, sans authentification réseau PostgreSQL ; elle reste exclusivement destinée aux tests isolés.

Voir aussi le [cahier des charges](CAHIER_DES_CHARGES.md) et l’[audit UX](AUDIT_UX_UI.md).

## Mise à jour du 13 octobre 2026

Pour un projet existant, appliquer `supabase/migrations/202610130001_simplify_capture.sql` dans Supabase SQL Editor **avant** de déployer cette version. Ne pas rejouer la migration initiale. La migration conserve les idées, listes et réservations ; elle remplace les appartenances globales par des appartenances explicites aux listes existantes. Pour une nouvelle installation, appliquer les deux migrations dans l’ordre.

Le bouton de récupération affiche les champs trouvés et l’aperçu image. L’extraction lit Open Graph, Twitter Cards et les produits JSON-LD. Un site qui bloque les accès automatiques ou charge ses informations uniquement en JavaScript peut nécessiter une saisie manuelle.

## Capture et personnalisation

Les photos sont préparées dans le navigateur (JPEG, bord maximal 2048 px, envoi inférieur à 2 Mo) pour rester sous les limites de requête de l’hébergement. Les fichiers HEIC sont convertis à la demande. Les liens directs d’images http/https sont utilisables pour les idées et les couvertures, avec aperçu.

Dans Pour qui, Couleur personnalise chaque carte. La même couleur est reprise dans la sélection des personnes lors de l’ajout d’une idée. Cette personnalisation, comme les favoris, appartient au compte connecté et est conservée dans ses préférences Supabase. Les personnes peuvent aussi être créées avec leur couleur directement dans le formulaire d’idée.

Vérifications locales supplémentaires : `node scripts/browser-check-capture.mjs`, `node scripts/browser-check-colors.mjs`, `HEIC_TEST_FILE=/chemin/fixture.heic node scripts/test-photo-preparation.mjs`. Les deux premiers scripts exigent la pile d’intégration jetable et ses comptes de test ; TEST_APP_URL doit être une adresse locale. Le troisième exige Chromium et une fixture HEIC locale.

## Personnes, notifications d’ajout et partage rapide

Avant de déployer cette version sur un projet existant, appliquer `supabase/migrations/202610240001_people_and_gmail.sql`. Pour un projet neuf, appliquer toutes les migrations dans l’ordre.

- « Modifier l’ordre » affiche des commandes de déplacement et autorise le glisser-déposer sur ordinateur. Les favoris restent en tête ; chaque groupe garde son ordre personnel. Les flèches sont désactivées à la frontière des groupes.
- Une personne peut être renommée ou supprimée. La suppression propose de garder ses cadeaux dans À classer ou de retirer ses cadeaux actifs en les conservant aux archives. Les associations aux listes sont conservées, mais les cadeaux sans personne active disparaissent de la vue invitée. Les réservations concernées sont annulées. Les idées privées de l’autre administrateur ne sont pas modifiées ; si leur personne a été supprimée, elles apparaissent comme non classées chez leur propriétaire. Les anciens destinataires restent consultables dans les archives. Recréer un nom supprimé réactive sa fiche.
- « Commun E&A » est protégé contre le renommage, la suppression et le changement du statut commun.
- Le prix et la priorité sont accessibles directement dans le formulaire. Les précisions restent dépliables.
- « Prévenir de l’ajout ? » permet de choisir Elise et/ou Alex après le bouton d’enregistrement. Les adresses sont celles des profils administrateur, sans adresses personnelles codées dans le client. Une idée privée ne peut notifier que son propriétaire.
- Le partage rapide est réservé aux administrateurs : message WhatsApp prérempli ou email direct depuis le compte Gmail connecté. Il ne contient jamais les notes de gestion ou les identités des réservants.

Pour activer l’envoi réel, suivre [GMAIL_SETUP.md](GMAIL_SETUP.md). La configuration Google et l’autorisation de chaque administrateur sont nécessaires ; les messages restent en attente tant qu’elles ne sont pas terminées. La connexion OAuth n’a pas été réalisée avec un compte réel pendant le développement.

Vérification locale supplémentaire : `TEST_APP_URL=http://localhost:3000 node scripts/browser-check-people-mail.mjs`, sur la pile d’intégration jetable uniquement.
