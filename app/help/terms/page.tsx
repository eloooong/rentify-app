import type { Metadata } from "next";
import { LegalPage } from "../_components/legal-page";
import { terms } from "../_content/legal";

// Draft text, not reviewed yet: keep it out of search results until it is.
export const metadata: Metadata = {
  title: "Terms of Service (draft) | Rentify",
  description: "The draft terms for renting and lending devices on Rentify.",
  robots: { index: false, follow: true },
};

export default function Page() {
  return <LegalPage document={terms} />;
}
