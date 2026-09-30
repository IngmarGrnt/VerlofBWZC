// .NET-gedrag dat de Blazor-website gebruikt: DateTime.ToString(format, cultuur), datums van/naar de API, "0.##".
// De namen komen uit de ICU-gegevens van .NET WebAssembly (zoals de Blazor-website ze toont): nl-BE met punt
// na afgekorte maanden ("jan.", "mrt.", maar "mei"), dagen zonder punt ("ma", "di").

export type Culture = 'nl-BE' | 'current'

interface CultureNames {
  days: string[]
  abbrDays: string[]
  months: string[]
  abbrMonths: string[]
}

const nl: CultureNames = {
  days: ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'],
  abbrDays: ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'],
  months: ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'],
  abbrMonths: ['jan.', 'feb.', 'mrt.', 'apr.', 'mei', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'],
}

const en: CultureNames = {
  days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  abbrDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  abbrMonths: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}

// CultureInfo.CurrentCulture in Blazor WebAssembly = taal van de browser
const namesFor = (culture: Culture): CultureNames =>
  culture === 'nl-BE' ? nl : (navigator.language || 'en').toLowerCase().startsWith('nl') ? nl : en

const pad = (n: number, len = 2) => String(n).padStart(len, '0')

// Zoals DateTime.ToString(format, culture) voor de aangepaste opmaakcodes die de website gebruikt:
// d dd ddd dddd M MM MMM MMMM yy yyyy H HH h hh m mm s ss tt, '%d', letterlijke tekst tussen '...' of "...", \x
export function formatDate(date: Date, format: string, culture: Culture = 'current'): string {
  const names = namesFor(culture)
  // "%d" = enkel het dagnummer (één opmaakcode)
  if (format.length === 2 && format[0] === '%') format = format[1]
  let out = ''
  let i = 0
  while (i < format.length) {
    const ch = format[i]
    if (ch === "'" || ch === '"') {
      const end = format.indexOf(ch, i + 1)
      out += format.slice(i + 1, end < 0 ? format.length : end)
      i = end < 0 ? format.length : end + 1
      continue
    }
    if (ch === '\\') {
      out += format[i + 1] ?? ''
      i += 2
      continue
    }
    let run = 1
    while (format[i + run] === ch) run++
    switch (ch) {
      case 'd':
        out += run === 1 ? String(date.getDate()) : run === 2 ? pad(date.getDate()) : run === 3 ? names.abbrDays[date.getDay()] : names.days[date.getDay()]
        break
      case 'M':
        out += run === 1 ? String(date.getMonth() + 1) : run === 2 ? pad(date.getMonth() + 1) : run === 3 ? names.abbrMonths[date.getMonth()] : names.months[date.getMonth()]
        break
      case 'y':
        out += run <= 2 ? pad(date.getFullYear() % 100) : pad(date.getFullYear(), run)
        break
      case 'H':
        out += run === 1 ? String(date.getHours()) : pad(date.getHours())
        break
      case 'h': {
        const h = date.getHours() % 12 || 12
        out += run === 1 ? String(h) : pad(h)
        break
      }
      case 'm':
        out += run === 1 ? String(date.getMinutes()) : pad(date.getMinutes())
        break
      case 's':
        out += run === 1 ? String(date.getSeconds()) : pad(date.getSeconds())
        break
      case 't':
        out += (date.getHours() < 12 ? 'AM' : 'PM').slice(0, run === 1 ? 1 : 2)
        break
      default:
        out += ch.repeat(run)
    }
    i += run
  }
  return out
}

// Zoals Capitalize in de Blazor-pagina's: eerste letter hoofdletter
export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

// DateTime van de API ("2027-01-03T00:00:00", zonder tijdzone) als lokale datum
export function parseDate(value: string | Date | null | undefined): Date {
  if (value instanceof Date) return value
  if (!value) return new Date(NaN)
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value)
  if (!m) return new Date(value)
  if (m[8]) return new Date(value) // met tijdzone (bv. UTC "…Z")
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), m[7] ? +m[7].slice(0, 3).padEnd(3, '0') : 0)
}

// DateTime naar de API, zoals System.Text.Json een DateTime (Kind Unspecified) schrijft: "2027-01-03T00:00:00"
export function toApiDate(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// Enkel de datum (DateTime.Date)
export const dateOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds())

// Zoals double.ToString("0.##") in de huidige cultuur (nl: komma)
export function format0dd(n: number, culture: Culture = 'current'): string {
  const rounded = Math.round(n * 100) / 100
  const text = String(rounded)
  return namesFor(culture) === nl ? text.replace('.', ',') : text
}
