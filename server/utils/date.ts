export function getLocalTodayStr(tzOffsetMs: number = 0): string {
  const now = new Date(Date.now() + tzOffsetMs);
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function toLocalYYYYMMDD(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getLocalHMStr(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function subtractDays(dateStr: string, days: number): string {
  const [yyyy, mm, dd] = dateStr.split('-').map(Number);
  const date = new Date(yyyy, mm - 1, dd);
  date.setDate(date.getDate() - days);
  const outYyyy = date.getFullYear();
  const outMm = String(date.getMonth() + 1).padStart(2, '0');
  const outDd = String(date.getDate()).padStart(2, '0');
  return `${outYyyy}-${outMm}-${outDd}`;
}
