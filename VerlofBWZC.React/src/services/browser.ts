import { AuthTokenKey, getItem } from '../auth/tokens'
import { getUserId } from '../auth/jwt'
import { personApi, type PersonBaseDTO } from '../api/person'

// Hulpfuncties uit index.html en de services van de Blazor-website

// window.bwzcIsMobile: gsm/tablet (<= 768px)
export const isMobile = () => window.matchMedia('(max-width: 768px)').matches

// window.bwzcScrollToId: rij in beeld brengen (teamkalender)
export const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ block: 'center', behavior: 'smooth' })

// export.js (geladen in index.html, net als bij Blazor)
declare global {
  interface Window {
    downloadFile?: (fileName: string, contentType: string, content: string) => void
    exportElementToPdf?: (
      elementId: string,
      fileName: string,
      titleText: string,
      orientation?: string,
      fitOnePage?: boolean,
      compress?: boolean,
      hideSelector?: string | null,
      marginMm?: number,
    ) => Promise<void>
    hasExportFns?: () => boolean
  }
}

// CurrentPersonService: de ingelogde persoon (in demo modus de gekozen demo-waarden)
export async function getCurrentPerson(): Promise<PersonBaseDTO | null> {
  const id = Number.parseInt(getUserId(getItem(AuthTokenKey)) ?? '', 10)
  return Number.isInteger(id) ? await personApi.getPersonById(id) : null
}

export const isAdminPerson = (p: PersonBaseDTO | null | undefined) => (p?.role ?? '').toLowerCase() === 'admin'
