import type { FeaturedTitle } from './featuredCatalogue';

interface ValueProp { readonly tag: string; readonly title: string; readonly body: string }
interface Step { readonly step: string; readonly body: string }

/** The existing admin partner section, including legacy newline-separated lists. */
export interface PartnerContent {
  readonly eyebrow: string;
  readonly title: string;
  readonly lede: string;
  readonly ctaLabel: string;
  readonly ctaUrl: string;
  readonly contactEmail: string;
  readonly valueProps: readonly ValueProp[];
  readonly steps: readonly Step[];
  readonly specs: string | readonly string[];
  readonly catalogue: readonly FeaturedTitle[];
  readonly complianceTitle: string;
  readonly complianceBody: string;
  readonly compliancePoints: string | readonly string[];
  readonly faqs: readonly { readonly q: string; readonly a: string }[];
  readonly closingTitle: string;
  readonly closingBody: string;
}
