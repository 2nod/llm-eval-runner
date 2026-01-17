import chalk from "chalk";

type Level = "debug" | "info" | "warn" | "error";

const levelOrder: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_LEVEL: Level = (process.env.LOG_LEVEL as Level) || "info";

function format(level: Level, message: string, meta?: Record<string, unknown>) {
  const color =
    level === "debug"
      ? chalk.gray
      : level === "info"
        ? chalk.cyan
        : level === "warn"
          ? chalk.yellow
          : chalk.red;
  const ts = new Date().toISOString();
  const base = `${ts} ${color(level.toUpperCase())} ${message}`;
  if (!meta || Object.keys(meta).length === 0) {
    return base;
  }
  return `${base} ${chalk.gray(JSON.stringify(meta))}`;
}

export class Logger {
  constructor(private threshold: Level = DEFAULT_LEVEL) {}

  private shouldLog(level: Level) {
    return levelOrder[level] >= levelOrder[this.threshold];
  }

  log(level: Level, message: string, meta?: Record<string, unknown>) {
    if (!this.shouldLog(level)) return;
    console.log(format(level, message, meta));
  }

  debug(message: string, meta?: Record<string, unknown>) {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>) {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>) {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>) {
    this.log("error", message, meta);
  }
}

export const logger = new Logger();
