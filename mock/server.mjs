// Stand-in for the ControlPlane FastAPI service, for developing and testing the UI without Postgres,
// Ollama or a corpus. Response shapes mirror src/provenance/api.py.
//
//   node mock/server.mjs                  persona mode (AUTH_MODE=persona)
//   MOCK_AUTH=oidc node mock/server.mjs   token mode: send "Bearer admin" or "Bearer sam"
//   MOCK_DEMO=1 node mock/server.mjs      hosted-demo restrictions (canned questions only)
import http from 'node:http'
import crypto from 'node:crypto'

const PORT = Number(process.env.MOCK_PORT ?? 8000)
const OIDC = process.env.MOCK_AUTH === 'oidc'
const DEMO = process.env.MOCK_DEMO === '1'

const PERSONAS = {
  sam: ['public', 'all-employees', 'engineering'],
  dana: ['public', 'all-employees', 'hr-comp'],
  priya: ['public', 'all-employees', 'finance'],
  riley: ['public'],
  marcus: ['public', 'all-employees', 'store-ops'],
}
const TOKENS = { admin: { sub: 'admin', groups: ['public', 'all-employees', 'hr-comp'], admin: true }, sam: { sub: 'sam', groups: PERSONAS.sam, admin: false } }

const MODELS = [
  { id: 'llama3.1:8b', provider: 'ollama', tier: 'self-hosted', status: 'active', max_classification: 'restricted', cost_per_1k_input: 0, cost_per_1k_output: 0 },
  { id: 'bedrock-sonnet', provider: 'bedrock', tier: 'cloud', status: 'active', max_classification: 'internal', cost_per_1k_input: 0.003, cost_per_1k_output: 0.015 },
  { id: 'gemini-flash', provider: 'gemini', tier: 'cloud', status: 'active', max_classification: 'internal', cost_per_1k_input: 0.0003, cost_per_1k_output: 0.0025 },
  { id: 'legacy-gpt', provider: 'openai', tier: 'cloud', status: 'retired', max_classification: 'public', cost_per_1k_input: 0.01, cost_per_1k_output: 0.03 },
]
const RULES = [
  { id: 'retired-refused', when: { model_status: 'retired' }, decision: 'deny' },
  { id: 'confidential-stays-local', when: { classification: ['confidential', 'restricted'] }, decision: 'allow', allow_tiers: ['self-hosted'] },
  { id: 'public-any-approved', when: { classification: ['public', 'internal'] }, decision: 'allow' },
  { id: 'default-deny', when: 'always', decision: 'deny' },
]

const DOCS = {
  salary: { doc_id: 'HR-004', version: 3, title: 'Engineering compensation bands', classification: 'confidential', need: 'hr-comp', answer: 'A Senior Engineer II is in band E5, $148,000 to $182,000 base. [HR-004 v3]' },
  rollback: { doc_id: 'ENG-012', version: 2, title: 'Payments API on-call runbook', classification: 'internal', need: 'engineering', answer: 'Run the documented rollback from the on-call runbook. [ENG-012 v2]' },
  founded: { doc_id: 'COM-001', version: 1, title: 'About Kestrel Ridge Outfitters', classification: 'public', need: 'public', answer: 'Kestrel Ridge Outfitters was founded in 1987. [COM-001 v1]' },
  pto: { doc_id: 'HR-001', version: 4, title: 'PTO policy', classification: 'internal', need: 'all-employees', answer: 'Full-time employees get 20 PTO days per year. [HR-001 v4]', old: { doc_id: 'HR-001', version: 3, title: 'PTO policy', classification: 'internal', status: 'superseded' } },
}
const EXAMPLES = [
  { label: 'Salary band (confidential)', persona: 'dana', question: 'What is the salary band for a Senior Engineer II?' },
  { label: 'Same question, no entitlement', persona: 'sam', question: 'What is the salary band for a Senior Engineer II?' },
  { label: 'Rollback command (contractor)', persona: 'riley', question: 'How do I roll back the payments API after a bad deploy?' },
  { label: 'Public fact', persona: 'riley', question: 'When was Kestrel Ridge Outfitters founded?' },
  { label: 'Version conflict', persona: 'sam', question: 'How many PTO days do full-time employees get per year?' },
]
const CANNED = new Set(EXAMPLES.map((e) => e.question))

