import { useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { api, explain } from '../api'
import type { AskResponse } from '../api'
import { useSession } from '../session'
import { Kv, KvRow, Note, Panel, Tag, usd } from '../ui'

export function Ask() {
  const { mode, personas, persona, setPersona, models, demo } = useSession()
  const [question, setQuestion] = useState('')
  const [model, setModel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AskResponse | null>(null)

  const locked = demo?.canned_only === true
  const allowed = demo?.allowed_models ?? null

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (busy || !question.trim()) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(
        await api.ask({
          question: question.trim(),
          user: mode === 'persona' ? persona : undefined,
          model: model || undefined,
        }),
      )
    } catch (err) {
      setError(explain(err))
    } finally {
      setBusy(false)
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit()
  }

  const gov = result?.governance
  const sources = result?.sources ?? []

  return (
    <div className="split">
      <div className="col">
        {demo?.demo_mode ? (
          <Note kind="info">
            Hosted demo.{' '}
            {locked ? 'Only the example questions are accepted. ' : ''}
            {allowed ? `Models limited to ${allowed.join(', ')}. ` : ''}
            {demo.rate_per_minute ? `${demo.rate_per_minute} questions per minute.` : ''}
          </Note>
        ) : null}

        <Panel title="Ask a question">
          <form onSubmit={submit} className="stack">
            <div className="row">
              {mode === 'loading' ? (
                <div className="muted small">Connecting…</div>
              ) : mode === 'persona' ? (
                <label>
                  Ask as
                  <select value={persona} onChange={(e) => setPersona(e.target.value)}>
                    {personas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id} — {p.groups.join(', ')}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="muted small">
                  Identity comes from your bearer token. The server decides what you can see; this page
                  can&rsquo;t widen it.
                </div>
              )}
              <label>
                Model
                <select value={model} onChange={(e) => setModel(e.target.value)}>
                  <option value="">Registry default{models ? ` (${models.default})` : ''}</option>
                  {(models?.models ?? [])
                    .filter((m) => m.status !== 'retired')
                    .map((m) => {
                      const off = allowed !== null && !allowed.includes(m.id)
                      return (
                        <option key={m.id} value={m.id} disabled={off}>
                          {m.id}
                          {off ? ' — disabled here' : ''}
                        </option>
                      )
                    })}
                </select>
              </label>
            </div>

            {demo?.examples.length ? (
              <div className="chips" role="group" aria-label="Example questions">
                {demo.examples.map((ex) => (
                  <button
                    type="button"
                    key={ex.label}
                    className="chip"
                    onClick={() => {
                      if (mode === 'persona' && personas.some((p) => p.id === ex.persona)) setPersona(ex.persona)
                      setQuestion(ex.question)
                    }}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            ) : null}

            <label>
              Question
              <textarea
                value={question}
                readOnly={locked}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={onKey}
                placeholder={locked ? 'Pick an example above.' : 'What is the PTO policy for full-time employees?'}
                rows={3}
              />
            </label>

            <div className="actions">
              <button type="submit" disabled={busy || !question.trim()}>
                {busy ? 'Asking…' : 'Ask question'}
              </button>
              <span className="muted small">Ctrl/⌘ + Enter</span>
            </div>
          </form>
        </Panel>

        <Panel title="Answer">
          {error ? (
            <Note>{error}</Note>
          ) : (
            <div className="answer" aria-live="polite">
              {result ? result.answer : <span className="muted">{busy ? 'Asking…' : 'No question asked yet.'}</span>}
            </div>
          )}
        </Panel>

        <Panel title="Retrieved context" aside={result ? `${sources.length} document${sources.length === 1 ? '' : 's'}` : null}>
          {!result ? (
            <p className="muted small">Documents behind an answer show up here, with their classification.</p>
          ) : sources.length === 0 ? (
            <p className="muted">Nothing this identity is entitled to matched.</p>
          ) : (
            <ul className="chunks">
              {sources.map((s) => (
                <li key={`${s.doc_id}-${s.version}`}>
                  <span>
                    <span className="mono">
                      {s.doc_id} v{s.version}
                    </span>{' '}
                    {s.title}
                  </span>
                  <span className="tags">
                    {s.status === 'superseded' ? <Tag kind="warn">superseded</Tag> : null}
                    <Tag kind={s.classification}>{s.classification}</Tag>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="foot">
            Permissions are enforced by Postgres row-level security before retrieval, so documents this
            identity can&rsquo;t see never reach the list or the model.
          </p>
        </Panel>
      </div>

      <div className="col side">
        <Panel title="Routing decisions">
          {!gov ? (
            <p className="muted small">Each rule the gateway checked, in order, with its reason.</p>
          ) : gov.decisions?.length ? (
            <ul className="decisions">
              {gov.decisions.map((d, i) => (
                <li key={i} className={d.allowed ? 'allow' : 'deny'}>
                  <strong>{d.allowed ? 'Allowed' : 'Denied'}</strong>
                  {d.model ? <> · <span className="mono">{d.model}</span></> : null}
                  <div className="small">{d.reason}</div>
                  <div className="rule">rule: {d.rule_id}</div>
                </li>
              ))}
            </ul>
          ) : gov.reason ? (
            <ul className="decisions">
              <li className="deny">
                <strong>Refused</strong>
                <div className="small">{gov.reason}</div>
              </li>
            </ul>
          ) : (
            <p className="muted">
              {gov.decision === 'refused_no_access' ? 'No model was called: nothing retrievable matched.' : '—'}
            </p>
          )}
        </Panel>

        {gov ? (
          <Panel title="Governance record">
            <Kv>
              <KvRow label="Outcome"><span className="mono">{gov.decision ?? 'answered'}</span></KvRow>
              <KvRow label="Answered by">{gov.model ? <span className="mono">{gov.model}</span> : '—'}</KvRow>
              <KvRow label="Context class">
                {gov.classification ? <Tag kind={gov.classification}>{gov.classification}</Tag> : '—'}
              </KvRow>
              <KvRow label="Cost">{gov.cache_hit ? '$0.000000 — served from cache' : usd(gov.cost_usd, 6)}</KvRow>
              <KvRow label="Latency">
                {gov.cache_hit ? 'cached' : gov.latency_ms != null ? `${gov.latency_ms} ms` : '—'}
              </KvRow>
              <KvRow label="Evidence">{gov.evidence_seq != null ? `#${gov.evidence_seq}` : '—'}</KvRow>
              <KvRow label="Correlation"><span className="mono">{gov.correlation_id}</span></KvRow>
            </Kv>
          </Panel>
        ) : null}
      </div>
    </div>
  )
}
