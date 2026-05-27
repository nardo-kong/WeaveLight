import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AdmZip, { IZipEntry } from 'adm-zip';
import { EngineError, ERROR_CODE_INVALID_PARAMS, ERROR_CODE_NOT_FOUND, ERROR_CODE_UNSUPPORTED_FORMAT } from './errors';
import { assertAbsolutePath, ensureWithinRoots } from './paths';

export interface CanvasSpec {
  widthPx: number;
  heightPx: number;
  ratio: string;
  baseDpi?: number;
  renderScale?: number;
  safeArea?: { left: number; right: number; top: number; bottom: number };
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

export interface SessionMeta {
  sessionId: string;
  createdAt: string;
  canvasSpec: CanvasSpec;
  fontManifest: string;
  apiVersion: string;
}

export interface WorkspaceOpenResult {
  workspacePath: string;
  sessionsPath: string;
  sharedPath: string;
  sessions: Array<{ sessionId: string; sessionPath: string; sessionFile: string }>;
}

export interface SessionOpenResult {
  sessionPath: string;
  sessionFile: string;
  meta: SessionMeta;
}

export interface WorkspaceExportResult {
  sessionId: string;
  format: 'session-zip' | 'slide-pack';
  outputPath: string;
}

export interface WorkspaceImportResult {
  sessionId: string;
  sessionPath: string;
  importedFrom: string;
}

const DEFAULT_CANVAS_SPEC: CanvasSpec = {
  widthPx: 1920,
  heightPx: 1080,
  ratio: '16:9',
  baseDpi: 96,
  renderScale: 1,
};

const SESSION_SUB_DIRS = ['docs', 'history', 'pages', 'exports', 'assets', 'templates', 'fonts'] as const;

function validateSessionId(sessionId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new EngineError(ERROR_CODE_INVALID_PARAMS, 'sessionId must only include letters, numbers, _ or -');
  }
  return sessionId;
}

function normalizeCanvasSpec(spec?: Partial<CanvasSpec>): CanvasSpec {
  const merged = { ...DEFAULT_CANVAS_SPEC, ...(spec ?? {}) };
  if (!Number.isFinite(merged.widthPx) || merged.widthPx <= 0) {
    throw new EngineError(ERROR_CODE_INVALID_PARAMS, 'canvasSpec.widthPx must be a positive number');
  }
  if (!Number.isFinite(merged.heightPx) || merged.heightPx <= 0) {
    throw new EngineError(ERROR_CODE_INVALID_PARAMS, 'canvasSpec.heightPx must be a positive number');
  }
  if (typeof merged.ratio !== 'string' || merged.ratio.length === 0) {
    throw new EngineError(ERROR_CODE_INVALID_PARAMS, 'canvasSpec.ratio must be a string');
  }
  return merged;
}

