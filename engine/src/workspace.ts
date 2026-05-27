import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface CanvasSpec {
  widthPx: number;
  heightPx: number;
  ratio: string;
}

export interface WorkspaceInitResult {
  workspacePath: string;
  sessionsPath: string;
  sharedPath: string;
}

export interface CreateSessionResult {
  sessionId: string;
  sessionPath: string;
  sessionFile: string;
}

const DEFAULT_CANVAS_SPEC: CanvasSpec = {
  widthPx: 1920,
  heightPx: 1080,
  ratio: '16:9',
};

const SESSION_SUB_DIRS = ['docs', 'history', 'pages', 'exports', 'assets', 'templates', 'fonts'] as const;

function assertAbsoluteWorkspacePath(workspacePath: string): string {
  if (!workspacePath || typeof workspacePath !== 'string') {
    throw new Error('workspacePath is required');
  }

  if (!path.isAbsolute(workspacePath)) {
    throw new Error('workspacePath must be absolute');
  }

  return path.resolve(workspacePath);
}

export async function initWorkspace(workspacePath: string): Promise<WorkspaceInitResult> {
  const resolvedWorkspacePath = assertAbsoluteWorkspacePath(workspacePath);
  const sessionsPath = path.join(resolvedWorkspacePath, 'sessions');
  const sharedPath = path.join(resolvedWorkspacePath, 'shared');

  await mkdir(path.join(sharedPath, 'fonts'), { recursive: true });
  await mkdir(path.join(sharedPath, 'templates'), { recursive: true });
  await mkdir(sessionsPath, { recursive: true });

  return {
    workspacePath: resolvedWorkspacePath,
    sessionsPath,
    sharedPath,
  };
}

function validateSessionId(sessionId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error('sessionId must only include letters, numbers, _ or -');
  }
  return sessionId;
}

export async function createSession(
  workspacePath: string,
  sessionId: string,
  canvasSpec: CanvasSpec = DEFAULT_CANVAS_SPEC,
): Promise<CreateSessionResult> {
  const normalizedSessionId = validateSessionId(sessionId);
  const { sessionsPath } = await initWorkspace(workspacePath);

  const sessionPath = path.join(sessionsPath, normalizedSessionId);
  for (const dir of SESSION_SUB_DIRS) {
    await mkdir(path.join(sessionPath, dir), { recursive: true });
  }

  const sessionFile = path.join(sessionPath, 'session.json');
  await writeFile(
    sessionFile,
    JSON.stringify(
      {
        sessionId: normalizedSessionId,
        createdAt: new Date().toISOString(),
        canvasSpec,
        fontManifest: 'fonts/manifest.json',
        apiVersion: '1.0',
      },
      null,
      2,
    ),
    'utf8',
  );

  await writeFile(path.join(sessionPath, 'history', 'ops.ndjson'), '', { flag: 'a' });

  return {
    sessionId: normalizedSessionId,
    sessionPath,
    sessionFile,
  };
}
