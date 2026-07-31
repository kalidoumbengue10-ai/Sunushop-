import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.",
  );
}

const root = resolve(process.cwd(), "reports", "portable-export", "storage");
const allowedRoot = `${resolve(process.cwd())}${sep}`;
if (!root.startsWith(allowedRoot)) {
  throw new Error("La destination d’export doit rester dans le projet.");
}
await mkdir(root, { recursive: true });

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function listBucketObjects(bucket) {
  const files = [];
  const prefixes = [""];
  while (prefixes.length) {
    const prefix = prefixes.shift();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;
      for (const entry of data) {
        const objectName = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id) files.push(objectName);
        else prefixes.push(objectName);
      }
      if (data.length < 1000) break;
    }
  }
  return files;
}

const manifest = {
  exportedAt: new Date().toISOString(),
  source: url,
  objects: [],
};

for (const bucket of ["merchant-verification", "product-media"]) {
  for (const objectName of await listBucketObjects(bucket)) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(objectName);
    if (error) throw error;
    const bytes = Buffer.from(await data.arrayBuffer());
    const destination = resolve(root, bucket, objectName);
    if (!destination.startsWith(`${resolve(root)}${sep}`)) {
      throw new Error(`Chemin Storage non sûr : ${objectName}`);
    }
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { mode: 0o600 });
    manifest.objects.push({
      bucket,
      path: objectName,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
}

await writeFile(
  resolve(root, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  { encoding: "utf8", mode: 0o600 },
);
process.stdout.write(
  `${manifest.objects.length} objet(s) exporté(s) avec checksums dans ${root}.\n`,
);
