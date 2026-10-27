import { useRef, useState } from 'react'
import { apiRequest, uploadImage } from '../api.js'
import Avatar from './Avatar.jsx'

const MAX_BYTES = 5 * 1024 * 1024

/**
 * Foto do próprio perfil. Passar o mouse mostra "Alterar"; clicar abre o
 * seletor de arquivo e a foto sobe na hora, sem esperar o "Salvar alterações"
 * do formulário — igual à capa do projeto.
 */
export default function ProfilePhotoField({ foto, onChange, onFeedback }) {
  const inputRef = useRef(null)
  const [isBusy, setIsBusy] = useState(false)

  async function handleFile(event) {
    const file = event.target.files[0]
    // Zera o campo para escolher o mesmo arquivo de novo disparar `change`.
    event.target.value = ''
    if (!file) return

    // Os mesmos limites do servidor, checados antes para não subir à toa.
    if (!file.type.startsWith('image/')) {
      onFeedback({ message: 'Envie um arquivo de imagem.', type: 'error' })
      return
    }
    if (file.size > MAX_BYTES) {
      onFeedback({ message: 'A imagem deve ter no máximo 5 MB.', type: 'error' })
      return
    }

    setIsBusy(true)
    try {
      const data = await uploadImage('/api/users/me/foto', file)
      onChange(data.foto)
      onFeedback({ message: 'Foto de perfil atualizada.', type: 'success' })
    } catch (error) {
      onFeedback({ message: error.message, type: 'error' })
    } finally {
      setIsBusy(false)
    }
  }

  async function handleRemove() {
    setIsBusy(true)
    try {
      await apiRequest('/api/users/me/foto', { method: 'DELETE' })
      onChange(null)
      onFeedback({ message: 'Foto de perfil removida.', type: 'success' })
    } catch (error) {
      onFeedback({ message: error.message, type: 'error' })
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="profile-photo">
      <button
        className="account-avatar profile-photo-button"
        type="button"
        onClick={() => inputRef.current.click()}
        disabled={isBusy}
        aria-label={foto ? 'Alterar foto de perfil' : 'Adicionar foto de perfil'}
        data-busy={isBusy || undefined}
      >
        <Avatar foto={foto} size={34} />
        <span className="profile-photo-overlay" aria-hidden="true">
          {isBusy ? '...' : <CameraIcon />}
          <span>{isBusy ? 'Enviando' : foto ? 'Alterar' : 'Adicionar'}</span>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleFile}
      />
      {foto && (
        <button
          className="text-button profile-photo-remove"
          type="button"
          onClick={handleRemove}
          disabled={isBusy}
        >
          Remover
        </button>
      )}
    </div>
  )
}

function CameraIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}
