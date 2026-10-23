import { recordFollowup } from "@/lib/data";
import { getOwnerUser } from "@/lib/session";

// "Message on WhatsApp" taps (followup_tap). Sent as a beacon so opening WhatsApp isn't delayed.
export async function POST(request: Request) {
  const user = await getOwnerUser();
  const body = (await request.json().catch(() => null)) as { leadId?: string } | null;
  if (!user || !body?.leadId) return new Response(null, { status: 204 });
  await recordFollowup(user, body.leadId);
  return new Response(null, { status: 204 });
}
