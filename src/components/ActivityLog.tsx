import type { Activity, Dataset } from "@/lib/types";
import { activityActor, activityDetails } from "@/lib/list-history";
export default function ActivityLog({
  entries,
  data,
}: {
  entries: Activity[];
  data: Dataset;
}) {
  if (!entries.length)
    return (
      <p className="empty">Aucun changement enregistré pour cette liste.</p>
    );
  return (
    <ol className="activity-log">
      {entries.map((a) => {
        const idea = data.ideas.find((i) => i.id === a.idea_id);
        return (
          <li key={a.id}>
            <div className="activity-meta">
              <strong>{activityActor(a, data)}</strong>
              <time dateTime={a.created_at}>
                {new Date(a.created_at).toLocaleString("fr-FR", {
                  timeZone: "Europe/Paris",
                })}
              </time>
            </div>
            <h3>{a.message}</h3>
            {idea && <p className="activity-idea">{idea.title}</p>}
            <ul>
              {activityDetails(a, data).map((detail, i) => (
                <li key={i}>{detail}</li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
