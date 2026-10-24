# Activer les emails Gmail de La Hotte Humbert

Les emails d’ajout d’idée et les partages rapides sont envoyés depuis le compte Gmail de l’administrateur connecté. Aucun mot de passe Gmail n’est demandé ni stocké. Les confirmations de réservation, annulations, changements et notifications aux administrateurs partent du Gmail d’Alex (profil administrateur nommé « Alex »). Aucun compte Resend ni domaine d’expédition ne sont nécessaires. La connexion Gmail d’Elise ne remplace jamais automatiquement celle d’Alex pour ces messages.

## Avant le déploiement

Dans Supabase → SQL Editor, exécuter une seule fois le fichier `supabase/migrations/202610240001_people_and_gmail.sql`. Il protège le destinataire Commun E&A, ajoute la suppression des personnes avec conservation des cadeaux et crée le stockage sécurisé des connexions Gmail.

Ne pas rejouer les migrations précédentes sur un projet déjà initialisé. Sur un nouveau projet, appliquer les trois migrations dans l’ordre.

## Créer les identifiants Google

1. Ouvrir [Google Cloud Console](https://console.cloud.google.com/) et créer ou sélectionner un projet, par exemple « La Hotte Humbert ».
2. Dans **API et services → Bibliothèque**, rechercher **Gmail API** et l’activer.
3. Ouvrir **Google Auth Platform** (ou « Écran de consentement OAuth », selon l’interface).
4. Renseigner le nom de l’application et l’adresse de contact. Pour des adresses Gmail personnelles, sélectionner une audience **Externe**.
5. Dans les accès aux données/scopes, demander `openid`, `email` et `https://www.googleapis.com/auth/gmail.send`. L’application ne demande pas de lecture de la boîte de réception.
6. Dans **Branding**, enregistrer la page d’accueil HTTPS et la politique de confidentialité publique : `https://listecadeaux-mauve.vercel.app/confidentialite` (adapter si le domaine change). La page est aussi accessible depuis l’écran de connexion du site. Ne pas renseigner un lien de conditions d’utilisation inexistant.
7. Si l’application est en mode **Test**, ajouter les deux adresses Gmail administrateur comme utilisateurs de test. Ces adresses sont celles visibles dans « Mon compte » dans La Hotte Humbert.
8. Créer un **client OAuth → Application Web**.
9. Ajouter une URI de redirection autorisée : `https://VOTRE-DOMAINE/api/gmail/callback`. Avec le domaine de production actuel, ce sera `https://listecadeaux-mauve.vercel.app/api/gmail/callback`. Utiliser le domaine principal du projet, pas une adresse temporaire de déploiement.
10. Copier l’ID client et le secret client **uniquement dans les variables sécurisées Vercel**, jamais dans la conversation ou dans Git.

## Variables Vercel

Dans le projet → Settings → Environment Variables, renseigner pour Production :

| Nom | Valeur | Type |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | ID du client OAuth Web | Config |
| `GOOGLE_CLIENT_SECRET` | Secret du client OAuth Web | Secret |
| `APP_URL` | L’adresse principale HTTPS de La Hotte Humbert, sans slash final | Config |

Conserver `SUPABASE_SERVICE_ROLE_KEY` dans les variables **Secret** existantes. Elle sert aussi de racine au chiffrement AES-GCM des jetons Gmail. Sa rotation nécessite de reconnecter les deux comptes Gmail ; ne pas supprimer cette variable.

Relancer le déploiement après l’enregistrement des variables.

## Connecter Alex puis Elise

1. Ouvrir La Hotte Humbert avec le compte Alex.
2. Ouvrir l’avatar → **Connecter mon Gmail**.
3. Choisir l’adresse Google identique à l’email du compte administrateur et autoriser l’envoi. Un autre compte est refusé.
4. Vérifier le message « Votre Gmail est connecté ».
5. Refaire les étapes avec le compte Elise.

Après connexion, les emails déjà préparés en attente sont réessayés. Alex peut aussi relancer les notifications de réservation via « Réessayer les emails en attente ». Si son Gmail est déconnecté ou son autorisation expirée, les messages restent en attente ; aucun succès de livraison n’est annoncé. Le bouton « Réessayer les emails en attente » permet de relancer un envoi refusé temporairement. En mode Test Google, un jeton peut expirer après sept jours : une reconnexion sera alors nécessaire. Le passage en production et les éventuelles exigences de vérification se règlent dans Google Auth Platform.

## Confidentialité et limites

- Les jetons sont chiffrés côté serveur et la table `admin_mailboxes` est inaccessible aux clients Supabase anonymes et authentifiés. Seul le serveur autorisé y accède.
- Chaque connexion est liée au compte administrateur et à son email Google vérifié.
- Les notes de gestion et les identités des réservants ne figurent jamais dans un partage rapide.
- Une idée « Moi uniquement » ne peut pas notifier l’autre administrateur. L’accès est revérifié avant l’envoi d’un email en attente.
- Les emails restent en attente tant que les identifiants Google et le compte expéditeur ne sont pas connectés. « Préparé » ne signifie pas « envoyé ».
- Les photos téléchargées sont jointes au message ; les images web restent des références au site qui les héberge.
- Pour des réessais automatiques indépendants de l’utilisation du site, configurer un appel planifié du point d’entrée existant `/api/mail` avec son secret `CRON_SECRET`.
