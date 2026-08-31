import { useRef } from 'react'

const LENGTH = 6

export default function CodeInput({ value, onChange, ariaLabel }) {
  const inputRefs = useRef([])
  const digits = value.padEnd(LENGTH, ' ').split('').map((char) => char.trim())

  function handleChange(index, rawValue) {
    const char = rawValue.replace(/\D/g, '').slice(-1)
    const nextDigits = [...digits]
    nextDigits[index] = char
    onChange(nextDigits.join('').trimEnd())

    if (char) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index, event) {
    if (event.key === 'Backspace' && !digits[index]) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  return (
    <div className="code-inputs" aria-label={ariaLabel}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => (inputRefs.current[index] = element)}
          inputMode="numeric"
          maxLength={1}
          aria-label={`Dígito ${index + 1}`}
          value={digit}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
        />
      ))}
    </div>
  )
}
