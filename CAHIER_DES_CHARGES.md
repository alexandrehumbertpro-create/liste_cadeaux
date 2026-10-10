# Kad’Humbert — cahier des charges fonctionnel

Version de travail du 7 octobre 2026, destinée à préparer la maquette mobile.

Slogan : « Pour les âmes en panne d’inspiration ». Identité visuelle pop : rose, violet, jaune et crème, titres arrondis, touches graphiques façon stickers, animations légères et formulaires sobres.

## 1. Objectif

Permettre à un couple de recueillir, organiser et conserver ses idées cadeaux, puis de partager des listes ciblées avec des proches. Ajouter une idée et réserver un cadeau doivent demander peu d’étapes. Les invités n’ont pas à créer de compte.

L’application sera un site adapté au téléphone, installable sur l’écran d’accueil. La première version privilégie les usages mobiles tout en restant utilisable sur ordinateur.

## 2. Utilisateurs et accès

Chaque membre du couple possède son compte. Chacun peut créer des idées privées et participer à la gestion des idées communes.

La vue **Toutes les idées** constitue la liste générale de gestion. Elle affiche toutes les idées auxquelles la personne connectée a accès : ses idées privées et les idées communes. Elle n’affiche jamais les idées privées de l’autre personne. Par défaut, elle présente les idées actives ; un filtre permet de consulter les archives.

Un lien invité correspond à une seule liste d’occasion. L’invité ne peut pas changer de liste ni accéder à la gestion. Il peut filtrer les cadeaux par destinataire, budget et priorité. Les protections s’appliquent également aux données et aux actions, et pas seulement aux écrans.

## 3. Une idée unique, des destinataires et plusieurs occasions

Les destinataires sont des personnes, distinctes des tags d’occasion. À la création, on sélectionne une ou plusieurs personnes dans la liste existante, ou on ajoute un nouveau destinataire. On sélectionne séparément une ou plusieurs occasions existantes, ou on crée une nouvelle occasion. Ces choix sont facultatifs pour enregistrer une idée rapidement.

Le tag spécial « Idée globale », présenté comme « ✨ Toutes les listes », inclut une idée dans toutes les listes actuelles et futures. Une explication au toucher précise que la visibilité, les destinataires et la réservation ne changent pas. Une idée globale privée ou archivée reste masquée aux invités.

Une idée est enregistrée une seule fois et peut apparaître dans plusieurs listes d’occasions sans dupliquer sa fiche. Les listes correspondent aux occasions (Noël, anniversaire, etc.) et rassemblent les destinataires concernés. Une vue Destinataires permet, transversalement, de retrouver les idées d’une personne à travers toutes les occasions. La vue générale conserve toutes les idées accessibles, y compris les idées non classées.

Les destinataires et les occasions ne modifient pas automatiquement la confidentialité. Retirer une occasion retire l’idée de cette liste, sans supprimer sa fiche ni son association aux autres occasions.

Pour un même produit destiné à plusieurs personnes, la description est commune mais les priorités, réservations et historiques restent propres à chaque destinataire. Pour une personne donnée, plusieurs listes montrant la même proposition partagent sa réservation. Une nouvelle proposition pour une occasion ultérieure conserve l’historique précédent.

## 4. Contenu d’une idée

Seul le titre est obligatoire pour enregistrer rapidement une idée. Les autres informations sont facultatives :

- Photo ou image.
- Lien vers un produit, une activité ou une page utile.
- Prix indicatif ou budget estimé, en euros dans la première version.
- Description générale et champ Précisions distinct pour la taille, la couleur, le modèle ou les options souhaitées. Les précisions sont visibles aux invités autorisés à consulter l’idée.
- Destinataire(s) et occasions, sélectionnés séparément.
- Priorité en trois niveaux : Coup de cœur (envie favorite), Top idée (très appréciée), Bonne idée (option sympa, par défaut). Ces niveaux sont affichés sur chaque carte, dans le détail et dans le formulaire. La vue invitée propose un filtre et classe les coups de cœur en premier.
- Type : produit, expérience, cadeau fait maison ou service.
- Possibilité de participer à plusieurs.

Un prix inconnu est affiché comme tel ; il n’est pas assimilé à zéro. Les filtres permettent de choisir une tranche de budget et d’inclure ou non les idées sans prix.

## 5. Ajouter une idée

### Saisie manuelle

L’utilisateur saisit un titre et peut importer une image déjà enregistrée pour illustrer son idée. Il enregistre immédiatement ou complète les destinataires et les occasions avant validation.

### Coller un lien

