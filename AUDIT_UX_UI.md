# Kad’Humbert — audit UX/UI de la maquette v4

Date : 10 octobre 2026. Périmètre : inspection du prototype, lecture des règles et essais dans Chromium avec une largeur mobile de 390 px. Il s’agit d’un audit expert, pas d’une étude auprès d’utilisateurs. L’application n’a pas été modifiée pendant cet audit. Les recommandations ne réintroduisent pas les fonctions écartées par le propriétaire.

## Diagnostic

L’architecture Toutes les idées / Listes / Pour qui / Archives est adaptée au besoin. L’ajout express, la visibilité privée et le partage sans installation sont de bonnes bases. L’accumulation des fonctions a toutefois rendu certains parcours longs et introduit des états ambigus. La priorité est de rendre le modèle cadeau–destinataire–réservation cohérent, puis de réduire la charge des écrans.

P0 : à résoudre avant un usage réel. P1 : à corriger avant la prochaine validation de la maquette. P2 : amélioration de confort et de finition.

## P0 — confiance et cohérence métier

### 1. Choisir pour qui l’on réserve

Constat reproduit : une idée indique Alex et Elise au récapitulatif ; le formulaire de réservation ne permet pas de choisir le destinataire. La réservation porte sur la fiche entière. Cela contredit la distinction entre candidats et destinataire choisi et peut bloquer un cadeau pour la mauvaise personne.

Recommandation : garder les destinataires possibles dans le carnet administrateur. Avant publication, attribuer la proposition à une personne ou à Commun. Si une idée est réellement proposée à plusieurs personnes, créer des propositions réservables distinctes. Commun constitue une proposition unique pour le couple, pas deux réservations. Une proposition peut apparaître dans plusieurs listes avec la même réservation ; une nouvelle édition doit créer une nouvelle proposition.

Validation : réserver pour Alex ne réserve pas pour Elise ; Commun n’apparaît dans aucune vue individuelle ; le récapitulatif ne présente jamais un destinataire ambigu.

### 2. Empêcher la perte d’un brouillon

Constat reproduit : commencer une seconde idée remplace dans le stockage local le brouillon précédent, sans avertissement. Un encart Reprendre mon brouillon reste également affiché après une sauvegarde réussie alors que le stockage a été vidé.

Recommandation : choisir une règle claire, soit plusieurs brouillons personnels, soit un seul avec Reprendre / Remplacer avant toute nouvelle saisie. Afficher un état fiable Enregistré à… / Enregistrement impossible. Retirer l’encart immédiatement après validation. Distinguer le brouillon d’édition d’une idée déjà enregistrée d’une nouvelle idée.

Validation : fermer, changer de vue et recharger conservent le bon brouillon ; aucune nouvelle saisie ne remplace silencieusement l’ancienne ; un brouillon d’édition ne perd pas sa cible.

### 3. Séparer visibilité et publication

Constat : sélectionner des listes et choisir Partageable ne signifie pas nécessairement qu’un lien a été transmis. Le texte Partageable dans… peut être interprété comme Déjà partagé. Une idée privée commune peut aussi devenir inaccessible à celui qui la modifie si la propriété du créateur demeure implicite.

Recommandation : présenter deux questions séparées : Qui peut consulter cette idée ? puis Dans quelles listes l’inclure ? Utiliser Moi uniquement / Nous deux / Visible dans les listes partagées. Indiquer les conséquences avant un changement, en nommant le propriétaire de la confidentialité. Lors d’une modification par Elise d’une idée créée par Alex, clarifier explicitement à qui se rapporte Moi uniquement.

Validation : aucun utilisateur ne découvre après sauvegarde que l’idée a été publiée ou qu’il en a perdu l’accès sans avertissement.

### 4. Définir le cycle de réservation réel

Limite du prototype : email, validation, annulation durable et notifications ne fonctionnent pas réellement ; cela n’est pas un simple ajustement graphique.

