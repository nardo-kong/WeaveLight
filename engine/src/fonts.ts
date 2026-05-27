import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EngineError, ERROR_CODE_INVALID_PARAMS } from './errors';
import { assertAbsolutePath, ensureWithinRoots } from './paths';

export interface FontFileEntry {
  weight: number;
  style: string;
  path: string;
}

export interface FontFamilyEntry {
  name: string;
  files: FontFileEntry[];
  fallback?: string[];
}

export interface FontManifest {
  version: '1.0';
  families: FontFamilyEntry[];
  roles: Record<string, string>;
}

export interface FontImportResult {
  manifest: FontManifest;
  imported: FontFileEntry;
}

const SUPPORTED_EXTS = new Set(['.woff2', '.ttf', '.otf']);

async function loadManifest(sessionPath: string): Promise<FontManifest> {
  const manifestPath = path.join(sessionPath, 'fonts', 'manifest.json');
  try {
    const content = await readFile(manifestPath, 'utf8');
    return JSON.parse(content) as FontManifest;
  } catch {
    return { version: '1.0', families: [], roles: {} };
  }
}

async function saveManifest(sessionPath: string, manifest: FontManifest): Promise<void> {
  const manifestPath = path.join(sessionPath, 'fonts', 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

export async function importFont(
  workspacePath: string,
  sessionPath: string,
  sourcePath: string,
  family: string,
  weight = 400,
  style = 'normal',
  role?: string,
  importRoot?: string,
): Promise<FontImportResult> {
  if (!family || typeof family !== 'string') {
    throw new EngineError(ERROR_CODE_INVALID_PARAMS, 'family must be a string');
  }
  if (!Number.isFinite(weight)) {
    throw new EngineError(ERROR_CODE_INVALID_PARAMS, 'weight must be a number');
  }
  if (!style || typeof style !== 'string') {
    throw new EngineError(ERROR_CODE_INVALID_PARAMS, 'style must be a string');
  }
  const resolvedSource = assertAbsolutePath(sourcePath, 'sourcePath');
  const ext = path.extname(resolvedSource).toLowerCase();
  if (!SUPPORTED_EXTS.has(ext)) {
    throw new EngineError(ERROR_CODE_INVALID_PARAMS, `Unsupported font extension: ${ext}`);
  }
  const roots = [assertAbsolutePath(workspacePath, 'workspacePath')];
  if (importRoot) {
    roots.push(assertAbsolutePath(importRoot, 'importRoot'));
  }
  await ensureWithinRoots(resolvedSource, roots);

  const filesDir = path.join(sessionPath, 'fonts', 'files');
  await mkdir(filesDir, { recursive: true });
  const safeFamily = family.replace(/\s+/g, '-');
  const fileName = `${safeFamily}-${weight}-${style}${ext}`;
  const targetPath = path.join(filesDir, fileName);
  await copyFile(resolvedSource, targetPath);

  const manifest = await loadManifest(sessionPath);
  let familyEntry = manifest.families.find((entry) => entry.name === family);
  if (!familyEntry) {
    familyEntry = { name: family, files: [] };
    manifest.families.push(familyEntry);
  }
  const newFile = { weight, style, path: `files/${fileName}` };
  familyEntry.files = familyEntry.files.filter((file) => !(file.weight === weight && file.style === style));
  familyEntry.files.push(newFile);
  if (role) {
    manifest.roles[role] = family;
  }

  await saveManifest(sessionPath, manifest);
  return { manifest, imported: newFile };
}

export async function listFonts(sessionPath: string): Promise<FontManifest> {
  return loadManifest(sessionPath);
}
