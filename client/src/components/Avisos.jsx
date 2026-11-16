import { useEffect, useState } from 'react'
import { apiRequest } from '../api.js'

/**
 * Avisos da plataforma para a própria pessoa — por exemplo, uma história dela
 * excluída por má conduta, ou a conta restaurada. Ficam no topo da tela
 * inicial e do /editor até ela marcar "Entendi".
 */
export default function Avisos() {
  const [avisos, setAvisos] = useState([])

  useEffect(() => {
    // Falhar aqui não pode atrapalhar a página: os avisos só não aparecem.
    apiRequest('/api/avisos')
      .then((data) => setAvisos(data?.avisos || []))
      .catch(() => setAvisos([]))
  }, [])

  async function marcarLido(id) {
    setAvisos((atuais) => atuais.filter((aviso) => aviso.id !== id))
    try {
      await apiRequest(`/api/avisos/${id}/lido`, { method: 'POST' })
    } catch {
      // Volta na próxima visita; nada a mostrar agora.
    }
  }

  if (!avisos.length) return null

  return (
    <section className="avisos" aria-label="Avisos da plataforma">
      {avisos.map((aviso) => (
        <div className="aviso" role="alert" key={aviso.id}>
          <p>{aviso.mensagem}</p>
          <button className="text-button" type="button" onClick={() => marcarLido(aviso.id)}>
            Entendi
          </button>
        </div>
      ))}
    </section>
  )
}
