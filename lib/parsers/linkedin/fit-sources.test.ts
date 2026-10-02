import { describe, expect, it } from "vitest";
import {
  parseConnectionsCsv,
  parseProfileCsv,
  parseRichMediaCsv,
  profileEvidenceText,
} from "@/lib/parsers/linkedin/fit-sources";

const PROFILE = `First Name,Last Name,Maiden Name,Address,Birth Date,Headline,Summary,Industry,Zip Code,Geo Location,Twitter Handles,Websites,Instant Messengers
Ada,Quill,,"1 Secret St",1990-01-01,Backend engineer,"Builds payment APIs. GitHub: github.com/ada-quill",Software,84101,Salt Lake City,,https://ada.example,
`;

const RICH_MEDIA = `Date/Time,Media Description,Media Link
"March 1, 2024","Shipped a billing service in Go.",https://example.test/photo.jpg
"March 2, 2024",-,https://example.test/empty.jpg
"March 3, 2024","—",https://example.test/dash.jpg
`;

const CONNECTIONS = `Notes:
"When exporting your connection data, email addresses may be missing. See https://www.linkedin.com/help/linkedin/answer/261"

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Ada,Quill,https://www.linkedin.com/in/ada-quill,ada@example.com,"Acme Payments, Inc.",Staff Engineer,15 Jan 2024
Grace,Hopper,https://www.linkedin.com/in/grace,grace@example.com,,Compiler writer,01 Feb 2024
`;

describe("parseProfileCsv", () => {
  it("keeps headline, summary, and industry and drops address and birth date", () => {
    const profile = parseProfileCsv(PROFILE);
    expect(Object.keys(profile).sort()).toEqual(
      ["githubSearchText", "headline", "industry", "summary"].sort(),
    );
    const evidence = profileEvidenceText(profile);
    expect(evidence).toContain("Backend engineer");
    expect(evidence).toContain("payment APIs");
    expect(evidence).not.toContain("1 Secret St");
    expect(evidence).not.toContain("1990-01-01");
    expect(evidence).not.toContain("Ada");
    expect(profile.githubSearchText).toContain("github.com/ada-quill");
  });
});

describe("parseRichMediaCsv", () => {
  it("keeps post text and drops empty descriptions and links", () => {
    const posts = parseRichMediaCsv(RICH_MEDIA);
    expect(posts).toEqual(["Shipped a billing service in Go."]);
  });
});

describe("parseConnectionsCsv", () => {
  it("projects company data and never returns email or URL keys", () => {
    const parsed = parseConnectionsCsv(CONNECTIONS);
    expect(parsed.count).toBe(2);
    for (const row of parsed.rows) {
      expect(Object.keys(row).sort()).toEqual(["company", "connectedOn", "position"]);
      expect(JSON.stringify(row)).not.toContain("example.com");
      expect(JSON.stringify(row)).not.toContain("linkedin.com");
    }
    expect(parsed.rows[0]).toEqual({
      company: "Acme Payments, Inc.",
      position: "Staff Engineer",
      connectedOn: "15 Jan 2024",
    });
  });
});
