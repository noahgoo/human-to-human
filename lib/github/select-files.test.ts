import { describe, expect, it } from "vitest";
import { redactSecrets } from "@/lib/github/collect-review";
import { selectReviewFiles } from "@/lib/github/select-files";

describe("selectReviewFiles", () => {
  it("prefers docs, CI, and tests and skips dependencies and lockfiles", () => {
    const selected = selectReviewFiles([
      { path: "node_modules/leftpad/index.js", type: "blob" },
      { path: "package-lock.json", type: "blob" },
      { path: "src/server.ts", type: "blob" },
      { path: "README.md", type: "blob" },
      { path: ".github/workflows/ci.yml", type: "blob" },
      { path: "infra/main.tf", type: "blob" },
      { path: "tests/api.test.ts", type: "blob" },
      { path: "logo.png", type: "blob" },
    ]);
    expect(selected[0]).toBe("README.md");
    expect(selected).toContain(".github/workflows/ci.yml");
    expect(selected).toContain("infra/main.tf");
    expect(selected).toContain("tests/api.test.ts");
    expect(selected).not.toContain("node_modules/leftpad/index.js");
    expect(selected).not.toContain("package-lock.json");
    expect(selected).not.toContain("logo.png");
  });
});

describe("redactSecrets", () => {
  it("removes tokens before they are sent to the model", () => {
    const cleaned = redactSecrets('const key = "ghp_abcdefghijklmnopqrstuvwxyz123456"; aws = "AKIAIOSFODNN7EXAMPLE"');
    expect(cleaned).not.toContain("ghp_");
    expect(cleaned).not.toContain("AKIA");
    expect(cleaned).toContain("[REDACTED]");
  });
});
