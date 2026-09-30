// Zelfde als VerlofBWZC/Handler/JwtUtils.cs en TokenService.IsExpired: claims uit het token lezen (zonder controle,
// dat doet de API).

type Payload = Record<string, unknown>

export function decodePayload(token: string | null | undefined): Payload | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    if (payload.length % 4 === 2) payload += '=='
    else if (payload.length % 4 === 3) payload += '='
    const bytes = Uint8Array.from(atob(payload), c => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as Payload
  } catch {
    return null
  }
}

const NameIdentifier = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'
const MsRole = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'

export function getUserId(token: string | null | undefined): string | null {
  const p = decodePayload(token)
  if (!p) return null
  const id = p[NameIdentifier] ?? p.sub
  return typeof id === 'string' ? id : null
}

// Zoals GetUserRolFromToken: role, anders roles (eerste), anders de MS-claim
export function getUserRole(token: string | null | undefined): string | null {
  const p = decodePayload(token)
  if (!p) return null
  if ('role' in p) return typeof p.role === 'string' ? p.role : null
  if ('roles' in p) {
    const roles = p.roles
    if (Array.isArray(roles)) return typeof roles[0] === 'string' ? roles[0] : null
    return typeof roles === 'string' ? roles : null
  }
  if (MsRole in p) return typeof p[MsRole] === 'string' ? (p[MsRole] as string) : null
  return null
}

// Losse string-claim (bv. "team", "speciality", "demo")
export function getClaim(token: string | null | undefined, name: string): string | null {
  const v = decodePayload(token)?.[name]
  return typeof v === 'string' ? v : null
}

// Demo modus: admin bekijkt de app als een andere rol/ploeg/specialiteit
export const isDemo = (token: string | null | undefined) => getClaim(token, 'demo') === 'true'

// Beperkt token na een tijdelijk of zwak wachtwoord: eerst een nieuw wachtwoord kiezen
export const mustChangePassword = (token: string | null | undefined) => getClaim(token, 'pwd_change') === 'true'

// Token verlopen (of binnen de minuut)?
export function isExpired(token: string | null | undefined): boolean {
  if (!token || !token.trim()) return true
  const exp = decodePayload(token)?.exp
  if (typeof exp !== 'number') return true
  return Date.now() >= (exp - 60) * 1000
}
