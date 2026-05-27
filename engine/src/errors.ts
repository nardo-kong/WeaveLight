export const ERROR_CODE_INVALID_PARAMS = 1001;
export const ERROR_CODE_NOT_FOUND = 1002;
export const ERROR_CODE_CONTRACT_VIOLATION = 1003;
export const ERROR_CODE_AUTH_FAILED = 1004;
export const ERROR_CODE_FORBIDDEN_PATH = 1005;
export const ERROR_CODE_JOB_CONFLICT = 1006;
export const ERROR_CODE_UNSUPPORTED_FORMAT = 1007;
export const ERROR_CODE_ENGINE_INTERNAL = 2001;
export const ERROR_CODE_DEPENDENCY_FAILURE = 2002;

export class EngineError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}
