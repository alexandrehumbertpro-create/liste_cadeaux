# Kad’Humbert — maquette version 7

Slogan : Pour les âmes en panne d’inspiration.

Ouvrir index.html dans un navigateur. Le HTML est autonome pour les parcours de démonstration. Le pack complet ajoute les captures, les icônes et les fichiers nécessaires au partage entrant sur navigateur compatible.

## Parcours et règles

- Accueil et navigation sur mobile et ordinateur : Pour qui → Mes listes → Mes idées → À classer → Archives. Le logo revient vers Pour qui.
- Mes idées : deux cartes par ligne sur mobile, trois sur ordinateur. Cartes entièrement cliquables, badges de listes renforcés, ajout express, brouillon personnel, recherche, filtres, sélection groupée et tris.
- À classer : uniquement les idées sans destinataire ; une idée sans liste mais attribuée à une personne reste hors de cette rubrique.
- Listes : bouton Afficher la liste en mode invité, retour à la vue gestionnaire, création, favoris en tête, ordre personnel dans le mode Organiser. Chaque liste possède une page avec Ajouter une idée, Partager, recherche et filtres. Le menu Actions regroupe couverture/message, duplication et archivage.
- Pour qui : une seule sélection de personnes. Plusieurs personnes sélectionnées créent une idée indépendante pour chacune, avec des réservations indépendantes. Commun reste distinct et exclusif. Ajouter depuis une personne la présélectionne.
- Confidentialité : Moi uniquement, Nous deux (gestionnaires), Public (invités des listes auxquelles l’idée appartient). Public ne signifie pas publication dans un annuaire. Seul le créateur peut rendre une idée privée. Les idées privées sont signalées par cadenas, contour et badge Confidentiel.
- Formulaire progressif : titre/lien, personnes et listes facultatives, prix et priorité, visibilité Public par défaut, images et détails facultatifs. Aucun second champ de destinataire ni option Toutes les listes. Le bouton d’enregistrement reste disponible dans le formulaire.
- Brouillons : enregistrés automatiquement sur cet appareil, séparés par gestionnaire. Une nouvelle saisie ou édition ne remplace pas un autre brouillon sans choix explicite. L’encart disparaît après sauvegarde.
- Réservation immédiate avec nom familial et email obligatoire : aucune validation ni expiration. Budget collectif atteint = fermeture des contributions. Les réservés sont grisés et regroupés sous Déjà réservés, après les autres idées.
- Le gestionnaire peut remettre un cadeau disponible depuis son détail, y compris dans les archives, avec confirmation. Restaurer une idée ne réactive pas sa réservation.
- Historique par idée et administrateur avec modifications avant/après. Notes de gestion exclues du lien invité. Notifications et réglages illustrés.
- Archives : vues Idées et Listes, motifs et restauration. Duplication d’une liste et réutilisation créent des propositions sans anciennes réservations.
- Partage : lien d’une seule liste, copie ou contact puis WhatsApp/Gmail/SMS, message préparé et historique de préparation. Les invités filtrent par destinataire, prix, priorité et disponibilité.
- Accessibilité : boutons natifs, focus visible, confinement et restitution du focus des dialogues, fond inerte, réduction des animations. Version ordinateur avec grille élargie.

## Données et limites

Les données de la version 5 sont conservées dans le stockage local du navigateur pour la démonstration ; elles ne sont pas partagées entre appareils. L’export JSON contient les idées accessibles au gestionnaire courant. Le changement Alex/Elise simule les profils et ne constitue pas une authentification. Le stockage local n’assure pas la confidentialité d’une application en production : ne pas y placer de données sensibles.

Aucun email n’est envoyé. Les confirmations et notifications sont simulées. Aucun appel réel Unsplash ni extraction d’un site marchand. Les illustrations Unsplash sont des exemples graphiques explicitement simulés. Le lien de partage contient un instantané des cadeaux publics, sans notes de gestion, propriétaires ni noms de réservants. Il nécessite une adresse hébergée accessible pour être ouvert sur un autre appareil. Il ne synchronise ni modifications ni réservations : l’application finale nécessite serveur, autorisations, liens opaques, service email et API images.

Le pack possède un manifeste avec Web Share Target, un service worker et des icônes. Pour le partage entrant, servir le dossier sur HTTPS puis installer dans un navigateur compatible. Les paramètres title/text/url préremplissent un ajout ; le support du menu Partager dépend du téléphone et du navigateur. Cette intégration n’a pas été testée sur un téléphone réel.

Les essais ont été effectués dans Chromium sur les parcours d’ajout/édition, brouillons, profils privés, attribution, réservation immédiate, reset administrateur, fermeture collective, filtres/compteurs, favoris, duplication, archives, actions groupées, historique et clavier. Les largeurs 320, 390, 768 et 1280 px ont été contrôlées pour le débordement horizontal. Cela ne constitue pas une certification d’accessibilité.

Version 6 : bouton compact « + Idée » fixé à l’écran au-dessus de la navigation, accessible durant le défilement, réservé aux gestionnaires.

Version 7 : récupération de lien illustrée par un exemple fictif (nom, photo, prix, description modifiables). Aucun site marchand réellement interrogé. Les anciennes idées globales sont converties en appartenances explicites aux listes existantes. L’application Next.js et les données Supabase ne sont pas modifiées.
