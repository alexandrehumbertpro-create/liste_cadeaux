import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/supabase/server";
import { gmailConfigured } from "@/lib/gmail";
export async function GET(request: Request) {
  let user;
  try {
    ({ user } = await requireAdmin());
  } catch {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: "/login", "Cache-Control": "no-store" },
    });
  }
  if (!gmailConfigured())
    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: "/?mail=not_configured",
        "Cache-Control": "no-store",
      },
    });
  const origin = new URL(process.env.APP_URL!).origin;
  const publicHost = (
    request.headers.get("x-forwarded-host")?.split(",")[0] ||
    request.headers.get("host") ||
    new URL(request.url).host
  )
    .trim()
    .toLowerCase();
  if (publicHost !== new URL(origin).host.toLowerCase())
    return NextResponse.redirect(new URL("/api/gmail/connect", origin));
  const nonce = randomBytes(32).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: origin + "/api/gmail/callback",
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/gmail.send",
    access_type: "offline",
    prompt: "consent",
    state: nonce,
    login_hint: user.email || "",
  }).toString();
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set("kad-gmail-state", user.id + "." + nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https:"),
    path: "/api/gmail",
    maxAge: 600,
  });
  return response;
}