Recommandation avant lancement : état En attente de validation avec expiration, confirmation, récupération du lien par email, annulation, protection contre les réservations simultanées et traitement des échecs d’envoi. Pour une participation collective, distinguer encore ouvert / budget atteint ; ne pas proposer une contribution lorsque rien ne reste. Confirmer les conséquences avant modification ou archivage d’un cadeau réservé. Les noms restent masqués dans les notifications par défaut.

Validation : deux invités ne peuvent recevoir la confirmation du même cadeau individuel ; une adresse mal saisie n’immobilise pas durablement le cadeau ; aucun message ne dit Email envoyé après un échec. Les archives ne réactivent pas de réservation.

## P1 — simplifier les parcours principaux

### 5. Une fiche d’ajout progressive

Constat mesuré : le formulaire complet expose 17 contrôles avant les champs supplémentaires de gestion. L’import d’image et Unsplash apparaissent avant le titre. Pour qui, listes et sauvegarde sont loin dans le défilement.

Recommandation : titre ou lien en premier ; destinataires et listes ensuite ; prix et priorité ; image facultative ; section Plus de détails pour description, précisions et note de gestion. Grouper les images sous un seul choix Importer / Caméra / Illustration. Maintenir l’action Enregistrer visible, sans masquer les champs ni le clavier.

Validation : l’ajout simple ne nécessite aucun défilement inutile ; taille/couleur restent accessibles sans encombrer la saisie rapide.

### 6. Faire de la liste un espace de travail

Constat : le détail d’une liste est une longue fenêtre superposée avec idées, couverture, partage, révélation, historique, duplication et archive. Ouvrir une idée remplace ce détail et fermer ne ramène pas à la même liste.

Recommandation : une page liste dédiée avec retour, recherche, filtres et cartes cliquables. Actions principales Ajouter une idée / Partager. Menu secondaire pour Personnaliser / Dupliquer / Archiver. Retirer d’une liste reste distinct d’archiver l’idée entière.

Validation : modifier une idée ramène à la liste et à la position précédentes ; partager et ajouter restent visibles.

### 7. Rendre les filtres prévisibles

Constats reproduits : les filtres restent actifs en changeant de vue ; une pastille expose privée plutôt qu’un libellé utilisateur. À classer annonce 1 idée lorsque la recherche en affiche 0. Dans Pour qui, certains filtres ne masquent pas une personne dont aucune idée ne correspond. Le détail d’une liste ne reprend pas tous les filtres de la vue précédente.

Recommandation : état de recherche propre à chaque vue, libellés humains et filtres actifs toujours visibles. Un seul calcul doit servir aux résultats et au compteur. À classer = sans destinataire OU sans liste ; expliquer cette règle. Écran vide avec Effacer les filtres. Conserver les filtres d’une vue lorsqu’on y revient, sans les transporter silencieusement ailleurs.

Validation : compteur = éléments visibles pour chaque combinaison recherche/filtres ; aucune liste ou personne ne paraît vide sans explication.

### 8. Réduire le poids de l’accueil

Constat visuel à 390 × 844 px : le grand bandeau occupe environ un tiers de l’écran ; aucune carte complète n’est visible avant de défiler. Le bouton Ajouter flotte sur les premières cartes.

Recommandation : bandeau de marque compact après le premier usage, contenu visible plus haut, action d’ajout dans une zone dédiée ou positionnée sans recouvrir les informations. À classer et brouillons facilement accessibles sans dépendre d’une rangée de filtres défilante.

Validation : au moins une idée identifiable avec titre, prix et destinataire visible dès l’ouverture, sans recouvrement des contrôles.

### 9. Rendre les favoris réellement utiles

Constat reproduit : marquer Alex comme favori change une étoile, mais ne le fait pas remonter et ne crée aucun accès rapide.

Recommandation : section Favoris en tête ou filtre Favoris, ordre personnalisé à l’intérieur, puis Autres. Placer les contrôles de réorganisation dans un mode Organiser pour alléger la consultation.

Validation : un favori est plus rapide à retrouver qu’avant l’action ; ordre propre à chaque gestionnaire.

