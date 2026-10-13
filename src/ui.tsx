import type { ReactNode } from 'react'
import type { Classification } from './api'

export function Panel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>{title}</h2>
        {aside ? <div className="panel-aside">{aside}</div> : null}
      </header>
      {children}
    </section>
  )
}

export function Tag({ kind, children }: { kind: Classification | 'warn'; children: ReactNode }) {
  return <span className={`tag ${kind}`}>{children}</span>
}

export function Kv({ children }: { children: ReactNode }) {
  return <dl className="kv">{children}</dl>
}

export function KvRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kv-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export function Note({ kind = 'bad', children }: { kind?: 'bad' | 'ok' | 'info'; children: ReactNode }) {
  return (
    <div className={`note ${kind}`} role={kind === 'bad' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

export function usd(n: number | null | undefined, digits = 4): string {
  return n === null || n === undefined ? '—' : `$${n.toFixed(digits)}`
}

export function when(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })
}

export function shortHash(h: string | null): string {
  return h ? `${h.slice(0, 10)}…` : '—'
}
