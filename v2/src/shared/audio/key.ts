export const SOUND_KEY = Object.freeze({
  name: 'D natural minor', referenceHz: 440,
  pitchClasses: [2, 4, 5, 7, 9, 10, 0] as readonly number[],
});

export interface Pitch {
  readonly name: string;
  readonly midi: number;
  readonly hz: number;
}

const pitch = (name: string, midi: number): Pitch => Object.freeze({
  name, midi, hz: SOUND_KEY.referenceHz * 2 ** ((midi - 69) / 12),
});

export const NOTES = Object.freeze({
  Bb0: pitch('Bb0', 22), D1: pitch('D1', 26), A1: pitch('A1', 33), Bb1: pitch('Bb1', 34),
  D3: pitch('D3', 50), G3: pitch('G3', 55), A3: pitch('A3', 57),
  D5: pitch('D5', 74), F5: pitch('F5', 77), G5: pitch('G5', 79), A5: pitch('A5', 81), Bb5: pitch('Bb5', 82),
  D6: pitch('D6', 86), F6: pitch('F6', 89), G6: pitch('G6', 91), A6: pitch('A6', 93),
  D7: pitch('D7', 98), G7: pitch('G7', 103),
});

interface CueNotes {
  readonly key: string;
  readonly tones: readonly Pitch[];
  readonly glides: readonly (readonly [Pitch, Pitch])[];
  readonly noise: boolean;
}

const cue = (tones: readonly Pitch[], glides: CueNotes['glides'] = [], noise = false): CueNotes =>
  Object.freeze({ key: SOUND_KEY.name, tones, glides, noise });

/** All audible pitches, including sweep endpoints; noise contains no oscillator. */
export const CUE_NOTES = Object.freeze({
  ambient: cue([NOTES.D1, NOTES.A1, NOTES.A3], [], true),
  hover: cue([NOTES.A6]),
  click: cue([NOTES.G5, NOTES.G6]),
  panelOpen: cue([], [[NOTES.G3, NOTES.D6], [NOTES.Bb1, NOTES.Bb0]], true),
  panelClose: cue([], [[NOTES.A5, NOTES.D3]]),
  transmission: cue([NOTES.D6, NOTES.F6, NOTES.G6]),
  alert: cue([NOTES.D7, NOTES.G7]),
  bigWin: cue([NOTES.G5, NOTES.Bb5, NOTES.D6, NOTES.G6]),
  sectionSwitch: cue([NOTES.D5, NOTES.A5]),
  warpStart: cue([], [], true),
  warpArrival: cue([NOTES.A5, NOTES.D6]),
  catalogueFocus: cue([NOTES.D6]),
});

export type CueName = keyof typeof CUE_NOTES;
export type EffectCue = Exclude<CueName, 'ambient'>;
