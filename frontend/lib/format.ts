export function clockTime(input: string | number | Date): string {
  return new Date(input).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(input: string | number | Date): string {
  const then = new Date(input).getTime();
  const diff = Math.round((Date.now() - then) / 1000);
  if (diff < 45) return 'now';
  if (diff < 3600) return `${Math.round(diff / 60)}m`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  if (diff < 7 * 86400) return `${Math.round(diff / 86400)}d`;
  return new Date(input).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function dayLabel(input: string | number | Date): string {
  const d = new Date(input);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function banText(until: string | null, permanent: boolean): string {
  if (permanent || !until) return 'until a moderator reviews your account';
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return 'for a moment longer';
  const h = Math.ceil(ms / 3600000);
  if (h < 1) return 'for less than an hour';
  if (h < 48) return `for about ${h} hour${h === 1 ? '' : 's'}`;
  return `for about ${Math.ceil(h / 24)} days`;
}

export function compactNumber(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
