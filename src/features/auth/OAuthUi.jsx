export function OAuthDivider() {
  return (
    <div className="relative py-1">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <div className="w-full border-t border-gray-700" />
      </div>
      <div className="relative flex justify-center text-xs text-gray-500">
        <span className="bg-gray-900 px-3">or continue with</span>
      </div>
    </div>
  )
}

export function AppleIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M16.365 1.43c0 1.14-.42 2.23-1.18 3.05-.79.86-2.1 1.52-3.22 1.43-.13-1.1.4-2.26 1.16-3.07.8-.87 2.2-1.52 3.24-1.41zM20.76 17.37c-.58 1.34-.86 1.93-1.61 3.11-1.05 1.64-2.53 3.68-4.36 3.7-1.63.02-2.05-1.06-4.27-1.05-2.22.01-2.68 1.08-4.32 1.06-1.83-.02-3.23-1.86-4.28-3.5C.37 17.4-.7 12.7 1.2 9.55c1.2-1.98 3.1-3.23 5.23-3.27 1.64-.03 3.18 1.1 4.19 1.1 1 0 2.88-1.36 4.86-1.16.83.03 3.15.33 4.64 2.52-3.75 2.06-3.15 7.43.64 8.63z"
      />
    </svg>
  )
}

export function GoogleIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}
