import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { EngineError, ERROR_CODE_CONTRACT_VIOLATION, ERROR_CODE_INVALID_PARAMS, ERROR_CODE_NOT_FOUND } from './errors';

export type DeckPatchOp =
  | { op: 'setText'; nodeId: string; value: string }
  | { op: 'setAttr'; nodeId: string; name: string; value: string }
  | { op: 'setStyle'; nodeId: string; path?: string; name?: string; value: string }
  | { op: 'insertNode'; parentId: string; html: string; beforeNodeId?: string }
  | { op: 'removeNode'; nodeId: string }
  | { op: 'reorderZ'; nodeId: string; z: number };

export interface DeckNodeSnapshot {
  nodeId: string;
  nodeType?: string;
  pageId?: string;
  attributes: Record<string, string>;
  dataset: Record<string, string>;
  textContent: string;
  inlineStyle: Record<string, string>;
}

const sessionSeq = new Map<string, number>();

function parseStyle(styleValue: string | null | undefined): Record<string, string> {
  if (!styleValue) {
    return {};
  }
  return styleValue
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, entry) => {
      const [key, ...rest] = entry.split(':');
      if (!key || rest.length === 0) {
        return acc;
      }
      acc[key.trim()] = rest.join(':').trim();
      return acc;
    }, {});
}

function serializeStyle(style: Record<string, string>): string {
  return Object.entries(style)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
}

async function getNextSeq(sessionPath: string): Promise<number> {
  if (!sessionSeq.has(sessionPath)) {
    try {
      const historyPath = path.join(sessionPath, 'history', 'ops.ndjson');
      const content = await readFile(historyPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      const lastLine = lines.at(-1);
      if (lastLine) {
        const parsed = JSON.parse(lastLine) as { seq?: number };
        sessionSeq.set(sessionPath, parsed.seq ?? 0);
      } else {
        sessionSeq.set(sessionPath, 0);
      }
    } catch {
      sessionSeq.set(sessionPath, 0);
    }
  }
  const next = (sessionSeq.get(sessionPath) ?? 0) + 1;
  sessionSeq.set(sessionPath, next);
  return next;
}

function ensureString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new EngineError(ERROR_CODE_INVALID_PARAMS, `${field} must be a string`);
  }
  return value;
}

export async function readPageFragment(sessionPath: string, pageId: string): Promise<string> {
  const filePath = path.join(sessionPath, 'pages', `${pageId}.html`);
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return `<div data-deck-root="true" data-page-id="${pageId}"></div>`;
  }
}

export async function writePageFragment(sessionPath: string, pageId: string, fragment: string): Promise<void> {
  const filePath = path.join(sessionPath, 'pages', `${pageId}.html`);
  await writeFile(filePath, fragment, 'utf8');
}

export async function listPageFragments(sessionPath: string): Promise<Array<{ pageId: string; fragment: string }>> {
  try {
    const pagesDir = path.join(sessionPath, 'pages');
    const entries = await readdir(pagesDir);
    const pages: Array<{ pageId: string; fragment: string }> = [];
    for (const entry of entries) {
      if (!entry.endsWith('.html')) {
        continue;
      }
      const pageId = entry.replace(/\.html$/, '');
      pages.push({ pageId, fragment: await readPageFragment(sessionPath, pageId) });
    }
    return pages;
  } catch {
    return [];
  }
}

export async function inspectNode(sessionPath: string, pageId: string, nodeId: string): Promise<DeckNodeSnapshot> {
  const fragment = await readPageFragment(sessionPath, pageId);
  const root = parse(fragment, { lowerCaseTagName: false, comment: false });
  const node = root.querySelector(`[data-node-id="${nodeId}"]`);
  if (!node) {
    throw new EngineError(ERROR_CODE_NOT_FOUND, 'Node not found', { nodeId });
  }

  const attributes: Record<string, string> = {};
  Object.entries(node.attributes).forEach(([key, value]) => {
    attributes[key] = value;
  });
  const dataset: Record<string, string> = {};
  Object.entries(node.attributes).forEach(([key, value]) => {
    if (key.startsWith('data-')) {
      const dataKey = key.slice(5).replace(/-([a-z])/g, (_, chr) => chr.toUpperCase());
      dataset[dataKey] = value;
    }
  });

  return {
    nodeId,
    nodeType: node.getAttribute('data-node-type') ?? undefined,
    pageId: node.getAttribute('data-page-id') ?? undefined,
    attributes,
    dataset,
    textContent: node.textContent ?? '',
    inlineStyle: parseStyle(node.getAttribute('style')),
  };
}

