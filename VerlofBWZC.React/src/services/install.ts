import { getItem, setItem } from '../auth/tokens'

// Zelfde als window.bwzcInstall (index.html van de Blazor-website) en VerlofBWZC/Services/AppInstallService.cs:
// app installeren op de gsm (PWA). Android/Chrome/Edge: de installatievraag van de browser bewaren tot de gebruiker
// op "Installeren" tikt. iPhone/iPad: geen knop mogelijk, enkel uitleg (Delen > Zet op beginscherm).

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallState {
  canPrompt: boolean
  standalone: boolean
  ios: boolean
  mobile: boolean
}

// Al geïnstalleerd (geopend als app) = niets tonen; anders installatievraag (canPrompt) of uitleg
export const canInstall = (s: InstallState) => !s.standalone

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const changed = () => listeners.forEach(l => l())

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  deferred = e as BeforeInstallPromptEvent
  changed()
})
window.addEventListener('appinstalled', () => {
  deferred = null
  changed()
})

export function onInstallChanged(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function installState(): InstallState {
  const ua = navigator.userAgent || ''
  return {
    canPrompt: !!deferred,
    standalone: window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
    ios: /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    mobile: window.matchMedia('(max-width: 768px)').matches || /android|iphone|ipad|ipod/i.test(ua),
  }
}

// Android/Chrome: de installatievraag van de gsm. Geeft "accepted", "dismissed" of "unavailable".
export async function promptInstall(): Promise<string> {
  let outcome: string
  try {
    if (!deferred) {
      outcome = 'unavailable'
    } else {
      const e = deferred
      deferred = null
      void e.prompt()
      outcome = (await e.userChoice).outcome
    }
  } catch {
    outcome = 'unavailable'
  }
  changed()
  return outcome
}

// "Later": de melding 2 weken niet meer tonen (enkel in deze browser). Zelfde sleutel als Blazor; die bewaart
// .NET-ticks (100 ns sinds 1-1-0001 UTC), dus hier ook, zodat beide websites dezelfde keuze zien.
const LaterKey = 'bwzcInstallLater'
const LaterForMs = 14 * 24 * 60 * 60 * 1000
const TicksAtUnixEpoch = 621355968000000000n

export function isSnoozed(): boolean {
  try {
    const value = getItem(LaterKey)
    if (!value || !/^\d+$/.test(value)) return false
    const ms = Number((BigInt(value) - TicksAtUnixEpoch) / 10000n)
    return Date.now() - ms < LaterForMs
  } catch {
    return false
  }
}

export function snooze() {
  const ticks = BigInt(Date.now()) * 10000n + TicksAtUnixEpoch
  setItem(LaterKey, ticks.toString())
}
