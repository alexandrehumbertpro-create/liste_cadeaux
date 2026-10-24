import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { serviceClient } from "./supabase/server";
export function gmailConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.APP_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
function key() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw Error("Service non configuré");
  // Stable cryptographic context: renaming the app must not invalidate Gmail connections.
  return createHash("sha256")
    .update("KadHumbert Gmail v1\0" + process.env.SUPABASE_SERVICE_ROLE_KEY)
    .digest();
}
export function sealToken(token: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function openToken(value: string) {
  try {
    const [version, iv, tag, encrypted] = value.split(".");
    if (version !== "v1") throw Error("Connexion Gmail à renouveler");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw Error("La connexion Gmail doit être renouvelée.");
  }
}
export async function mailbox(profileId: string) {
  const { data } = await serviceClient()
    .from("admin_mailboxes")
    .select("email,connected_at")
    .eq("profile_id", profileId)
    .maybeSingle();
  return data;
}
export type InlineImage = { content: Uint8Array; contentType: string };
export function gmailMessage(
  from: string,
  to: string,
  subject: string,
  html: string,
  image?: InlineImage,
) {
  if (
    !/^[^\r\n<>]+@[^\r\n<>]+$/.test(to) ||
    !/^[^\r\n<>]+@[^\r\n<>]+$/.test(from)
  )
    throw Error("Adresse email incorrecte");
  const encode = (value: string | Uint8Array) =>
    Buffer.from(typeof value === "string" ? value : Buffer.from(value))
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") || "";
  const headers = [
    "From: " + from,
    "To: " + to,
    "Subject: =?UTF-8?B?" + Buffer.from(subject).toString("base64") + "?=",
    "MIME-Version: 1.0",
  ];
  if (!image)
    return [
      ...headers,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      encode(html),
    ].join("\r\n");
  if (
    !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
      image.contentType,
    )
  )
    throw Error("Format d’image non pris en charge");
  const boundary = "kad-" + randomBytes(16).toString("hex");
  return [
    ...headers,
    'Content-Type: multipart/related; boundary="' + boundary + '"',
    "",
    "--" + boundary,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encode(html),
    "--" + boundary,
    "Content-Type: " + image.contentType,
    "Content-ID: <gift-image>",
    'Content-Disposition: inline; filename="cadeau.' +
      image.contentType.split("/")[1] +
      '"',
    "Content-Transfer-Encoding: base64",
    "",
    encode(image.content),
    "--" + boundary + "--",
  ].join("\r\n");
}

export async function sendGmail(
  profileId: string,
  to: string,
  subject: string,
  html: string,
  image?: InlineImage,
) {
  const db = serviceClient();
  const { data } = await db
    .from("admin_mailboxes")
    .select("email,refresh_token")
    .eq("profile_id", profileId)
    .single();
  if (!data)
    throw Error("Connectez votre compte Gmail pour envoyer cet email.");
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: openToken(data.refresh_token),
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(10000),
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token)
    throw Error("La connexion Gmail doit être renouvelée.");
  const mime = gmailMessage(data.email, to, subject, html, image);
  const result = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!result.ok)
    throw Error(
      "Gmail n’a pas accepté cet envoi. Vérifiez la connexion du compte.",
    );
}
