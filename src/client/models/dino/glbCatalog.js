// Replace files, semantic clips and bone aliases here when changing asset providers.
const bones = {
  head: 'Head', neck: ['Neck'], body: 'Body', spine: ['Hips', 'Torso', 'Shoulders'],
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
      attack: `${source}_Attack`, death: species === 'brachio' ? 'Stegosaurus_Death' : `${source}_Death` },
  };
}
export const GLB_DINOS = {
  raptor: model('raptor', 'Velociraptor', 1.4, 2.9, 1.6, 2.7),
  trex: model('trex', 'TRex', 4.1, 11, 3.8, 5.5),
  stego: model('stego', 'Stegosaurus', 4, 7.9, 2.3, 4.2, true),
  brachio: model('brachio', 'Apatosaurus', 11, 19, 4.4, 6.5, true),
};
