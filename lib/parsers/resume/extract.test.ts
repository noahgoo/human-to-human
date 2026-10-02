import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { textFromDocx } from "@/lib/parsers/resume/extract";

describe("textFromDocx", () => {
  it("reads paragraph text from a docx zip", () => {
    const xml = `<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Shipped TypeScript and React.</w:t></w:r></w:p><w:p><w:r><w:t>Built CI for deployments.</w:t></w:r></w:p></w:body></w:document>`;
    const bytes = zipSync({ "word/document.xml": strToU8(xml) });
    expect(textFromDocx(bytes)).toBe("Shipped TypeScript and React.\nBuilt CI for deployments.");
  });
});