export async function applyPatch(
  sessionPath: string,
  pageId: string,
  patch: DeckPatchOp[],
  actor = 'engine',
): Promise<{ pageId: string; applied: number; seq: number }> {
  const fragment = await readPageFragment(sessionPath, pageId);
  const root = parse(fragment, { lowerCaseTagName: false, comment: false });

  for (const op of patch) {
    switch (op.op) {
      case 'setText': {
        const nodeId = ensureString(op.nodeId, 'nodeId');
        const node = root.querySelector(`[data-node-id="${nodeId}"]`);
        if (!node) {
          throw new EngineError(ERROR_CODE_NOT_FOUND, 'Node not found', { nodeId });
        }
        node.set_content(op.value);
        break;
      }
      case 'setAttr': {
        const nodeId = ensureString(op.nodeId, 'nodeId');
        const node = root.querySelector(`[data-node-id="${nodeId}"]`);
        if (!node) {
          throw new EngineError(ERROR_CODE_NOT_FOUND, 'Node not found', { nodeId });
        }
        node.setAttribute(ensureString(op.name, 'name'), op.value);
        break;
      }
      case 'setStyle': {
        const nodeId = ensureString(op.nodeId, 'nodeId');
        const node = root.querySelector(`[data-node-id="${nodeId}"]`);
        if (!node) {
          throw new EngineError(ERROR_CODE_NOT_FOUND, 'Node not found', { nodeId });
        }
        const styleMap = parseStyle(node.getAttribute('style'));
        const styleKey =
          op.path && op.path.startsWith('style.') ? op.path.slice('style.'.length) : op.name ?? op.path;
        if (!styleKey) {
          throw new EngineError(ERROR_CODE_INVALID_PARAMS, 'setStyle requires path or name');
        }
        styleMap[styleKey] = op.value;
        node.setAttribute('style', serializeStyle(styleMap));
        break;
      }
      case 'insertNode': {
        const parentId = ensureString(op.parentId, 'parentId');
        const parent = root.querySelector(`[data-node-id="${parentId}"]`);
        if (!parent) {
          throw new EngineError(ERROR_CODE_NOT_FOUND, 'Parent node not found', { parentId });
        }
        if (!op.html || typeof op.html !== 'string') {
          throw new EngineError(ERROR_CODE_INVALID_PARAMS, 'insertNode.html must be a string');
        }
        const parsedNode = parse(op.html, { lowerCaseTagName: false, comment: false });
        const newNode = parsedNode.firstChild;
        if (!newNode) {
          throw new EngineError(ERROR_CODE_CONTRACT_VIOLATION, 'insertNode.html must include a node');
        }
        if (op.beforeNodeId) {
          const beforeNode = parent.querySelector(`[data-node-id="${op.beforeNodeId}"]`);
          if (beforeNode) {
            beforeNode.before(newNode);
          } else {
            parent.appendChild(newNode);
          }
        } else {
          parent.appendChild(newNode);
        }
        break;
      }
      case 'removeNode': {
        const nodeId = ensureString(op.nodeId, 'nodeId');
        const node = root.querySelector(`[data-node-id="${nodeId}"]`);
        if (!node) {
          throw new EngineError(ERROR_CODE_NOT_FOUND, 'Node not found', { nodeId });
        }
        node.remove();
        break;
      }
      case 'reorderZ': {
        const nodeId = ensureString(op.nodeId, 'nodeId');
        const node = root.querySelector(`[data-node-id="${nodeId}"]`);
        if (!node) {
          throw new EngineError(ERROR_CODE_NOT_FOUND, 'Node not found', { nodeId });
        }
        if (!Number.isFinite(op.z)) {
          throw new EngineError(ERROR_CODE_INVALID_PARAMS, 'reorderZ.z must be a number');
        }
        const styleMap = parseStyle(node.getAttribute('style'));
        styleMap['z-index'] = String(op.z);
        node.setAttribute('style', serializeStyle(styleMap));
        break;
      }
      default:
        throw new EngineError(ERROR_CODE_CONTRACT_VIOLATION, `Unsupported patch op: ${(op as DeckPatchOp).op}`);
    }
  }

  await writePageFragment(sessionPath, pageId, root.toString());

  const seq = await getNextSeq(sessionPath);
  const historyPath = path.join(sessionPath, 'history', 'ops.ndjson');
  const record = {
    seq,
    actor,
    pageId,
    timestamp: new Date().toISOString(),
    patch,
  };
  await writeFile(historyPath, `${JSON.stringify(record)}\n`, { flag: 'a' });

  return { pageId, applied: patch.length, seq };
}
