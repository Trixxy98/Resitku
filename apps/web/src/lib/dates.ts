/// Tengah malam tempatan, bukan UTC. `.toISOString().slice(0, 10)` menganjak
/// hari untuk zon di timur UTC — Malaysia UTC+8 akan nampak 31 Julai pada
/// 1 Ogos 00:00.
export function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function todayLocalIsoDate(): string {
  return toLocalIsoDate(new Date());
}
