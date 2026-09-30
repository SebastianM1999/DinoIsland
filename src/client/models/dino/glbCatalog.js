// Replace files, semantic clips and bone aliases here when changing asset providers.
const bones = {
  head: 'Head', jaw: 'Jaw', neck: ['Neck'], body: 'Body', spine: ['Hips', 'Torso', 'Shoulders'],
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
  // Median grounded foot velocity × clip duration; see measure-dino-strides.mjs.
  raptor: model('raptor', 'Velociraptor', 1.4, 2.9, 2.373, 2.207),
  trex: model('trex', 'TRex', 4.1, 11, 6.262, 10.715),
  stego: model('stego', 'Stegosaurus', 4, 7.9, 2.04, 3.629, true),
  brachio: model('brachio', 'Apatosaurus', 11, 19, 3.246, 6.506, true),
};
// The long-neck needs a broader body when fitting Apatosaurus to brachio height.
GLB_DINOS.brachio.width = 4;
GLB_DINOS.stego.width = 2.4;
