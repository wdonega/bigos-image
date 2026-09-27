import { describe, expect, it } from "vitest";
import { VIDEO_DURATIONS, buildVideoPrompt, tokensToSubjects, videoFrames, videoSize } from "./video";

describe("videoFrames", () => {
  it("snaps up to H3's 17k + 5 grid at 24 fps", () => {
    expect(VIDEO_DURATIONS.map(videoFrames)).toEqual([124, 192, 243, 362]);
    for (const s of VIDEO_DURATIONS) {
      const f = videoFrames(s);
      expect((f - 5) % 17).toBe(0);
      expect(f).toBeGreaterThanOrEqual(s * 24);
    }
  });
});

describe("videoSize", () => {
  it("keeps the proportion within the pixel budget, in multiples of 32", () => {
    expect(videoSize("16:9", 1280 * 720)).toEqual({ width: 1280, height: 736 });
    expect(videoSize("9:16", 1280 * 720)).toEqual({ width: 736, height: 1280 });
    expect(videoSize("1:1", 1280 * 720)).toEqual({ width: 960, height: 960 });
    expect(videoSize("16:9", 1920 * 1080)).toEqual({ width: 1920, height: 1088 });
  });
});

describe("buildVideoPrompt", () => {
  it("text to video: description, soundscape and N/A music", () => {
    expect(
      buildVideoPrompt({ description: "A dog runs on the beach.", soundscape: "waves", music: "", references: 0 }),
    ).toBe("detailed_description: A dog runs on the beach.\n\noverall_soundscape: waves\n\nnon_diegetic_music: N/A");
  });

  it("leaves an empty soundscape out instead of claiming silence", () => {
    expect(buildVideoPrompt({ description: "x", soundscape: " ", music: "piano", references: 0 })).toBe(
      "detailed_description: x\n\nnon_diegetic_music: piano",
    );
  });

  it("binds each reference picture to a subject and summarizes the task", () => {
    const text = buildVideoPrompt({
      description: "<Subject 1> hugs <Subject 2>.",
      soundscape: "laughter",
      music: "",
      references: 2,
    });
    expect(text).toContain(
      "subject_definitions:\n<Subject 1> is the subject shown in <Picture 1>.\n<Subject 2> is the subject shown in <Picture 2>.",
    );
    expect(text).toContain("summary: [reference generation] The target video features <Subject 1>, <Subject 2>.");
    expect(text.indexOf("subject_definitions")).toBeLessThan(text.indexOf("detailed_description"));
  });

  it("maps image tokens to subjects", () => {
    expect(tokensToSubjects("the cat from <image1> meets <image2>")).toBe(
      "the cat from <Subject 1> meets <Subject 2>",
    );
  });
});
