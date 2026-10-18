import Link from "next/link";
import type { LegalDocument } from "../_content/types";
import { DraftBanner } from "./draft-banner";
import { Blocks } from "./rich-text";

function slug(title: string) {
  return title
    .toLowerCase()
    .replace(/^\d+\.\s*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function LegalPage({ document }: { document: LegalDocument }) {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/help" className="hover:text-brand-strong hover:underline">
          Help center
        </Link>
      </nav>
      <h1 className="text-3xl font-semibold text-fg">{document.title}</h1>
      <DraftBanner legal />
      <Blocks blocks={document.intro} />

      {document.sections.length > 3 && (
        <nav
          aria-labelledby="contents-heading"
          className="rounded-lg border border-border p-4"
        >
          <h2 id="contents-heading" className="text-sm font-semibold text-fg">
            Contents
          </h2>
          <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {document.sections.map((section) => (
              <li key={section.title}>
                <a
                  href={`#${slug(section.title)}`}
                  className="text-fg underline-offset-4 hover:text-brand-strong hover:underline"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {document.sections.map((section) => (
        <section
          key={section.title}
          id={slug(section.title)}
          aria-labelledby={`${slug(section.title)}-heading`}
          className="scroll-mt-4"
        >
          <h2
            id={`${slug(section.title)}-heading`}
            className="mb-2 text-xl font-semibold text-fg"
          >
            {section.title}
          </h2>
          <Blocks blocks={section.blocks} />
        </section>
      ))}
    </article>
  );
}
