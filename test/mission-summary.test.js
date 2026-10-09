import test from 'node:test';
import assert from 'node:assert/strict';
import { missionSummary } from '../src/client/ui/missionSummary.js';

const mission = () => ({ level: { number: 2, name: 'Misty Swamp' }, step: 'search',
  relics: [{ found: true }, { found: false }, { found: false }], objectives: [
    { text: 'Find first part', done: true }, { text: 'Find second part', done: false }, { text: 'Find third part', done: false },
    { text: 'Repair the boat (1/3 parts)', done: false }, { text: 'Set sail together (0/1 at the boat)', done: false },
  ] });

test('search summary groups parallel part objectives without inventing an order', () => {
  const m = mission();
  const before = JSON.stringify(m);
  assert.equal(missionSummary(m).goal, 'Find boat parts · 1/3');
  assert.equal(missionSummary(m).title, 'Island 2: Misty Swamp');
  assert.equal(JSON.stringify(m), before);
});
test('repair and sailing goals follow authoritative objective completion', () => {
  const m = mission();
  m.relics.forEach(r => { r.found = true; });
  m.objectives.slice(0, 3).forEach(o => { o.done = true; });
  assert.equal(missionSummary(m).goal, 'Repair the boat (1/3 parts)');
  m.step = 'repaired'; m.objectives[3].done = true;
  assert.equal(missionSummary(m).goal, 'Set sail together (0/1 at the boat)');
});
test('pinned contract remains secondary to the expedition goal', () => {
  const m = mission();
  m.trackedObjective = { text: 'Hunt together: 2/5', done: false };
  m.objectives.push(m.trackedObjective);
  assert.equal(missionSummary(m).tracked, 'Hunt together: 2/5');
  assert.equal(missionSummary(m).goal, 'Find boat parts · 1/3');
  m.trackedObjective.done = true;
  assert.equal(missionSummary(m).tracked, null);
});
test('completion distinguishes travel from escape and supports missing/custom mission data', () => {
  assert.equal(missionSummary(null), null);
  assert.equal(missionSummary({ complete: true }).goal, 'Island complete · Sailing onward');
  assert.equal(missionSummary({ complete: true, won: true }).goal, 'Expedition complete · You escaped!');
  assert.equal(missionSummary({ title: 'Hunt', objectives: [{text:'Track a dinosaur',done:false}] }).goal, 'Track a dinosaur');
});
