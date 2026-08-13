"use client";

type ApiPayload<T> = { data: T } | { error?: { code?: string; message?: string } };

let authenticationRedirectStarted = false;

export class AdminApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function adminFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { ...init, credentials: "same-origin" });
  const payload = await response.json().catch(() => ({})) as ApiPayload<T>;

  if (!response.ok) {
    const apiError = "error" in payload ? payload.error : undefined;
    const code = apiError?.code ?? "ADMIN_REQUEST_FAILED";
    const message = apiError?.message ?? "Le CRM ne peut pas charger ces informations.";

    if (!authenticationRedirectStarted && typeof window !== "undefined") {
      const next = `${window.location.pathname}${window.location.search}`;
      if (response.status === 401 || code === "AUTHENTICATION_REQUIRED") {
        authenticationRedirectStarted = true;
        window.location.assign(`/connexion?profil=admin&next=${encodeURIComponent(next)}`);
      } else if (["MFA_REQUIRED", "ADMIN_MFA_REQUIRED", "ADMIN_AAL2_REQUIRED", "REVIEWER_MFA_REQUIRED"].includes(code)) {
        authenticationRedirectStarted = true;
        window.location.assign(`/admin/securite?next=${encodeURIComponent(next)}`);
      }
    }

    throw new AdminApiError(message, code, response.status);
  }

  return (payload as { data: T }).data;
}

