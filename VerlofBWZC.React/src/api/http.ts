import { apiUrl } from '../config'
import * as tokens from '../auth/tokens'
import { isExpired } from '../auth/jwt'

// Zelfde als VerlofBWZC/Handler/AuthMessageHandler.cs: stuurt het token mee bij elke API-oproep.
// Verlopen token: eerst ongemerkt vernieuwen. Toch 401 met een token: één keer vernieuwen en opnieuw proberen;
// lukt dat niet, dan naar de loginpagina (volledig herladen, zoals NavigateTo(..., forceLoad: true)).

export interface RequestOptions {
  method?: string
  body?: unknown
  // Bewust een ander token meesturen (bv. demo modus); anders het bewaarde token
  token?: string | null
}

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function signOutAndRedirect() {
  tokens.clear()
  // Forceer een reload zodat UI-state (layouts/menus) schoon is
  window.location.assign('/login')
}

export async function send(path: string, options: RequestOptions = {}): Promise<Response> {
  let token = tokens.getAccessToken()
  let bearer: string | null = options.token !== undefined ? options.token : null

  if (token && token.trim() && isExpired(token)) {
    const refreshed = await tokens.refresh(token)
    if (refreshed.outcome === 'NoSession') {
      signOutAndRedirect()
      return new Response(null, { status: 401, statusText: 'Sessie verlopen' })
    }
    if (refreshed.demoEnded) window.location.reload() // demo modus is gestopt: pagina opnieuw laden
    // Header enkel vervangen als er (nog) geen of het verlopen token in staat
    if (refreshed.token && (bearer === null || bearer === token)) bearer = refreshed.token
    token = refreshed.token ?? token
  } else if (token && token.trim() && bearer === null) {
    bearer = token
  }

  const init = (auth: string | null): RequestInit => {
    const headers: Record<string, string> = {}
    if (auth) headers.Authorization = `Bearer ${auth}`
    if (options.body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8'
    return {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    }
  }

  let response = await fetch(apiUrl(path), init(bearer))

  // 401 met een token (sessie verlopen of ongeldig): vernieuwen en opnieuw proberen.
  // Zonder token (bv. inloggen met een fout wachtwoord) niet: dan toont de pagina zelf de fout.
  if (response.status === 401 && bearer) {
    const refreshed = await tokens.refresh(bearer)
    if (refreshed.token && refreshed.token !== bearer) {
      response = await fetch(apiUrl(path), init(refreshed.token))
      if (response.status !== 401) return response
    }
    if (refreshed.outcome !== 'Offline') signOutAndRedirect()
  }

  return response
}

// Zoals HttpClient.GetFromJsonAsync: fout bij een niet-geslaagd antwoord
export async function getJson<T>(path: string, options?: RequestOptions): Promise<T> {
  const response = await send(path, options)
  if (!response.ok) throw new HttpError(response.status, `Response status code does not indicate success: ${response.status} (${response.statusText}).`)
  return (await response.json()) as T
}

export const postJson = (path: string, body: unknown, options?: RequestOptions) => send(path, { ...options, method: 'POST', body })

// Zoals PersonApiService.ErrorAsync: de Nederlandse foutmelding van de server, anders de standaardtekst
export async function errorText(response: Response, fallback: string): Promise<string> {
  if (response.status === 403) return 'Je hebt hier geen rechten voor.'
  const text = (await response.text()).trim().replace(/^"+|"+$/g, '')
  return !text.trim() || text.startsWith('{') ? fallback : text
}

export const putJson = (path: string, body: unknown, options?: RequestOptions) => send(path, { ...options, method: 'PUT', body })

export const deleteRequest = (path: string, options?: RequestOptions) => send(path, { ...options, method: 'DELETE' })
