import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EngineError, ERROR_CODE_INVALID_PARAMS, ERROR_CODE_NOT_FOUND } from './errors';
import { assertAbsolutePath, ensureWithinRoots } from './paths';

export interface AssetImportResult {
  assetId: string;
  assetPath: string;
  relativePath: string;
}

export interface AssetResolveResult {
  assetId: string;
  exists: boolean;
  relativePath: string;
  assetPath: string;
}

interface AssetManifest {
  version: '1.0';
  assets: Record<string, { path: string; sha256: string }>;
}

async function loadManifest(sessionPath: string): Promise<AssetManifest> {
  const manifestPath = path.join(sessionPath, 'assets', 'manifest.json');
  try {
    const content = await readFile(manifestPath, 'utf8');
    return JSON.parse(content) as AssetManifest;
  } catch {
    return { version: '1.0', assets: {} };
  }
}

async function saveManifest(sessionPath: string, manifest: AssetManifest): Promise<void> {
  const manifestPath = path.join(sessionPath, 'assets', 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

export async function importAsset(
  workspacePath: string,
  sessionPath: string,
  sourcePath: string,
  importRoot?: string,
): Promise<AssetImportResult> {
  const resolvedSource = assertAbsolutePath(sourcePath, 'sourcePath');
  const roots = [assertAbsolutePath(workspacePath, 'workspacePath')];
  if (importRoot) {
    roots.push(assertAbsolutePath(importRoot, 'importRoot'));
  }
  await ensureWithinRoots(resolvedSource, roots);

  const buffer = await readFile(resolvedSource);
  const hash = createHash('sha256').update(buffer).digest('hex');
  const ext = path.extname(resolvedSource).toLowerCase();
  const assetFileName = `${hash}${ext}`;
  const assetDir = path.join(sessionPath, 'assets');
  await mkdir(assetDir, { recursive: true });
  const assetPath = path.join(assetDir, assetFileName);
  await copyFile(resolvedSource, assetPath);

  const manifest = await loadManifest(sessionPath);
  manifest.assets[hash] = { path: `assets/${assetFileName}`, sha256: hash };
  await saveManifest(sessionPath, manifest);

  return { assetId: hash, assetPath, relativePath: `assets/${assetFileName}` };
}

export async function resolveAsset(sessionPath: string, assetId: string): Promise<AssetResolveResult> {
  if (!assetId || typeof assetId !== 'string') {
    throw new EngineError(ERROR_CODE_INVALID_PARAMS, 'assetId must be a string');
  }
  const manifest = await loadManifest(sessionPath);
  const entry = manifest.assets[assetId];
  if (!entry) {
    throw new EngineError(ERROR_CODE_NOT_FOUND, 'Asset not found', { assetId });
  }
  const assetPath = path.join(sessionPath, entry.path);
  return {
    assetId,
    exists: true,
    relativePath: entry.path,
    assetPath,
  };
}
