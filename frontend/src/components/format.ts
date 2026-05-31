export function formatTemperature(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value)}°`
    : '--°';
}

export function formatTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTodayLabel(date = new Date()): string {
  const day = new Intl.DateTimeFormat([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
  return `Today, ${day}`;
}
