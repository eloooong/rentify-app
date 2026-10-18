import type { Metadata } from "next";
import { LegalPage } from "../_components/legal-page";
import { prohibitedItems } from "../_content/legal";

// Draft text, not reviewed yet: keep it out of search results until it is.
export const metadata: Metadata = {
  title: "Prohibited items (draft) | Rentify",
  description:
    "The draft list of items that cannot be listed or rented on Rentify.",
  robots: { index: false, follow: true },
};

export default function Page() {
  return <LegalPage document={prohibitedItems} />;
}
