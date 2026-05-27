import { writeFile } from 'node:fs/promises';
import { importAsset, resolveAsset } from './assets';
import { applyPatch, DeckPatchOp, inspectNode, listPageFragments, readPageFragment, writePageFragment } from './deck';
import { runExport } from './exporter';
import { importFont, listFonts } from './fonts';
import { runGeneration, retryGenerationPage } from './generation';
import { jobManager } from './jobs';
import { EngineError, ERROR_CODE_ENGINE_INTERNAL, ERROR_CODE_INVALID_PARAMS } from './errors';
import {
  CanvasSpec,
  createSession,
  exportWorkspace,
  importWorkspace,
  initWorkspace,
  listSessions,
  openSession,
} from './workspace';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: string | number | null;
  result: unknown;
}

interface JsonRpcError {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;
export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const maybeRequest = value as Partial<JsonRpcRequest>;
  const hasValidId =
    maybeRequest.id === null || typeof maybeRequest.id === 'string' || typeof maybeRequest.id === 'number';
  const hasValidParams =
    maybeRequest.params === undefined ||
    (typeof maybeRequest.params === 'object' && maybeRequest.params !== null);

  return maybeRequest.jsonrpc === '2.0' && typeof maybeRequest.method === 'string' && hasValidId && hasValidParams;
}

function invalidParams(id: string | number | null, message: string): JsonRpcError {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: ERROR_CODE_INVALID_PARAMS,
      message,
    },
  };
}

function getParams(request: JsonRpcRequest): Record<string, unknown> {
  return request.params ?? {};
}

function requireString(params: Record<string, unknown>, name: string): string {
  const value = params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new EngineError(ERROR_CODE_INVALID_PARAMS, `${name} must be a string`);
  }
  return value;
}

function requireArray(params: Record<string, unknown>, name: string): unknown[] {
  const value = params[name];
  if (!Array.isArray(value)) {
    throw new EngineError(ERROR_CODE_INVALID_PARAMS, `${name} must be an array`);
  }
  return value;
}

const WORKSPACE_FORMATS = new Set(['session-zip', 'slide-pack']);

