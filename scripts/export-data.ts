/**
 * Write every download file to dist-data/: npm run export-data
 * Used by the weekly release workflow to attach the dataset to a GitHub Release.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDownloads } from "../src/lib/downloads";
import { getSite } from "../src/lib/site";

const out = path.resolve(process.cwd(), "dist-data");
await mkdir(out, { recursive: true });
const files = buildDownloads(await getSite());
for (const f of files) await writeFile(path.join(out, f.file), f.body);
console.log(`Wrote ${files.length} files to dist-data/`);
