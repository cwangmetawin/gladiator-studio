/** ?fx=off disables M4b's material response and post for same-machine A/B tests.
 * ?fx=measure lazily enables GPU queries; ?fx=off&fx=measure measures the baseline.
 */
export function sceneFxFlags(search: string) {
  const flags = new URLSearchParams(search).getAll('fx');
  return { enabled: !flags.includes('off'), measure: flags.includes('measure') };
}
