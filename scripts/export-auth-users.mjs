import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.",
  );
}

const target = resolve(process.cwd(), "reports", "portable-export", "auth");
await mkdir(target, { recursive: true });
const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const users = [];
for (let page = 1; ; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page,
    perPage: 1000,
  });
  if (error) throw error;
  users.push(
    ...data.users.map((user) => ({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
      emailConfirmedAt: user.email_confirmed_at ?? null,
      phoneConfirmedAt: user.phone_confirmed_at ?? null,
      userMetadata: user.user_metadata,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    })),
  );
  if (data.users.length < 1000) break;
}

const body = `${JSON.stringify(
  {
    exportedAt: new Date().toISOString(),
    source: url,
    users,
  },
  null,
  2,
)}\n`;
await writeFile(resolve(target, "users.json"), body, {
  encoding: "utf8",
  mode: 0o600,
});
await writeFile(
  resolve(target, "users.sha256"),
  `${createHash("sha256").update(body).digest("hex")}  users.json\n`,
  { encoding: "utf8", mode: 0o600 },
);
process.stdout.write(`${users.length} utilisateur(s) exporté(s) dans ${target}.\n`);
