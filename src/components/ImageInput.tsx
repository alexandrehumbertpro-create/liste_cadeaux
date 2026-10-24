"use client";
import { useState } from "react";
import { uploadImage } from "@/lib/client-actions";
import { prepareImage } from "@/lib/prepare-image";
export default function ImageInput({
  value,
  change,
  busy,
  setBusy,
  error,
}: {
  value: string;
  change: (path: string, preview: string) => void;
  busy: boolean;
  setBusy: (value: boolean) => void;
  error: (message: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setUploading(true);
    error("");
    try {
      const photo = await prepareImage(file);
      const data = new FormData();
      data.set("file", photo);
      const result = await uploadImage(data);
      if (!result.ok) throw new Error(result.error);
      if (!result.data)
        throw new Error("La photo n’a pas pu être enregistrée.");
      change(result.data.path, result.data.url);
    } catch (e) {
      error(
        e instanceof Error
          ? e.message
          : "Impossible d’importer cette photo. Réessayez.",
      );
    } finally {
      setBusy(false);
      setUploading(false);
    }
  }
  return (
    <div className="image-input">
      <div className="image-tools">
        <label className="file-button">
          Importer une photo
          <input
            disabled={busy}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <label className="file-button">
          Prendre une photo
          <input
            disabled={busy}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {uploading && <p role="status">Préparation ou envoi en cours…</p>}
      <label>
        URL de l’image
        <input
          type="url"
          placeholder="https://…/photo.jpg"
          maxLength={4000}
          value={value.startsWith("storage:") ? "" : value}
          onChange={(e) => {
            error("");
            change(e.target.value, e.target.value);
          }}
          disabled={busy}
        />
        <small>
          Collez le lien direct d’une image, et non celui d’une fiche produit.
        </small>
      </label>
    </div>
  );
}
