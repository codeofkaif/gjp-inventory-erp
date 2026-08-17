export function get<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function set<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    console.error(`[storage] Failed to set key "${key}"`);
  }
}

export function update<T>(key: string, updaterFn: (prev: T) => T, fallback: T): void {
  const prev = get<T>(key) ?? fallback;
  set<T>(key, updaterFn(prev));
}
