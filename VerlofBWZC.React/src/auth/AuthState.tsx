import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import * as tokens from './tokens'
import { getUserId, getUserRole } from './jwt'

// Zelfde als VerlofBWZC/Services/JwtAuthenticationStateProvider.cs + <CascadingAuthenticationState>:
// bij het opstarten één keer bepalen of iemand is aangemeld (verlopen token eerst ongemerkt vernieuwen),
// daarna enkel wijzigen via markAuthenticated / markLoggedOut.

export interface AuthUser {
  token: string
  id: string | null
  role: string | null
}

export type AuthStatus = { state: 'authorizing' } | { state: 'anonymous' } | { state: 'authenticated'; user: AuthUser }

const anonymous: AuthStatus = { state: 'anonymous' }
const fromToken = (token: string): AuthStatus => ({ state: 'authenticated', user: { token, id: getUserId(token), role: getUserRole(token) } })

let current: AuthStatus = { state: 'authorizing' }
const listeners = new Set<(s: AuthStatus) => void>()
const notify = (s: AuthStatus) => {
  current = s
  listeners.forEach(l => l(s))
}

// Zoals GetAuthenticationStateAsync
export async function getAuthenticationState(): Promise<AuthStatus> {
  const token = await tokens.getValidAccessToken()
  if (!token || !token.trim()) {
    // Verlopen token wissen; een vernieuwingstoken (bv. als er even geen netwerk was) blijft bewaard
    if (tokens.getAccessToken()?.trim()) tokens.removeItem(tokens.AuthTokenKey)
    return anonymous
  }
  return fromToken(token)
}

export function markAuthenticated(token: string, refreshToken?: string | null, remember?: boolean) {
  tokens.store(token, refreshToken, remember)
  notify(fromToken(token))
}

// Uitloggen: ook het vernieuwingstoken van dit toestel intrekken
export async function markLoggedOut() {
  await tokens.logout()
  notify(anonymous)
}

// Luisteren naar wijzigingen (zoals AuthenticationStateChanged)
export function onAuthStateChanged(listener: (s: AuthStatus) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const AuthContext = createContext<AuthStatus>(current)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(current)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(setStatus)
    let cancelled = false
    void getAuthenticationState().then(s => {
      if (!cancelled && current.state === 'authorizing') notify(s)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])
  return <AuthContext.Provider value={status}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
