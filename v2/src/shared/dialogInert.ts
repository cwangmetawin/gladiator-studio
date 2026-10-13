export interface InertTarget { inert: boolean }

/**
 * The siblings a modal dialog makes inert, each with the value it should get back when the
 * dialog lets go. React also writes `inert` (an `inert={!active}` prop) while a dialog is
 * open; that write becomes the value to restore, so a stale snapshot never overrides it.
 */
export function createInertLedger<T extends InertTarget>() {
  const held = new Map<T, boolean>();
  return {
    hold(node: T): void {
      held.set(node, node.inert);
      node.inert = true;
    },
    /** Another writer changed a held node's inert: keep its value for the release. */
    noteExternal(node: T): void {
      if (held.has(node)) held.set(node, node.inert);
    },
    releaseAll(): void {
      for (const [node, value] of held) node.inert = value;
      held.clear();
    },
  };
}
