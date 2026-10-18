import type { Metadata } from "next";
import Link from "next/link";
import { DraftBanner } from "./_components/draft-banner";
import { FeedbackForm } from "./_components/feedback-form";
import { Blocks } from "./_components/rich-text";
import { faqGroups, faqIntro } from "./_content/faq";

// Draft content, not reviewed yet: keep it out of search results until it is.
export const metadata: Metadata = {
  title: "Help center (draft) | Rentify",
  description:
    "Answers about renting, listing, payments and safety on Rentify, and a feedback form.",
  robots: { index: false, follow: true },
};

const policyLinks = [
  { href: "/help/terms", label: "Terms of Service" },
  { href: "/help/privacy", label: "Privacy Policy" },
  { href: "/help/prohibited-items", label: "Prohibited items" },
];

export default function HelpPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold text-fg">Help center</h1>
        <DraftBanner />
        <Blocks blocks={faqIntro} />
        <nav aria-label="Help topics">
          <ul className="flex flex-wrap gap-2">
            {faqGroups.map((group) => (
              <li key={group.id}>
                <a
                  href={`#${group.id}`}
                  className="inline-flex min-h-9 items-center rounded-full border border-border px-3 text-sm font-medium text-fg hover:bg-surface-muted"
                >
                  {group.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {faqGroups.map((group) => (
        <section
          key={group.id}
          id={group.id}
          aria-labelledby={`${group.id}-heading`}
          className="scroll-mt-4"
        >
          <h2
            id={`${group.id}-heading`}
            className="mb-3 text-xl font-semibold text-fg"
          >
            {group.title}
          </h2>
          <div className="divide-y divide-border rounded-lg border border-border">
            {group.questions.map((question) => (
              <details key={question.q} className="group px-4">
                <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 py-3 font-medium text-fg">
                  {question.q}
                  <span
                    aria-hidden="true"
                    className="text-muted-foreground transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <div className="pb-4">
                  <Blocks blocks={question.blocks} />
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <section aria-labelledby="policies-heading">
        <h2
          id="policies-heading"
          className="mb-3 text-xl font-semibold text-fg"
        >
          Policies
        </h2>
        <ul className="flex flex-col gap-1">
          {policyLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex min-h-11 items-center font-medium text-fg underline underline-offset-4 hover:text-brand-strong"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="feedback-heading"
        className="rounded-lg border border-border p-4 sm:p-6"
      >
        <h2 id="feedback-heading" className="text-xl font-semibold text-fg">
          Still need help? Send us feedback
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Tell us what you were trying to do and what happened.
        </p>
        <FeedbackForm />
      </section>
    </div>
  );
}
