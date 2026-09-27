import { describe, expect, it } from "vitest";
import { parseRange } from "./http-range";

describe("parseRange", () => {
  const size = 1000;

  it("serves the whole file without a usable header", () => {
    expect(parseRange(null, size)).toBeNull();
    expect(parseRange("bytes=-", size)).toBeNull();
    expect(parseRange("items=0-10", size)).toBeNull();
    expect(parseRange("bytes=0-10,20-30", size)).toBeNull();
  });

  it("reads start-end, open-ended and suffix ranges", () => {
    expect(parseRange("bytes=0-1", size)).toEqual({ start: 0, end: 1 });
    expect(parseRange("bytes=100-", size)).toEqual({ start: 100, end: 999 });
    expect(parseRange("bytes=-200", size)).toEqual({ start: 800, end: 999 });
    expect(parseRange("bytes=900-5000", size)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-5000", size)).toEqual({ start: 0, end: 999 });
  });

  it("flags ranges outside the file", () => {
    expect(parseRange("bytes=1000-", size)).toBe("unsatisfiable");
    expect(parseRange("bytes=500-100", size)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", size)).toBe("unsatisfiable");
  });
});
