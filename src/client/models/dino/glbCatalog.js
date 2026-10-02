// Replace files, semantic clips and bone aliases here when changing asset providers.
const bones = {
  head: 'Head', jaw: null, neck: ['Neck'], body: 'Body', spine: ['Hips', 'Torso', 'Shoulders'],
  tail: ['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5'],
  legs: ['BackUpLegR', 'BackUpLegL', 'FrontUpLegR', 'FrontUpLegL'],
  feet: ['BackFootR', 'BackFootL', 'FrontFootR', 'FrontFootL'],
  knees: ['BackLowLegR', 'BackLowLegL', 'FrontLowLegR', 'FrontLowLegL'],
};
function model(species, source, height, length, walkStride, runStride, quadruped = false) {
  return {
    url: `/assets/models/dinos/${species}.glb`, source, height, length,
    // Pack faces +Z after Blender's Y-up export; game creatures face -Z.
    yaw: Math.PI, walkStride, runStride, runThreshold: species === 'raptor' ? 4 : 3,
    bones: { ...bones, legs: quadruped ? bones.legs : bones.legs.slice(0, 2),
      feet: quadruped ? bones.feet : bones.feet.slice(0, 2) },
    clips: { idle: `${source}_Idle`, walk: `${source}_Walk`, run: `${source}_Run`,
      attack: `${source}_Attack`, death: `${source}_Death` },
  };
}
export const GLB_DINOS = {
  // Median grounded foot velocity × clip duration; see measure-dino-strides.mjs.
  raptor: model('raptor', 'Velociraptor', 1.675, 3.037, 1.818, 4.09),
  trex: model('trex', 'TRex', 5.919, 11, 4.819, 8.095),
  stego: model('stego', 'Stegosaurus', 3.758, 7.9, 1.414, 3.414, true),
  brachio: model('brachio', 'Brachiosaurus', 13.007, 18.514, 2.714, 5.333, true),
};
// Project brachio (art/sources/brachio/brachio.blend).
GLB_DINOS.brachio.bones = { ...GLB_DINOS.brachio.bones,
  jaw: 'Jaw',
  neck: Array.from({ length: 6 }, (_, i) => `Neck${i + 1}`),
  tail: Array.from({ length: 8 }, (_, i) => `Tail${i + 1}`), spine: ['Body', 'Shoulders'] };
// Project raptor (art/sources/raptor/raptor.blend): opening jaw, two-bone neck,
// toe bones as the planted contact points.
GLB_DINOS.raptor.bones = { ...GLB_DINOS.raptor.bones,
  jaw: 'Jaw', neck: ['Neck1', 'Neck2'], spine: ['Body', 'Torso'],
  feet: ['BackToesR', 'BackToesL'], knees: ['BackLowLegR', 'BackLowLegL'] };
// Project T-Rex (art/sources/trex/trex.blend): same theropod rig plus a roar clip.
GLB_DINOS.trex.bones = { ...GLB_DINOS.raptor.bones };
GLB_DINOS.trex.clips.roar = 'TRex_Roar';
// Project stego (art/sources/stego/stego.blend): fused head+jaw+neck, 7-bone tail whose
// Attack clip is the thagomizer swing; Run is the charge gallop.
GLB_DINOS.stego.bones = { ...GLB_DINOS.stego.bones,
  jaw: 'Jaw', neck: ['Neck1', 'Neck2'], spine: ['Body', 'Shoulders'],
  tail: Array.from({ length: 7 }, (_, i) => `Tail${i + 1}`) };
// Extra stego hit spheres, measured from stego.blend (game metres: [zone, bone, x, y, forward, radius]):
// armour plates (x0.35 damage) and soft flanks (x1.6) as on the old procedural stego, plus the snout,
// lower legs/feet and the thick tail base that the generic joint spheres miss.
GLB_DINOS.stego.extraHitZones = [
  ['plates', 'Neck1', -0.1, 1.45, 2.0, 0.16],
  ['plates', 'Shoulders', 0.11, 1.78, 1.64, 0.18],
  ['plates', 'Shoulders', -0.11, 2.13, 1.29, 0.21],
  ['plates', 'Shoulders', 0.11, 2.45, 0.94, 0.26],
  ['plates', 'Shoulders', -0.15, 2.74, 0.59, 0.33],
  ['plates', 'Body', 0.17, 2.99, 0.23, 0.39],
  ['plates', 'Body', -0.15, 3.16, -0.14, 0.45],
  ['plates', 'Tail1', 0.16, 3.26, -0.52, 0.49],
  ['plates', 'Tail1', -0.2, 3.26, -0.91, 0.49],
  ['plates', 'Tail1', 0.18, 3.17, -1.3, 0.46],
  ['plates', 'Tail2', -0.14, 3.03, -1.68, 0.41],
  ['plates', 'Tail3', 0.14, 2.84, -2.04, 0.34],
  ['plates', 'Tail3', -0.14, 2.63, -2.39, 0.27],
  ['plates', 'Tail4', 0.12, 2.43, -2.74, 0.22],
  ['flank', 'Body', -0.55, 1.45, 0.4, 0.45],
  ['flank', 'Body', -0.55, 1.62, -0.5, 0.45],
  ['flank', 'Body', 0.55, 1.45, 0.4, 0.45],
  ['flank', 'Body', 0.55, 1.62, -0.5, 0.45],
  ['head', 'Head', 0, 0.93, 2.55, 0.36],
  ['head', 'Head', 0, 0.9, 2.95, 0.3],
  ['head', 'Head', 0, 0.9, 3.18, 0.2],
  ['leg', 'BackLowLegL', -0.54, 0.92, -0.34, 0.29],
  ['leg', 'BackLowLegL', -0.55, 0.61, -0.56, 0.29],
  ['leg', 'BackFootL', -0.56, 0.12, -0.68, 0.29],
  ['leg', 'FrontLowLegL', -0.51, 0.63, 1.1, 0.25],
  ['leg', 'FrontLowLegL', -0.52, 0.42, 1.23, 0.25],
  ['leg', 'FrontFootL', -0.53, 0.11, 1.36, 0.25],
  ['leg', 'BackLowLegR', 0.54, 0.92, -0.34, 0.29],
  ['leg', 'BackLowLegR', 0.55, 0.61, -0.56, 0.29],
  ['leg', 'BackFootR', 0.56, 0.12, -0.68, 0.29],
  ['leg', 'FrontLowLegR', 0.51, 0.63, 1.1, 0.25],
  ['leg', 'FrontLowLegR', 0.52, 0.42, 1.23, 0.25],
  ['leg', 'FrontFootR', 0.53, 0.11, 1.36, 0.25],
  ['tail', 'Tail1', 0.0, 1.95, -1.48, 0.62],
  ['tail', 'Tail2', 0.0, 1.91, -2.04, 0.52],
  ['tail', 'Tail3', 0.0, 1.82, -2.59, 0.42],
  ['tail', 'Tail4', 0.0, 1.71, -3.18, 0.31],
].map(([zone, bone, x, y, fwd, radius]) => ({ zone, bone, at: [x, y, fwd], radius }));
// Cycles per second, bounded independently of unusually short source run strides.
GLB_DINOS.raptor.maxCadence = 2.4;
GLB_DINOS.trex.maxCadence = 1.25;
GLB_DINOS.stego.maxCadence = 2.6;
GLB_DINOS.brachio.maxCadence = 1.25;
