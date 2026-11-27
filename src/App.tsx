import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { HomePage } from './features/home/HomePage'

// Hash routing (/#/bills) because GitHub Pages can't rewrite deep links to
// index.html; a refresh on /household_budget/bills would 404 otherwise.
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
