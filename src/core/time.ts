export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function shortStamp(iso = nowIso()): string {
  return iso.replace('T', ' ').replace(/:\d{2}Z$/, 'Z');
}

export function daysSince(iso: string, from = Date.now()): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return (from - t) / 86_400_000;
}

export function monthBucket(iso = nowIso()): string {
  return iso.slice(0, 7);
}

export function humanAge(iso: string): string {
  const d = daysSince(iso);
  if (!Number.isFinite(d)) return '?';
  if (d < 1 / 24) return 'just now';
  if (d < 1) return `${Math.round(d * 24)}h ago`;
  if (d < 30) return `${Math.round(d)}d ago`;
  return `${Math.round(d / 30)}mo ago`;
}
