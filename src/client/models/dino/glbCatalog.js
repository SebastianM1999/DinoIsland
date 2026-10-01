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
  trex: model('trex', 'TRex', 5.808, 11, 4.719, 7.928),
  stego: model('stego', 'Stegosaurus', 4, 7.9, 2.04, 3.629, true),
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
GLB_DINOS.stego.width = 2.4;
// Cycles per second, bounded independently of unusually short source run strides.
GLB_DINOS.raptor.maxCadence = 2.4;
GLB_DINOS.trex.maxCadence = 1.25;
GLB_DINOS.stego.maxCadence = 1.35;
GLB_DINOS.brachio.maxCadence = 1.25;
