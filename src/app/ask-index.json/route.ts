import { buildAskIndex } from "@/lib/askIndex";
import { getSite } from "@/lib/site";

// The Ask search index, generated at build time and served as a static file.
export const dynamic = "force-static";

export async function GET() {
  return Response.json(buildAskIndex(await getSite()));
}
