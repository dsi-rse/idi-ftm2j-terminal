import { corpusStats } from "@/domains/companies/dataset";
import { Landing } from "@/views/landing";

export const dynamic = "force-static";

export default function LandingPage() {
  // Read at build time from the same index the company pages are selected
  // from, so the landing figures and the site's contents cannot disagree.
  return <Landing stats={corpusStats()} />;
}
