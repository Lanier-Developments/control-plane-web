import { useState } from 'react'
import { api, explain } from '../api'
import type { VerifyResult } from '../api'
import { useLoad } from '../useLoad'
import { Note, Panel, Tag, shortHash, usd, when } from '../ui'

export function Ledger({ active }: { active: boolean }) {
  const [limit, setLimit] = useState(25)
  const { data, error, loading, reload } = useLoad(() => api.evidence(limit), active, String(limit))
  const [verifying, setVerifying] = useState(false)
  const [verdict, setVerdict] = useState<VerifyResult | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  async function verify() {
    setVerifying(true)
    setVerdict(null)
    setVerifyError(null)
    try {
      setVerdict(await api.verify())
    } catch (e) {
      setVerifyError(explain(e))
    } finally {
      setVerifying(false)
    }
  }

  const entries = data?.entries ?? []

  return (
    <div className="col">
      <Panel
        title="Evidence ledger"
        aside={
          <div className="actions">
            <label className="inline">
              Show
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    last {n}
                  </option>
                ))}
              </select>
            </label>
            <button className="ghost" onClick={() => void reload()} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button onClick={() => void verify()} disabled={verifying}>
              {verifying ? 'Recomputing…' : 'Verify chain'}
            </button>
          </div>
        }
      >
        {verdict ? (
          verdict.ok ? (
            <Note kind="ok">
              Chain intact — {verdict.checked} entries verified. Head <span className="mono">{shortHash(verdict.head)}</span>
            </Note>
          ) : (
            <Note>
              Chain broken at #{verdict.broken_at} after {verdict.checked} good entries — {verdict.why}.
            </Note>
          )
        ) : null}
        {verifyError ? <Note>{verifyError}</Note> : null}
        {error ? <Note>{error}</Note> : null}
        {!data && !error ? <p className="muted">Loading…</p> : null}

        {!error && data && entries.length === 0 ? (
          <p className="muted">Empty. Ask a question and its entry appears here, refusals included.</p>
        ) : null}

        {entries.length > 0 ? (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">When</th>
                  <th scope="col">Principal</th>
                  <th scope="col">Question</th>
                  <th scope="col">Class</th>
                  <th scope="col">Decision</th>
                  <th scope="col">Model</th>
                  <th scope="col">Rule</th>
                  <th scope="col" className="num">Cost</th>
                  <th scope="col">Answer digest</th>
                  <th scope="col">Entry hash</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.seq}>
                    <td className="mono">{e.seq}</td>
                    <td className="nowrap">{when(e.occurred_at)}</td>
                    <td>{e.principal ?? <span className="muted">anonymous</span>}</td>
                    <td className="q" title={e.question}>
                      {e.question}
                    </td>
                    <td>
                      <Tag kind={e.classification}>{e.classification}</Tag>
                    </td>
                    <td className={e.decision === 'answered' ? 'ok-text' : 'deny-text'}>{e.decision}</td>
                    <td className="mono">{e.model ?? '—'}</td>
                    <td className="mono">{e.rule_id ?? '—'}</td>
                    <td className="num mono">{usd(e.cost_usd, 6)}</td>
                    <td className="mono" title={e.answer_sha256 ?? ''}>
                      {shortHash(e.answer_sha256)}
                    </td>
                    <td className="mono" title={e.entry_hash}>
                      {shortHash(e.entry_hash)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <p className="foot">
          Append-only and hash-chained. The ledger stores a SHA-256 of each answer, never the answer text, so
          it can&rsquo;t become a second copy of confidential content. Tamper-evident, not tamper-proof: anyone
          who can rewrite the whole table in order can forge a consistent chain.
        </p>
      </Panel>
    </div>
  )
}
