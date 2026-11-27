// Hidden categories (is_active = false) stay on the transactions and bills
// that already use them, so the app loads every category. Pick lists show
// only the visible ones, plus the one a row already has, so opening and
// saving an old transaction never silently changes its category.
export function pickable<T extends { id: string; is_active: boolean }>(categories: T[], currentId?: string | null): T[] {
  return categories.filter((c) => c.is_active || c.id === currentId)
}
