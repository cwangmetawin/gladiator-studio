/** Null means unavailable (use fallback); a successful empty read stays empty. */
export function selectCatalogueRows<T>(rows: readonly T[] | null, readFailed: boolean): readonly T[] | null {
  return readFailed ? null : rows ?? [];
}
