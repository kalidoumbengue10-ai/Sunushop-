import { createHash, randomBytes } from "node:crypto";

export function createInvitationToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function invitationUrl(request: Request, token: string, email: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = configured ? new URL(configured).origin : null;
  const configuredIsLocal = configuredOrigin
    ? ["localhost", "127.0.0.1"].includes(new URL(configuredOrigin).hostname)
    : false;
  const requestIsPublic = !["localhost", "127.0.0.1"].includes(new URL(requestOrigin).hostname);
  const origin = configuredOrigin && !(configuredIsLocal && requestIsPublic)
    ? configuredOrigin
    : requestOrigin;
  const claimPath = `/invitations/claim?token=${encodeURIComponent(token)}`;
  const url = new URL("/connexion", origin);
  url.searchParams.set("profil", "vendeur");
  url.searchParams.set("mode", "inscription");
  url.searchParams.set("email", email);
  url.searchParams.set("next", claimPath);
  return url.toString();
}
