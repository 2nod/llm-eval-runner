import fs from "fs";
import path from "path";
import readline from "readline";

export async function* iterateJsonl<T>(file: string): AsyncGenerator<T> {
  const stream = fs.createReadStream(file, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    yield JSON.parse(trimmed) as T;
  }
}

export async function readJsonl<T>(file: string): Promise<T[]> {
  const results: T[] = [];
  for await (const record of iterateJsonl<T>(file)) {
    results.push(record);
  }
  return results;
}

export async function writeJsonl(file: string, records: unknown[]) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const stream = fs.createWriteStream(file, { encoding: "utf8" });
  for (const record of records) {
    stream.write(`${JSON.stringify(record)}\n`);
  }
  await new Promise<void>((resolve, reject) => {
    stream.end((err: Error | null | undefined) => (err ? reject(err) : resolve()));
  });
}

export async function appendJsonl(file: string, record: unknown) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.appendFile(file, `${JSON.stringify(record)}\n`, { encoding: "utf8" });
}
