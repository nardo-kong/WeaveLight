import { constants as fsConstants } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launch } from 'puppeteer-core';
import { listPageFragments } from './deck';
import { CanvasSpec, SessionMeta } from './workspace';

export interface ExportResult {
  outputPath: string;
  outputs: string[];
  warnings: Array<{ code: string; message: string; suggestion?: string }>;
}

const DEFAULT_CHROMIUM_PATH = '/usr/bin/chromium';
function buildExportCss(canvasSpec: CanvasSpec): string {
  return `
@page { size: ${canvasSpec.widthPx}px ${canvasSpec.heightPx}px; margin: 0; }
html, body { margin: 0; padding: 0; }
body { background: #fff; }
.page { position: relative; overflow: hidden; page-break-after: always; }
[data-deck-root="true"] { position: relative; width: 100%; height: 100%; }
`.trim();
}

export function buildExportHtml(
  pages: Array<{ pageId: string; fragment: string }>,
  canvasSpec: CanvasSpec,
): string {
  const { widthPx, heightPx } = canvasSpec;
  const pageStyle = `width:${widthPx}px;height:${heightPx}px;`;
  const css = buildExportCss(canvasSpec);
  const pageBody = pages
    .map(
      (page) =>
        `<div class="page" data-page-id="${page.pageId}" style="${pageStyle}">${page.fragment}</div>`,
    )
    .join('\n');
  return `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8" />\n<style>\n${css}\n</style>\n</head>\n<body>\n${pageBody}\n</body>\n</html>`;
}

function resolveChromiumPath(): string {
  return process.env.WEAVELIGHT_CHROMIUM_PATH ?? DEFAULT_CHROMIUM_PATH;
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

  const outputs: string[] = [];
  const pages = await listPageFragments(sessionPath);
  const exportPages =
    pages.length > 0
      ? pages
      : [
          {
            pageId: 'page-1',
            fragment: `<div data-deck-root=\"true\" data-page-id=\"page-1\"></div>`,
          },
        ];

  if (format === 'png' || format === 'pdf') {
    const chromiumPath = resolveChromiumPath();
    try {
      await access(chromiumPath, fsConstants.X_OK);
      const browser = await launch({
        executablePath: chromiumPath,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setViewport({
        width: canvasSpec.widthPx,
        height: canvasSpec.heightPx,
        deviceScaleFactor: canvasSpec.renderScale || 1,
      });
      await page.emulateMediaType('screen');

      if (format === 'png') {
        for (const pageFragment of exportPages) {
          const html = buildExportHtml([pageFragment], canvasSpec);
          await page.setContent(html, { waitUntil: 'load' });
          const outputPath = path.join(exportDir, `${pageFragment.pageId}.png`);
          await page.screenshot({ path: outputPath });
          outputs.push(outputPath);
        }
      } else {
        const html = buildExportHtml(exportPages, canvasSpec);
        await page.setContent(html, { waitUntil: 'load' });
        const outputPath = path.join(exportDir, `export.pdf`);
        await page.pdf({
          path: outputPath,
          printBackground: true,
          preferCSSPageSize: true,
        });
        outputs.push(outputPath);
      }

      await page.close();
      await browser.close();
    } catch (error) {
      warnings.push({
        code: 'ERR_RENDER',
        message:
          error instanceof Error
            ? error.message
            : `Failed to render export output with Chromium at ${chromiumPath}.`,
        suggestion: `Ensure Chromium is installed or set WEAVELIGHT_CHROMIUM_PATH (current: ${chromiumPath}).`,
      });
    }
  }

  if (outputs.length === 0) {
    warnings.push({
      code: 'WARN_EXPORT_FORMAT',
      message: `No renderer available for format ${format}; export produced metadata only.`,
      suggestion: 'Use format png or pdf to generate files.',
    });
  }

  const result = {
    sessionId: sessionMeta.sessionId,
    format,
    canvasSpec,
    fontManifestRef: fontManifestRef ?? sessionMeta.fontManifest,
    generatedAt: new Date().toISOString(),
    warnings,
    outputs,
  };

  const outputPath = path.join(exportDir, 'export-result.json');
  await writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8');
  return { outputPath, outputs, warnings };
}
