// The first screen's two components, as one lazy chunk: App imports them dynamically (after the age gate
// answers), so none of this reaches the gate's own bundle. preloadScene warms the chunk while the gate is up.
export { ArenaHero } from './ArenaHero';
export { TopBar } from './TopBar';
