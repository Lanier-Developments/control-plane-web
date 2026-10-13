// Typed client for the ControlPlane FastAPI service (src/provenance/api.py).
// Every field here mirrors a real response shape; nothing is invented client-side.

const BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '')

export type Classification = 'public' | 'internal' | 'confidential' | 'restricted'

export interface Persona { id: string; groups: string[] }
export interface ModelEntry {
  id: string
  provider: string
  tier: string
  status: string
  max_classification: Classification
  cost_per_1k_input: number
  cost_per_1k_output: number
}
export interface ModelsResponse { default: string; models: ModelEntry[] }
export interface PolicyResponse { rules: Record<string, unknown>[]; fallback_model: string | null }
export interface Example { label: string; persona: string; question: string }
export interface DemoStatus {
  demo_mode: boolean
  canned_only: boolean
  allowed_models: string[] | null
  rate_per_minute: number | null
  examples: Example[]
}
export interface Source {
  doc_id: string
  version: number | string
  title: string
  classification: Classification
  status?: string | null
}
export interface Decision { rule_id: string; allowed: boolean; reason: string; model: string | null }
export interface Governance {
  correlation_id: string
  decision?: string
  reason?: string
  evidence_id?: string | null
  evidence_seq?: number | null
  model?: string
  classification?: Classification
  decisions?: Decision[]
  cache_hit?: boolean
  cost_usd?: number | null
  latency_ms?: number | null
}
export interface AskResponse {
  question: string
  user: string | null
  permissions_enforced: boolean
  answer: string
  sources: Source[]
  governance: Governance
}
export interface EvidenceEntry {
  seq: number
  occurred_at: string
  principal: string | null
  question: string
  classification: Classification
  decision: string
  model: string | null
  rule_id: string | null
  answer_sha256: string | null
  cost_usd: number | null
  entry_hash: string
}
export type VerifyResult =
  | { ok: true; checked: number; head: string }
  | { ok: false; checked: number; broken_at: number; why: string }
export interface UsageResponse {
  calls: number
  denied: number
  cost_usd: number
  by_rule: { rule_id: string | null; decision: string; calls: number; cost_usd: number }[]
}

export class ApiError extends Error {
  status: number
  retryAfter?: string
  constructor(status: number, message: string, retryAfter?: string) {
    super(message)
    this.status = status
    this.retryAfter = retryAfter
  }
}

let tokenSource: () => string = () => ''
export function setTokenSource(fn: () => string): void {
  tokenSource = fn
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (init.body) headers['Content-Type'] = 'application/json'
  const token = tokenSource()
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(BASE + path, { ...init, headers })
  } catch {
    throw new ApiError(0, `Can't reach the ControlPlane API${BASE ? ` at ${BASE}` : ''}. Is it running?`)
  }
  if (!res.ok) {
    let detail = res.statusText || `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
      else if (Array.isArray(body?.detail)) detail = body.detail.map((d: { msg?: string }) => d.msg).join('; ')
    } catch {
      /* non-JSON error body: keep the status text */
    }
    throw new ApiError(res.status, detail, res.headers.get('Retry-After') ?? undefined)
  }
  return res.json() as Promise<T>
}

export const api = {
  personas: () => request<{ personas: Persona[] }>('/api/personas'),
  models: () => request<ModelsResponse>('/api/models'),
  policy: () => request<PolicyResponse>('/api/policy'),
  demo: () => request<DemoStatus>('/api/demo'),
  ask: (body: { question: string; user?: string; model?: string }) =>
    request<AskResponse>('/ask', { method: 'POST', body: JSON.stringify(body) }),
  evidence: (limit: number) => request<{ entries: EvidenceEntry[] }>(`/api/evidence?limit=${limit}`),
  verify: () => request<VerifyResult>('/api/verify'),
  usage: (hours: number) => request<UsageResponse>(`/api/usage?hours=${hours}`),
}

/** A message a person can act on, for any failure from the API. */
export function explain(err: unknown): string {
  if (!(err instanceof ApiError)) return err instanceof Error ? err.message : 'Something went wrong.'
  if (err.status === 401) return 'Sign-in required. Paste a valid bearer token in the header and try again.'
  if (err.status === 403) return err.message || 'You are not allowed to do that.'
  if (err.status === 429 && err.retryAfter) return `${err.message} (retry in ${err.retryAfter}s)`
  return err.message
}
