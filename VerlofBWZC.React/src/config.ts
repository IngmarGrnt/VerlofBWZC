// Adres van de API. Lokaal leeg: /api/... gaat via de Vite-dev-server naar de API van Aspire (vite.config.ts).
// In productie uit .env.production (zelfde API als de Blazor-website).
const base = import.meta.env.VITE_API_BASE_ADDRESS ?? ''

export const apiBaseAddress = base.endsWith('/') || base === '' ? base : `${base}/`

export const apiUrl = (path: string) => `${apiBaseAddress}${path.replace(/^\//, '')}`
