import UserIcon from './UserIcon.jsx'

/** Foto de perfil, ou o ícone genérico para quem ainda não enviou uma. */
export default function Avatar({ foto, size = 20 }) {
  if (foto) return <img className="avatar-photo" src={foto} alt="" draggable="false" />
  return <UserIcon size={size} />
}
