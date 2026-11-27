import { useEffect, useRef, useState } from 'react'

// Animates a number from its previous value to the new one (for totals that
// change after a bill is paid). Jumps straight there if the phone's
// Reduce Motion setting is on.
export function useCountUp(value: number, durationMs = 600) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)

  useEffect(() => {
    const start = from.current
    from.current = value
    if (start === value) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const duration = reduce ? 0 : durationMs
    let frame = 0
    const t0 = performance.now()
    const step = (now: number) => {
      const k = duration ? Math.min(1, (now - t0) / duration) : 1
      const eased = 1 - Math.pow(1 - k, 3)
      setShown(Math.round(start + (value - start) * eased))
      if (k < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, durationMs])

  return shown
}
