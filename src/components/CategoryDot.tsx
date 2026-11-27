import type { CSSProperties } from 'react'
import { categoryColor } from '../lib/categoryColor'

// A small colored dot for a category. Renders nothing for "no category".
export function CategoryDot({ id }: { id: string | null | undefined }) {
  const color = categoryColor(id)
  if (!color) return null
  return <span className="cat-dot" style={{ '--cat': color } as CSSProperties} aria-hidden="true" />
}

// The category's name as a tinted tag.
export function CategoryTag({ id, name }: { id: string | null | undefined; name: string }) {
  const color = categoryColor(id)
  if (!color) return null
  return (
    <span className="cat-tag" style={{ '--cat': color } as CSSProperties}>
      {name}
    </span>
  )
}
