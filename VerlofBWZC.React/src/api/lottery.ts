import { getJson, postJson, send } from './http'
import { parseDate } from '../util/dotnet'

// Zelfde als VerlofBWZC/Services/LotteryApiService.cs: lotingen, gedeeld door de teamkalender (popup) en de loterijpagina

export interface LotteryPersonDTO {
  personId: number
  firstName: string
  lastName: string
  // Enkel verliezers: bij toepassen weggehaald verlof (terugzetten bij verwijderen van de loting)
  removedDay: boolean
  removedNight: boolean
  dayLeaveCategoryId?: number | null
  nightLeaveCategoryId?: number | null
}

export interface LotteryDrawDTO {
  drawNumber: number
  drawName: string
  fromDate: string // DateTime zoals de API hem geeft ("2027-01-03T00:00:00")
  toDate: string
  shift?: string | null // "D" of "N" = enkel die shift; null = alle shiften in de periode
  createdAtUtc: string
  winners: LotteryPersonDTO[]
  losers: LotteryPersonDTO[]
}

// Verlof dat teruggezet werd bij het verwijderen van een toegepaste loting
export interface RestoredDayOffDTO {
  personId: number
  date: string
  shift: string
  leaveCategoryId?: number | null
}

export interface LotteryResult<T> {
  ok: boolean
  value: T | null
  error: string | null
}

export interface Stats {
  won: number
  lost: number
}

async function errorText(resp: Response, fallback: string): Promise<string> {
  const text = await resp.text()
  if (resp.status === 403 && !text.trim()) return 'Je hebt hier geen rechten voor (of opslaan is momenteel niet toegelaten).'
  return !text.trim() || text.trimStart().startsWith('{') ? `${fallback} (${resp.status}).` : text
}

const message = (ex: unknown) => (ex instanceof Error ? ex.message : String(ex))

export const lotteryApi = {
  async getDraws(): Promise<LotteryDrawDTO[]> {
    try {
      return (await getJson<LotteryDrawDTO[] | null>('api/lottery/draws')) ?? []
    } catch {
      return []
    }
  },

  // Aantal gewonnen/verloren lotingen per persoon in een jaar
  statsFor(draws: LotteryDrawDTO[], year: number): Map<number, Stats> {
    const result = new Map<number, Stats>()
    for (const d of draws.filter(d => parseDate(d.fromDate).getFullYear() === year)) {
      for (const w of d.winners) {
        const s = result.get(w.personId)
        result.set(w.personId, s ? { ...s, won: s.won + 1 } : { won: 1, lost: 0 })
      }
      for (const l of d.losers) {
        const s = result.get(l.personId)
        result.set(l.personId, s ? { ...s, lost: s.lost + 1 } : { won: 0, lost: 1 })
      }
    }
    return result
  },

  // Toegepast = er werd al verlof weggehaald bij een verliezer
  isApplied: (draw: LotteryDrawDTO) => draw.losers.some(l => l.removedDay || l.removedNight),

  // Bewaart de loting; geeft het (eventueel door de server aangepaste) volgnummer terug
  async create(draw: LotteryDrawDTO): Promise<LotteryResult<number>> {
    try {
      const resp = await postJson('api/lottery/draw', draw)
      if (!resp.ok) return { ok: false, value: 0, error: await errorText(resp, 'Opslaan van de loting mislukt') }
      let number: number
      try {
        number = (await resp.json()) as number
      } catch {
        number = draw.drawNumber
      }
      return { ok: true, value: number, error: null }
    } catch (ex) {
      return { ok: false, value: 0, error: message(ex) }
    }
  },

  // Verliezers verliezen hun verlof op de shift(en) van de loting; geeft het weggehaalde verlof terug
  async apply(drawNumber: number): Promise<LotteryResult<RestoredDayOffDTO[]>> {
    try {
      const resp = await send(`api/lottery/draw/${drawNumber}/apply`, { method: 'POST' })
      if (!resp.ok) return { ok: false, value: null, error: await errorText(resp, 'Toepassen mislukt') }
      return { ok: true, value: ((await resp.json()) as RestoredDayOffDTO[] | null) ?? [], error: null }
    } catch (ex) {
      return { ok: false, value: null, error: message(ex) }
    }
  },

  // Verwijdert de loting; toegepast verlof wordt teruggezet en teruggegeven
  async remove(drawNumber: number): Promise<LotteryResult<RestoredDayOffDTO[]>> {
    try {
      const resp = await send(`api/lottery/draw/${drawNumber}`, { method: 'DELETE' })
      if (!resp.ok) return { ok: false, value: null, error: await errorText(resp, 'Verwijderen mislukt') }
      return { ok: true, value: ((await resp.json()) as RestoredDayOffDTO[] | null) ?? [], error: null }
    } catch (ex) {
      return { ok: false, value: null, error: message(ex) }
    }
  },
}
