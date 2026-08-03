export function slugifyPublicLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "sunushop";
}

export function createPublicSlug(value: string) {
  return `${slugifyPublicLabel(value)}-${crypto.randomUUID().slice(0, 8)}`;
}
