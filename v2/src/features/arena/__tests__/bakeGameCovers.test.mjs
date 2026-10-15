import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('the actual Python cover baker passes synthetic palette, determinism and stale-output checks offline', t => {
  // Some macOS shells put Xcode's Python before the installed pyenv Python.
  // Prefer an explicit interpreter, then the one with Pillow already installed.
  let python = process.env.COVER_BAKER_PYTHON || 'python3';
  if (spawnSync(python, ['-c', 'from PIL import Image']).status !== 0 && !process.env.COVER_BAKER_PYTHON) {
    const installed = spawnSync('pyenv', ['which', 'python3'], { encoding: 'utf8' });
    if (installed.status === 0) python = installed.stdout.trim();
  }
  // The baker is a developer tool (the controller runs it); a machine without Pillow skips it rather than fail npm test.
  if (spawnSync(python, ['-c', 'from PIL import Image']).status !== 0) {
    t.skip('no python3 with Pillow: set COVER_BAKER_PYTHON to run the cover baker tests');
    return;
  }
  const result = spawnSync(python, ['-B', 'scripts/__tests__/test_bake_game_covers.py'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
