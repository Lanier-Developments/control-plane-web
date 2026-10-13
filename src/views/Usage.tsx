import { useState } from 'react'
import { api } from '../api'
import { useLoad } from '../useLoad'
import { Kv, KvRow, Note, Panel, usd } from '../ui'

const WINDOWS: [number, string][] = [
  [1, 'last hour'],
  [24, 'last 24 hours'],
  [168, 'last 7 days'],
]

export function Usage({ active }: { active: boolean }) {
  const [hours, setHours] = useState(24)
  const { data, error, loading, reload } = useLoad(() => api.usage(hours), active, String(hours))

  const max = Math.max(1, ...(data?.by_rule.map((r) => r.calls) ?? [1]))
  const denyRate = data && data.calls > 0 ? Math.round((data.denied / data.calls) * 100) : 0

  return (
    <div className="col">
      <Panel
        title="Spend and policy decisions"
        aside={
          <div className="actions">
            <label className="inline">
              Window
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                {WINDOWS.map(([h, label]) => (
                  <option key={h} value={h}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button className="ghost" onClick={() => void reload()} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        }
      >
        {error ? <Note>{error}</Note> : null}
        {!data && !error ? <p className="muted">Loading…</p> : null}
        {data ? (
          <>
            <Kv>
              <KvRow label="Calls">{data.calls}</KvRow>
              <KvRow label="Denied">{`${data.denied}${data.calls ? ` (${denyRate}%)` : ''}`}</KvRow>
              <KvRow label="Cost">{usd(data.cost_usd)}</KvRow>
            </Kv>
            {data.by_rule.length === 0 ? (
              <p className="muted">No calls yet in this window.</p>
            ) : (
              <>
                <h3>Which rules are firing</h3>
                <div className="scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Rule</th>
                        <th scope="col">Decision</th>
                        <th scope="col">Calls</th>
                        <th scope="col" className="num">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_rule.map((r) => (
                        <tr key={`${r.rule_id}-${r.decision}`}>
                          <td className="mono">{r.rule_id ?? '—'}</td>
                          <td className={r.decision === 'deny' ? 'deny-text' : 'ok-text'}>{r.decision}</td>
                          <td className="bar-cell">
                            <span
                              className={`bar ${r.decision === 'deny' ? 'deny' : 'allow'}`}
                              style={{ width: `${(r.calls / max) * 100}%` }}
                              aria-hidden="true"
                            />
                            <span className="mono">{r.calls}</span>
                          </td>
                          <td className="num mono">{usd(r.cost_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        ) : null}
        <p className="foot">
          Which rules fire is the governance question; the dollars are a side effect. For budgets, steering
          and provider health, run <span className="mono">make usage</span>. The API doesn&rsquo;t expose them yet.
        </p>
      </Panel>
    </div>
  )
}
