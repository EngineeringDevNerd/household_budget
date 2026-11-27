import { useEffect } from 'react'

export type ToastState = { id: number; message: string; actionLabel?: string; onAction?: () => void }

// A short message above the tab bar, with an optional action such as Undo.
// It hides itself after a few seconds.
export function Toast({ toast, onDone, ms = 5000 }: { toast: ToastState | null; onDone: () => void; ms?: number }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDone, ms)
    return () => clearTimeout(t)
  }, [toast, onDone, ms])

  if (!toast) return null
  return (
    <div className="toast" role="status" key={toast.id}>
      <span>{toast.message}</span>
      {toast.actionLabel && toast.onAction && (
        <button
          className="toast-action"
          onClick={() => {
            toast.onAction?.()
            onDone()
          }}
        >
          {toast.actionLabel}
        </button>
      )}
    </div>
  )
}