Le parcours commence par le lien : l’application tente d’abord de récupérer le titre, l’image, la description et le prix lorsque le site le permet, puis présente les champs préremplis et modifiables. L’utilisateur vérifie et corrige les informations avant validation. En cas d’échec, le lien est conservé et la saisie manuelle reste disponible. Le prix récupéré est indicatif, sans promesse de mise à jour automatique.

### Photo et boîte à idées

Le mode Prendre une photo lance la caméra sur les appareils compatibles pour photographier un objet sur le vif. L’import d’une image déjà enregistrée est disponible dans le mode manuel. Une image seule ne suffit pas à identifier automatiquement un produit dans la première version : il renseigne au moins un titre.

La boîte à idées permet de retrouver les idées non classées et de leur attribuer ensuite des destinataires et des occasions. Les nouvelles idées sont privées par défaut, y compris lorsqu’elles sont enregistrées rapidement.

### Partage depuis le téléphone

Une évolution permettra d’envoyer un lien ou une image depuis le menu « Partager » du téléphone lorsque le navigateur et le système le permettent. Coller un lien et importer une image restent les solutions disponibles sur les appareils non compatibles.

Les suggestions automatiques de classement et la détection des doublons sont exclues du périmètre retenu.

## 6. Confidentialité et partage

Une idée possède l’une des visibilités suivantes :

- **Privée** : visible uniquement par son auteur.
- **Commune** : visible par les deux membres du couple, sans être accessible aux invités.
- **Partageable** : visible par le couple et susceptible d’apparaître dans une liste partagée.

Passer une idée en partageable est une action explicite. Ajouter des tags, restaurer une archive ou créer une liste ne change pas automatiquement sa visibilité.

Chaque liste d’occasion possède une présentation personnalisable : photo d’illustration importée, titre personnalisé et slogan ou petit message facultatif. Sans titre personnalisé, le nom de l’occasion est utilisé. Cette présentation apparaît dans la vue gestionnaire et dans la liste invitée. Modifier le titre ne renomme pas l’occasion et ne change pas les idées associées.

Chaque liste peut être partagée par un lien difficile à deviner. Avant de diffuser le lien, les gestionnaires peuvent prévisualiser exactement ce qu’un invité verra. Ils peuvent désactiver ou renouveler le lien ; l’ancien lien ne donne alors plus accès aux listes associées.

Un lien permet l’accès à une seule liste à toute personne qui le possède, y compris s’il est transféré. Il ne constitue pas une invitation nominative.

Une liste partagée expose seulement les idées partageables et actives correspondant à ses critères. Les tags internes non nécessaires, les notes privées et les listes non incluses dans le lien ne sont pas exposés.

## 7. Réservations et surprises

### Réserver seul

L’invité ouvre la liste, choisit un cadeau et indique un prénom ou un pseudonyme. Il confirme sa réservation sans créer de compte. Le cadeau apparaît ensuite comme réservé aux autres invités.

Un lien personnel lui permet de retrouver et d’annuler sa réservation. Ce lien est affiché immédiatement avec une invitation à le conserver. L’envoi par email n’est pas requis dans la première version.

Deux réservations simultanées ne doivent pas produire deux confirmations pour un cadeau individuel. La personne arrivant après la réservation reçoit un message clair et peut choisir une autre idée.

### Préserver la surprise

Pour le destinataire, les réservations de ses cadeaux sont masquées par défaut : l’écran courant ne révèle ni leur état ni les participants. Un bouton **Révéler les réservations** avertit qu’il peut dévoiler la surprise et permet volontairement de voir les réservations et les noms déclarés.

Les invités voient la disponibilité des cadeaux, mais pas les noms des autres participants. Le membre du couple qui organise les cadeaux pour une autre personne peut consulter les réservations utiles à l’organisation.

### Participer à plusieurs

Pour une idée autorisant une participation collective, plusieurs invités peuvent s’inscrire et indiquer un montant prévu. La liste affiche le budget cible, le total des intentions et le montant restant. Une fois le budget atteint, les nouvelles participations sont bloquées jusqu’à une éventuelle annulation.

Les montants sont des intentions déclarées : l’application ne collecte pas d’argent et ne confirme pas qu’un paiement ou un achat a eu lieu. Chaque participant dispose de son lien personnel pour annuler sa participation. Les noms et les montants détaillés restent masqués au destinataire jusqu’à révélation.

## 8. Archivage et conservation

Archiver retire une idée ou une proposition des listes actives concernées tout en conservant ses informations, ses tags et son historique. Le motif est obligatoire :

