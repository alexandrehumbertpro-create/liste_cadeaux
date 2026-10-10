import { timingSafeEqual } from "node:crypto";
import { drainEmails } from "@/lib/mail";
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET,
    value = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (
    !expected ||
    !value ||
    Buffer.byteLength(expected) !== Buffer.byteLength(value) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(value))
  )
    return new Response("Unauthorized", { status: 401 });
  return Response.json(await drainEmails());
}
