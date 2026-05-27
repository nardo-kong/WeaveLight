import { EventEmitter } from 'node:events';
import { EngineError, ERROR_CODE_JOB_CONFLICT, ERROR_CODE_NOT_FOUND } from './errors';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface EngineEvent {
  type: string;
  requestId?: string | number | null;
  jobId?: string;
  seq: number;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface JobRecord {
  jobId: string;
  type: string;
  status: JobStatus;
  progress: number;
  requestId?: string | number | null;
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
  result?: unknown;
  error?: string;
  warnings?: Array<Record<string, unknown>>;
}

type JobRunner = () => Promise<unknown>;

class EventBus {
  private emitter = new EventEmitter();
  private seq = 0;

  emit(event: Omit<EngineEvent, 'seq' | 'timestamp'>): void {
    this.seq += 1;
    const payload: EngineEvent = {
      seq: this.seq,
      timestamp: new Date().toISOString(),
      ...event,
    };
    this.emitter.emit('event', payload);
  }

  on(listener: (event: EngineEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}

export const eventBus = new EventBus();

class JobManager {
  private jobs = new Map<string, JobRecord>();

  startJob(type: string, sessionId: string | undefined, requestId: string | number | null, runner: JobRunner): JobRecord {
    const jobId = `${type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    if (this.jobs.has(jobId)) {
      throw new EngineError(ERROR_CODE_JOB_CONFLICT, 'Job conflict');
    }
    const now = new Date().toISOString();
    const record: JobRecord = {
      jobId,
      type,
      status: 'running',
      progress: 0,
      requestId,
      sessionId,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(jobId, record);
    eventBus.emit({ type: `${type}.progress`, requestId, jobId, payload: { progress: 0, sessionId } });

    setTimeout(async () => {
      if (record.status === 'cancelled') {
        return;
      }
      try {
        record.progress = 35;
        record.updatedAt = new Date().toISOString();
        eventBus.emit({ type: `${type}.progress`, requestId, jobId, payload: { progress: 35, sessionId } });

        const result = await runner();
        record.progress = 100;
        record.status = 'completed';
        record.updatedAt = new Date().toISOString();
        record.result = result;
        eventBus.emit({ type: 'job.completed', requestId, jobId, payload: { result, sessionId } });
      } catch (error) {
        record.status = 'failed';
        record.updatedAt = new Date().toISOString();
        record.error = error instanceof Error ? error.message : 'Job failed';
        eventBus.emit({ type: 'job.failed', requestId, jobId, payload: { error: record.error, sessionId } });
      }
    }, 30);

    return record;
  }

  getJob(jobId: string): JobRecord {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new EngineError(ERROR_CODE_NOT_FOUND, 'Job not found', { jobId });
    }
    return job;
  }

  cancelJob(jobId: string): JobRecord {
    const job = this.getJob(jobId);
    if (job.status !== 'running') {
      return job;
    }
    job.status = 'cancelled';
    job.updatedAt = new Date().toISOString();
    eventBus.emit({
      type: 'job.failed',
      requestId: job.requestId,
      jobId,
      payload: { error: 'Cancelled', sessionId: job.sessionId },
    });
    return job;
  }
}

export const jobManager = new JobManager();
