import { SARCO_MODEL, SARCO_TYPE } from './sarcoModel.js';
import { SUMP_MODEL, SUMP_TYPE } from './sumpModel.js';
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
    yaw: Math.PI, walkStride, runStride, runThreshold: species === 'raptor' || species === 'gloom-raptor' ? 4 : 3,
    bones: { ...bones, legs: quadruped ? bones.legs : bones.legs.slice(0, 2),
      feet: quadruped ? bones.feet : bones.feet.slice(0, 2) },
    clips: { idle: `${source}_Idle`, walk: `${source}_Walk`, run: `${source}_Run`,
      attack: `${source}_Attack`, death: `${source}_Death` },
  };
}
export const GLB_DINOS = {
  [SARCO_TYPE]: SARCO_MODEL,
  [SUMP_TYPE]: SUMP_MODEL,
  // Median grounded foot velocity × clip duration; see measure-dino-strides.mjs.
  raptor: model('raptor', 'Velociraptor', 1.675, 3.037, 1.818, 4.09),
  // Cave-dwelling raptor kin (art/sources/gloom-raptor): ~25% larger than the raptor (uniform fit).
  'gloom-raptor': model('gloom-raptor', 'GloomRaptor', 2.083, 3.9, 2.279, 5.125),
  trex: model('trex', 'TRex', 5.919, 11, 4.819, 8.095),
  stego: model('stego', 'Stegosaurus', 3.758, 7.9, 1.414, 3.414, true),
  // Cave herbivore (art/sources/crystal-plodder): low, armoured, crystals on its back (glow: see glbDino.js).
  'crystal-plodder': model('crystal-plodder', 'CrystalPlodder', 2.057, 6.0, 1.001, 1.797, true),
  brachio: model('brachio', 'Brachiosaurus', 13.007, 18.514, 2.714, 5.333, true),
  // Flyer: strides are unused (GLBDinoAnimator picks flight clips by state, not by ground speed).
  ptera: model('ptera', 'Pteranodon', 1.855, 2.56, 1, 1),
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
// Gloom Raptor: the raptor rig plus a hiss (Roar) and a flinch (Hurt) clip.
GLB_DINOS['gloom-raptor'].bones = { ...GLB_DINOS.raptor.bones };
GLB_DINOS['gloom-raptor'].clips.roar = 'GloomRaptor_Roar';
GLB_DINOS['gloom-raptor'].clips.hurt = 'GloomRaptor_Hurt';
// Extra hit spheres measured with hit_coverage.mjs (game metres: [zone, bone, x, y, forward, radius]): head/snout, forelimbs,
// feet and lower legs, thick tail base that the generic joint spheres miss.
GLB_DINOS['gloom-raptor'].extraHitZones = [
  ['head', 'Head', -0.02, 1.69, 1.43, 0.16],
  ['leg', 'BackFootL', -0.27, 0.11, 0.03, 0.16],
  ['leg', 'BackFootR', 0.27, 0.11, 0.02, 0.16],
  ['body', 'ArmLowR', 0.25, 0.77, 0.69, 0.16],
  ['body', 'ArmLowL', -0.25, 0.8, 0.71, 0.16],
  ['tail', 'Tail4', 0.02, 1.12, -2.19, 0.16],
  ['leg', 'BackLowLegL', -0.24, 0.41, -0.2, 0.16],
  ['leg', 'BackLowLegR', 0.19, 0.42, -0.14, 0.16],
].map(([zone, bone, x, y, fwd, radius]) => ({ zone, bone, at: [x, y, fwd], radius }));
// Project T-Rex (art/sources/trex/trex.blend): same theropod rig plus a roar clip.
GLB_DINOS.trex.bones = { ...GLB_DINOS.raptor.bones };
GLB_DINOS.trex.clips.roar = 'TRex_Roar';
// Project stego (art/sources/stego/stego.blend): fused head+jaw+neck, 7-bone tail whose
// Attack clip is the thagomizer swing; Run is the charge gallop.
GLB_DINOS.stego.bones = { ...GLB_DINOS.stego.bones,
  jaw: 'Jaw', neck: ['Neck1', 'Neck2'], spine: ['Body', 'Shoulders'],
  tail: Array.from({ length: 7 }, (_, i) => `Tail${i + 1}`) };
// Crystal Plodder: stego-style quadruped rig (6-bone club tail), plus a bellow (Roar) and a flinch (Hurt) clip.
GLB_DINOS['crystal-plodder'].bones = { ...GLB_DINOS.stego.bones, tail: Array.from({ length: 6 }, (_, i) => `Tail${i + 1}`) };
GLB_DINOS['crystal-plodder'].glow = { material: 'PlodCrystal' };   // crystals: unlit vertex-colour material, slow pulse
GLB_DINOS['crystal-plodder'].clips.roar = 'CrystalPlodder_Roar';
GLB_DINOS['crystal-plodder'].clips.hurt = 'CrystalPlodder_Hurt';
// Extra Crystal Plodder hit spheres (hit_coverage.mjs: the generic joint spheres cover ~30 % of this broad, low body; with
// these ~97 %). Game metres [zone, bone, x, y, forward, radius]: armoured back = plates (x0.35), flanks weak (x1.6).
GLB_DINOS['crystal-plodder'].extraHitZones = [
  ['head', 'Head', 0.17, 0.43, 2.71, 0.2],
  ['head', 'Head', -0.31, 0.61, 2.76, 0.2],
  ['head', 'Head', 0.25, 0.73, 2.81, 0.2],
  ['body', 'Body', -0.62, 1.41, 0.12, 0.3],
  ['body', 'Body', 0.67, 1.29, 0.13, 0.3],
  ['head', 'Head', -0.26, 0.46, 2.39, 0.2],
  ['head', 'Head', 0.3, 0.66, 2.45, 0.2],
  ['plates', 'Shoulders', 0.21, 1.52, 0.67, 0.3],
  ['plates', 'Body', -0.19, 1.56, -0.52, 0.3],
  ['leg', 'BackFootL', -0.7, 0.16, -0.17, 0.22],
  ['leg', 'BackFootR', 0.75, 0.15, -0.18, 0.22],
  ['tail', 'Tail2', 0.06, 1.1, -1.16, 0.22],
  ['head', 'Jaw', -0.13, 0.33, 2.88, 0.2],
  ['body', 'Shoulders', -0.17, 1.41, 1.42, 0.3],
  ['leg', 'FrontLowLegR', 0.6, 0.32, 1.13, 0.22],
  ['leg', 'FrontFootL', -0.75, 0.32, 1.16, 0.22],
  ['flank', 'Shoulders', -0.77, 1.22, 0.67, 0.3],
  ['leg', 'FrontFootR', 0.87, 0.12, 0.78, 0.22],
  ['tail', 'Tail5', 0.39, 0.67, -2.4, 0.22],
  ['leg', 'FrontFootL', -0.74, 0.16, 0.68, 0.22],
  ['tail', 'Tail4', -0.4, 0.6, -2.36, 0.22],
  ['plates', 'Body', 0.43, 1.53, -0.27, 0.3],
  ['neck', 'Neck1', 0.53, 1.01, 1.49, 0.22],
  ['head', 'Head', -0.34, 0.78, 2.39, 0.2],
  ['leg', 'BackFootL', -0.78, 0.02, -0.49, 0.22],
  ['flank', 'Body', -0.91, 1.04, 0.02, 0.3],
  ['tail', 'Tail1', -0.31, 1.26, -0.99, 0.22],
  ['body', 'Shoulders', 0.7, 1.3, 0.93, 0.3],
  ['leg', 'BackLowLegR', 0.75, 0.35, -0.67, 0.22],
  ['tail', 'Tail4', -0.18, 0.89, -2.37, 0.22],
  ['tail', 'Tail5', 0.09, 0.27, -2.41, 0.22],
  ['leg', 'FrontFootL', -0.42, 0.14, 1.1, 0.22],
  ['body', 'Shoulders', -0.65, 1, 1.41, 0.3],
  ['neck', 'Neck2', 0.21, 0.47, 1.96, 0.22],
  ['plates', 'Body', -0.06, 1.63, 0.33, 0.3],
  ['leg', 'BackLowLegR', 0.46, 0.25, -0.38, 0.22],
  ['flank', 'Shoulders', 0.91, 0.66, 0.62, 0.3],
  ['leg', 'FrontFootR', 0.59, 0.01, 1.28, 0.22],
  ['tail', 'Tail2', -0.31, 0.84, -1.27, 0.22],
  ['body', 'Shoulders', 0.25, 1.34, 1.27, 0.3],
  ['leg', 'BackLowLegL', -0.98, 0.54, -0.35, 0.22],
  ['head', 'Jaw', 0, 0.29, 2.26, 0.2],
  ['flank', 'Body', 0.95, 0.71, -0.14, 0.3],
  ['leg', 'BackLowLegL', -0.47, 0.33, -0.42, 0.22],
  ['neck', 'Neck1', -0.32, 0.5, 1.7, 0.22],
  ['tail', 'Tail2', 0.33, 0.88, -1.13, 0.22],
  ['flank', 'Body', -0.72, 0.58, 0.3, 0.3],
  ['tail', 'Tail1', -0.81, 1.05, -0.77, 0.22],
  ['leg', 'FrontLowLegR', 0.46, 0.35, 0.82, 0.22],
  ['body', 'Shoulders', 0.58, 0.63, 1.35, 0.3],
  ['leg', 'BackFootR', 0.93, 0.03, -0.62, 0.22],
  ['neck', 'Neck1', 0.32, 1.08, 1.81, 0.22],
  ['tail', 'Tail3', 0.28, 0.76, -2.03, 0.22],
  ['head', 'Head', -0.07, 0.74, 2.95, 0.2],
  ['neck', 'Neck1', -0.37, 1, 1.88, 0.22],
  ['flank', 'Body', 1.09, 1.18, 0.3, 0.3],
].map(([zone, bone, x, y, fwd, radius]) => ({ zone, bone, at: [x, y, fwd], radius }));
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
// Project ptera (art/sources/ptera/ptera.blend): a flyer. Fly/Glide/Dive while alive in the air, Fall
// while dead and still falling (the server simulates the drop), Death = the ground impact.
GLB_DINOS.ptera.flyer = true;
GLB_DINOS.ptera.pivot = 1.0;                 // pitch/bank about the torso, not the toes
GLB_DINOS.ptera.clips = { ...GLB_DINOS.ptera.clips, walk: 'Pteranodon_Fly', run: 'Pteranodon_Glide',
  fly: 'Pteranodon_Fly', glide: 'Pteranodon_Glide', dive: 'Pteranodon_Dive', fall: 'Pteranodon_Fall' };
GLB_DINOS.ptera.bones = { ...GLB_DINOS.ptera.bones,
  jaw: 'Jaw', neck: ['Neck1', 'Neck2'], spine: ['Body', 'Shoulders'], tail: ['Tail1', 'Tail2'],
  legs: [], feet: [], knees: [] };
// Membrane hit spheres (game metres: [bone, x, y, forward, radius]), mid-chord along each wing.
GLB_DINOS.ptera.extraHitZones = [
  ['WingLowL', -0.57, 1.1, -0.19, 0.33],
  ['WingLowL', -1.05, 1.11, -0.13, 0.45],
  ['WingHandL', -1.53, 1.12, -0.17, 0.42],
  ['WingHandL', -2.0, 1.12, -0.25, 0.32],
  ['WingFingerL', -2.47, 1.11, -0.35, 0.22],
  ['WingFingerL', -2.94, 1.1, -0.45, 0.18],
  ['WingLowR', 0.57, 1.1, -0.19, 0.33],
  ['WingLowR', 1.05, 1.11, -0.13, 0.45],
  ['WingHandR', 1.53, 1.12, -0.17, 0.42],
  ['WingHandR', 2.0, 1.12, -0.25, 0.32],
  ['WingFingerR', 2.47, 1.11, -0.35, 0.22],
  ['WingFingerR', 2.94, 1.1, -0.45, 0.18],
].map(([bone, x, y, fwd, radius]) => ({ zone: 'wing', bone, at: [x, y, fwd], radius }));
// The generic joint spheres miss the long beak, the crest and the (zone-less) flyer legs.
GLB_DINOS.ptera.extraHitZones.push(...[
  ['head', 'Head', 0, 1.43, 0.88, 0.13],
  ['head', 'Head', 0, 1.39, 1.08, 0.11],
  ['head', 'Head', 0, 1.37, 1.32, 0.09],
  ['head', 'Head', 0, 1.35, 1.58, 0.07],
  ['head', 'Head', 0, 1.34, 1.82, 0.05],
  ['head', 'Head', 0, 1.58, 0.78, 0.12],
  ['head', 'Head', 0, 1.7, 0.55, 0.1],
  ['head', 'Head', 0, 1.8, 0.36, 0.07],
  ['leg', 'BackUpLegL', -0.11, 0.73, -0.25, 0.09],
  ['leg', 'BackLowLegL', -0.125, 0.5, -0.26, 0.07],
  ['leg', 'BackLowLegL', -0.13, 0.25, -0.28, 0.07],
  ['leg', 'BackFootL', -0.13, 0.07, -0.22, 0.11],
  ['leg', 'BackUpLegR', 0.11, 0.73, -0.25, 0.09],
  ['leg', 'BackLowLegR', 0.125, 0.5, -0.26, 0.07],
  ['leg', 'BackLowLegR', 0.13, 0.25, -0.28, 0.07],
  ['leg', 'BackFootR', 0.13, 0.07, -0.22, 0.11],
].map(([zone, bone, x, y, fwd, radius]) => ({ zone, bone, at: [x, y, fwd], radius })));
// Cycles per second, bounded independently of unusually short source run strides.
GLB_DINOS.raptor.maxCadence = 2.0;
GLB_DINOS['gloom-raptor'].maxCadence = 2.0;
GLB_DINOS.trex.maxCadence = 1.25;
GLB_DINOS.stego.maxCadence = 2.6;
GLB_DINOS['crystal-plodder'].maxCadence = 1.9;
GLB_DINOS.brachio.maxCadence = 1.25;
