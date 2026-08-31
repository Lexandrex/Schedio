import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

export default function AuthLayout() {
  const location = useLocation()
  const [feedback, setFeedback] = useState({ message: '', type: 'info' })

  useEffect(() => {
    setFeedback({
      message: location.state?.feedback || '',
      type: location.state?.feedbackType || 'info',
    })
  }, [location.pathname])

  return (
    <main className="auth-page">
      <Link className="brand" to="/login" aria-label="Schedio Drasis, voltar ao login">
        <span className="brand-mark">S</span>
        <span>Schedio Drasis</span>
      </Link>

      <section className="auth-shell" aria-live="polite">
        <Outlet context={{ setFeedback }} />
        <p className="feedback" role="status" data-type={feedback.type}>
          {feedback.message}
        </p>
      </section>
    </main>
  )
}