// ---- ledger with a real hash chain ----
const GENESIS = '0'.repeat(64)
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const ledger = []
const calls = []
const digest = (p, prev) => sha(`${prev}\x00${JSON.stringify(Object.fromEntries(Object.entries(p).sort()))}`)
function record(p) {
  const prev = ledger.length ? ledger.at(-1).entry_hash : GENESIS
  const payload = {
    principal: p.principal, question: p.question, classification: p.classification, decision: p.decision,
    model: p.model ?? null, rule_id: p.rule_id ?? null, answer_sha256: p.answer ? sha(p.answer) : null, cost_usd: p.cost ?? null,
  }
  const entry = { seq: ledger.length + 1, occurred_at: new Date().toISOString(), ...payload, prev_hash: prev, entry_hash: digest(payload, prev), payload }
  ledger.push(entry)
  return entry
}
function verify() {
  let prev = GENESIS, checked = 0
  for (const e of ledger) {
    const p = { principal: e.principal, question: e.question, classification: e.classification, decision: e.decision, model: e.model, rule_id: e.rule_id, answer_sha256: e.answer_sha256, cost_usd: e.cost_usd }
    if (e.prev_hash !== prev) return { ok: false, checked, broken_at: e.seq, why: 'prev_hash does not match the previous entry' }
    if (digest(p, e.prev_hash) !== e.entry_hash) return { ok: false, checked, broken_at: e.seq, why: 'entry content does not match its hash' }
    prev = e.entry_hash
    checked++
  }
  return { ok: true, checked, head: prev }
}

// ---- helpers ----
const ORDER = ['public', 'internal', 'confidential', 'restricted']
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}
function principal(req) {
  if (!OIDC) return null
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')
  return m ? TOKENS[m[1]] ?? 'bad' : 'none'
}
async function body(req) {
  let s = ''
  for await (const c of req) s += c
  return s ? JSON.parse(s) : {}
}

