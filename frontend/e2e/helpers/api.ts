import { expect } from '@playwright/test';
import type { APIRequestContext, APIResponse } from '@playwright/test';

/** The shape of every error body of the service and the edge (RF-API-05). */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  requestId: string;
  instance?: string;
  errors?: unknown[];
}

/**
 * Direct HTTP checks: they call the API without the UI, so they prove the service and the edge, not the screen.
 * Every spec that uses them says so in the test title («API: …»).
 */
export async function post(
  request: APIRequestContext,
  operation: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<APIResponse> {
  return request.post(`/api/v1/operations/${operation}`, {
    data: body,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** The response is an `application/problem+json` Problem with this status and code and a request id equal to the header. */
export async function expectProblem(response: APIResponse, status: number, code: string): Promise<Problem> {
  expect(response.status()).toBe(status);
  expect(response.headers()['content-type']).toMatch(/^application\/problem\+json/);
  const problem = (await response.json()) as Problem;
  expect(problem.status).toBe(status);
  expect(problem.code).toBe(code);
  expect(problem.type).toMatch(/^urn:calculator:problem:[a-z0-9-]+$/);
  expect(problem.requestId).toBe(response.headers()['x-request-id']);
  return problem;
}

/** Every value of a response header, in the order received (the browser's `headers()` joins duplicates). */
export function headerValues(response: APIResponse, name: string): string[] {
  return response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === name.toLowerCase())
    .map((header) => header.value);
}

/** The five browser-policy headers of the edge (deploy/nginx/security-headers.conf), once each. */
export const EDGE_POLICY_HEADERS = [
  'content-security-policy',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
] as const;

export const EDGE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'";
