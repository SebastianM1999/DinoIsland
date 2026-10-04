// Game and preview asset contract for the Drowned Hollow boss.
export const SARCO_TYPE = 'alpha-sarcosuchus';
export const SARCO_MODEL = {
  url: '/assets/models/dinos/alpha-sarcosuchus.glb', source: 'AlphaSarcosuchus',
  height: 3.4308, length: 16.2, width: 4.427790898814507, yaw: Math.PI,
  hitHeight: 3.812, groundPitchLimit: 0, terrainLegs: true, maxFootAdjustment: .45,
  authoredPoseClips: ['attack', 'bite', 'shove', 'tailsweep', 'pivot', 'retreat', 'ambush', 'recovery', 'swim'],
  walkStride: 1.866 * .9, runStride: 3.775 * .9, runThreshold: 3, maxCadence: 2.55,
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
    ...['Front', 'Back'].flatMap(pre => ['L', 'R'].flatMap(side => {
      const x = side === 'L' ? -1.59 : 1.59;
      return [
        { zone: 'leg', bone: `${pre}LowLeg${side}`, at: [x, 1.25, pre === 'Front' ? 1.22 : -1], radius: .65 },
        { zone: 'leg', bone: `${pre}Foot${side}`, at: [x, .32, pre === 'Front' ? 2.68 : -1.55], radius: .83 },
      ];
    })),
  ],
};
// Runtime fit reduces only height and length; lateral armor, stance and hit widths stay the same.
SARCO_MODEL.extraHitZones = SARCO_MODEL.extraHitZones.map(zone => ({ ...zone,
  at: [zone.at[0], zone.at[1] * .9, zone.at[2] * .9] }));
