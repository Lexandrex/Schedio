import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import UserIcon from './UserIcon.jsx'

export default function AccountMenu({ children }) {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return undefined

    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  return (
    <div className="avatar-menu" ref={menuRef}>
      <button
        className="avatar-button"
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-haspopup="true"
        aria-expanded={menuOpen}
        aria-label="Menu da conta"
      >
        <UserIcon />
      </button>

      {menuOpen && (
        <div className="avatar-dropdown" role="menu" onClick={() => setMenuOpen(false)}>
          <p className="avatar-dropdown-email">{user.email}</p>
          {children}
          <button type="button" onClick={logout}>
            Sair
          </button>
        </div>
      )}
    </div>
  )
}
