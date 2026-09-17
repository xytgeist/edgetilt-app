import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { inputBase } from '../shell/shellClasses'

/**
 * Email/password auth field with a show/hide control.
 * Used on Sign in, Create account, and the reset-password page.
 */
export default function AuthPasswordField({
  id,
  value,
  onChange,
  placeholder = 'Password',
  autoComplete = 'current-password',
  enterKeyHint = 'go',
  required = true,
}) {
  const [visible, setVisible] = useState(false)
  const reactId = useId()
  const inputId = id || `auth-password-${reactId}`
  const shown = visible === true

  return (
    <div className="relative" data-auth-password-field>
      <input
        id={inputId}
        type={shown ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputBase} pr-14`}
        autoComplete={autoComplete}
        inputMode="text"
        enterKeyHint={enterKeyHint}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required={required}
      />
      <button
        type="button"
        data-auth-password-toggle
        className="absolute right-1.5 top-1/2 z-[1] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-100 touch-manipulation"
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        aria-controls={inputId}
        onClick={() => setVisible((v) => !v)}
      >
        {shown ? <EyeOff className="h-5 w-5" strokeWidth={2} /> : <Eye className="h-5 w-5" strokeWidth={2} />}
      </button>
    </div>
  )
}
