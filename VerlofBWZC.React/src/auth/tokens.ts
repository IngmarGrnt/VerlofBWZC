import { apiUrl } from '../config'
import { isExpired } from './jwt'

// Zelfde als VerlofBWZC/Services/TokenService.cs: token (1 uur) en vernieuwingstoken ("ingelogd blijven") van dit
// toestel, in localStorage (dezelfde sleutels als de Blazor-website). Verlopen token: ongemerkt vernieuwen.
// Eén vernieuwing tegelijk, ook bij veel gelijktijdige API-oproepen. Vernieuwen gebeurt zonder de gewone API-hulp
// (geen Bearer-token, geen doorsturen naar login).

export const AuthTokenKey = 'authToken'
export const RefreshTokenKey = 'refreshToken'
export const RememberKey = 'rememberMe'
export const AdminTokenKey = 'adminToken' // demo modus

export type RefreshOutcome = 'Refreshed' | 'NoSession' | 'Offline'
export interface RefreshResult {
  outcome: RefreshOutcome
  token?: string | null
  demoEnded?: boolean
}

export interface LoginResultDTO {
  token: string
  refreshToken?: string | null
  mustChangePassword: boolean
}

export function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function setItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* opslag geblokkeerd: enkel deze sessie */
  }
}

export function removeItem(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* negeren */
  }
}

export const getAccessToken = () => getItem(AuthTokenKey)

// Na inloggen of wachtwoord wijzigen
export function store(token: string, refreshToken?: string | null, remember?: boolean) {
  setItem(AuthTokenKey, token)
  if (refreshToken) setItem(RefreshTokenKey, refreshToken)
  if (remember !== undefined) setItem(RememberKey, remember ? '1' : '0')
}

export const getRemember = () => getItem(RememberKey) === '1'

// Een geldig token: het huidige, of een vernieuwd. Null als er geen sessie (meer) is.
export async function getValidAccessToken(): Promise<string | null> {
  const token = getAccessToken()
  if (token && token.trim() && !isExpired(token)) return token
  const result = await refresh(token)
  return result.token ?? null
}

// Eén vernieuwing tegelijk (zoals de SemaphoreSlim in TokenService)
let gate: Promise<unknown> = Promise.resolve()

// Vernieuwen. failedToken = het token dat verlopen of geweigerd is (heeft een andere oproep intussen al
// vernieuwd, dan wordt dat nieuwe token gebruikt).
export function refresh(failedToken: string | null | undefined): Promise<RefreshResult> {
  const run = gate.then(() => doRefresh(failedToken))
  gate = run.catch(() => undefined)
  return run
}

async function doRefresh(failedToken: string | null | undefined): Promise<RefreshResult> {
  const current = getAccessToken()
  if (current && current.trim() && current !== failedToken && !isExpired(current)) return { outcome: 'Refreshed', token: current }

  const refreshToken = getItem(RefreshTokenKey)
  if (!refreshToken || !refreshToken.trim()) return { outcome: 'NoSession' }

  let response: Response
  try {
    response = await fetch(apiUrl('api/person/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
  } catch {
    return { outcome: 'Offline' } // geen netwerk: sessie niet weggooien
  }

  if (response.status === 401 || response.status === 400) {
    removeItem(RefreshTokenKey)
    return { outcome: 'NoSession' }
  }
  if (!response.ok) return { outcome: 'Offline' } // bv. te veel pogingen of server tijdelijk weg

  let result: LoginResultDTO | null = null
  try {
    result = (await response.json()) as LoginResultDTO
  } catch {
    result = null
  }
  if (!result || !result.token || !result.token.trim()) return { outcome: 'Offline' }

  setItem(AuthTokenKey, result.token)
  if (result.refreshToken && result.refreshToken.trim()) setItem(RefreshTokenKey, result.refreshToken)

  // Demo modus: het vernieuwde token is dat van de admin zelf, dus de demo stopt
  const demoEnded = !!getItem(AdminTokenKey)?.trim()
  if (demoEnded) removeItem(AdminTokenKey)

  return { outcome: 'Refreshed', token: result.token, demoEnded }
}

// Uitloggen op dit toestel: vernieuwingstoken intrekken op de server en alles lokaal wissen
export async function logout() {
  const refreshToken = getItem(RefreshTokenKey)
  if (refreshToken && refreshToken.trim()) {
    try {
      await fetch(apiUrl('api/person/logout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
    } catch {
      /* offline: het token verloopt vanzelf */
    }
  }
  clear()
}

export function clear() {
  removeItem(AuthTokenKey)
  removeItem(RefreshTokenKey)
  removeItem(AdminTokenKey)
}
