import crypto from "crypto";
import stringify from "fast-json-stable-stringify";

export function stableHash(input: unknown): string {
  const payload = typeof input === "string" ? input : stringify(input);
  return crypto.createHash("sha1").update(payload).digest("hex");
}

export function hashFromParts(...parts: Array<string | number | undefined>) {
  return stableHash(parts.filter((part) => part !== undefined).join("::"));
}
