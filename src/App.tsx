import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { AuthGate } from './features/auth/AuthGate'
import { AuthProvider } from './features/auth/AuthProvider'
import { BillsBoard } from './features/bills/BillsBoard'
import { PaychecksPage } from './features/paychecks/PaychecksPage'

// Hash routing (/#/bills) because GitHub Pages can't rewrite deep links to
// index.html; a refresh on /household_budget/bills would 404 otherwise.
export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <HashRouter>
          <Routes>
            <Route path="/" element={<BillsBoard />} />
            <Route path="/paychecks" element={<PaychecksPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </AuthGate>
    </AuthProvider>
  )
}
