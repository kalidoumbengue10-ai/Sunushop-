export type AnalyticsPeriodPreset = "today" | "7days" | "month" | "30days" | "year" | "custom";

export const ANALYTICS_PERIOD_PRESETS: Array<[AnalyticsPeriodPreset, string]> = [
  ["today", "Aujourd’hui"],
  ["7days", "7 jours"],
  ["month", "Ce mois-ci"],
  ["30days", "30 jours"],
  ["year", "Cette année"],
  ["custom", "Personnalisé"],
];

export function rangeForPreset(preset: AnalyticsPeriodPreset, customFrom: string, customTo: string) {
  const now = new Date();
  const to = preset === "custom" && customTo ? new Date(`${customTo}T23:59:59.999Z`) : now;
  let from: Date;
  if (preset === "today") from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  else if (preset === "7days") from = new Date(to.getTime() - 6 * 86400000);
  else if (preset === "30days") from = new Date(to.getTime() - 29 * 86400000);
  else if (preset === "month") from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  else if (preset === "year") from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  else from = customFrom ? new Date(`${customFrom}T00:00:00.000Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from: from.toISOString(), to: to.toISOString(), granularity: preset === "year" ? "month" as const : "day" as const };
}

export function previousRangeFor(from: string, to: string) {
  const duration = new Date(to).getTime() - new Date(from).getTime();
  return {
    previousFrom: new Date(new Date(from).getTime() - duration).toISOString(),
    previousTo: from,
  };
}
