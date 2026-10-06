// Game and preview asset contract for the Drowned Hollow boss.
export const SARCO_TYPE = 'alpha-sarcosuchus';
export const SARCO_MODEL = {
  url: '/assets/models/dinos/alpha-sarcosuchus.glb', source: 'AlphaSarcosuchus',
  // uniform fit: the lateral 10/9 is built into the model (non-uniform scale sheared the sprawled legs)
  height: 3.4455, length: 16.2, yaw: Math.PI,
  hitHeight: 3.812, groundPitchLimit: 0, terrainLegs: true, maxFootAdjustment: .45,
  authoredPoseClips: ['attack', 'bite', 'shove', 'tailsweep', 'pivot', 'retreat', 'ambush', 'recovery', 'swim'],
  // measured on the fitted 16.2 m model (90_validate.mjs); the 15 m/s lunge plays the attack clip
  walkStride: 2.039, runStride: 4.755, runThreshold: 3, maxCadence: 2.4,
  bones: {
    head: 'Head', jaw: 'Jaw', body: 'Body', spine: ['Body', 'Shoulders'],
    neck: ['Neck1', 'Neck2'], tail: Array.from({ length: 8 }, (_, i) => `Tail${i + 1}`),
    legs: ['BackUpLegR', 'BackUpLegL', 'FrontUpLegR', 'FrontUpLegL'],
    knees: ['BackLowLegR', 'BackLowLegL', 'FrontLowLegR', 'FrontLowLegL'],
    feet: ['BackFootR', 'BackFootL', 'FrontFootR', 'FrontFootL'],
  },
  clips: Object.fromEntries(['Idle', 'Walk', 'Run', 'Attack', 'Death', 'Roar', 'Swim', 'TailSweep', 'Bite', 'Shove', 'Pivot', 'Retreat', 'Ambush', 'Recovery'].map(
    name => [name.toLowerCase(), `AlphaSarcosuchus_${name}`])),
  authoredJawClips: ['attack', 'bite', 'ambush'],
  extraHitZones: [
    ...[4.3, 5.4, 6.5, 7.5].map(f => ({ zone: 'head', bone: 'Head', at: [0, 2.45, f], radius: 1 })),
    { zone: 'head', bone: 'Head', at: [0, 2.55, 3.9], radius: 1.55 },
    ...[-1.8, 0, 1.8].flatMap(f => [-.9, .9].map(x => ({
      zone: 'body', bone: f > 0 ? 'Shoulders' : 'Body', at: [x, 2.12, f], radius: 1.25,
    }))),
    ...[-2.5, -1.3, 0, 1.3, 2.7].map(f => ({
      zone: 'body', bone: f > 0 ? 'Shoulders' : 'Body', at: [0, 3.14, f], radius: .85,
    })),
    ...[[-3, 1.3], [-4.3, 1.15], [-5.7, 1.05], [-7.2, .95], [-8.8, .8]].map(([f, radius], i) => ({
      zone: 'tail', bone: `Tail${i + 2}`, at: [0, 1.75 - i * .18, f], radius,
    })),
    { zone: 'tail', bone: 'Tail8', at: [0, .85, -9.8], radius: .6 },
    // sprawled legs: elbow/knee out at the side, lower leg down to a splayed foot
    ...['Front', 'Back'].flatMap(pre => ['L', 'R'].flatMap(side => {
      const sx = side === 'L' ? -1 : 1, f = pre === 'Front' ? 1 : -1;
      return [
        { zone: 'leg', bone: `${pre}UpLeg${side}`, at: [sx * 1.85, 1.5, f * 1.8], radius: .6 },
        { zone: 'leg', bone: `${pre}LowLeg${side}`, at: [sx * 2.45, 1.18, f * (pre === 'Front' ? 1.69 : 1.46)], radius: .6 },
        { zone: 'leg', bone: `${pre}LowLeg${side}`, at: [sx * 2.5, .75, f * (pre === 'Front' ? 1.88 : 1.73)], radius: .55 },
        { zone: 'leg', bone: `${pre}Foot${side}`, at: [sx * 2.62, .25, f * (pre === 'Front' ? 2.3 : 1.75)], radius: .8 },
      ];
    })),
  ],
};
// Runtime fit reduces only height and length; lateral armor, stance and hit widths stay the same.
SARCO_MODEL.extraHitZones = SARCO_MODEL.extraHitZones.map(zone => ({ ...zone,
  at: [zone.at[0], zone.at[1] * .9, zone.at[2] * .9] }));
