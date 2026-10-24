import type { Dataset, GiftList } from "@/lib/types";
import { shareChannels } from "@/lib/list-history";
export default function ListShares({
  list,
  data,
}: {
  list: GiftList;
  data: Dataset;
}) {
  const shares = data.shares
    .filter((s) => s.list_id === list.id)
    .slice()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return (
    <>
      <p>
        Les partages de « {list.name} » préparés depuis l’application. Copier un
        lien ne permet pas d’identifier son destinataire.
      </p>
      {shares.length ? (
        <ul className="share-history">
          {shares.map((s, i) => (
            <li key={s.id || i}>
              <strong>{s.contact_name}</strong>
              <span>
                {shareChannels[s.channel] || s.channel} · Partage préparé
              </span>
              <small>
                {new Date(s.created_at).toLocaleString("fr-FR", {
                  timeZone: "Europe/Paris",
                })}
                {s.created_by
                  ? " · " +
                    (data.profiles.find((p) => p.id === s.created_by)
                      ?.display_name || "Ancien gestionnaire")
                  : ""}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Aucun partage enregistré pour cette liste.</p>
      )}
    </>
  );
}
