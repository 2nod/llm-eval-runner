import fs from "fs";
import path from "path";
import stringify from "fast-json-stable-stringify";
import { stableHash } from "../utils/hashing";

export interface CacheEntry<T> {
  key: string;
  value: T;
  createdAt: string;
}

export class DiskCache<T> {
  constructor(private readonly directory: string) {}

  private resolvePath(key: string) {
    return path.join(this.directory, `${key}.json`);
  }

  async ensureDir() {
    await fs.promises.mkdir(this.directory, { recursive: true });
  }

  async get(keyParts: unknown[]): Promise<T | undefined> {
    const key = stableHash(keyParts);
    const file = this.resolvePath(key);
    try {
      const data = await fs.promises.readFile(file, "utf8");
      const parsed = JSON.parse(data) as CacheEntry<T>;
      return parsed.value;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw err;
    }
  }

  async set(keyParts: unknown[], value: T) {
    const key = stableHash(keyParts);
    await this.ensureDir();
    const file = this.resolvePath(key);
    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: new Date().toISOString(),
    };
    await fs.promises.writeFile(file, stringify(entry), "utf8");
  }
}
