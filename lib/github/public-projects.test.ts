import { describe, expect, it } from "vitest";
import { extractGithubLogin } from "@/lib/github/public-projects";

describe("extractGithubLogin", () => {
  it("reads a login from profile text", () => {
    expect(extractGithubLogin("GitHub: github.com/noahgoo · Portfolio: noahgoo.dev")).toBe("noahgoo");
    expect(extractGithubLogin("https://github.com/Ada-Lovelace/")).toBe("Ada-Lovelace");
  });

  it("ignores reserved GitHub paths and missing links", () => {
    expect(extractGithubLogin("See github.com/settings for privacy")).toBeNull();
    expect(extractGithubLogin("No code host listed")).toBeNull();
  });
});
