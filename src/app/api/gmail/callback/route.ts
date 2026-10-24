import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireAdmin, serviceClient } from "@/lib/supabase/server";
import { gmailConfigured, sealToken } from "@/lib/gmail";
import { drainEmails } from "@/lib/mail";
export async function GET(request: NextRequest) {
  const finish = (status: string) => {
    const r = new NextResponse(null, {
      status: 303,
      headers: { Location: "/?mail=" + status, "Cache-Control": "no-store" },
    });
    r.headers.set("Referrer-Policy", "no-referrer");
    r.cookies.delete({ name: "kad-gmail-state", path: "/api/gmail" });
    return r;
  };
  try {
    const { user, profile } = await requireAdmin();
    if (!gmailConfigured()) return finish("not_configured");
    const saved = request.cookies.get("kad-gmail-state")?.value || "";
    const supplied =
      user.id + "." + (request.nextUrl.searchParams.get("state") || "");
    if (
      !saved ||
      saved.length !== supplied.length ||
      !timingSafeEqual(Buffer.from(saved), Buffer.from(supplied))
    )
      return finish("invalid_state");
    const code = request.nextUrl.searchParams.get("code");
    if (!code || request.nextUrl.searchParams.has("error"))
      return finish("cancelled");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri:
          new URL(process.env.APP_URL!).origin + "/api/gmail/callback",
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10000),
    });
    const token = await response.json();
    if (!response.ok || !token.refresh_token || !token.access_token)
      return finish("failed");
    if (
      !String(token.scope || "")
        .split(" ")
        .includes("https://www.googleapis.com/auth/gmail.send")
    )
      return finish("missing_permission");
    const who = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: "Bearer " + token.access_token },
        signal: AbortSignal.timeout(10000),
      },
    );
    const identity = await who.json();
    if (
      !who.ok ||
      identity.email_verified !== true ||
      String(identity.email).toLowerCase() !==
        String(profile.email).toLowerCase()
    )
      return finish("wrong_account");
    const { error } = await serviceClient()
      .from("admin_mailboxes")
      .upsert({
        profile_id: user.id,
        email: identity.email,
        refresh_token: sealToken(token.refresh_token),
        connected_at: new Date().toISOString(),
      });
    if (error) return finish("failed");
    await drainEmails();
    return finish("connected");
  } catch {
    return finish("failed");
  }
}
