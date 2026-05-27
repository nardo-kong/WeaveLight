import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CanvasSpec, SessionMeta } from './workspace';

export interface ExportResult {
  outputPath: string;
  warnings: Array<{ code: string; message: string; suggestion?: string }>;
}

export async function runExport(
  sessionPath: string,
  sessionMeta: SessionMeta,
  format: string,
  canvasSpec: CanvasSpec,
  fontManifestRef?: string,
): Promise<ExportResult> {
  const exportId = `${format}-${Date.now()}`;
  const exportDir = path.join(sessionPath, 'exports', exportId);
  await mkdir(exportDir, { recursive: true });

  const warnings: ExportResult['warnings'] = [];
  if (fontManifestRef && fontManifestRef !== sessionMeta.fontManifest) {
    warnings.push({
      code: 'WARN_FONT_FALLBACK',
      message: 'fontManifestRef differs from session manifest; fallback will be applied.',
      suggestion: 'Ensure fontManifestRef matches session.fontManifest for stable export.',
    });
  }

  const result = {
    sessionId: sessionMeta.sessionId,
    format,
    canvasSpec,
    fontManifestRef: fontManifestRef ?? sessionMeta.fontManifest,
    generatedAt: new Date().toISOString(),
    warnings,
  };

  const outputPath = path.join(exportDir, 'export-result.json');
  await writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8');
  return { outputPath, warnings };
}
