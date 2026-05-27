import { createSession, initWorkspace } from './workspace';

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
export const ERROR_CODE_INVALID_PARAMS = 1001;
export const ERROR_CODE_ENGINE_INTERNAL = 2001;

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const maybeRequest = value as Partial<JsonRpcRequest>;
  return maybeRequest.jsonrpc === '2.0' && typeof maybeRequest.method === 'string' && 'id' in maybeRequest;
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

export async function handleRpcRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { id } = request;

  try {
    switch (request.method) {
      case 'workspace.init': {
        const workspacePath = request.params?.workspacePath;
        if (typeof workspacePath !== 'string') {
          return invalidParams(id, 'workspacePath must be a string');
        }

        return {
          jsonrpc: '2.0',
          id,
          result: await initWorkspace(workspacePath),
        };
      }
      case 'generate.createSession': {
        const workspacePath = request.params?.workspacePath;
        const sessionId = request.params?.sessionId;
        if (typeof workspacePath !== 'string' || typeof sessionId !== 'string') {
          return invalidParams(id, 'workspacePath and sessionId must be strings');
        }

        return {
          jsonrpc: '2.0',
          id,
          result: await createSession(workspacePath, sessionId),
        };
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
