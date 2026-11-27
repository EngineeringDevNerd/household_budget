// Each category gets a color from this set, chosen from its id, so the color
// stays the same when the category is renamed. With more categories than
// colors, two can share one.
const PALETTE = [
  '#2f8fd8', // blue
  '#e0862f', // orange
  '#c73fa8', // magenta
  '#7a5cff', // violet
  '#e0453b', // red
  '#13a37f', // teal
  '#d6a419', // gold
  '#5b6fe0', // indigo
  '#3aa83f', // green
  '#e05c8a', // pink
  '#0f9fb8', // cyan
  '#8a6b4e', // brown
]

export function categoryColor(id: string | null | undefined): string | null {
  if (!id) return null
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}
