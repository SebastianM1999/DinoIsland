// Codex discovers project skills in .agents/skills, Claude and Copilot in .claude/skills.
// .claude/skills is the single tracked copy; this links .agents/skills to it so every
// clone and git worktree gets the same skills. Runs from the npm "prepare" hook, so
// `npm ci` in a fresh worktree is enough. Never fails an install.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, '.claude', 'skills');
const link = path.join(root, '.agents', 'skills');

try {
  if (!fs.existsSync(target)) process.exit(0);
  if (fs.existsSync(link)) process.exit(0);
  fs.mkdirSync(path.dirname(link), { recursive: true });
  // 'junction' needs no admin rights on Windows; other platforms get a plain symlink.
  fs.symlinkSync(target, link, 'junction');
  console.log('linked .agents/skills -> .claude/skills');
} catch (err) {
  console.warn(`could not link .agents/skills: ${err.message}`);
}
