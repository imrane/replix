export function ensureNoCollisions(ids: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`collision detected for id: ${id}`);
    seen.add(id);
  }
}
