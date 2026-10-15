import { useStudioStats } from '@/shared/content/StudioStats';

// M3 replaces this small copy layer with the game ring. Geometry and the camera do not depend on it.
export function ArenaLanding({ visible }: { readonly visible: boolean }) {
  const { games } = useStudioStats();
  return (
    <section className="arena-landing" aria-labelledby="arena-roster-title" aria-hidden={!visible} inert={!visible}>
      <div className="arena-landing__copy">
        <p className="arena-landing__chapter">02 / The arena</p>
        <h2 id="arena-roster-title"><span>{games} games.</span> <span>One arena.</span></h2>
        <p className="arena-landing__line">Original games, built in-house for operators and aggregators.</p>
        <button type="button" className="arena-landing__explore"
          onClick={event => {
            event.currentTarget.focus({ preventScroll: true });
            window.dispatchEvent(new CustomEvent('open-panel', { detail: 'games' }));
          }}>
          Explore the games
        </button>
      </div>
    </section>
  );
}
