import { postJson } from '../api/http'
import { AdminTokenKey, AuthTokenKey, getItem, removeItem, setItem } from '../auth/tokens'
import { getClaim, getUserRole, isDemo } from '../auth/jwt'
import { chipText } from '../rules'

// Zelfde als VerlofBWZC/Services/DemoModeService.cs: demo modus (enkel Admin), de app bekijken als een gekozen rol,
// ploeg en specialiteit. De echte admin-token wordt bewaard als "adminToken" en bij Stoppen teruggezet.

export interface ScopeItemDTO {
  team: string
  speciality?: string | null
}

export interface DemoInfo {
  role: string
  team: string
  speciality: string
  // Bij Manager de extra ploegen, bv. "Ploeg2 · IGS", "Ploeg3 · alle specialiteiten"
  extra: string[]
  scopes: ScopeItemDTO[]
}

export function getActiveDemo(): DemoInfo | null {
  const token = getItem(AuthTokenKey)
  if (!isDemo(token)) return null
  const parts = (getClaim(token, 'demo_scopes') ?? '')
    .split(';')
    .filter(p => p.length > 0)
    .map(p => p.split(':'))
    .filter(b => b.length === 2)
  return {
    role: getUserRole(token) ?? '',
    team: getClaim(token, 'team') ?? '',
    speciality: getClaim(token, 'speciality') ?? '',
    extra: parts.map(b => (b[1] === '*' ? chipText(b[0], null) : chipText(b[0], b[1]))),
    scopes: parts.map(b => ({ team: b[0], speciality: b[1] === '*' ? null : b[1] })),
  }
}

// Enkel een echte (niet-demo) admin kan de demo modus starten
export function canStartDemo(): boolean {
  const token = getItem(AuthTokenKey)
  return !isDemo(token) && getUserRole(token) === 'Admin'
}

export async function startDemo(role: string, team: string, speciality: string, scopes?: ScopeItemDTO[] | null): Promise<string | null> {
  const current = getItem(AuthTokenKey)
  let adminToken = current
  const wasDemo = isDemo(current)
  if (wasDemo) {
    // Demo aanpassen: met de bewaarde admin-token een nieuwe demo aanvragen
    adminToken = getItem(AdminTokenKey)
    if (!adminToken || !adminToken.trim()) return 'Demo aanpassen mislukt: stop de demo en start ze opnieuw.'
    setItem(AuthTokenKey, adminToken)
  }

  let token: string | null = null
  try {
    const response = await postJson('api/person/demo', { role, team, speciality, scopes: scopes ?? [] })
    if (response.ok) token = ((await response.json()) as { token?: string | null }).token ?? null
  } catch {
    token = null
  }
  if (!token || !token.trim()) {
    // Mislukt: de lopende demo behouden
    if (wasDemo && current) setItem(AuthTokenKey, current)
    return 'Demo modus starten mislukt.'
  }

  setItem(AdminTokenKey, adminToken ?? '')
  setItem(AuthTokenKey, token)
  // Alles opnieuw laden als de gekozen rol; bij aanpassen op dezelfde pagina blijven
  if (wasDemo) window.location.reload()
  else window.location.assign('/')
  return null
}

export function stopDemo() {
  const adminToken = getItem(AdminTokenKey)
  removeItem(AdminTokenKey)
  if (!adminToken || !adminToken.trim()) removeItem(AuthTokenKey)
  else setItem(AuthTokenKey, adminToken)
  window.location.assign(!adminToken || !adminToken.trim() ? '/login' : '/')
}
