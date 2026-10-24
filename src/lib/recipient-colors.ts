export const recipientPalette = [
  { name: "Lavande", value: "#eee5fc" },
  { name: "Rose", value: "#f9dce6" },
  { name: "Pêche", value: "#ffe1c2" },
  { name: "Menthe", value: "#d7efdf" },
  { name: "Bleu", value: "#dceafb" },
  { name: "Jaune", value: "#fff0b3" },
];
export function recipientColors(
  preferences: Record<string, unknown>,
): Record<string, string> {
  const raw = preferences.recipientColors;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && /^#[0-9a-f]{6}$/i.test(entry[1]),
    ),
  );
}
export function recipientStyle(color = "#eee5fc") {
  if (!/^#[0-9a-f]{6}$/i.test(color)) color = "#eee5fc";
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