function requireWorkspaceFormat(params: Record<string, unknown>, name: string): 'session-zip' | 'slide-pack' {
  const value = requireString(params, name);
  if (!WORKSPACE_FORMATS.has(value)) {
    throw new EngineError(ERROR_CODE_INVALID_PARAMS, `${name} must be one of: session-zip, slide-pack`);
  }
  return value as 'session-zip' | 'slide-pack';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function handleRpcRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { id } = request;

  try {
    const params = getParams(request);
    switch (request.method) {
      case 'workspace.init': {
        const workspacePath = requireString(params, 'workspacePath');
        return {
          jsonrpc: '2.0',
          id,
          result: await initWorkspace(workspacePath),
        };
      }
      case 'workspace.open': {
        const workspacePath = requireString(params, 'workspacePath');
        const sessionId = typeof params.sessionId === 'string' ? params.sessionId : undefined;
        if (sessionId) {
          const session = await openSession(workspacePath, sessionId);
          return { jsonrpc: '2.0', id, result: { workspacePath, session } };
        }
        return { jsonrpc: '2.0', id, result: await listSessions(workspacePath) };
      }
      case 'workspace.import': {
        const workspacePath = requireString(params, 'workspacePath');
        const archivePath = requireString(params, 'archivePath');
        const format = requireWorkspaceFormat(params, 'format');
        const sessionId = typeof params.sessionId === 'string' ? params.sessionId : undefined;
        const importRoot = typeof params.importRoot === 'string' ? params.importRoot : undefined;
        return {
          jsonrpc: '2.0',
          id,
          result: await importWorkspace(workspacePath, archivePath, format, sessionId, importRoot),
        };
      }
      case 'workspace.export': {
        const workspacePath = requireString(params, 'workspacePath');
        const sessionId = requireString(params, 'sessionId');
        const format = requireWorkspaceFormat(params, 'format');
        const outputPath = typeof params.outputPath === 'string' ? params.outputPath : undefined;
        const outputRoot = typeof params.outputRoot === 'string' ? params.outputRoot : undefined;
        return {
          jsonrpc: '2.0',
          id,
          result: await exportWorkspace(workspacePath, sessionId, format, outputPath, outputRoot),
        };
      }
      case 'generate.createSession': {
        const workspacePath = requireString(params, 'workspacePath');
        const sessionId = requireString(params, 'sessionId');
        const canvasSpec =
          typeof params.canvasSpec === 'object' && params.canvasSpec !== null
            ? (params.canvasSpec as Partial<CanvasSpec>)
            : undefined;
        return {
          jsonrpc: '2.0',
          id,
          result: await createSession(workspacePath, sessionId, canvasSpec),
        };
      }
      case 'generate.start': {
        const workspacePath = requireString(params, 'workspacePath');
        const sessionId = requireString(params, 'sessionId');
        const prompt = typeof params.prompt === 'string' ? params.prompt : '';
        const fontProfile =
          typeof params.fontProfile === 'object' && params.fontProfile !== null
            ? (params.fontProfile as Record<string, string>)
            : undefined;
        const canvasSpec =
          typeof params.canvasSpec === 'object' && params.canvasSpec !== null
            ? (params.canvasSpec as Partial<CanvasSpec>)
            : undefined;
        const { sessionPath, meta } = await openSession(workspacePath, sessionId);
        const job = jobManager.startJob('generation', sessionId, id, async () =>
          runGeneration(sessionPath, canvasSpec ? { ...meta.canvasSpec, ...canvasSpec } : meta.canvasSpec, prompt, fontProfile),
        );
        return { jsonrpc: '2.0', id, result: { jobId: job.jobId } };
      }
      case 'generate.cancel': {
        const jobId = requireString(params, 'jobId');
        return { jsonrpc: '2.0', id, result: jobManager.cancelJob(jobId) };
      }
      case 'generate.retryPage': {
        const workspacePath = requireString(params, 'workspacePath');
        const sessionId = requireString(params, 'sessionId');
        const pageId = requireString(params, 'pageId');
        const prompt = typeof params.prompt === 'string' ? params.prompt : 'Retry Page';
        const { sessionPath, meta } = await openSession(workspacePath, sessionId);
        const job = jobManager.startJob('generation', sessionId, id, async () =>
          retryGenerationPage(sessionPath, pageId, meta.canvasSpec, prompt),
        );
        return { jsonrpc: '2.0', id, result: { jobId: job.jobId } };
      }
      case 'deck.get': {
        const workspacePath = requireString(params, 'workspacePath');
        const sessionId = requireString(params, 'sessionId');
        const pageId = typeof params.pageId === 'string' ? params.pageId : undefined;
        const { sessionPath } = await openSession(workspacePath, sessionId);
        if (pageId) {
          return { jsonrpc: '2.0', id, result: { pageId, fragment: await readPageFragment(sessionPath, pageId) } };
        }
        return { jsonrpc: '2.0', id, result: { sessionId, pages: await listPageFragments(sessionPath) } };
      }
      case 'deck.patch.apply': {
        const workspacePath = requireString(params, 'workspacePath');
        const sessionId = requireString(params, 'sessionId');
        const pageId = requireString(params, 'pageId');
        const patch = requireArray(params, 'patch') as DeckPatchOp[];
        const actor = typeof params.actor === 'string' ? params.actor : undefined;
        const { sessionPath } = await openSession(workspacePath, sessionId);
        return { jsonrpc: '2.0', id, result: await applyPatch(sessionPath, pageId, patch, actor) };
      }
      case 'deck.node.inspect': {
        const workspacePath = requireString(params, 'workspacePath');
        const sessionId = requireString(params, 'sessionId');
        const pageId = requireString(params, 'pageId');
        const nodeId = requireString(params, 'nodeId');
        const { sessionPath } = await openSession(workspacePath, sessionId);
        return { jsonrpc: '2.0', id, result: await inspectNode(sessionPath, pageId, nodeId) };
      }
      case 'deck.persist': {
        const workspacePath = requireString(params, 'workspacePath');
        const sessionId = requireString(params, 'sessionId');
        const pageId = requireString(params, 'pageId');
        const fragment = requireString(params, 'fragment');
        const { sessionPath } = await openSession(workspacePath, sessionId);
        await writePageFragment(sessionPath, pageId, fragment);
        return { jsonrpc: '2.0', id, result: { pageId } };
      }
      case 'font.import': {
        const workspacePath = requireString(params, 'workspacePath');
        const sessionId = requireString(params, 'sessionId');
        const sourcePath = requireString(params, 'sourcePath');
        const family = requireString(params, 'family');
        const weight = typeof params.weight === 'number' ? params.weight : undefined;
        const style = typeof params.style === 'string' ? params.style : undefined;
        const role = typeof params.role === 'string' ? params.role : undefined;
        const importRoot = typeof params.importRoot === 'string' ? params.importRoot : undefined;
        const { sessionPath } = await openSession(workspacePath, sessionId);
        return {
          jsonrpc: '2.0',
          id,
          result: await importFont(workspacePath, sessionPath, sourcePath, family, weight, style, role, importRoot),
        };
      }
      case 'font.list': {
        const workspacePath = requireString(params, 'workspacePath');
        const sessionId = requireString(params, 'sessionId');
        const { sessionPath } = await openSession(workspacePath, sessionId);
        return { jsonrpc: '2.0', id, result: await listFonts(sessionPath) };
      }
      case 'asset.import': {
        const workspacePath = requireString(params, 'workspacePath');
        const sessionId = requireString(params, 'sessionId');
        const sourcePath = requireString(params, 'sourcePath');
        const importRoot = typeof params.importRoot === 'string' ? params.importRoot : undefined;
        const { sessionPath } = await openSession(workspacePath, sessionId);
        return {
          jsonrpc: '2.0',
          id,
          result: await importAsset(workspacePath, sessionPath, sourcePath, importRoot),
        };
      }
      case 'asset.resolve': {
        const workspacePath = requireString(params, 'workspacePath');
        const sessionId = requireString(params, 'sessionId');
        const assetId = requireString(params, 'assetId');
        const { sessionPath } = await openSession(workspacePath, sessionId);
        return { jsonrpc: '2.0', id, result: await resolveAsset(sessionPath, assetId) };
      }
      case 'export.start': {
        const workspacePath = requireString(params, 'workspacePath');
        const sessionId = requireString(params, 'sessionId');
        const format = requireString(params, 'format');
        const canvasSpec =
          typeof params.canvasSpec === 'object' && params.canvasSpec !== null
            ? (params.canvasSpec as Partial<CanvasSpec>)
            : undefined;
        const fontManifestRef = typeof params.fontManifestRef === 'string' ? params.fontManifestRef : undefined;
        const { sessionPath, meta } = await openSession(workspacePath, sessionId);
        const job = jobManager.startJob('export', sessionId, id, async () =>
          runExport(sessionPath, meta, format, canvasSpec ? { ...meta.canvasSpec, ...canvasSpec } : meta.canvasSpec, fontManifestRef),
        );
        return { jsonrpc: '2.0', id, result: { jobId: job.jobId } };
      }
      case 'export.status': {
        const jobId = requireString(params, 'jobId');
        return { jsonrpc: '2.0', id, result: jobManager.getJob(jobId) };
      }
      case 'export.cancel': {
        const jobId = requireString(params, 'jobId');
        return { jsonrpc: '2.0', id, result: jobManager.cancelJob(jobId) };
      }
      case 'pptx.import': {
        const workspacePath = requireString(params, 'workspacePath');
        const sourcePath = requireString(params, 'sourcePath');
        const sessionId = typeof params.sessionId === 'string' ? params.sessionId : `pptx-${Date.now()}`;
        const created = await createSession(workspacePath, sessionId);
        const note = {
          sourcePath,
          importedAt: new Date().toISOString(),
          note: 'PPTX import placeholder. Replace with real extraction pipeline.',
        };
        await writePageFragment(
          created.sessionPath,
          'page-1',
          `<div data-deck-root="true" data-page-id="page-1">Imported ${escapeHtml(sourcePath)}</div>`,
        );
        await writeFile(`${created.sessionPath}/docs/pptx-import.json`, JSON.stringify(note, null, 2), 'utf8');
        return { jsonrpc: '2.0', id, result: { sessionId } };
      }
      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${request.method}`,
          },
        };
    }
  } catch (error) {
    if (error instanceof EngineError) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: error.code,
          message: error.message,
          data: error.data,
        },
      };
    }
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: ERROR_CODE_ENGINE_INTERNAL,
        message: error instanceof Error ? error.message : 'Internal error',
      },
    };
  }
}
