import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExportHtml } from './exporter';

const canvasSpec = {
  widthPx: 1280,
  heightPx: 720,
  ratio: '16:9',
  baseDpi: 96,
  renderScale: 1,
};

test('buildExportHtml wraps each page with canvas size', () => {
  const html = buildExportHtml(
    [
      { pageId: 'page-1', fragment: '<div data-deck-root="true" data-page-id="page-1"></div>' },
      { pageId: 'page-2', fragment: '<div data-deck-root="true" data-page-id="page-2"></div>' },
    ],
    canvasSpec,
  );

  assert.match(html, /@page \{ size: 1280px 720px; margin: 0; \}/);
  assert.match(html, /data-page-id="page-1"/);
  assert.match(html, /data-page-id="page-2"/);
  assert.match(html, /width:1280px;height:720px;/);
});

test('buildExportHtml preserves page fragment markup', () => {
  const html = buildExportHtml(
    [{ pageId: 'cover', fragment: '<section data-deck-root="true"><h1>Title</h1></section>' }],
    canvasSpec,
  );

  assert.match(html, /<section data-deck-root="true"><h1>Title<\/h1><\/section>/);
});
