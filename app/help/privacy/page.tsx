import type { Metadata } from "next";
import { LegalPage } from "../_components/legal-page";
import { privacy } from "../_content/legal";

// Draft text, not reviewed yet: keep it out of search results until it is.
export const metadata: Metadata = {
  title: "Privacy Policy (draft) | Rentify",
  description: "The draft privacy policy: what Rentify collects and why.",
  robots: { index: false, follow: true },
};

export default function Page() {
  return <LegalPage document={privacy} />;
}
