"use client";
import { recipientPalette } from "@/lib/recipient-colors";
export default function ColorPicker({
  value,
  change,
}: {
  value: string;
  change: (value: string) => void;
}) {
  return (
    <fieldset className="color-picker">
      <legend>Couleur de la personne</legend>
      <div className="color-swatches">
        {recipientPalette.map((color) => (
          <button
            type="button"
            key={color.value}
            aria-label={color.name}
            aria-pressed={value === color.value}
            onClick={() => change(color.value)}
          >
            <span style={{ backgroundColor: color.value }} />
            {color.name}
            {value === color.value ? " ✓" : ""}
          </button>
        ))}
      </div>
      <label>
        Couleur personnalisée
        <input
          type="color"
          value={value}
          onChange={(e) => change(e.target.value)}
        />
      </label>
    </fieldset>
  );
}
