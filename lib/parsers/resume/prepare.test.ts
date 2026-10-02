import { describe, expect, it } from "vitest";
import { prepareResumeText } from "@/lib/parsers/resume/prepare";

describe("prepareResumeText", () => {
  it("redacts email and phone", () => {
    const text = prepareResumeText("Contact ada@example.com or 555-123-4567. Built APIs in Go.");
    expect(text).not.toContain("ada@example.com");
    expect(text).not.toContain("555-123-4567");
    expect(text).toContain("Built APIs in Go.");
  });

  it("truncates very long resumes", () => {
    const long = "x".repeat(20_000);
    const text = prepareResumeText(long);
    expect(text.length).toBeLessThan(20_000);
    expect(text).toContain("[…truncated…]");
  });
});
