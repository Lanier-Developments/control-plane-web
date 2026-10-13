import { api } from '../api'
import { useSession } from '../session'
import { useLoad } from '../useLoad'
import { Note, Panel, Tag } from '../ui'

function show(v: unknown): string {
  return typeof v === 'string' ? v : JSON.stringify(v)
}

export function Models({ active }: { active: boolean }) {
  const { models, bootError } = useSession()
  const policy = useLoad(() => api.policy(), active, 'policy')

  const rules = policy.data?.rules ?? []

  return (
    <div className="col">
      <Panel title="Model registry" aside={models ? <>default: <span className="mono">{models.default}</span></> : null}>
        {!models ? (
          <p className="muted">{bootError ? 'The registry didn’t load. Check the API connection.' : 'Loading…'}</p>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col">Provider</th>
                  <th scope="col">Tier</th>
                  <th scope="col">Max class</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">$ / 1k in</th>
                  <th scope="col" className="num">$ / 1k out</th>
                </tr>
              </thead>
              <tbody>
                {models.models.map((m) => (
                  <tr key={m.id}>
                    <td className="mono">{m.id}</td>
                    <td>{m.provider}</td>
                    <td>{m.tier}</td>
                    <td>
                      <Tag kind={m.max_classification}>{m.max_classification}</Tag>
                    </td>
                    <td className={m.status === 'retired' ? 'deny-text' : undefined}>{m.status}</td>
                    <td className="num mono">{m.cost_per_1k_input}</td>
                    <td className="num mono">{m.cost_per_1k_output}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="foot">
          The registry is data: add, reprice or retire a model by editing <span className="mono">policy/models.yaml</span>.
          A model&rsquo;s max class outranks every routing rule, and a retired model is refused rather than absent.
        </p>
      </Panel>

      <Panel
        title="Routing rules"
        aside={
          policy.data?.fallback_model ? (
            <>fallback: <span className="mono">{policy.data.fallback_model}</span></>
          ) : null
        }
      >
        {policy.error ? <Note>{policy.error}</Note> : null}
        {!policy.data && !policy.error ? <p className="muted">Loading…</p> : null}
        {rules.length > 0 ? (
          <ol className="rules">
            {rules.map((r, i) => {
              const { id, rule_id, decision, effect, action, ...rest } = r as Record<string, unknown>
              const name = show(id ?? rule_id ?? `rule ${i + 1}`)
              const verdict = decision ?? effect ?? action
              const denies = typeof verdict === 'string' && /deny/i.test(verdict)
              return (
                <li key={`${name}-${i}`} className={denies ? 'deny' : 'allow'}>
                  <div>
                    <strong className="mono">{name}</strong>
                    {verdict !== undefined ? <span className={denies ? 'deny-text' : 'ok-text'}> — {show(verdict)}</span> : null}
                  </div>
                  {Object.entries(rest).map(([k, v]) => (
                    <div key={k} className="small">
                      <span className="muted">{k}:</span> <span className="mono">{show(v)}</span>
                    </div>
                  ))}
                </li>
              )
            })}
          </ol>
        ) : !policy.error && policy.data ? (
          <p className="muted">No rules returned.</p>
        ) : null}
        <p className="foot">
          Evaluated top to bottom; the first match decides. The last rule is a deny, so a case the file
          doesn&rsquo;t anticipate is refused rather than allowed.
        </p>
      </Panel>
    </div>
  )
}
