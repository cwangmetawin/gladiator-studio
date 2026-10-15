/** Resolve only explicit current-market placeholders; historical/admin prose keeps its words. */
export function withStudioMarkets(text: string, stats: { readonly markets: number }): string {
  return text.replaceAll('{{markets}}', String(stats.markets));
}
