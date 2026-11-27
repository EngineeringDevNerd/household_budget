import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { AuthGate } from './features/auth/AuthGate'
import { AuthProvider } from './features/auth/AuthProvider'
import { BillsBoard } from './features/bills/BillsBoard'
import { PaychecksPage } from './features/paychecks/PaychecksPage'
import { TransactionsPage } from './features/transactions/TransactionsPage'
import { ImportPage } from './features/import/ImportPage'
import { RulesPage } from './features/rules/RulesPage'
import { CategoriesPage } from './features/categories/CategoriesPage'
import { BudgetPage } from './features/budget/BudgetPage'

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
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </AuthGate>
    </AuthProvider>
  )
}
