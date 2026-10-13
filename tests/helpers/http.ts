import { EventEmitter } from 'node:events';
import type { Express, Request, Response } from 'express';
import { createRequest, createResponse } from 'node-mocks-http';

export type InjectedResponse = {
  status: number;
  body: unknown;
  text: string;
  headers: Record<string, string | string[] | undefined>;
};

type RequestOptions = {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
};

async function inject(app: Express, options: RequestOptions): Promise<InjectedResponse> {
  const request = createRequest({
    method: options.method,
    url: options.path,
    originalUrl: options.path,
    headers: options.headers,
    body: options.body
  });
  // The mock already exposes a parsed body. Omitting Content-Length makes express.json skip stream parsing.
  const response = createResponse({ eventEmitter: EventEmitter });

  await new Promise<void>((resolve, reject) => {
    response.once('end', resolve);
    app.handle(request as unknown as Request, response as unknown as Response, (error?: unknown) => {
      if (error) reject(error);
      else if (!(response as { writableEnded?: boolean }).writableEnded) resolve();
    });
  });

  const raw = (response as unknown as { _getData: () => string | Buffer })._getData();
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // Non-JSON endpoints deliberately preserve their text form.
  }
  return {
    status: response.statusCode,
    body,
    text,
    headers: (response as unknown as { _getHeaders: () => Record<string, string | string[] | undefined> })._getHeaders()
  };
}

class PendingRequest {
  private body: unknown;
  private readonly headers: Record<string, string> = {};

  constructor(
    private readonly app: Express,
    private readonly method: string,
    private readonly path: string
  ) {}

  set(name: string, value: string): this {
    this.headers[name] = value;
    return this;
  }

  send(body: unknown): this {
    this.body = body;
    return this;
  }

  async expect(status: number, expectedBody?: unknown): Promise<InjectedResponse> {
    const response = await inject(this.app, {
      method: this.method,
      path: this.path,
      body: this.body,
      headers: this.headers
    });
    if (response.status !== status) {
      throw new Error(`${this.method} ${this.path}: expected ${status}, received ${response.status}: ${response.text}`);
    }
    if (expectedBody !== undefined && JSON.stringify(response.body) !== JSON.stringify(expectedBody)) {
      throw new Error(`${this.method} ${this.path}: response body does not match expected payload.`);
    }
    return response;
  }
}

class TestClient {
  constructor(private readonly app: Express) {}

  get(path: string): PendingRequest {
    return new PendingRequest(this.app, 'GET', path);
  }

  post(path: string): PendingRequest {
    return new PendingRequest(this.app, 'POST', path);
  }

  patch(path: string): PendingRequest {
    return new PendingRequest(this.app, 'PATCH', path);
  }

  delete(path: string): PendingRequest {
    return new PendingRequest(this.app, 'DELETE', path);
  }
}

export function request(app: Express): TestClient {
  return new TestClient(app);
}
