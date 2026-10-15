import type { createPageTransitionStore } from '@/features/arena-page/pageTransitionStore';
import { createPageGates, type PageCameraPose } from './pageGates';
import { createPageFlight, pageFlightTiming, samplePageFlight, samplePageScroll, type PageFlight, type PageFlightMouth } from './pageFlight';

interface Vector { x: number; y: number; z: number; set(x: number, y: number, z: number): unknown }
interface Camera { readonly position: Vector; readonly rotation: Vector; fov: number }
type Store = ReturnType<typeof createPageTransitionStore>;
type Leg = { readonly path: PageFlight; upto: number } | { readonly from: PageCameraPose; readonly to: PageCameraPose; upto: number };
const blank = (): PageCameraPose => ({ x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, fov: 0.82 });
function capture(camera: Camera): PageCameraPose {
  return { x: camera.position.x, y: camera.position.y, z: camera.position.z,
    pitch: camera.rotation.x, yaw: camera.rotation.y, roll: camera.rotation.z, fov: camera.fov };
}
function copy(from: PageCameraPose, to: PageCameraPose): void {
  to.x = from.x; to.y = from.y; to.z = from.z; to.pitch = from.pitch;
  to.yaw = from.yaw; to.roll = from.roll; to.fov = from.fov;
}
function sample(leg: Leg, out: PageCameraPose): void {
  if ('path' in leg) { samplePageFlight(leg.path, leg.upto, out); return; }
  const p = leg.upto, t = p * p * (3 - 2 * p), a = leg.from, b = leg.to;
  out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t;
  out.pitch = a.pitch + (b.pitch - a.pitch) * t; out.yaw = a.yaw + (b.yaw - a.yaw) * t;
  out.roll = a.roll + (b.roll - a.roll) * t; out.fov = a.fov + (b.fov - a.fov) * t;
}

/** Owns only the supplied camera. Routes allocate on clicks; the frame sampler reuses one scalar pose. */
export function createPageFlightController(camera: Camera, phone: boolean, reducedMotion: () => boolean,
  store: Store, requestStatic: () => void, mouth: () => PageFlightMouth | undefined = () => undefined) {
  const gates = createPageGates(phone ? 40 : 64), timing = pageFlightTiming(phone, false);
  const pose = blank(), rest = blank(), home = blank(), scrollStart = blank();
  const legs: Leg[] = [];
  let active = false, returning = false, disposed = false, revision = -1, available = false;
  let reverseRate = 1, scroll = 0;
  let names = 1, departureNames = 1;

  function apply(): void {
    camera.position.set(pose.x, pose.y, pose.z);
    camera.rotation.set(pose.pitch, pose.yaw, pose.roll); camera.fov = pose.fov;
  }
  function finishReturn(): void {
    copy(home, pose); apply(); legs.length = 0; active = returning = false; scroll = 0; names = 1;
    store.setPhase('idle', revision);
  }
  function land(): void {
    const leg = legs.at(-1);
    if (!leg) return;
    leg.upto = 1; sample(leg, pose); apply(); copy(pose, rest); names = 0;
    store.setPhase('settled', revision);
  }
  function bridgeScroll(): void {
    const last = legs.at(-1);
    if (!last) return;
    sample(last, scrollStart);
    const current = capture(camera);
    if (current.x !== scrollStart.x || current.y !== scrollStart.y || current.z !== scrollStart.z
      || current.pitch !== scrollStart.pitch || current.yaw !== scrollStart.yaw) {
      legs.push({ from: { ...scrollStart }, to: current, upto: 1 });
    }
  }
  const duration = (leg: Leg): number => 'path' in leg ? timing.durationMs : 140;

  function changed(): void {
    if (disposed) return;
    const state = store.getSnapshot(), newlyAvailable = state.sceneAvailable && !available;
    available = state.sceneAvailable;
    if (!available) {
      if (active) { copy(home, pose); apply(); legs.length = 0; active = returning = false; names = 1; }
      return;
    }
    if (state.revision === revision && !newlyAvailable) return;
    revision = state.revision;
    if (state.targetPage !== null) {
      const gate = gates.find(item => item.id === state.targetPage);
      if (!gate) return;
      if (!active) { copy(capture(camera), home); active = true; }
      else bridgeScroll();
      returning = false; scroll = 0; departureNames = names;
      const leg = { path: createPageFlight(capture(camera), gate, phone, mouth()), upto: 0 };
      legs.push(leg);
      sample(leg, pose); apply(); // Establish the exact takeover sample before any frame consumes time.
      if (reducedMotion()) land();
    } else if (active) {
      bridgeScroll(); returning = true;
      let total = 0;
      for (const leg of legs) total += leg.upto * duration(leg);
      // Retrace all visited gates, bounded to one flight's time even after many switches.
      reverseRate = Math.max(1, total / timing.durationMs);
      if (reducedMotion() || total === 0) finishReturn();
    } else store.setPhase('idle', revision);
    requestStatic();
  }
  const unsubscribe = store.subscribe(changed);

  return {
    isActive: (): boolean => active,
    homeDepth: (): number => home.z,
    gateNames: (): number => names,
    step(dt: number): void {
      if (disposed || !active) return;
      const reduced = reducedMotion(), state = store.getSnapshot();
      if (returning) {
        if (reduced) { finishReturn(); return; }
        names += (1 - names) * Math.min(1, Math.max(0, dt) / 0.12);
        let budget = Math.max(0, dt) * 1000 * reverseRate;
        while (legs.length) {
          const leg = legs[legs.length - 1]!, ms = duration(leg), remaining = leg.upto * ms;
          if (budget < remaining) { leg.upto -= budget / ms; sample(leg, pose); apply(); break; }
          budget -= remaining; leg.upto = 0; sample(leg, pose); apply(); legs.pop();
        }
        if (!legs.length) finishReturn();
      } else if (state.phase === 'flying') {
        const leg = legs[legs.length - 1]!;
        leg.upto = reduced ? 1 : Math.min(1, leg.upto + Math.max(0, dt) * 1000 / timing.durationMs);
        const elapsed = leg.upto * timing.durationMs;
        const enter = Math.min(1, elapsed / 120), leave = Math.min(1, (timing.durationMs - elapsed) / 180);
        names = (departureNames + (1 - departureNames) * enter * enter * (3 - 2 * enter)) * leave * leave * (3 - 2 * leave);
        sample(leg, pose); apply();
        if (leg.upto === 1) land();
      } else {
        names = 0;
        const target = reduced ? 0 : state.scrollProgress;
        scroll = reduced ? 0 : scroll + (target - scroll) * (1 - Math.exp(-5 * Math.max(0, dt)));
        samplePageScroll(rest, scroll, pose); apply();
      }
    },
    dispose(): void { disposed = true; unsubscribe(); legs.length = 0; },
  };
}