### 10. Améliorer la sélection groupée et l’annulation

Constat : des cases sont ajoutées hors des cartes ; toutes les options d’action apparaissent ensemble, même les champs qui ne concernent pas l’action choisie. Des états Annuler peuvent exister même lorsqu’aucune mutation n’a abouti.

Recommandation : mode de sélection explicite avec compteur, action fixe « N idées sélectionnées », champs conditionnels, résumé des conséquences et confirmation pour l’archive groupée. Proposer Annuler après réussite et uniquement pour l’action concernée. Les sélections doivent suivre exactement les cartes visibles.

Validation : on sait ce qui sera modifié, et les idées cachées par un filtre ne sont pas sélectionnées par erreur.

## P2 — lisibilité, accessibilité et continuité

### 11. Ajuster les cartes et le vocabulaire

Les trois priorités fonctionnent, mais Top idée et Coup de cœur sont proches. Garder des définitions courtes et ordonnées. Afficher les réservés dans une section « Déjà réservés » en bas, grisée mais lisible ; ne pas utiliser une faible opacité pour rendre le texte illisible. Réduire la répétition Pour qui ?, prix et badges. Distinguer Commun (destinataire du couple) et Nous deux (accès gestionnaire). Remplacer Supprimer / archiver par Archiver, conformément au comportement réel.

### 12. Accessibilité des commandes

Constats : l’avatar est un élément non natif sans accès clavier ; la fermeture d’un dialogue renvoie le focus au corps de page. Le prototype ne piège pas le focus dans les dialogues. Les commandes secondaires et légendes sont petites.

Recommandation : boutons natifs nommés, cibles tactiles d’environ 44 × 44 px, tailles lisibles, contraste mesuré, focus visible et restauré, arrière-plan inerte pendant un dialogue, réduction des animations. Tester clavier, lecteur d’écran et zoom 200 %, sans annoncer une conformité avant mesures.

### 13. Adapter ordinateur et mobile

Constat : même sur ordinateur, l’interface reste un téléphone de 440 px de large.

Recommandation : conserver la conception mobile, mais offrir sur ordinateur une grille plus large et un panneau latéral de détail. Les invités peuvent consulter une liste depuis un ordinateur ; aucune installation requise. Vérifier à 320/390/768/1280 px.

### 14. Clarifier archives, réutilisation et historique

Distinguer retrait d’une liste, archivage d’une idée et archivage d’une liste. Montrer un motif et une date de façon homogène. Archiver une liste doit expliquer l’effet sur sa page invitée sans introduire une nouvelle fonctionnalité de gestion de liens. L’historique doit donner la modification utile (avant/après), pas seulement Idée modifiée. La duplication doit expliciter la nouvelle édition et l’indépendance des réservations, sans donner l’impression de multiplier les fiches produit.

## Ordre de réalisation conseillé

1. Résoudre les règles destinataire–proposition–réservation et visibilité ; fiabiliser brouillons et sauvegarde.
2. Stabiliser ajout, page liste et recherche/filtres.
3. Simplifier accueil et cartes, rendre favoris/sélection réellement utiles.
4. Préparer les services nécessaires à une réservation et un email fiables.
5. Valider accessibilité et ordinateur, puis tester avec Alex, Elise et quelques invités novices.

## Scénarios de validation avec utilisateurs

- Capturer une idée sans destinataire, la retrouver et la classer plus tard.
- Garder une idée privée pour Elise sans qu’elle la voie.
- Attribuer une idée pouvant convenir à deux personnes, puis la partager sans ambiguïté.
- Modifier une idée depuis une liste et revenir au même endroit.
- Réserver comme famille avec email ; récupérer et annuler la réservation.
- Dupliquer une liste et vérifier les réservations indépendantes.

Observer réussite sans aide, erreurs, incompréhensions, retours arrière et temps de réalisation. Les objectifs chiffrés seront fixés avant ces tests ; aucun résultat d’usage réel n’est déduit de cet audit expert.
