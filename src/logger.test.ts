import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createLogger } from "./logger";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env["LOCKO_DEBUG"];
});

describe("createLogger — debug: false (default)", () => {
  it("log is a no-op", () => {
    const logger = createLogger(false);
    logger.log("should not appear");
    expect(console.log).not.toHaveBeenCalled();
  });

  it("warn is a no-op", () => {
    const logger = createLogger(false);
    logger.warn("should not appear");
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("error still calls console.error", () => {
    const logger = createLogger(false);
    logger.error("always visible");
    expect(console.error).toHaveBeenCalledWith("[Locko]", "always visible");
  });

  it("error forwards all arguments", () => {
    const logger = createLogger(false);
    logger.error("msg", { detail: "x" });
    expect(console.error).toHaveBeenCalledWith("[Locko]", "msg", { detail: "x" });
  });
});

describe("createLogger — debug: true", () => {
  it("log calls console.log with [Locko] prefix", () => {
    const logger = createLogger(true);
    logger.log("hello");
    expect(console.log).toHaveBeenCalledWith("[Locko]", "hello");
  });

  it("warn calls console.warn with [Locko] prefix", () => {
    const logger = createLogger(true);
    logger.warn("something wrong");
    expect(console.warn).toHaveBeenCalledWith("[Locko]", "something wrong");
  });

  it("error calls console.error with [Locko] prefix", () => {
    const logger = createLogger(true);
    logger.error("broken");
    expect(console.error).toHaveBeenCalledWith("[Locko]", "broken");
  });

  it("log forwards multiple arguments", () => {
    const logger = createLogger(true);
    logger.log("context", { key: "val" }, 42);
    expect(console.log).toHaveBeenCalledWith("[Locko]", "context", { key: "val" }, 42);
  });
});

describe("createLogger — LOCKO_DEBUG env var", () => {
  it("enables verbose logging when LOCKO_DEBUG=1", () => {
    process.env["LOCKO_DEBUG"] = "1";
    const logger = createLogger(false);
    logger.log("env-enabled");
    expect(console.log).toHaveBeenCalledWith("[Locko]", "env-enabled");
  });

  it("enables verbose logging when LOCKO_DEBUG=true", () => {
    process.env["LOCKO_DEBUG"] = "true";
    const logger = createLogger(false);
    logger.log("env-enabled");
    expect(console.log).toHaveBeenCalledWith("[Locko]", "env-enabled");
  });

  it("does not enable verbose logging when LOCKO_DEBUG=0", () => {
    process.env["LOCKO_DEBUG"] = "0";
    const logger = createLogger(false);
    logger.log("should not appear");
    expect(console.log).not.toHaveBeenCalled();
  });

  it("does not enable verbose logging when LOCKO_DEBUG=false", () => {
    process.env["LOCKO_DEBUG"] = "false";
    const logger = createLogger(false);
    logger.log("should not appear");
    expect(console.log).not.toHaveBeenCalled();
  });

  it("debug: true overrides LOCKO_DEBUG absence", () => {
    delete process.env["LOCKO_DEBUG"];
    const logger = createLogger(true);
    logger.log("flag wins");
    expect(console.log).toHaveBeenCalledWith("[Locko]", "flag wins");
  });

  it("error is always active regardless of LOCKO_DEBUG", () => {
    process.env["LOCKO_DEBUG"] = "0";
    const logger = createLogger(false);
    logger.error("always");
    expect(console.error).toHaveBeenCalledWith("[Locko]", "always");
  });
});
