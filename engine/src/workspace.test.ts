import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession, initWorkspace } from './workspace';

async function mustExist(filePath: string): Promise<void> {
  await stat(filePath);
}

test('workspace.init creates required workspace folders', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'weavelight-workspace-'));

  const result = await initWorkspace(tempRoot);

  assert.equal(result.workspacePath, tempRoot);
  await mustExist(path.join(tempRoot, 'sessions'));
  await mustExist(path.join(tempRoot, 'shared', 'fonts'));
  await mustExist(path.join(tempRoot, 'shared', 'templates'));
});

test('generate.createSession creates session layout and metadata', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'weavelight-session-'));

  const result = await createSession(tempRoot, 'session_1');

  await mustExist(path.join(result.sessionPath, 'docs'));
  await mustExist(path.join(result.sessionPath, 'history'));
  await mustExist(path.join(result.sessionPath, 'pages'));
  await mustExist(path.join(result.sessionPath, 'exports'));
  await mustExist(path.join(result.sessionPath, 'assets'));
  await mustExist(path.join(result.sessionPath, 'templates'));
  await mustExist(path.join(result.sessionPath, 'fonts'));
  await mustExist(path.join(result.sessionPath, 'history', 'ops.ndjson'));

  const sessionMeta = JSON.parse(await readFile(result.sessionFile, 'utf8')) as {
    sessionId: string;
    fontManifest: string;
    apiVersion: string;
  };

  assert.equal(sessionMeta.sessionId, 'session_1');
  assert.equal(sessionMeta.fontManifest, 'fonts/manifest.json');
  assert.equal(sessionMeta.apiVersion, '1.0');
});

test('generate.createSession rejects path traversal-like ids', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'weavelight-session-invalid-'));

  await assert.rejects(async () => {
    await createSession(tempRoot, '../x');
  }, /sessionId must only include letters, numbers, _ or -/);
});
