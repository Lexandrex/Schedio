import { Navigate, Route, Routes } from 'react-router-dom'
import AuthLayout from './layouts/AuthLayout.jsx'
import RequireAuth from './routes/RequireAuth.jsx'
import HomePage from './pages/HomePage.jsx'
import EditorPage from './pages/EditorPage.jsx'
import CanvasPage from './pages/CanvasPage.jsx'
import ProjectDetailPage from './pages/ProjectDetailPage.jsx'
import ProjectReaderPage from './pages/ProjectReaderPage.jsx'
import AccountPage from './pages/AccountPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import VerifyEmailPage from './pages/VerifyEmailPage.jsx'
import RecoverEmailPage from './pages/RecoverEmailPage.jsx'
import RecoverCodePage from './pages/RecoverCodePage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<RequireAuth />}>
        <Route path="/" element={<HomePage />} />
        <Route path="editor" element={<EditorPage />} />
        <Route path="editor/:id" element={<CanvasPage />} />
        <Route path="projeto/:id" element={<ProjectDetailPage />} />
        <Route path="projeto/:id/ler" element={<ProjectReaderPage />} />
        <Route path="conta" element={<AccountPage />} />
      </Route>

      <Route element={<AuthLayout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="recover-email" element={<RecoverEmailPage />} />
        <Route path="recover-code" element={<RecoverCodePage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
