import Brand from "@/components/Brand";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Confidentialité — La Hotte Humbert",
  description: "Données personnelles et connexion Gmail de La Hotte Humbert.",
};

export default function PrivacyPage() {
  return (
    <main className="setup privacy-page">
      <a className="brand" href="/">
        <Brand />
      </a>
      <h1>Confidentialité</h1>
      <p>Dernière mise à jour : 25 octobre 2026.</p>
      <p>
        La Hotte Humbert est un carnet familial d’idées cadeaux géré par Alex et
        Elise.
      </p>
      <h2>Les données utilisées</h2>
      <p>
        Le carnet conserve les comptes administrateurs, les idées et leurs
        photos, les destinataires, les listes et leurs réglages de partage. Pour
        réserver, un invité indique un nom, une adresse email et, pour un cadeau
        collectif, un montant de participation sans paiement.
      </p>
      <p>
        Ces informations servent à organiser les cadeaux, éviter les doubles
        réservations et envoyer les confirmations, annulations et notifications
        demandées. Les administrateurs peuvent révéler l’identité des réservants
        ; celle-ci est masquée par défaut dans le carnet.
      </p>
      <p>
        Si vous posez une question sur un cadeau, votre nom, votre email, votre
        message et la référence du cadeau sont transmis ensemble à Alex et Elise
        pour qu’ils puissent vous répondre directement par email. La question
        est conservée dans la file de messages pour permettre son envoi et les
        éventuels réessais.
      </p>
      <h2>La connexion Google et Gmail</h2>
      <p>
        La connexion facultative des administrateurs à Google permet
        d’identifier leur adresse email et d’envoyer des messages avec leur
        autorisation. L’application demande l’accès à l’identité du compte et
        l’autorisation Gmail d’envoi, sans accès à la lecture de la boîte de
        réception. Aucun mot de passe Gmail n’est demandé par La Hotte Humbert.
      </p>
      <p>
        Les partages rapides et alertes d’ajout partent du Gmail de
        l’administrateur expéditeur. Les confirmations de réservation,
        annulations et autres notifications automatiques partent du Gmail
        d’Alex. Les destinataires de ces emails voient l’adresse de l’expéditeur
        et le contenu du message.
      </p>
      <p>
        Les jetons de renouvellement Google sont chiffrés côté serveur. Vous
        pouvez supprimer la connexion enregistrée depuis « Mon compte →
        Déconnecter Gmail » et révoquer l’autorisation dans les{" "}
        <a href="https://myaccount.google.com/connections" rel="noreferrer">
          connexions de votre compte Google
        </a>
        . Cela ne supprime pas les messages déjà envoyés.
      </p>
      <p>
        L’utilisation et le transfert des informations reçues des API Google
        respectent les{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          rel="noreferrer"
        >
          règles Google API Services User Data Policy
        </a>
        , y compris les exigences d’utilisation limitée (« Limited Use »). Ces
        données ne sont ni vendues, ni utilisées pour de la publicité ou
        l’entraînement de modèles d’intelligence artificielle.
      </p>
      <h2>Accès et prestataires</h2>
      <p>
        Les données sont hébergées avec Supabase et le site avec Vercel. Google
        traite l’authentification Gmail et l’envoi des emails. Les liens de
        listes donnent accès aux idées publiques de la liste concernée : ne
        diffusez ces liens qu’aux personnes souhaitées. Les idées « Moi
        uniquement » restent accessibles à leur créateur dans le carnet.
      </p>
      <p>
        Un partage explicite par email ou WhatsApp transmet les informations
        choisies au destinataire et au service utilisé. Une recherche
        d’illustrations Unsplash, lorsqu’elle est activée, transmet les termes
        de recherche à Unsplash ; les images web peuvent être chargées depuis
        leurs hébergeurs.
      </p>
      <h2>Conservation et demandes</h2>
      <p>
        Les idées et listes restent dans le carnet tant qu’elles sont conservées
        par ses gestionnaires. L’archivage conserve les données ; il ne les
        efface pas. Les réservations et la file de notifications sont
        enregistrées pour assurer le suivi et les réessais d’envoi.
      </p>
      <p>
        Pour consulter, corriger ou demander la suppression de vos données,
        contactez directement Alex ou Elise, notamment la personne qui vous a
        communiqué le lien de liste. Annuler une réservation remet le cadeau à
        disposition, sans effacer automatiquement son historique.
      </p>
      <h2>Stockage dans le navigateur</h2>
      <p>
        Des cookies servent à la connexion et à la sécurité de l’autorisation
        Google. Le navigateur peut aussi conserver les brouillons et des
        ressources de l’application pour faciliter son utilisation. Évitez de
        conserver une session ouverte sur un appareil partagé.
      </p>
      <p>
        <a href="/">Revenir à La Hotte Humbert</a>
      </p>
    </main>
  );
}
