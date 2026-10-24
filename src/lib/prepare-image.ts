"use client";
// Keep camera photos below hosting request limits before sending a Server Action.
const MAX_BYTES = 2 * 1024 * 1024;
export async function prepareImage(file: File): Promise<File> {
  if (!file.size)
    throw new Error("Cette photo est vide. Choisissez une autre image.");
  if (file.size > 60 * 1024 * 1024)
    throw new Error("Cette photo est trop volumineuse (60 Mo maximum).");
  let source: Blob = file;
  const heic =
    /image\/hei[cf]/i.test(file.type) ||
    (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type) &&
      /\.hei[cf]$/i.test(file.name));
  if (heic) {
    try {
      const { default: convert } = await import("heic2any");
      const converted = await convert({
        blob: file,
        toType: "image/jpeg",
        quality: 0.9,
      });
      source = Array.isArray(converted) ? converted[0] : converted;
    } catch {
      throw new Error(
        "Impossible de convertir cette photo HEIC. Choisissez une version JPEG ou une autre photo.",
      );
    }
  } else if (
    !/^image\/(jpeg|png|webp|gif)$/i.test(file.type) &&
    !/\.(jpe?g|png|webp|gif)$/i.test(file.name)
  ) {
    throw new Error("Choisissez une photo JPEG, PNG, WebP, GIF ou HEIC.");
  }
  if (file.type === "image/gif" && file.size <= MAX_BYTES) return file;
  const objectUrl = URL.createObjectURL(source);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(
          new Error(
            "Cette image ne peut pas être lue. Choisissez une autre photo.",
          ),
        );
      image.src = objectUrl;
    });
    let scale = Math.min(
      1,
      2048 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    if (
      !heic &&
      scale === 1 &&
      file.size <= MAX_BYTES &&
      ["image/jpeg", "image/png", "image/webp"].includes(file.type)
    )
      return file;
    for (let attempt = 0; attempt < 4; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx)
        throw new Error("Impossible de préparer cette photo sur cet appareil.");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.85 - attempt * 0.1),
      );
      if (blob && blob.size <= MAX_BYTES)
        return new File([blob], file.name.replace(/\.[^.]*$/, "") + ".jpg", {
          type: "image/jpeg",
        });
      scale *= 0.7;
    }
    throw new Error(
      "Impossible de réduire suffisamment cette photo. Choisissez une autre image.",
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
