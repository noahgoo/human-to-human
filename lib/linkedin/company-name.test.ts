import { describe, expect, it } from "vitest";
import { normalizeCompanyName } from "@/lib/linkedin/company-name";

describe("normalizeCompanyName", () => {
  it("matches a plain company name and a suffixed legal name", () => {
    expect(normalizeCompanyName("Redo")).toBe("redo");
    expect(normalizeCompanyName("Redo, Inc.")).toBe("redo");
    expect(normalizeCompanyName("The Neighbor Company")).toBe("neighbor");
  });

  it("drops generic employers", () => {
    expect(normalizeCompanyName("Self-employed")).toBeNull();
  });
});