- **Offert** : le cadeau a été offert ; date facultative.
- **Abandonné** : l’idée n’est plus retenue, notamment lorsqu’on aurait voulu la supprimer.
- **Indisponible** : le produit ou l’expérience n’est plus accessible.
- **Autre motif** : une explication est demandée.

Une note complémentaire peut accompagner les autres motifs. Les archives indiquent le motif, la date et la personne ayant effectué l’action.

Si la fiche concerne plusieurs destinataires, l’utilisateur choisit d’archiver uniquement la proposition concernée ou toute l’idée. Archiver une seule proposition ne retire pas les propositions actives des autres destinataires.

En présence de réservations, l’écran avertit avant l’archivage. Les liens personnels affichent ensuite que l’idée n’est plus proposée ; les réservations sont clôturées et conservées dans l’historique. La première version ne promet pas de notification automatique.

Restaurer remet l’idée ou la proposition à disposition, en conservant le motif d’archivage dans l’historique. Une ancienne réservation ne redevient jamais active automatiquement. La visibilité reste inchangée ; si la restauration la fait réapparaître dans une liste partagée, l’écran le signale avant confirmation.

Une idée offerte peut être réutilisée pour une autre occasion avec une nouvelle proposition. La suppression définitive n’est pas une action courante de la première version.

## 9. Parcours à représenter dans la maquette

1. **Ajouter rapidement** : ouvrir l’application → ajouter → saisir un titre ou coller un lien → enregistrer une idée privée → classer maintenant ou plus tard.
2. **Organiser** : ouvrir Toutes les idées → filtrer ou rechercher → choisir une idée → modifier occasions, destinataires, priorité et visibilité.
3. **Partager** : ouvrir une occasion → vérifier les idées et les destinataires → prévisualiser la vue invité → activer et copier le lien.
4. **Réserver** : ouvrir le lien reçu → filtrer par budget → consulter une idée → indiquer son prénom → confirmer → conserver son lien personnel.
5. **Participer à plusieurs** : ouvrir une idée collective → consulter le montant restant → déclarer sa participation → conserver son lien personnel.
6. **Révéler** : ouvrir sa liste → choisir Révéler les réservations → confirmer → consulter les choix et les noms.
7. **Archiver** : choisir l’idée ou la proposition → archiver → sélectionner le motif → vérifier les conséquences → confirmer.
8. **Restaurer ou réutiliser** : ouvrir les archives → consulter motif et historique → restaurer ou proposer pour une nouvelle occasion.

## 10. Exemples de référence

### Une idée présente dans deux listes

Un casque a Alex pour destinataire et « Noël 2026 » et « Anniversaire 2027 » pour occasions. Il apparaît dans les deux listes et dans la vue transversale d’Alex. Une réservation pour Alex est visible comme indisponibilité dans les deux listes invitées. Retirer « Noël 2026 » conserve la fiche dans la seconde occasion et dans la vue d’Alex ; cela n’annule pas silencieusement une réservation existante.

### Une idée confidentielle

Alex ajoute une surprise pour sa femme et la garde privée. Même avec l’occasion « Noël 2026 » et sa femme comme destinataire, elle n’apparaît ni dans sa vue générale à elle ni dans une liste accessible par lien.

### Un cadeau abandonné

Un objet n’est finalement plus souhaité. Il est archivé avec le motif Abandonné. Il disparaît des listes actives, reste retrouvable dans les archives et peut être restauré plus tard.

### Un produit pour deux personnes

Un même livre convient à deux destinataires. La description est commune ; chaque personne a sa propre priorité et sa propre proposition. Réserver pour l’une ne bloque pas le cadeau pour l’autre.

## 11. Périmètre de réalisation

### Première version utilisable

- Deux comptes et vue générale avec recherche, tags et filtres.
- Fiches uniques, listes par occasion, vue transversale des destinataires et propositions distinctes par destinataire.
- Visibilités privée, commune et partageable.
- Ajout manuel, collage de lien avec récupération au mieux, photo et boîte à idées non classées.
- Priorités, budgets et cadeaux sans produit.
- Liens de partage par liste, prévisualisation et révocation.
- Réservation sans compte, annulation par lien personnel et protection contre les réservations simultanées.
- Surprise masquée par défaut et révélation volontaire.
- Participation collective sans paiement.
- Archives avec motif, historique et restauration.

### Évolution suivante

- Réception depuis le menu Partager des téléphones compatibles.
- Ajustements issus de l’usage réel du couple et des premiers invités.

Les préférences des destinataires, rappels, quantités multiples, paiements, suggestions automatiques et détection des doublons ne font pas partie de cette version.

## 12. Critères de validation

