import { describe, expect, it } from "vitest";
import { faqGroups, faqIntro } from "./faq";
import { privacy, prohibitedItems, terms } from "./legal";
import type { Block } from "./types";

const texts = (blocks: Block[]) =>
  blocks.flatMap((block) => ("items" in block ? block.items : [block.text]));

const allText = [
  ...texts(faqIntro),
  ...faqGroups.flatMap((group) =>
    group.questions.flatMap((question) => [
      question.q,
      ...texts(question.blocks),
    ]),
  ),
  ...[terms, privacy, prohibitedItems].flatMap((doc) => [
    ...texts(doc.intro),
    ...doc.sections.flatMap((section) => [
      section.title,
      ...texts(section.blocks),
    ]),
  ]),
];

describe("help content", () => {
  it("has the four FAQ groups, each with questions and answers", () => {
    expect(faqGroups.map((group) => group.title)).toEqual([
      "Renting",
      "Listing",
      "Payments",
      "Safety",
    ]);
    for (const group of faqGroups) {
      expect(group.questions.length).toBeGreaterThan(0);
      for (const question of group.questions)
        expect(question.blocks.length).toBeGreaterThan(0);
    }
  });

  it("has every legal document with content", () => {
    expect(terms.sections.length).toBeGreaterThan(5);
    expect(privacy.sections.length).toBeGreaterThan(5);
    expect(prohibitedItems.intro.some((block) => block.type === "ol")).toBe(
      true,
    );
  });

  it("uses only well-formed [[TBD]] markers", () => {
    for (const text of allText) {
      const withoutMarkers = text.replace(/\[\[TBD(?::[^\]]*)?\]\]/g, "");
      expect(withoutMarkers, text).not.toMatch(/\[TBD|\[\[|\]\]/);
    }
  });

  it("keeps bold markers balanced", () => {
    for (const text of allText)
      expect((text.match(/\*\*/g) ?? []).length % 2, text).toBe(0);
  });
});
