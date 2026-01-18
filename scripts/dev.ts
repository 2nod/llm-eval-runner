import { spawn } from "node:child_process";
import { resolve } from "node:path";

type DevProcess = {
  name: string;
  cwd: string;
  args: string[];
};

const processes: DevProcess[] = [
  { name: "api", cwd: "web", args: ["run", "dev"] },
  { name: "web", cwd: "web/app", args: ["run", "dev"] },
];

const children = processes.map((processConfig) => {
  const child = spawn("bun", processConfig.args, {
    cwd: resolve(process.cwd(), processConfig.cwd),
    stdio: "inherit",
    env: { ...process.env },
  });

  child.on("error", (error) => {
    console.error(`[${processConfig.name}] failed to start:`, error);
  });

  return { name: processConfig.name, child };
});

let shuttingDown = false;

const shutdown = (signal: NodeJS.Signals) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  for (const { child } of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", () => shutdown("SIGTERM"));

for (const { name, child } of children) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    for (const other of children) {
      if (other.child !== child && !other.child.killed) {
        other.child.kill("SIGTERM");
      }
    }

    if (signal) {
      console.error(`[${name}] exited with signal ${signal}`);
      process.exit(1);
    }

    const exitCode = code ?? 0;
    if (exitCode !== 0) {
      console.error(`[${name}] exited with code ${exitCode}`);
    }
    process.exit(exitCode);
  });
}
