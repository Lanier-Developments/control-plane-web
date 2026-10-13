import { useCallback, useEffect, useRef, useState } from 'react'
import { explain } from './api'

/**
 * Load data whenever the view becomes active or `key` changes, and on demand via reload().
 * Views stay mounted across tab switches, so `active` is what triggers a fresh read.
 */
export function useLoad<T>(fetcher: () => Promise<T>, active: boolean, key: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fetchRef = useRef(fetcher)
  useEffect(() => {
    fetchRef.current = fetcher
  })
  const seq = useRef(0)

  const reload = useCallback(async () => {
    const mine = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const d = await fetchRef.current()
      if (mine === seq.current) setData(d)
    } catch (e) {
      if (mine === seq.current) setError(explain(e))
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (active) void reload()
  }, [active, key, reload])

  return { data, error, loading, reload }
}
