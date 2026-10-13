import { useState } from 'react'
import { SessionProvider, useSession } from './session'
import { Ask } from './views/Ask'
import { Ledger } from './views/Ledger'
import { Models } from './views/Models'
import { Usage } from './views/Usage'
import { Note } from './ui'

type Tab = 'ask' | 'ledger' | 'usage' | 'models'

const TABS: [Tab, string][] = [
  ['ask', 'Ask'],
  ['ledger', 'Ledger'],
  ['usage', 'Usage'],
  ['models', 'Models and policy'],
]

function Shell() {
  const { mode, token, setToken, bootError } = useSession()
  const [tab, setTab] = useState<Tab>('ask')
  const [draft, setDraft] = useState(token)

  return (
    <>
      <header className="top">
        <div className="brand">
          <h1>ControlPlane</h1>
          <p>Permission-scoped retrieval, policy-routed inference, evidence ledger.</p>
        </div>

        {mode === 'token' ? (
          <form
            className="token"
            onSubmit={(e) => {
              e.preventDefault()
              setToken(draft)
            }}
          >
            <label>
              Bearer token
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Paste a JWT from your identity provider"
              />
            </label>
            <button type="submit" className="ghost">
              {token ? 'Update' : 'Use token'}
            </button>
            {token ? (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setDraft('')
                  setToken('')
                }}
              >
                Sign out
              </button>
            ) : null}
          </form>
        ) : mode === 'persona' ? (
          <span className="mode">Persona mode: development only</span>
        ) : null}

        <a className="repo" href="https://github.com/Lanier-Developments/ControlPlane" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
      </header>

      <nav className="tabs" aria-label="Sections">
        {TABS.map(([id, label]) => (
          <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <main>
        {bootError ? <Note>{bootError}</Note> : null}
        <div hidden={tab !== 'ask'}>
          <Ask />
        </div>
        <div hidden={tab !== 'ledger'}>
          <Ledger active={tab === 'ledger'} />
        </div>
        <div hidden={tab !== 'usage'}>
          <Usage active={tab === 'usage'} />
        </div>
        <div hidden={tab !== 'models'}>
          <Models active={tab === 'models'} />
        </div>
      </main>
    </>
  )
}

export default function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  )
}
