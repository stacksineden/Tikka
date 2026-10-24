import { getDemoMedia } from "@/lib/demo-media";
import { demoAllowed } from "@/lib/session";

// DEMO: serves an uploaded video, with byte ranges so phones can seek and play it.
export async function GET(request: Request, { params }: RouteContext<"/api/demo/media/[id]">) {
  if (!demoAllowed) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const m = getDemoMedia(id);
  if (!m) return new Response("Not found", { status: 404 });
  const size = m.bytes.length;
  const range = request.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    return new Response(new Uint8Array(m.bytes.subarray(start, end + 1)), {
      status: 206,
      headers: { "Content-Type": m.type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(new Uint8Array(m.bytes), { headers: { "Content-Type": m.type, "Accept-Ranges": "bytes", "Content-Length": String(size) } });
}
