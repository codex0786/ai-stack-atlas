import { buildDownloads } from "@/lib/downloads";
import { getSite } from "@/lib/site";

// Static files at /data/<name>, written at build time (static export).
export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  return buildDownloads(await getSite()).map((d) => ({ file: d.file }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const d = buildDownloads(await getSite()).find((x) => x.file === file);
  if (!d) return new Response("Not found", { status: 404 });
  return new Response(d.body, { headers: { "Content-Type": d.type } });
}
