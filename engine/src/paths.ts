import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { EngineError, ERROR_CODE_FORBIDDEN_PATH, ERROR_CODE_INVALID_PARAMS } from './errors';

export function assertAbsolutePath(targetPath: string, fieldName: string): string {
  if (!targetPath || typeof targetPath !== 'string') {
    throw new EngineError(ERROR_CODE_INVALID_PARAMS, `${fieldName} must be a string`);
  }
  if (!path.isAbsolute(targetPath)) {
    throw new EngineError(ERROR_CODE_INVALID_PARAMS, `${fieldName} must be absolute`);
  }
  return path.resolve(targetPath);
}

async function resolveRealPath(targetPath: string): Promise<string> {
  try {
    return await realpath(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

export async function ensureWithinRoots(targetPath: string, roots: string[]): Promise<string> {
  const resolvedTarget = await resolveRealPath(targetPath);
  const resolvedRoots = await Promise.all(roots.map(resolveRealPath));
  const isAllowed = resolvedRoots.some((root) => resolvedTarget === root || resolvedTarget.startsWith(`${root}${path.sep}`));
  if (!isAllowed) {
    throw new EngineError(ERROR_CODE_FORBIDDEN_PATH, 'Path is outside allowed roots', { path: targetPath });
  }
  return resolvedTarget;
}
