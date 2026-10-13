import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, api, explain, setTokenSource } from './api'
import type { DemoStatus, ModelsResponse, Persona } from './api'

/**
 * How this instance identifies callers, discovered from the API rather than configured:
 *  - persona: AUTH_MODE=persona. /api/personas exists and the body names the user.
 *  - token:   AUTH_MODE=oidc. /api/personas is a 404 and identity is a bearer JWT.
 */
export type AuthMode = 'loading' | 'persona' | 'token'

interface Session {
  mode: AuthMode
  personas: Persona[]
  persona: string
  setPersona: (id: string) => void
  token: string
  setToken: (t: string) => void
  models: ModelsResponse | null
  demo: DemoStatus | null
  bootError: string | null
}

const Ctx = createContext<Session | null>(null)
const TOKEN_KEY = 'controlplane.token'

function readStoredToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AuthMode>('loading')
  const [personas, setPersonas] = useState<Persona[]>([])
  const [persona, setPersona] = useState('')
  const [token, setTokenState] = useState(readStoredToken)
  const [models, setModels] = useState<ModelsResponse | null>(null)
  const [demo, setDemo] = useState<DemoStatus | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

  // The client reads token and mode at call time, so a paste takes effect without a re-render race.
  // In persona mode the server ignores bearer tokens, so none is sent there.
  useEffect(() => {
    setTokenSource(() => (mode === 'persona' ? '' : token))
  }, [mode, token])

  const setToken = useCallback((t: string) => {
    const clean = t.trim()
    setTokenState(clean)
    try {
      if (clean) sessionStorage.setItem(TOKEN_KEY, clean)
      else sessionStorage.removeItem(TOKEN_KEY)
    } catch {
      /* storage blocked: the token lives for this tab's memory only */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [p, m, d] = await Promise.allSettled([api.personas(), api.models(), api.demo()])
      if (cancelled) return

      if (m.status === 'fulfilled') setModels(m.value)
      else setBootError(explain(m.reason))
      if (d.status === 'fulfilled') setDemo(d.value)

      if (p.status === 'fulfilled') {
        setPersonas(p.value.personas)
        const first = d.status === 'fulfilled' ? d.value.examples[0]?.persona : undefined
        const preferred = p.value.personas.find((x) => x.id === first) ?? p.value.personas[0]
        setPersona(preferred?.id ?? '')
        setMode('persona')
      } else if (p.reason instanceof ApiError && p.reason.status === 404) {
        setMode('token')
      } else {
        // Not the "persona mode is off" 404: the API is unreachable or failing, so say so.
        setBootError(explain(p.reason))
        setMode('token')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(
    () => ({ mode, personas, persona, setPersona, token, setToken, models, demo, bootError }),
    [mode, personas, persona, token, setToken, models, demo, bootError],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): Session {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession must be used inside SessionProvider')
  return v
}
