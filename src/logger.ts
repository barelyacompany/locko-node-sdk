const PREFIX = "[Locko]";

export interface LockoLogger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

function isDebugEnabled(debug: boolean): boolean {
  if (debug) return true;
  try {
    return process.env.LOCKO_DEBUG === "1" || process.env.LOCKO_DEBUG === "true";
  } catch {
    return false;
  }
}

export function createLogger(debug: boolean): LockoLogger {
  const verbose = isDebugEnabled(debug);
  return {
    log: verbose ? (...args) => console.log(PREFIX, ...args) : () => {},
    warn: verbose ? (...args) => console.warn(PREFIX, ...args) : () => {},
    error: (...args) => console.error(PREFIX, ...args),
  };
}
