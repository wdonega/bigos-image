import { describe, expect, it } from "vitest";
import { type JobEntry, addEntry, jobHref, parseEntries, pruneEntries, updateEntry } from "./job-history";

const entry = (id: string, createdAt = 1_000, extra: Partial<JobEntry> = {}): JobEntry => ({
  id,
  screen: "video",
  label: "a cat in space",
  request: { screen: "video" },
  createdAt,
  seen: false,
  ...extra,
});

describe("parseEntries", () => {
  it("reads what was saved", () => {
    expect(parseEntries(JSON.stringify([entry("1")]))).toEqual([entry("1")]);
  });

  it("drops malformed data instead of failing", () => {
    expect(parseEntries(null)).toEqual([]);
    expect(parseEntries("{not json")).toEqual([]);
    expect(parseEntries(JSON.stringify({ id: "1" }))).toEqual([]);
    expect(parseEntries(JSON.stringify([entry("1"), { id: "2", screen: "nope" }, 3]))).toEqual([entry("1")]);
  });
});

describe("pruneEntries", () => {
  it("keeps only jobs inside the retention window", () => {
    const list = [entry("new", 9_000), entry("old", 1_000)];
    expect(pruneEntries(list, 10_000, 5_000).map((e) => e.id)).toEqual(["new"]);
  });
});

describe("addEntry / updateEntry", () => {
  it("puts the newest first and replaces the same id", () => {
    const list = addEntry(addEntry([entry("1")], entry("2")), entry("1", 5_000));
    expect(list.map((e) => [e.id, e.createdAt])).toEqual([
      ["1", 5_000],
      ["2", 1_000],
    ]);
  });

  it("changes one entry", () => {
    expect(updateEntry([entry("1"), entry("2")], "2", { seen: true }).map((e) => e.seen)).toEqual([false, true]);
  });
});

describe("jobHref", () => {
  it("opens the job on its screen", () => {
    expect(jobHref({ id: "103", screen: "generate" })).toBe("/image?job=103");
    expect(jobHref({ id: "7", screen: "restore" })).toBe("/restore?job=7");
  });
});
