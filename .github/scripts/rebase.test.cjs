'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-rebase-test-'));
  t.after(() => {
    // Remove only the exact directory created above, never a parent or computed Git path.
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('dino-rebase-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true', GIT_SEQUENCE_EDITOR: 'true',
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' }
  }).trim();
  const origin = path.join(root, 'origin.git');
  const developer = path.join(root, 'developer');
  const worker = path.join(root, 'worker');
  git(root, 'init', '--bare', '--initial-branch=main', origin);
  git(root, 'clone', origin, developer);
  const write = (cwd, file, contents) => fs.writeFileSync(path.join(cwd, file), contents);
  const commit = (cwd, message) => { git(cwd, 'add', '-A'); git(cwd, 'commit', '-m', message); return git(cwd, 'rev-parse', 'HEAD'); };
  write(developer, 'shared.txt', 'original\n');
  commit(developer, 'Initial');
  git(developer, 'push', 'origin', 'main');
  git(developer, 'checkout', '-b', 'codex/task');
  write(developer, 'feature.txt', 'feature behavior\n');
  const reserved = commit(developer, 'Feature');
  git(developer, 'push', 'origin', 'codex/task');
  git(root, 'clone', origin, worker);
  git(worker, 'checkout', '--detach', reserved);
  git(developer, 'checkout', 'main');
  write(developer, 'main.txt', 'main behavior\n');
  const main = commit(developer, 'Main advance');
  git(developer, 'push', 'origin', 'main');
  git(worker, 'fetch', 'origin', 'refs/heads/main:refs/remotes/origin/main');
  return { root, origin, developer, worker, reserved, main, git, write, commit };
}

test('clean diverged task rebases onto current main and lease-push preserves both changes without merge commits', t => {
  const f = fixture(t);
  f.git(f.worker, 'rebase', 'origin/main');
  f.git(f.worker, 'push', `--force-with-lease=refs/heads/codex/task:${f.reserved}`, 'origin', 'HEAD:refs/heads/codex/task');
  const published = f.git(f.origin, 'rev-parse', 'refs/heads/codex/task');
  assert.notEqual(published, f.reserved);
  f.git(f.origin, 'merge-base', '--is-ancestor', f.main, published);
  assert.equal(f.git(f.origin, 'rev-list', '--count', '--merges', `${f.main}..${published}`), '0');
  assert.equal(f.git(f.origin, 'show', `${published}:feature.txt`), 'feature behavior');
  assert.equal(f.git(f.origin, 'show', `${published}:main.txt`), 'main behavior');
});

test('exact-head force-with-lease rejects a concurrent task edit without overwriting it', t => {
  const f = fixture(t);
  f.git(f.worker, 'rebase', 'origin/main');
  f.git(f.developer, 'checkout', 'codex/task');
  f.write(f.developer, 'concurrent.txt', 'new developer work\n');
  const concurrent = f.commit(f.developer, 'Concurrent task edit');
  f.git(f.developer, 'push', 'origin', 'codex/task');
  assert.throws(() => f.git(f.worker, 'push', `--force-with-lease=refs/heads/codex/task:${f.reserved}`, 'origin', 'HEAD:refs/heads/codex/task'), /stale info|rejected/);
  assert.equal(f.git(f.origin, 'rev-parse', 'refs/heads/codex/task'), concurrent);
  assert.equal(f.git(f.origin, 'show', `${concurrent}:concurrent.txt`), 'new developer work');
});

test('a conflicting rebase abort restores the reserved task and leaves its remote unchanged', t => {
  const f = fixture(t);
  f.git(f.developer, 'checkout', 'codex/task');
  f.write(f.developer, 'shared.txt', 'task-specific change\n');
  const reserved = f.commit(f.developer, 'Task shared edit');
  f.git(f.developer, 'push', 'origin', 'codex/task');
  f.git(f.developer, 'checkout', 'main');
  f.write(f.developer, 'shared.txt', 'main-specific change\n');
  f.commit(f.developer, 'Main shared edit');
  f.git(f.developer, 'push', 'origin', 'main');
  f.git(f.worker, 'fetch', 'origin', 'refs/heads/codex/task');
  assert.equal(f.git(f.worker, 'rev-parse', 'FETCH_HEAD'), reserved);
  f.git(f.worker, 'checkout', '--detach', reserved);
  f.git(f.worker, 'fetch', 'origin', 'refs/heads/main:refs/remotes/origin/main');
  assert.throws(() => f.git(f.worker, 'rebase', 'origin/main'), /conflict|could not apply/i);
  assert.equal(f.git(f.worker, 'diff', '--name-only', '--diff-filter=U'), 'shared.txt');
  f.git(f.worker, 'rebase', '--abort');
  assert.equal(f.git(f.worker, 'rev-parse', 'HEAD'), reserved);
  assert.equal(f.git(f.worker, 'status', '--porcelain'), '');
  assert.equal(f.git(f.origin, 'rev-parse', 'refs/heads/codex/task'), reserved);
});