export async function initWorkspace(workspacePath: string): Promise<WorkspaceInitResult> {
  const resolvedWorkspacePath = assertAbsolutePath(workspacePath, 'workspacePath');
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

export async function listSessions(workspacePath: string): Promise<WorkspaceOpenResult> {
  const { workspacePath: resolvedWorkspacePath, sessionsPath, sharedPath } = await initWorkspace(workspacePath);
  const sessions: WorkspaceOpenResult['sessions'] = [];
  try {
    const entries = await readdir(sessionsPath);
    for (const entry of entries) {
      const sessionPath = path.join(sessionsPath, entry);
      const sessionFile = path.join(sessionPath, 'session.json');
      try {
        await stat(sessionFile);
        sessions.push({ sessionId: entry, sessionPath, sessionFile });
      } catch {
        continue;
      }
    }
  } catch {
    // ignore
  }

  return {
    workspacePath: resolvedWorkspacePath,
    sessionsPath,
    sharedPath,
    sessions,
  };
}

export async function openSession(workspacePath: string, sessionId: string): Promise<SessionOpenResult> {
  const normalizedSessionId = validateSessionId(sessionId);
  const { sessionsPath } = await initWorkspace(workspacePath);
  const sessionPath = path.join(sessionsPath, normalizedSessionId);
  const sessionFile = path.join(sessionPath, 'session.json');
  try {
    const meta = JSON.parse(await readFile(sessionFile, 'utf8')) as SessionMeta;
    return { sessionPath, sessionFile, meta };
  } catch {
    throw new EngineError(ERROR_CODE_NOT_FOUND, 'Session not found', { sessionId: normalizedSessionId });
  }
}

export async function createSession(
  workspacePath: string,
  sessionId: string,
  canvasSpec?: Partial<CanvasSpec>,
): Promise<CreateSessionResult> {
  const normalizedSessionId = validateSessionId(sessionId);
  const { sessionsPath } = await initWorkspace(workspacePath);
  const normalizedCanvasSpec = normalizeCanvasSpec(canvasSpec);

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
        canvasSpec: normalizedCanvasSpec,
        fontManifest: 'fonts/manifest.json',
        apiVersion: '1.0',
      } satisfies SessionMeta,
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

async function addFolderToZip(zip: AdmZip, folderPath: string, zipPath: string): Promise<void> {
  try {
    zip.addLocalFolder(folderPath, zipPath);
  } catch {
    // ignore missing folder
  }
}

export async function exportWorkspace(
  workspacePath: string,
  sessionId: string,
  format: 'session-zip' | 'slide-pack',
  outputPath?: string,
  outputRoot?: string,
): Promise<WorkspaceExportResult> {
  const { sessionPath, meta } = await openSession(workspacePath, sessionId);
  if (format !== 'session-zip' && format !== 'slide-pack') {
    throw new EngineError(ERROR_CODE_UNSUPPORTED_FORMAT, `Unsupported export format: ${format}`);
  }

  const exportsDir = path.join(sessionPath, 'exports');
  await mkdir(exportsDir, { recursive: true });
  const defaultName = format === 'session-zip' ? `session-${sessionId}.zip` : `slide-pack-${sessionId}.zip`;
  const resolvedOutputPath = outputPath ?? path.join(exportsDir, defaultName);
  const roots = [assertAbsolutePath(workspacePath, 'workspacePath')];
  if (outputRoot) {
    roots.push(assertAbsolutePath(outputRoot, 'outputRoot'));
  }
  await ensureWithinRoots(resolvedOutputPath, roots);

  const zip = new AdmZip();
  if (format === 'session-zip') {
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(meta, null, 2)));
    await addFolderToZip(zip, path.join(sessionPath, 'pages'), 'pages');
    await addFolderToZip(zip, path.join(sessionPath, 'assets'), 'assets');
    await addFolderToZip(zip, path.join(sessionPath, 'fonts'), 'fonts');
    await addFolderToZip(zip, path.join(sessionPath, 'history'), 'history');
  } else {
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(meta, null, 2)));
    await addFolderToZip(zip, path.join(sessionPath, 'pages'), 'page-fragments');
    await addFolderToZip(zip, path.join(sessionPath, 'fonts'), 'fonts');
    try {
      const assetMap = await readFile(path.join(sessionPath, 'assets', 'manifest.json'));
      zip.addFile('asset-map.json', assetMap);
    } catch {
      zip.addFile('asset-map.json', Buffer.from(JSON.stringify({}, null, 2)));
    }
  }

  zip.writeZip(resolvedOutputPath);
  return { sessionId, format, outputPath: resolvedOutputPath };
}

function safeEntryPath(entryName: string): string {
  const normalized = path.normalize(entryName).replace(/^([/\\]+)/, '');
  if (normalized.includes('..')) {
    throw new EngineError(ERROR_CODE_INVALID_PARAMS, 'Archive entry path is invalid', { entry: entryName });
  }
  return normalized;
}

export async function importWorkspace(
  workspacePath: string,
  archivePath: string,
  format: 'session-zip' | 'slide-pack',
  sessionId?: string,
  importRoot?: string,
): Promise<WorkspaceImportResult> {
  const resolvedArchivePath = assertAbsolutePath(archivePath, 'archivePath');
  const roots = [assertAbsolutePath(workspacePath, 'workspacePath')];
  if (importRoot) {
    roots.push(assertAbsolutePath(importRoot, 'importRoot'));
  }
  await ensureWithinRoots(resolvedArchivePath, roots);

  if (format !== 'session-zip' && format !== 'slide-pack') {
    throw new EngineError(ERROR_CODE_UNSUPPORTED_FORMAT, `Unsupported import format: ${format}`);
  }

  const zip = new AdmZip(resolvedArchivePath);
  const entries = zip.getEntries() as IZipEntry[];
  const manifestEntry = entries.find((entry) => entry.entryName === 'manifest.json');
  const manifest = manifestEntry ? (JSON.parse(manifestEntry.getData().toString('utf8')) as SessionMeta) : null;
  const resolvedSessionId = sessionId ?? manifest?.sessionId ?? `session-${Date.now()}`;
  const { sessionPath } = await createSession(workspacePath, resolvedSessionId, manifest?.canvasSpec);

  for (const entry of entries) {
    if (entry.isDirectory) {
      continue;
    }
    const safePath = safeEntryPath(entry.entryName);
    let targetRelative = safePath;
    if (format === 'slide-pack' && safePath.startsWith(`page-fragments${path.sep}`)) {
      targetRelative = path.join('pages', safePath.slice(`page-fragments${path.sep}`.length));
    }
    const targetPath = path.join(sessionPath, targetRelative);
    await ensureWithinRoots(targetPath, [sessionPath]);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, entry.getData());
  }

  if (manifest) {
    await writeFile(path.join(sessionPath, 'session.json'), JSON.stringify({ ...manifest, sessionId: resolvedSessionId }, null, 2));
  }

  return { sessionId: resolvedSessionId, sessionPath, importedFrom: resolvedArchivePath };
}
