import { useRef, type ReactNode, type PointerEvent, type MouseEvent } from 'react'

const COMMIT_PX = 90 // how far right a row must travel to count as a swipe
const EDGE_PX = 24 // ignore touches that start at the screen edge (iPhone back-swipe)

type Props = { enabled: boolean; label: string; onSwipe: () => void; children: ReactNode }

// Lets a row be dragged to the right to reveal "Mark paid". Letting go past
// the line calls onSwipe; anything shorter springs back. Up-and-down drags
// are left alone so the page still scrolls.
export function SwipeToPay({ enabled, label, onSwipe, children }: Props) {
  const face = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; dx: number; axis: 'x' | 'y' | null; id: number } | null>(null)
  const swallowClick = useRef(false)

  const setX = (px: number, animate: boolean) => {
    const el = face.current
    if (!el) return
    el.style.transition = animate ? '' : 'none'
    el.style.transform = px ? `translateX(${px}px)` : ''
  }

  const down = (e: PointerEvent) => {
    if (!enabled || e.button !== 0 || e.clientX < EDGE_PX) return
    if ((e.target as HTMLElement).closest('.check')) return
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, axis: null, id: e.pointerId }
  }
  const move = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    const mx = e.clientX - d.x
    const my = e.clientY - d.y
    if (!d.axis && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      d.axis = Math.abs(mx) > Math.abs(my) && mx > 0 ? 'x' : 'y'
      if (d.axis === 'x') face.current?.setPointerCapture(d.id)
    }
    if (d.axis !== 'x') return
    // Past the line, the row resists a little more.
    d.dx = mx < COMMIT_PX ? Math.max(0, mx) : COMMIT_PX + (mx - COMMIT_PX) * 0.35
    setX(d.dx, false)
    face.current?.parentElement?.classList.toggle('armed', d.dx >= COMMIT_PX)
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    if (!d || d.axis !== 'x') return
    swallowClick.current = true
    setX(0, true)
    face.current?.parentElement?.classList.remove('armed')
    if (d.dx >= COMMIT_PX) {
      try {
        navigator.vibrate?.(10)
      } catch {
        /* not supported */
      }
      onSwipe()
    }
  }
  // A drag shouldn't also count as a tap on the row.
  const click = (e: MouseEvent) => {
    if (swallowClick.current) {
      swallowClick.current = false
      e.stopPropagation()
      e.preventDefault()
    }
  }

  return (
    <div className="swipe">
      {enabled && (
        <div className="swipe-under" aria-hidden="true">
          <svg viewBox="0 0 16 16">
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
          {label}
        </div>
      )}
      <div
        ref={face}
        className="swipe-face"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={click}
      >
        {children}
      </div>
    </div>
  )
}
