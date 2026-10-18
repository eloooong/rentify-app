/** Inline text supports **bold** and [[TBD]] / [[TBD: detail]] markers. */
export type Block =
  | { type: "p"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "note"; text: string };

export type FaqQuestion = { q: string; blocks: Block[] };
export type FaqGroup = { id: string; title: string; questions: FaqQuestion[] };

export type LegalSection = { title: string; blocks: Block[] };
export type LegalDocument = {
  title: string;
  intro: Block[];
  sections: LegalSection[];
};
