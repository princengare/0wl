type StorageValue = Record<string, unknown>;

export class MemoryStorageArea {
  private values = new Map<string, unknown>();

  async get(keys?: string | string[] | StorageValue | null): Promise<StorageValue> {
    if (!keys) {
      return Object.fromEntries(this.values.entries());
    }

    if (typeof keys === "string") {
      return { [keys]: this.values.get(keys) };
    }

    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map((key) => [key, this.values.get(key)]));
    }

    const result: StorageValue = {};

    for (const [key, fallback] of Object.entries(keys)) {
      result[key] = this.values.has(key) ? this.values.get(key) : fallback;
    }

    return result;
  }

  async set(items: StorageValue): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      this.values.set(key, value);
    }
  }

  async remove(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      this.values.delete(key);
    }
  }

  async clear(): Promise<void> {
    this.values.clear();
  }
}
