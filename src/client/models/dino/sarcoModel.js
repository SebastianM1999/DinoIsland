// Review-only asset contract. Boss stats, spawning and AI are separate work.
export const SARCO_TYPE = 'alpha-sarcosuchus';
export const SARCO_MODEL = {
  url: '/assets/models/dinos/alpha-sarcosuchus.glb', source: 'AlphaSarcosuchus',
  height: 3, length: 18, yaw: Math.PI,
  walkStride: 2, runStride: 5, runThreshold: 3, maxCadence: 1.8,
  bones: {
    head: 'Head', jaw: 'Jaw', body: 'Body', spine: ['Body', 'Shoulders'],
    neck: ['Neck1', 'Neck2'], tail: Array.from({ length: 8 }, (_, i) => `Tail${i + 1}`),
    legs: ['BackUpLegR', 'BackUpLegL', 'FrontUpLegR', 'FrontUpLegL'],
    knees: ['BackLowLegR', 'BackLowLegL', 'FrontLowLegR', 'FrontLowLegL'],
    feet: ['BackFootR', 'BackFootL', 'FrontFootR', 'FrontFootL'],
  },
  clips: Object.fromEntries(['Idle', 'Walk', 'Run', 'Attack', 'Death', 'Roar'].map(
    name => [name.toLowerCase(), `AlphaSarcosuchus_${name}`])),
};