function ask(q, user, groups, requested) {
  const key = /salary/i.test(q) ? 'salary' : /roll back/i.test(q) ? 'rollback' : /founded/i.test(q) ? 'founded' : /PTO/i.test(q) ? 'pto' : null
  const corr = crypto.randomUUID()
  const doc = key ? DOCS[key] : null
  if (!doc || !groups.includes(doc.need)) {
    const answer = "I don't have any information available to you that answers that."
    record({ principal: user, question: q, classification: 'public', decision: 'refused_no_access', answer })
    return { question: q, user, permissions_enforced: true, answer, sources: [], governance: { correlation_id: corr, decision: 'refused_no_access' } }
  }
  const sources = [{ doc_id: doc.doc_id, version: doc.version, title: doc.title, classification: doc.classification, status: 'active' }]
  if (doc.old) sources.push(doc.old)
  const cls = doc.classification
  const model = requested ? MODELS.find((m) => m.id === requested) : MODELS[0]
  const decisions = []
  if (!model || model.status === 'retired') {
    decisions.push({ rule_id: 'retired-refused', allowed: false, reason: `${requested} is retired and cannot be used.`, model: requested ?? null })
  } else if (ORDER.indexOf(cls) > ORDER.indexOf(model.max_classification)) {
    decisions.push({ rule_id: 'registry-ceiling', allowed: false, reason: `${model.id} may not process ${cls} data (ceiling: ${model.max_classification}).`, model: model.id })
  }
  if (decisions.length && !decisions[0].allowed) {
    const fb = MODELS[0]
    decisions.push({ rule_id: ORDER.indexOf(cls) >= 2 ? 'confidential-stays-local' : 'public-any-approved', allowed: true, reason: 'Fell back to a self-hosted model.', model: fb.id })
  } else {
    decisions.push({ rule_id: ORDER.indexOf(cls) >= 2 ? 'confidential-stays-local' : 'public-any-approved', allowed: true, reason: `${cls} content permitted on ${model.tier} models.`, model: model.id })
  }
  const used = decisions.at(-1)
  const m = MODELS.find((x) => x.id === used.model)
  const cost = m.cost_per_1k_input * 0.9 + m.cost_per_1k_output * 0.2
  const entry = record({ principal: user, question: q, classification: cls, decision: 'answered', model: used.model, rule_id: used.rule_id, answer: doc.answer, cost })
  calls.push({ rule_id: used.rule_id, decision: 'allow', cost, at: Date.now() })
  for (const d of decisions.filter((d) => !d.allowed)) calls.push({ rule_id: d.rule_id, decision: 'deny', cost: 0, at: Date.now() })
  return {
    question: q, user, permissions_enforced: true, answer: doc.answer, sources,
    governance: { correlation_id: corr, evidence_id: crypto.randomUUID(), evidence_seq: entry.seq, model: used.model, classification: cls, decisions, cache_hit: false, cost_usd: cost, latency_ms: 420 + Math.floor(Math.random() * 900) },
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const p = principal(req)
  const needAuth = () => { if (p === 'none' || p === 'bad') { send(res, 401, { detail: 'Authentication required.' }, { 'WWW-Authenticate': 'Bearer' }); return true } return false }
  const needAdmin = () => { if (needAuth()) return true; if (OIDC && !p.admin) { send(res, 403, { detail: 'Administrator access required.' }); return true } return false }
  await new Promise((r) => setTimeout(r, 120)) // feel like a network

  try {
    if (url.pathname === '/health') return send(res, 200, { status: 'ok' })
    if (url.pathname === '/api/personas') {
      if (OIDC) return send(res, 404, { detail: 'Not found.' })
      return send(res, 200, { personas: Object.entries(PERSONAS).map(([id, groups]) => ({ id, groups })) })
    }
    if (url.pathname === '/api/models') return send(res, 200, { default: MODELS[0].id, models: MODELS })
    if (url.pathname === '/api/policy') return send(res, 200, { rules: RULES, fallback_model: MODELS[0].id })
    if (url.pathname === '/api/demo') {
      return send(res, 200, { demo_mode: DEMO, canned_only: DEMO, allowed_models: DEMO ? ['llama3.1:8b'] : null, rate_per_minute: DEMO ? 6 : null, examples: EXAMPLES })
    }
    if (url.pathname === '/api/evidence') {
      if (needAdmin()) return
      const limit = Number(url.searchParams.get('limit') ?? 10)
      return send(res, 200, { entries: ledger.slice(-limit).reverse().map(({ prev_hash, payload, ...e }) => e) })
    }
    if (url.pathname === '/api/verify') { if (needAdmin()) return; return send(res, 200, verify()) }
    if (url.pathname === '/api/usage') {
      if (needAdmin()) return
      const by = new Map()
      for (const c of calls) { const k = `${c.rule_id}|${c.decision}`; const v = by.get(k) ?? { rule_id: c.rule_id, decision: c.decision, calls: 0, cost_usd: 0 }; v.calls++; v.cost_usd += c.cost; by.set(k, v) }
      return send(res, 200, { calls: calls.length, denied: calls.filter((c) => c.decision === 'deny').length, cost_usd: calls.reduce((a, c) => a + c.cost, 0), by_rule: [...by.values()].sort((a, b) => b.calls - a.calls) })
    }
    if (url.pathname === '/__tamper' && req.method === 'POST') { // test hook: silently edit an entry
      if (ledger[0]) ledger[0].question = 'edited behind the triggers'
      return send(res, 200, { tampered: true })
    }
    if (url.pathname === '/ask' && req.method === 'POST') {
      if (needAuth()) return
      const b = await body(req)
      if (DEMO && !CANNED.has((b.question ?? '').trim())) return send(res, 403, { detail: 'The hosted demo answers only its example questions. Clone the repo to ask your own.' })
      if (DEMO && b.model && b.model !== 'llama3.1:8b') return send(res, 403, { detail: `${b.model} is disabled on the hosted demo (it bills a real account).` })
      if (OIDC) {
        if (b.user) return send(res, 400, { detail: "Do not send 'user'. Identity is taken from the bearer token." })
        return send(res, 200, ask(b.question, p.sub, p.groups, b.model))
      }
      if (!PERSONAS[b.user]) return send(res, 403, { detail: `Unknown principal: ${b.user}` })
      return send(res, 200, ask(b.question, b.user, PERSONAS[b.user], b.model))
    }
    send(res, 404, { detail: 'Not found.' })
  } catch (e) {
    send(res, 500, { detail: String(e) })
  }
}).listen(PORT, () => console.log(`mock ControlPlane API on :${PORT} (${OIDC ? 'oidc' : 'persona'}${DEMO ? ', demo' : ''})`))