- Une idée peut être enregistrée avec seulement un titre et retrouvée sans classement préalable.
- Une même idée apparaît dans plusieurs listes d’occasions sans dupliquer sa description. Les destinataires sont sélectionnés séparément, et leurs vues traversent toutes les occasions.
- Une réservation reste cohérente entre les listes d’un même destinataire et indépendante entre deux destinataires.
- Un invité ne peut accéder à aucune liste non incluse dans son lien, ni à une idée privée en utilisant son identifiant.
- Une idée privée reste privée après modification de ses tags.
- Un lien désactivé ou renouvelé ne permet plus d’accéder à la liste.
- Deux demandes simultanées pour un cadeau individuel produisent au plus une réservation active.
- Le destinataire ne découvre les réservations qu’après une action explicite de révélation.
- Chaque archive affiche son motif et reste retrouvable ; une restauration ne réactive pas les anciennes réservations.
- L’échec de récupération d’un lien n’empêche pas l’ajout manuel.
- Une participation collective est présentée comme une intention, sans suggérer qu’un paiement a été effectué.

## 13. Hypothèses proposées pour la maquette

Les règles suivantes précisent les demandes sans avoir encore été validées individuellement : nouvelles idées privées par défaut, priorité en trois niveaux, euro comme devise initiale, budget cible pour les participations collectives et partage mobile après la première version.

La maquette pourra rendre ces choix concrets avant leur validation finale. Elle commencera par la vue générale, l’ajout d’une idée et la liste invitée avec réservation, puis couvrira les archives et les cas collectifs.

## Accès directs à la gestion

La vue Pour qui possède un bouton Ajouter un destinataire. La vue Occasions possède un bouton Créer une liste / occasion. Chaque liste dispose d’un bouton Partager cette liste, ouvrant les actions Copier le lien, Envoyer le lien et Prévisualiser la liste invitée. Le partage utilise le menu système lorsque disponible, sinon la rédaction d’un email.

## Révision du 10 octobre 2026 — règles retenues

Cette révision remplace les anciennes formulations contradictoires sur les occasions, les surprises et les réservations.

- Le produit se nomme Kad’Humbert, avec le slogan « Pour les âmes en panne d’inspiration ».
- Les listes sont des sélections partageables, sans obligation de correspondre à une occasion. La navigation distingue Toutes les idées, Listes, Pour qui et Archives.
- Une idée peut être sans destinataire ou sans liste, porter des tags libres et convenir à plusieurs personnes. Les destinataires peuvent être créés, recherchés et réordonnés. Plusieurs destinataires expriment des possibilités ; ils ne doivent pas imposer plusieurs achats.
- L’application sera un site responsive, installable pour les gestionnaires. Les invités utilisent un lien web, sans installation ni compte obligatoire. Un lien ouvre une seule liste, filtrable par personne, prix, priorité et réservation.
- Recherche sans distinction d’accents ou de casse dans titres, descriptions, précisions et tags, avec filtres combinables et tris.
- Toute idée accessible peut être modifiée depuis le carnet, une liste ou la vue destinataire. Tous ses paramètres sont éditables, y compris sa visibilité. Une idée privée n’est consultable et modifiable que par son auteur, Alex ou Elise. Retirer d’une liste est distinct de supprimer/archiver avec motif.
- Le détail permet d’ouvrir le lien du produit ou de l’activité. Les précisions taille/couleur/options sont distinctes de la description.
- Prix précis, fourchette minimum–maximum ou prix inconnu. Un filtre de budget retient les fourchettes qui recoupent la plage demandée.
- Trois priorités : Coup de cœur, Top idée et Bonne idée. Les états de réservation sont visibles et filtrables ; l’identité du réservant est cachée jusqu’à une action volontaire, illustrée par un retournement de carte.
- Nom et email sont obligatoires pour réserver. Le parcours final valide l’adresse email, puis envoie confirmation et lien d’annulation à l’invité et une notification aux gestionnaires sans dévoiler le réservant par défaut.
- Envoyer le lien demande le nom du contact, puis WhatsApp, Gmail ou SMS, avec coordonnées facultatives et message préparé. L’historique conserve le contact, le canal et l’état Partage préparé : ouvrir un canal ne prouve pas l’envoi.
- La recherche d’illustrations Unsplash est accessible depuis l’ajout d’une idée. Recherche, galerie, sélection, image d’illustration et crédit fournisseur sont prévus. L’application finale utilisera un service serveur et les règles actuelles de l’API, sans exposer de clé dans le navigateur.

