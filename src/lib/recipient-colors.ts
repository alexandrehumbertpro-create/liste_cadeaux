export const recipientPalette = [
  { name: "Bleu surprise", value: "#3155ff" },
  { name: "Citron vert", value: "#d8f36a" },
  { name: "Bleu doux", value: "#e9eeff" },
  { name: "Rose", value: "#f9dce6" },
  { name: "Pêche", value: "#ffe1c2" },
  { name: "Menthe", value: "#d7efdf" },
  { name: "Bleu", value: "#dceafb" },
  { name: "Jaune", value: "#fff0b3" },
];
// Colours belong to recipients and are shared by all administrators.
export function recipientColors(
  recipients: { id: string; color?: string }[],
): Record<string, string> {
  return Object.fromEntries(
    recipients
      .filter(
        (r) => typeof r.color === "string" && /^#[0-9a-f]{6}$/i.test(r.color),
      )
      .map((r) => [r.id, r.color!]),
  );
}
export function recipientStyle(color = "#e9eeff") {
  if (!/^#[0-9a-f]{6}$/i.test(color)) color = "#e9eeff";
  const channels = [1, 3, 5]
    .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return {
    backgroundColor: color,
    color: luminance > 0.179 ? "#000000" : "#ffffff",
  };
}
