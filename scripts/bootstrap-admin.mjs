import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const requestedUserId = process.env.ADMIN_USER_ID?.trim();
const requestedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const role = process.env.ADMIN_ROLE ?? "admin";

if (!url || !serviceRole || (!requestedUserId && !requestedEmail)) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et ADMIN_EMAIL ou ADMIN_USER_ID sont requis.",
  );
}
if (!["reviewer", "support", "admin"].includes(role)) {
  throw new Error("ADMIN_ROLE doit être reviewer, support ou admin.");
}

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let user;
if (requestedUserId) {
  const { data, error } =
    await supabase.auth.admin.getUserById(requestedUserId);
  if (error) throw error;
  user = data.user;
} else {
  let page = 1;
  while (!user) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw error;
    user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === requestedEmail,
    );
    if (user || data.users.length < 100) break;
    page += 1;
  }
}

if (!user) {
  throw new Error(
    "Utilisateur Auth introuvable. Créez et confirmez d’abord le compte.",
  );
}

const { error } = await supabase.from("admin_roles").upsert({
  user_id: user.id,
  role,
  active: true,
});
if (error) throw error;

process.stdout.write(
  `Rôle ${role} attribué à ${user.email ?? user.phone ?? user.id}.\n`,
);
