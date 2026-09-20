/** GoTrue hides missing-user vs bad-password behind the same sign-in error. */
export function isInvalidLoginCredentialsError(error) {
  const code = String(error?.code || '').toLowerCase()
  if (
    code === 'invalid_credentials' ||
    code === 'user_not_found' ||
    code === 'email_not_found' ||
    code === 'invalid_grant'
  ) {
    return true
  }
  const lower = String(error?.message || '').toLowerCase()
  if (!lower) return false
  if (lower.includes('email not confirmed') || lower.includes('not confirmed')) return false
  return (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid_credentials') ||
    lower.includes('user not found') ||
    lower.includes('email not found') ||
    lower.includes('no user found')
  )
}

export function isEmailAlreadyRegisteredSignup(error, data) {
  const lower = String(error?.message || '').toLowerCase()
  if (
    lower.includes('already registered') ||
    lower.includes('already exists') ||
    lower.includes('user already')
  ) {
    return true
  }
  return Boolean(data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)
}
