import { describe, expect, it } from "vitest";
import { splitPersonName } from "@/lib/names";

describe("splitPersonName", () => {
  it("strips the honorific that used to become the first name", () => {
    // This produced "Welcome, Mrs" on the parent portal.
    expect(splitPersonName("Mrs Folake Okonkwo")).toEqual({
      title: "Mrs",
      first: "Folake",
      last: "Okonkwo",
    });
  });

  it("handles the titles a Nigerian school actually sees", () => {
    expect(splitPersonName("Alhaji Musa Bello").first).toBe("Musa");
    expect(splitPersonName("Chief Adebayo Ogunlesi").first).toBe("Adebayo");
    expect(splitPersonName("Engr. Chidi Nwosu").first).toBe("Chidi");
    expect(splitPersonName("Pastor Grace Eze").first).toBe("Grace");
    expect(splitPersonName("Dr. Ngozi Okafor")).toEqual({ title: "Dr.", first: "Ngozi", last: "Okafor" });
  });

  it("matches a title whatever its case", () => {
    expect(splitPersonName("MRS Folake Okonkwo").first).toBe("Folake");
    expect(splitPersonName("mrs folake okonkwo").first).toBe("folake");
  });

  it("keeps stacked titles out of the name", () => {
    expect(splitPersonName("Chief Dr Adebayo Ogunlesi")).toEqual({
      title: "Chief Dr",
      first: "Adebayo",
      last: "Ogunlesi",
    });
  });

  it("keeps a middle name with the first name rather than losing it", () => {
    expect(splitPersonName("Folake Adenike Okonkwo")).toEqual({
      title: "",
      first: "Folake Adenike",
      last: "Okonkwo",
    });
  });

  it("leaves a name with no honorific alone", () => {
    expect(splitPersonName("Folake Okonkwo")).toEqual({
      title: "",
      first: "Folake",
      last: "Okonkwo",
    });
  });

  it("repeats a single word rather than leaving half the record empty", () => {
    expect(splitPersonName("Folake")).toEqual({ title: "", first: "Folake", last: "Folake" });
  });

  it("does not strip the only word it has, even if it looks like a title", () => {
    // Better a guardian called "Mrs" than one with no name at all.
    expect(splitPersonName("Mrs")).toEqual({ title: "", first: "Mrs", last: "Mrs" });
  });

  it("survives empty and whitespace input", () => {
    expect(splitPersonName("")).toEqual({ title: "", first: "", last: "" });
    expect(splitPersonName("   ")).toEqual({ title: "", first: "", last: "" });
  });

  it("collapses runs of whitespace", () => {
    expect(splitPersonName("  Mrs   Folake    Okonkwo ")).toEqual({
      title: "Mrs",
      first: "Folake",
      last: "Okonkwo",
    });
  });
});
