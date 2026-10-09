// Compact HUD copy from host-owned mission state. Does not alter objectives.
export function missionSummary(mission) {
  if (!mission) return null;
  const objectives = mission.objectives || [];
  const relics = mission.relics || [];
  const found = relics.filter(relic => relic.found).length;
  let goal;
  if (mission.complete) goal = mission.won ? 'Expedition complete · You escaped!' : 'Island complete · Sailing onward';
  else if (relics.length && mission.step === 'search' && found < relics.length) goal = `Find boat parts · ${found}/${relics.length}`;
  else goal = objectives.find(objective => !objective.done && objective !== mission.trackedObjective)?.text || 'Ready for the next expedition';
  return { title: mission.level ? `Island ${mission.level.number}: ${mission.level.name}` : mission.title || 'Expedition', goal,
    tracked: mission.trackedObjective && !mission.trackedObjective.done ? mission.trackedObjective.text : null };
}