La maquette n’est pas une application de production : comptes, autorisations serveur, API Unsplash, extraction de liens, envois email et synchronisation des réservations ne sont pas implémentés. Les illustrations du parcours Unsplash sont des exemples graphiques simulés, pas des résultats de l’API.

Le destinataire Commun est distinct d’Alex et d’Elise : une idée commune apparaît uniquement dans la vue Commun, pas dans leurs vues individuelles. Dans le formulaire, Commun exclut la sélection de personnes individuelles. Il ne modifie pas la confidentialité. Le logo revient à Mes idées pour un gestionnaire ; dans un lien invité, il conserve l’accès à la seule liste partagée.

## Améliorations retenues — version 3

- Ajout express titre/lien/photo, idées à classer, brouillon automatique et partage entrant depuis le navigateur mobile compatible.
- Favoris et ordre personnel des destinataires/listes ; actions groupées ; filtres enregistrés ; candidats et destinataire choisi distincts.
- Notes de gestion non publiées ; historique depuis l’espace administrateur et chaque idée ; annulation de la dernière action ; affichage des listes où une idée est partageable.
- Archives séparées pour idées et listes. Archiver une liste conserve les idées dans le carnet ; restauration possible. Le motif Offert concerne l’archive d’une idée, sans statut d’achat dans les réservations.
- Récapitulatif avant réservation ; nom familial accepté avec email obligatoire. Les participants organisent eux-mêmes les achats collectifs.
- Email aux réservants lors d’un changement important ou archivage d’une idée réservée. Réglages des notifications des gestionnaires : email/app, fréquence, noms masqués.
- Duplication d’une liste avec sélection des idées et nouvelles propositions sans anciennes réservations ; réutilisation d’une idée, original conservé ; export du carnet accessible.
- Exclus : raccourci Petits budgets, organisateur d’achat collectif, révocation/renouvellement du lien et nouveaux statuts acheté/offert côté invité.

La duplication crée dans la maquette des propositions copiées indépendantes pour illustrer le nouvel événement. L’application finale devra distinguer la fiche descriptive commune et les propositions/réservations par événement. Les envois email restent simulés et l’intégration Unsplash non connectée.

## Révision — classement et brouillons

Les tags libres sont retirés des formulaires, filtres et actions groupées. Le classement utilise destinataires, listes, budgets et priorités. Les cadeaux réservés se placent automatiquement après les cadeaux non réservés et sont grisés, dans le carnet, les listes et les vues destinataires/invités. Le tri choisi s’applique à l’intérieur de ces deux groupes.

Sur Mes idées, un encart Reprendre mon brouillon apparaît dès qu’un brouillon contient un titre, un lien ou une photo. Il est personnel au gestionnaire et conservé sur cet appareil. Le brouillon courant n’est pas une idée enregistrée : À classer contient les idées déjà enregistrées mais encore sans destinataire ou liste. Une action Supprimer le brouillon est disponible.

## Décisions validées après l’audit — version 5 (prioritaires sur les anciennes propositions)

- Visibilité Public, et non Partageable. Elle concerne seulement les invités des listes partagées. Aucun gestionnaire ne peut choisir Moi uniquement sur une idée créée par un autre gestionnaire.
- Publication avec un destinataire choisi unique (ou Commun). Les autres destinataires sont des pistes possibles dans le carnet. Une autre personne reçoit une proposition distincte et une réservation indépendante.
- Réservation immédiate avec nom et email obligatoires, sans validation ni expiration. Budget collectif atteint : les participations cessent. Le gestionnaire peut remettre disponible une réservation active ou archivée.
- Brouillon : demande explicite avant remplacement, état fiable, suppression de l’encart après sauvegarde. Formulaire progressif, détails facultatifs et enregistrement accessible.
- Page liste dédiée, retour à la même liste après édition, actions Ajouter/Partager principales et autres actions dans un menu.
- Filtres propres à chaque vue, résultats et compteurs cohérents, états vides réinitialisables.
- Accueil compact, badge Confidentiel et cadenas pour les idées privées, distinction Commun/Nous deux, favoris en tête et mode Organiser.
- Réservés lisibles dans une section Déjà réservés. Sélection groupée avec compteur, champs conditionnels et confirmation d’archive. Action Archiver explicitement nommée.
- Avatar accessible au clavier, focus des dialogues confiné puis restitué, cibles tactiles agrandies et disposition élargie sur ordinateur.
- Historique avant/après, par exemple Prix : 40 → 60, pour comprendre les modifications.

Les emails et appels Unsplash restent simulés dans la maquette. Les règles de confidentialité et les réservations simultanées devront être assurées côté serveur dans l’application réelle.
