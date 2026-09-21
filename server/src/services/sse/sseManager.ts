import { EventEmitter } from 'events';
import { Response, Request } from 'express';
import { GenerationJobInfo } from '@trao/shared';

export interface SSEProgressEvent {
  jobId: string;
  status: string;
  currentStep: string;
  progress: number;
}

export interface SSECompletedEvent {
  jobId: string;
  status: 'completed';
  kitId: string;
  progress: 100;
}

export interface SSEFailedEvent {
  jobId: string;
  status: 'failed';
  error: {
    code: string;
    message: string;
  };
}

export class SSEManager {
  private emitter = new EventEmitter();

  constructor() {
    // Increase max listeners for concurrent SSE streams
    this.emitter.setMaxListeners(200);
  }

  /**
   * Broadcasts a progress update for a running job.
   */
  public emitProgress(jobId: string, data: SSEProgressEvent): void {
    this.emitter.emit(`job:${jobId}:progress`, data);
  }

  /**
   * Broadcasts a completion event for a job.
   */
  public emitCompleted(jobId: string, data: SSECompletedEvent): void {
    this.emitter.emit(`job:${jobId}:completed`, data);
  }

  /**
   * Broadcasts a failure event for a job.
   */
  public emitFailed(jobId: string, data: SSEFailedEvent): void {
    this.emitter.emit(`job:${jobId}:failed`, data);
  }

  /**
   * Returns current listener count for a job event (useful for leak assertion in tests).
   */
  public getListenerCount(jobId: string): number {
    return (
      this.emitter.listenerCount(`job:${jobId}:progress`) +
      this.emitter.listenerCount(`job:${jobId}:completed`) +
      this.emitter.listenerCount(`job:${jobId}:failed`)
    );
  }

  /**
   * Subscribes an HTTP response to live Server-Sent Events for a job.
   */
  public subscribe(
    jobId: string,
    initialJob: GenerationJobInfo,
    req: Request,
    res: Response
  ): void {
    // 1. Establish SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // 2. Send initial state immediately upon connection
    this.sendEvent(res, 'initial', initialJob);

    // If job is already in terminal state, terminate immediately
    if (initialJob.status === 'completed') {
      this.sendEvent(res, 'completed', {
        jobId,
        status: 'completed',
        kitId: initialJob.kitId,
        progress: 100,
      });
      res.end();
      return;
    }

    if (initialJob.status === 'failed') {
      this.sendEvent(res, 'failed', {
        jobId,
        status: 'failed',
        error: initialJob.error || { code: 'FAILED', message: 'Job failed.' },
      });
      res.end();
      return;
    }

    // 3. Keepalive ping every 15s to prevent proxy/router idle timeouts
    const pingTimer = setInterval(() => {
      res.write(': ping\n\n');
    }, 15_000);

    // 4. Register event handlers
    const progressHandler = (data: SSEProgressEvent) => {
      this.sendEvent(res, 'progress', data);
    };

    const completedHandler = (data: SSECompletedEvent) => {
      this.sendEvent(res, 'completed', data);
      cleanup();
      res.end();
    };

    const failedHandler = (data: SSEFailedEvent) => {
      this.sendEvent(res, 'failed', data);
      cleanup();
      res.end();
    };

    const cleanup = () => {
      clearInterval(pingTimer);
      this.emitter.off(`job:${jobId}:progress`, progressHandler);
      this.emitter.off(`job:${jobId}:completed`, completedHandler);
      this.emitter.off(`job:${jobId}:failed`, failedHandler);
    };

    this.emitter.on(`job:${jobId}:progress`, progressHandler);
    this.emitter.on(`job:${jobId}:completed`, completedHandler);
    this.emitter.on(`job:${jobId}:failed`, failedHandler);

    // 5. Clean up on client disconnect
    req.on('close', () => {
      cleanup();
    });
  }

  private sendEvent(res: Response, eventName: string, data: any): void {
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

export const sseManager = new SSEManager();
