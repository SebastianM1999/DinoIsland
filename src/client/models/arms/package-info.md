# arms
> First-person arms: Claude-of-Duty's two-bone arm rig restyled as bare cartoon hands in the player colour, plus the grip maths that places them on a tool.

## Files
- `cartoonArm.js` — `makeCartoonArm(side, skin, top, opts)` builds a CoD `Arm` (`firearms/reference/hands.js`) with throwaway materials, cuts away pads, seams, strap and the wrist cuff pipe, thickens the digits (`FINGER_THICK`, also in `arm._segRadius`), merges a small rounded, subtle nail into each distal segment, colours everything per vertex and draws it with `MAT.standard` (17 draw calls per arm). Sleeves are smooth tapered tubes (the CoD fold-ring sleeves read as spikes this close to the camera) coloured from the top (`restyleSleeves`): long = fabric with a darker cuff, short = fabric upper sleeve and a bare skin forearm, none = bare skin tubes. Extra poses `fist`, `relaxed`, `hold`, `hook` live in `arm.poses`, never in the global `HAND_POSES`.
- Grip helpers: `handBasis`, `scaledGrip` (CoD wrist targets are authored for scale 1; keeps the knuckles on their line for `HAND_SCALE`; optional `itemScale` for a scaled gun), `wristTarget` (the same, allocation-free, with the hand orientation, for clip keys every frame), `cylinderGrip` (wrist target for a hand round a cylinder in tool space), per-pose `indexLift` (small knuckle clearance, reset on pose switches) and `triggerPull` (travel from the grip-specific rest curl); `fitTriggerFinger` (scans the index curl so its pad lands on the trigger; stored as the pose's `trigger` rest, which the per-arm `setTrigger` override uses), `fitCylinderPose` (fingertip fit via `Arm.fitToCylinder`, cached per side/pose/`HAND_SCALE` so a new viewmodel per island does not refit).

## Entry points
- `player/viewmodel.js` builds three arms (right, left, torch), fits their fingers round the tools (`fitCylinderPose`), solves them to the grips every frame and calls `restyleSleeves` on outfit changes.

## Rules
- `firearms/reference/hands.js` is vendored and stays unedited; all restyling is post-processing in `cartoonArm.js`.
- Hand space: -Z along the fingers, +Y out of the back of the hand; wrist targets are `{ pos, finger, back }`.
- Geometry is owned by the arm (`arm.dispose()`); the shared material is not.

## Not here
- Third-person arms: `playerModel.js`. Gun models and their grip nodes: `firearms/`. Viewmodel animation and state: `client/player/`.
