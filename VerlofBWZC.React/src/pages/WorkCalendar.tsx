import { useEffect, useReducer, useRef } from 'react'
import { Button } from '../radzen/Button'
import { Panel } from '../radzen/Misc'
import { DataGrid, type DataGridColumn } from '../radzen/DataGrid'
import { dialogService } from '../radzen/Dialog'
import { notificationService } from '../radzen/Notification'
import { parseStyle } from '../radzen/core'
import { getJson, postJson, send } from '../api/http'
import { personApi } from '../api/person'
import { AuthTokenKey, getItem } from '../auth/tokens'
import { getUserId } from '../auth/jwt'
import { NavigationLock, usePageTitle } from '../app/navigation'
import { askUnsavedChanges } from './UnsavedChangesDialog'
import { capitalize, dateOnly, formatDate, parseDate, sameDay, toApiDate } from '../util/dotnet'
import { hasNoRegime } from '../rules'

// Zelfde als VerlofBWZC/Pages/WorkCalendar.razor (@page "/workcalendar", [Authorize])
// Opgebouwd zoals het Blazor-component: velden in een ref (m), stateHasChanged() tekent opnieuw.

// --- DTO's (VerlofBWZC.DataContracts) ---------------------------------------------------------
// WorkDay (Date, Shift, LeaveCategoryId)
interface WorkDay {
  date: Date
  shift: string
  leaveCategoryId?: number | null
}
interface WorkDayJson {
  date: string
  shift: string
  leaveCategoryId?: number | null
}
interface MonthGroup {
  monthName: string
  workDays: WorkDay[]
}
interface DayOffDTO {
  date: string
  shift?: string | null
  leaveCategoryId?: number | null
}
interface CalendarPermissionsDTO {
  canSeeTeamCalendar: boolean
  canSaveWorkCalendar: boolean
  canSaveTeamCalendar: boolean
}
interface LeaveCategoryDTO {
  id: number
  team: string
  speciality: string
  year?: number | null
  name: string
  maxShifts: number
  color: string
  sortOrder: number
  mustBeConsecutive: boolean
}
interface QuarterLimitDTO {
  q1Max: number
  q2Max: number
  q3Max: number
  isDefault?: boolean
}
interface NameTranslationDTO {
  language: string
  text: string
}
interface HolidayJson {
  name?: NameTranslationDTO[] | null
  startDate: string
  endDate: string
  type?: string
}
interface Holiday {
  name?: NameTranslationDTO[] | null
  startDate: Date
  endDate: Date
}
interface ExtraShiftDTO {
  date: Date
  shift: string
  team: string
  note?: string | null
}
interface RestShiftDTO {
  date: Date
  shift: string
  // null = rust (Ploeg0); anders een andere afwezigheid of uurcode (Werkregels.OtherAbsences)
  code?: string | null
}
interface HolidayGridRow {
  dateText: string
  name: string
  type: string
  sortDate: Date
}

// Werkregels.OtherAbsences (andere afwezigheden en uurcodes, enkel Dispatching)
const otherAbsences: { code: string; name: string; absent: boolean }[] = [
  { code: 'AOV', name: 'Aanvraag onbetaald verlof', absent: true },
  { code: 'OV', name: 'Onbetaald verlof', absent: true },
  { code: 'ZK', name: 'Ziek', absent: true },
  { code: 'OUD', name: 'Ouderschapsverlof', absent: true },
  { code: 'O1', name: 'Omstandigheidsverlof', absent: true },
  { code: 'DV', name: 'Dienstvrijstelling', absent: true },
  { code: 'APL', name: 'Andere ploeg/plaats', absent: true },
  { code: 'AFL', name: 'Afgelost', absent: true },
  { code: '3U/', name: 'Eerste 3 uur verlof', absent: false },
  { code: '6U/', name: 'Eerste 6 uur verlof', absent: false },
  { code: '9U/', name: 'Eerste 9 uur verlof', absent: false },
  { code: '/3U', name: 'Laatste 3 uur verlof', absent: false },
  { code: '/6U', name: 'Laatste 6 uur verlof', absent: false },
  { code: '/9U', name: 'Laatste 9 uur verlof', absent: false },
]
const findOtherAbsence = (code: string | null | undefined) => (code == null ? undefined : otherAbsences.find(a => a.code === code))
// Werkregels.PairRulesApply: niet voor de ploeg zonder werkregime
const pairRulesApply = (team: string | null | undefined) => !hasNoRegime(team)

// QuarterLimitDTO.QuarterOf / MaxFor
const quarterOf = (date: Date) => Math.floor(date.getMonth() / 4) + 1
const maxFor = (q: QuarterLimitDTO, quarter: number) => (quarter === 1 ? q.q1Max : quarter === 2 ? q.q2Max : q.q3Max)
const quarterPeriod = (quarter: number) => (quarter === 1 ? 'jan–apr' : quarter === 2 ? 'mei–aug' : 'sep–dec')

// Math.Round van .NET (half naar even)
function roundHalfEven(x: number): number {
  const r = Math.round(x)
  return Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : r
}
const percent = (value: number, max: number) => (max <= 0 ? 0 : Math.min(100, roundHalfEven((100.0 * value) / max)))

const chipClass = (selected: boolean, hasCategory: boolean, isWeekend: boolean) =>
  'wc-chip' + (selected ? (hasCategory ? ' wc-chip-category' : ' wc-chip-selected') : '') + (!selected && isWeekend ? ' wc-chip-weekend' : '')

const shiftText = (shift: string) => (shift === 'D' ? 'dagshift' : 'nachtshift')

function chipTitle(day: WorkDay, category: LeaveCategoryDTO | undefined, holiday: string | null, school: string | null) {
  const parts = [`${formatDate(day.date, 'dddd d MMMM', 'nl-BE')} · ${shiftText(day.shift)}`]
  if (category) parts.push(category.name)
  if (holiday != null) parts.push(`Feestdag: ${holiday}`)
  if (school != null) parts.push(`Schoolvakantie: ${school}`)
  return parts.join(' · ')
}

// h.Name?.FirstOrDefault(n => n.Language == "NL")?.Text ?? h.Name?.FirstOrDefault()?.Text ?? fallback
const nameOf = (names: NameTranslationDTO[] | null | undefined, fallback: string) =>
  names?.find(n => n.language === 'NL')?.text ?? names?.[0]?.text ?? fallback

const nlMonths = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

// int.TryParse
const tryParseInt = (s: string | null | undefined) => (s != null && /^\s*[+-]?\d+\s*$/.test(s) ? Number.parseInt(s, 10) : null)

// Stabiel sorteren zoals LINQ OrderBy/ThenBy
function orderBy<T>(list: T[], ...keys: ((x: T) => number)[]): T[] {
  return list
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      for (const k of keys) {
        const d = k(a.item) - k(b.item)
        if (d !== 0) return d
      }
      return a.i - b.i
    })
    .map(x => x.item)
}
const shiftOrder = (shift: string) => (shift === 'D' ? 0 : 1)

const holidayColumns: DataGridColumn<HolidayGridRow>[] = [
  { property: r => r.dateText, title: 'Datum', width: '240px' },
  { property: r => r.name, title: 'Naam' },
  { property: r => r.type, title: 'Type', width: '160px' },
]

// De velden van het Blazor-component
class Model {
  personDaysOff: DayOffDTO[] = []
  monthGroups: MonthGroup[] = []
  selectedDays: WorkDay[] = []
  // Permissions from ManagerPanel rules
  perms: CalendarPermissionsDTO | null = null
  userId: string | null = null
  selectedYear = new Date().getFullYear() + 1
  // Niet-opgeslagen wijzigingen
  isDirty = false
  // Verlofcategorieën (bv. Groot verlof max 8) voor ploeg/specialiteit van de gebruiker
  categories: LeaveCategoryDTO[] = []
  activeCategoryId: number | null = null
  personTeam: string | null = null
  // Verlofaantal per jaar (ingesteld bij Personen); null = geen limiet
  leaveAllowance: number | null = null
  // Kwartaalmaxima (KW1 jan-apr, KW2 mei-aug, KW3 sep-dec), standaard 14/16/14
  quarterLimits: QuarterLimitDTO | null = null
  publicHolidays: Holiday[] = []
  schoolHolidays: Holiday[] = []
  // Extra shiften in een andere ploeg (Dispatching), aangeduid door een verantwoordelijke
  extraShifts: ExtraShiftDTO[] = []
  // Rust (Ploeg0) en andere afwezigheden/uurcodes (Dispatching), aangeduid door een verantwoordelijke
  restShifts: RestShiftDTO[] = []
  personName: string | null = null

  get canSaveWork() {
    return this.perms?.canSaveWorkCalendar ?? true
  }
  get minYear() {
    return new Date().getFullYear() - 1
  }
  get maxYear() {
    return new Date().getFullYear() + 10
  }
  get selectedYearDayOffCount() {
    return this.selectedDays.filter(d => d.date.getFullYear() === this.selectedYear).length
  }

  quarterUsage(quarter: number) {
    return this.selectedDays.filter(d => d.date.getFullYear() === this.selectedYear && quarterOf(d.date) === quarter).length
  }

  categoryUsage(categoryId: number) {
    return this.selectedDays.filter(d => d.leaveCategoryId === categoryId && d.date.getFullYear() === this.selectedYear).length
  }

  // Aansluitend: alle shiften van de categorie vormen één reeks in het werkrooster (vrije dagen ertussen tellen niet)
  isConsecutive(categoryId: number) {
    const roster = orderBy(
      this.monthGroups.flatMap(m => m.workDays),
      w => w.date.getTime(),
      w => shiftOrder(w.shift),
    )
    const positions = roster
      .map((w, i) => ({ w, i }))
      .filter(x => this.selectedDays.some(d => d.date.getTime() === x.w.date.getTime() && d.shift === x.w.shift && d.leaveCategoryId === categoryId))
      .map(x => x.i)
    return positions.length <= 1 || Math.max(...positions) - Math.min(...positions) + 1 === positions.length
  }

  // Verlof neem je normaal per 2 shiften: dagshift (D) op dag X + nachtshift (N) op dag X+1.
  // Een losse shift is een aangeduide shift waarvan de partner niet aangeduid is.
  // Ploeg zonder werkregime (Werkregels): daar gelden losse shiften en paren niet.
  isLoose(day: WorkDay) {
    if (!pairRulesApply(this.personTeam)) return false
    const d0 = dateOnly(day.date)
    const partnerDate = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + (day.shift === 'D' ? 1 : -1))
    const partnerShift = day.shift === 'D' ? 'N' : 'D'
    return !this.selectedDays.some(d => sameDay(d.date, partnerDate) && d.shift === partnerShift)
  }

  get looseShifts() {
    return orderBy(
      this.selectedDays.filter(d => d.date.getFullYear() === this.selectedYear && this.isLoose(d)),
      d => d.date.getTime(),
      d => shiftOrder(d.shift),
    )
  }

  publicHolidayName(date: Date) {
    const h = this.publicHolidays.find(x => sameDay(x.startDate, date))
    return h ? nameOf(h.name, 'Feestdag') : null
  }

  schoolHolidayName(date: Date) {
    const t = dateOnly(date).getTime()
    const h = this.schoolHolidays.find(x => dateOnly(x.startDate).getTime() <= t && dateOnly(x.endDate).getTime() >= t)
    return h ? nameOf(h.name, 'Schoolvakantie') : null
  }

  // Eigen shiften en extra shiften van een maand, in volgorde. Extra op een eigen shift (ploeg zonder werkregime): markering.
  chipItems(month: MonthGroup): { day: WorkDay | null; extra: ExtraShiftDTO | undefined }[] {
    const monthNr = month.workDays[0]?.date.getMonth()
    const own = month.workDays.map(d => ({ day: d as WorkDay | null, extra: this.extraShifts.find(x => sameDay(x.date, d.date) && x.shift === d.shift) }))
    const extra = this.extraShifts
      .filter(x => x.date.getMonth() === monthNr && !month.workDays.some(d => sameDay(d.date, x.date) && d.shift === x.shift))
      .map(x => ({ day: null as WorkDay | null, extra: x as ExtraShiftDTO | undefined }))
    return orderBy(
      [...own, ...extra],
      i => (i.day?.date ?? i.extra!.date).getTime(),
      i => shiftOrder(i.day?.shift ?? i.extra!.shift),
    )
  }

  getAllHolidaysForGrid(): HolidayGridRow[] {
    // Feestdagen groeperen op naam en datum (volgorde van de eerste keer, zoals GroupBy)
    const groups: { name: string; startDate: Date }[] = []
    for (const h of this.publicHolidays.filter(x => x.startDate.getFullYear() === this.selectedYear)) {
      const name = nameOf(h.name, '')
      if (!groups.some(g => g.name === name && g.startDate.getTime() === h.startDate.getTime())) groups.push({ name, startDate: h.startDate })
    }
    const holidays = orderBy(
      groups.map(g => ({ dateText: formatDate(g.startDate, 'dd-MM-yyyy'), name: g.name, type: 'Feestdag', sortDate: g.startDate })),
      r => r.sortDate.getTime(),
    )

    // Schoolvakanties groeperen op naam en overlappende periodes
    const vacationGroups: { name: string; start: Date; end: Date }[] = []
    const processed = new Set<number>()
    const list = this.schoolHolidays
    for (let i = 0; i < list.length; i++) {
      if (processed.has(i)) continue

      const current = list[i]
      const name = nameOf(current.name, '')

      // Vind alle overlappende vakanties met dezelfde naam
      const group = [i]
      let minStart = current.startDate
      let maxEnd = current.endDate

      for (let j = 0; j < list.length; j++) {
        if (i === j || processed.has(j)) continue

        const other = list[j]
        const otherName = nameOf(other.name, '')

        // Zelfde naam en overlappende periode
        if (name === otherName && other.startDate.getTime() <= maxEnd.getTime() && other.endDate.getTime() >= minStart.getTime()) {
          group.push(j)
          minStart = minStart.getTime() < other.startDate.getTime() ? minStart : other.startDate
          maxEnd = maxEnd.getTime() > other.endDate.getTime() ? maxEnd : other.endDate
        }
      }

      // Markeer alle als verwerkt
      for (const idx of group) processed.add(idx)

      vacationGroups.push({ name, start: minStart, end: maxEnd })
    }

    const vacations = orderBy(
      vacationGroups
        .filter(g => g.name.trim() !== '')
        .map(g => ({
          dateText: `van ${formatDate(g.start, 'dd-MM-yyyy')} tot ${formatDate(g.end, 'dd-MM-yyyy')}`,
          name: g.name,
          type: 'Schoolvakantie',
          sortDate: g.start,
        })),
      r => r.sortDate.getTime(),
    )

    return [...holidays, ...vacations]
  }
}

const toWorkDay = (w: WorkDayJson): WorkDay => ({ date: parseDate(w.date), shift: w.shift, leaveCategoryId: w.leaveCategoryId ?? null })
const toHoliday = (h: HolidayJson): Holiday => ({ name: h.name, startDate: parseDate(h.startDate), endDate: parseDate(h.endDate) })

export function WorkCalendar() {
  usePageTitle('Werkkalender')
  const ref = useRef<Model | null>(null)
  if (!ref.current) ref.current = new Model()
  const m = ref.current
  const [, forceRender] = useReducer((x: number) => x + 1, 0)
  const alive = useRef(true)
  const stateHasChanged = () => {
    if (alive.current) forceRender()
  }

  // Waarschuwingen na het aanduiden van een shift: verlofaantal en kwartaalmaximum (opslaan blijft mogelijk)
  const warnIfOverLimits = (date: Date) => {
    if (m.leaveAllowance != null && m.selectedYearDayOffCount > m.leaveAllowance) {
      notificationService.notify(
        'Warning',
        'Verlofaantal overschreden',
        `Je hebt ${m.selectedYearDayOffCount} verlofshiften aangeduid in ${m.selectedYear}, maar je verlofaantal is ${m.leaveAllowance}.`,
        5000,
      )
    }

    if (m.quarterLimits && date.getFullYear() === m.selectedYear) {
      const quarter = quarterOf(date)
      const used = m.quarterUsage(quarter)
      const maxQ = maxFor(m.quarterLimits, quarter)
      if (used > maxQ) {
        notificationService.notify(
          'Warning',
          `KW${quarter} overschreden`,
          `Je hebt ${used} verlofshiften in KW${quarter} (${quarterPeriod(quarter)}), het maximum is ${maxQ}.`,
          5000,
        )
      }
    }
  }

  const loadQuarterLimits = async () => {
    try {
      m.quarterLimits = await getJson<QuarterLimitDTO | null>(`api/quarter-limits/mine?year=${m.selectedYear}`)
    } catch {
      m.quarterLimits = null
    }
  }

  const loadPermissions = async () => {
    try {
      const resp = await send(`api/access/calendar-permissions?year=${m.selectedYear}`)
      if (resp.ok) {
        m.perms = (await resp.json()) as CalendarPermissionsDTO | null
      } else {
        m.perms = null
        notificationService.notify('Warning', 'Permissies', `Permissies laden mislukt (${resp.status}).`, 4000)
      }
    } catch (ex) {
      m.perms = null
      notificationService.notify('Error', 'Permissies', ex instanceof Error ? ex.message : String(ex), 4000)
    }
  }

  const getDaysOff = async () => {
    const persoonId = tryParseInt(m.userId)
    if (persoonId != null) {
      m.personDaysOff = (await getJson<DayOffDTO[] | null>(`api/calender/person-days-off/${persoonId}`)) ?? []

      // Vul selectedDays met de juiste shift per dag (en eventuele verlofcategorie)
      m.selectedDays = []
      for (const dayOff of m.personDaysOff) {
        const date = parseDate(dayOff.date)
        const workDays = m.monthGroups.flatMap(mg => mg.workDays).filter(wd => sameDay(wd.date, date))
        // Opgeslagen shift heeft voorrang; oudere records zonder shift nemen de eerste shift van die dag
        const workDay = workDays.find(wd => wd.shift === dayOff.shift) ?? workDays[0]

        if (workDay) m.selectedDays.push({ date: workDay.date, shift: workDay.shift, leaveCategoryId: dayOff.leaveCategoryId ?? null })
      }
      m.isDirty = false
    }
  }

  const loadHolidaysAndVacations = async () => {
    m.publicHolidays = ((await getJson<HolidayJson[] | null>(`api/holidays/public/${m.selectedYear}`)) ?? []).map(toHoliday)
    m.schoolHolidays = ((await getJson<HolidayJson[] | null>(`api/holidays/school/${m.selectedYear}`)) ?? []).map(toHoliday)
  }

  const loadExtraShifts = async () => {
    try {
      const list = (await getJson<(Omit<ExtraShiftDTO, 'date'> & { date: string })[] | null>(`api/extra-shifts/mine?year=${m.selectedYear}`)) ?? []
      m.extraShifts = list.map(x => ({ ...x, date: parseDate(x.date) }))
    } catch {
      m.extraShifts = []
    }
    try {
      // Rust (Ploeg0) en andere afwezigheden/uurcodes (Dispatching)
      const list = (await getJson<(Omit<RestShiftDTO, 'date'> & { date: string })[] | null>(`api/rest-shifts/mine?year=${m.selectedYear}`)) ?? []
      m.restShifts = list.map(x => ({ ...x, date: parseDate(x.date) }))
    } catch {
      m.restShifts = []
    }
  }

  const loadWorkDays = async () => {
    await loadExtraShifts()
    const team = !m.personTeam || !m.personTeam.trim() ? 'Ploeg1' : m.personTeam
    const workDays = ((await getJson<WorkDayJson[] | null>(`api/calender?teamName=${team}&year=${m.selectedYear}`)) ?? []).map(toWorkDay)
    // GroupBy per maand, in volgorde van de maand
    const byMonth = new Map<number, WorkDay[]>()
    for (const wd of workDays) {
      const k = wd.date.getMonth()
      if (!byMonth.has(k)) byMonth.set(k, [])
      byMonth.get(k)!.push(wd)
    }
    m.monthGroups = orderBy(
      [...byMonth.entries()].map(([month, days]) => ({
        monthName: nlMonths[month],
        workDays: orderBy(days, wd => wd.date.getTime()),
      })),
      g => g.workDays[0].date.getMonth(),
    )
  }

  const loadCategories = async () => {
    try {
      m.categories = (await getJson<LeaveCategoryDTO[] | null>(`api/leave-categories/mine?year=${m.selectedYear}`)) ?? []
    } catch {
      m.categories = []
    }

    if (m.activeCategoryId != null && m.categories.every(c => c.id !== m.activeCategoryId)) m.activeCategoryId = null
  }

  const resolvePersonName = async () => {
    try {
      const id = tryParseInt(m.userId)
      if (id != null) {
        const person = await personApi.getPersonById(id)
        if (person) {
          m.personTeam = person.team
          m.leaveAllowance = person.leaveAllowance ?? null
          const first = person.firstName?.trim() ?? ''
          const last = person.lastName?.trim() ?? ''
          m.personName = [first, last].filter(s => s.trim()).join(' ')
        }
      }
    } catch {
      // Laat PersonName fallbacken in exportToPdf ("Gebruiker")
    }
  }

  // OnInitializedAsync
  useEffect(() => {
    alive.current = true
    void (async () => {
      // Haal token op
      m.userId = getUserId(getItem(AuthTokenKey))

      // Haal de weergavenaam en ploeg op (ploeg bepaalt het werkrooster)
      await resolvePersonName()

      await loadWorkDays()

      // Permissions ophalen op basis van claims (team/speciality) en huidig jaar
      await loadPermissions()
      await loadCategories()
      await loadQuarterLimits()

      await loadHolidaysAndVacations()
      // Verlofdagen ophalen
      await getDaysOff()
      stateHasChanged()
    })()
    return () => {
      alive.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveSelectedDays = async () => {
    // Categorieën die aansluitend moeten zijn maar dat niet zijn: niet opslaan
    const notConsecutive = m.categories.filter(c => c.mustBeConsecutive && !m.isConsecutive(c.id))
    for (const c of notConsecutive) {
      notificationService.notify('Error', c.name, `De shiften van '${c.name}' moeten aansluitend zijn (één ononderbroken reeks werkshiften).`, 6000)
    }
    if (notConsecutive.length > 0) return

    // Losse shiften mogen, maar enkel bewust: eerst bevestigen
    const loose = m.looseShifts
    if (loose.length > 0) {
      const list =
        loose
          .slice(0, 8)
          .map(d => `${formatDate(d.date, 'd MMM', 'nl-BE')} ${d.shift}`)
          .join(', ') + (loose.length > 8 ? ` en nog ${loose.length - 8}` : '')
      const confirmed = await dialogService.confirm(
        `Je hebt ${loose.length} losse ${loose.length === 1 ? 'shift' : 'shiften'} (${list}). Verlof neem je normaal per 2 shiften: een dagshift met de nachtshift erna. Toch opslaan?`,
        'Losse shiften',
        { okButtonText: 'Opslaan', cancelButtonText: 'Terug' },
      )
      if (confirmed !== true) return
    }

    // new { PersoonId = userId (tekst), Days = selectedDays }
    const payload = {
      persoonId: m.userId,
      days: m.selectedDays.map(d => ({ date: toApiDate(d.date), shift: d.shift, leaveCategoryId: d.leaveCategoryId ?? null })),
    }
    const response = await postJson('api/calender/add-dayoff', payload)

    if (response.ok) {
      m.isDirty = false
      notificationService.notify('Success', 'Opgeslagen', 'Je verlofdagen zijn opgeslagen.', 2000)
    } else {
      // Bij een validatiefout (bv. te veel shiften in een categorie) de reden van de server tonen
      // 400 (validatie) of 403 (bv. demo modus): de reden van de server tonen als die er is
      const serverText = response.status === 400 || response.status === 403 ? await response.text() : null
      const reason = !serverText || !serverText.trim() ? 'Opslaan van verlofdagen mislukt.' : serverText
      notificationService.notify('Error', 'Fout', reason, 5000)
    }
  }

  // Niet-opgeslagen wijzigingen: opslaan, niet opslaan of annuleren. true = mag verder.
  const canLeave = async (question: string) => {
    if (!m.isDirty) return true
    const choice = await askUnsavedChanges(question)
    if (choice === 'discard') {
      m.isDirty = false // wijzigingen laten vallen
      return true
    }
    if (choice === 'save') {
      await saveSelectedDays()
      return !m.isDirty // enkel verder als het opslaan gelukt is
    }
    return false
  }

  const onBeforeInternalNavigation = async () => {
    const ok = await canLeave('Je hebt niet-opgeslagen wijzigingen. Wil je ze opslaan voor je de pagina verlaat?')
    stateHasChanged()
    return ok
  }

  const changeYear = async (delta: number) => {
    const year = m.selectedYear + delta
    if (year < m.minYear || year > m.maxYear) return

    // Blazor tekent opnieuw bij de eerste echte wachttijd: de vraag (als er iets niet opgeslagen is) of het laden
    const asked = m.isDirty
    if (asked && !(await canLeave('Je hebt niet-opgeslagen wijzigingen. Wil je ze opslaan voor je van jaar wisselt?'))) {
      stateHasChanged()
      return
    }

    m.selectedYear = year
    if (!asked) stateHasChanged()
    await loadWorkDays()
    await getDaysOff()
    await loadHolidaysAndVacations()
    await loadPermissions()
    await loadCategories()
    await loadQuarterLimits()
    stateHasChanged()
  }

  const onDayClicked = (day: WorkDay) => {
    const existing = m.selectedDays.find(d => d.date.getTime() === day.date.getTime() && d.shift === day.shift)

    // Gewoon verlof: shift aan/uit zetten
    if (m.activeCategoryId == null) {
      if (!existing) {
        m.selectedDays.push({ date: day.date, shift: day.shift })
        warnIfOverLimits(day.date)
      } else m.selectedDays.splice(m.selectedDays.indexOf(existing), 1)
      m.isDirty = true
      stateHasChanged()
      return
    }

    // Categorie actief: nog eens klikken op een shift met deze categorie zet de shift volledig uit
    if (existing && existing.leaveCategoryId === m.activeCategoryId) {
      m.selectedDays.splice(m.selectedDays.indexOf(existing), 1)
      m.isDirty = true
      stateHasChanged()
      return
    }

    const category = m.categories.find(c => c.id === m.activeCategoryId)!
    if (day.date.getFullYear() === m.selectedYear && m.categoryUsage(category.id) >= category.maxShifts) {
      notificationService.notify('Warning', category.name, `Je kan maximaal ${category.maxShifts} shiften als '${category.name}' aanduiden.`, 4000)
      stateHasChanged()
      return
    }

    if (!existing) {
      m.selectedDays.push({ date: day.date, shift: day.shift, leaveCategoryId: category.id })
      warnIfOverLimits(day.date)
    } else existing.leaveCategoryId = category.id
    m.isDirty = true
    stateHasChanged()
  }

  // Export the visible calendar + tables as PDF (hasExportFns uit export.js)
  const ensureExportJs = () => {
    try {
      if (typeof window.hasExportFns !== 'function') throw new Error('hasExportFns')
      const ok = window.hasExportFns() === true
      if (!ok) {
        notificationService.notify('Warning', 'Export', 'Export scripts not loaded. Refresh the page (Ctrl+F5) and try again.', 3000)
      }
      return ok
    } catch {
      notificationService.notify('Warning', 'Export', 'Export scripts unavailable. Refresh the page (Ctrl+F5) and try again.', 3000)
      return false
    }
  }

  const exportToPdf = async () => {
    if (!ensureExportJs()) return

    const displayName = !m.personName || !m.personName.trim() ? 'Gebruiker' : m.personName
    const title = `${displayName} - ${m.selectedYear}`

    await window.exportElementToPdf?.(
      'workcalendar-export',
      `WerkKalender-${m.selectedYear}.pdf`,
      title, // titleText
      'landscape', // orientation must be "landscape" or "portrait"
      true, // fitOnePage
      true, // compress
      '#holidays-grid, .wc-no-export', // hideSelector
      6, // marginMm
    )
  }

  // Export selected days as an .ics calendar (double-click to import)
  const exportIcs = async () => {
    if (!ensureExportJs()) return

    const days = orderBy(
      m.selectedDays.filter(d => d.date.getFullYear() === m.selectedYear),
      d => d.date.getTime(),
    )

    if (days.length === 0) {
      notificationService.notify('Info', 'Geen data', `Geen geselecteerde verlofdagen in ${m.selectedYear}.`, 2500)
      return
    }

    const now = new Date()
    const p2 = (n: number) => String(n).padStart(2, '0')
    const utcNow = `${now.getUTCFullYear()}${p2(now.getUTCMonth() + 1)}${p2(now.getUTCDate())}T${p2(now.getUTCHours())}${p2(now.getUTCMinutes())}${p2(now.getUTCSeconds())}Z`
    const lines: string[] = []
    lines.push('BEGIN:VCALENDAR')
    lines.push('VERSION:2.0')
    lines.push('PRODID:-//VerlofBWZC//WerkKalender//NL')
    lines.push('CALSCALE:GREGORIAN')
    lines.push('METHOD:PUBLISH')

    for (const d of days) {
      const start = dateOnly(d.date)
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
      const uid = `${crypto.randomUUID()}@verlofbwzc`
      const category = d.leaveCategoryId != null ? m.categories.find(c => c.id === d.leaveCategoryId) : undefined
      const summary = category ? `${category.name} (${d.shift})` : `Verlof (${d.shift})`

      lines.push('BEGIN:VEVENT')
      lines.push(`UID:${uid}`)
      lines.push(`DTSTAMP:${utcNow}`)
      lines.push(`DTSTART;VALUE=DATE:${formatDate(start, 'yyyyMMdd')}`)
      lines.push(`DTEND;VALUE=DATE:${formatDate(end, 'yyyyMMdd')}`)
      lines.push(`SUMMARY:${summary}`)
      lines.push('END:VEVENT')
    }

    lines.push('END:VCALENDAR')

    // StringBuilder.AppendLine in WebAssembly: "\n" na elke regel
    window.downloadFile?.(`Verlof-${m.selectedYear}.ics`, 'text/calendar', lines.map(l => l + '\n').join(''))
  }

  const setActiveCategory = (id: number | null) => {
    m.activeCategoryId = id
    stateHasChanged()
  }

  // Waarschuwen bij verlaten van de pagina met niet-opgeslagen wijzigingen
  const lock = <NavigationLock confirmExternalNavigation={m.isDirty} onBeforeInternalNavigation={onBeforeInternalNavigation} active={m.isDirty} />

  if (!m.monthGroups || m.monthGroups.length === 0) {
    return (
      <>
        {lock}
        <h1>Werkkalender</h1>{' '}
        <p className="wc-loading">Werkkalender laden…</p>
      </>
    )
  }

  const selectedYear = m.selectedYear
  const dayOffCount = m.selectedYearDayOffCount
  const looseShifts = m.looseShifts
  const showCategories = m.categories.length > 0 && m.canSaveWork

  return (
    <>
      {lock}
      <div className="wc">
        {/* Kop: titel, jaar, acties */}
        <div className="wc-header">
          <div className="wc-title">
            <h1>Werkkalender</h1>{' '}
            <div className="wc-year" role="group" aria-label="Jaar kiezen">
              <button type="button" className="wc-year-btn" aria-label="Vorig jaar" disabled={selectedYear <= m.minYear} onClick={() => void changeYear(-1)}>
                <i className="rzi">chevron_left</i>
              </button>{' '}
              <span className="wc-year-label">{selectedYear}</span>{' '}
              <button type="button" className="wc-year-btn" aria-label="Volgend jaar" disabled={selectedYear >= m.maxYear} onClick={() => void changeYear(1)}>
                <i className="rzi">chevron_right</i>
              </button>
            </div>
            {m.isDirty && (
              <span className="wc-dirty">
                <i className="rzi">edit</i> Niet opgeslagen
              </span>
            )}
          </div>{' '}
          <div className="wc-actions">
            <Button text="PDF" icon="picture_as_pdf" buttonStyle="Light" onClick={exportToPdf} title="Exporteren als PDF" />{' '}
            <Button text="Agenda" icon="event" buttonStyle="Light" onClick={exportIcs} title="Exporteren als .ics-bestand voor je agenda" />
            {m.canSaveWork && (
              <Button
                text="Opslaan"
                icon="save"
                buttonStyle="Primary"
                onClick={async () => {
                  await saveSelectedDays()
                  stateHasChanged()
                }}
              />
            )}
          </div>
        </div>{' '}
        <div id="workcalendar-export">
          {/* Samenvatting */}
          <div className="wc-summary">
            <div className="wc-stat">
              <div className="wc-stat-label">Verlof in {selectedYear}</div>{' '}
              <div className="wc-stat-value">
                {dayOffCount}
                {m.leaveAllowance != null && <span className="wc-stat-of">/ {m.leaveAllowance}</span>}
              </div>
              {m.leaveAllowance != null ? (
                (() => {
                  const allowance = m.leaveAllowance
                  const remaining = allowance - dayOffCount
                  return (
                    <>
                      <div className="wc-bar">
                        <div className={remaining < 0 ? 'wc-bar-fill wc-bar-over' : 'wc-bar-fill'} style={parseStyle(`width:${percent(dayOffCount, allowance)}%`)}></div>
                      </div>{' '}
                      <div className={remaining < 0 ? 'wc-stat-note wc-over' : 'wc-stat-note wc-ok'}>{remaining >= 0 ? `nog ${remaining} over` : `${-remaining} te veel`}</div>
                    </>
                  )
                })()
              ) : (
                <div className="wc-stat-note">verlofshiften aangeduid</div>
              )}
            </div>
            {m.quarterLimits &&
              [1, 2, 3].map(quarter => {
                const usedQ = m.quarterUsage(quarter)
                const maxQ = maxFor(m.quarterLimits!, quarter)
                return (
                  <div key={quarter} className={usedQ > maxQ ? 'wc-stat wc-stat-over' : 'wc-stat'}>
                    <div className="wc-stat-label">
                      KW{quarter} <span className="wc-stat-period">{quarterPeriod(quarter)}</span>
                    </div>{' '}
                    <div className="wc-stat-value">
                      {usedQ} <span className="wc-stat-of">/ {maxQ}</span>
                    </div>{' '}
                    <div className="wc-bar">
                      <div className={usedQ > maxQ ? 'wc-bar-fill wc-bar-over' : 'wc-bar-fill'} style={parseStyle(`width:${percent(usedQ, maxQ)}%`)}></div>
                    </div>{' '}
                    <div className={usedQ > maxQ ? 'wc-stat-note wc-over' : 'wc-stat-note'}>{usedQ > maxQ ? `${usedQ - maxQ} boven het maximum` : `nog ${maxQ - usedQ} over`}</div>
                  </div>
                )
              })}
            {m.categories.map((c, ci) => {
              const used = m.categoryUsage(c.id)
              const notConsecutive = c.mustBeConsecutive && !m.isConsecutive(c.id)
              return (
                <div key={ci} className={notConsecutive ? 'wc-stat wc-stat-over' : 'wc-stat'}>
                  <div className="wc-stat-label" title={c.mustBeConsecutive ? 'Deze shiften moeten aansluitend zijn' : undefined}>
                    <span className="wc-swatch" style={parseStyle(`background:${c.color}`)}></span>
                    {c.name}
                    {c.mustBeConsecutive && <span className="wc-stat-period">aansluitend</span>}
                  </div>{' '}
                  <div className="wc-stat-value">
                    {used} <span className="wc-stat-of">/ {c.maxShifts}</span>
                  </div>{' '}
                  <div className="wc-bar">
                    <div className="wc-bar-fill" style={parseStyle(`width:${percent(used, c.maxShifts)}%; background:${c.color}`)}></div>
                  </div>{' '}
                  <div className={notConsecutive ? 'wc-stat-note wc-over' : 'wc-stat-note'}>
                    {notConsecutive ? 'niet aansluitend' : c.maxShifts - used >= 0 ? `nog ${c.maxShifts - used} over` : ''}
                  </div>
                </div>
              )
            })}
            {looseShifts.length > 0 && (
              <div className="wc-stat wc-stat-warn" title="Verlof neem je normaal per 2 shiften: een dagshift met de nachtshift erna.">
                <div className="wc-stat-label">
                  <i className="rzi wc-warn-icon">warning</i>Losse shiften
                </div>{' '}
                <div className="wc-stat-value">{looseShifts.length}</div>{' '}
                <div className="wc-stat-note wc-warn">zonder dag- of nachtshift erbij</div>
              </div>
            )}
          </div>{' '}
          {/* Aanduiden als + legende */}
          <div className="wc-toolbar wc-no-export">
            {showCategories && (
              <div className="wc-categories" role="group" aria-label="Aanduiden als">
                <span className="wc-toolbar-label">Aanduiden als</span>{' '}
                <button
                  type="button"
                  className={m.activeCategoryId == null ? 'wc-pill wc-pill-active' : 'wc-pill'}
                  style={parseStyle(
                    m.activeCategoryId == null ? 'background:var(--rz-info); border-color:var(--rz-info); color:#fff;' : 'border-color:var(--rz-info); color:var(--rz-info-dark);',
                  )}
                  aria-pressed={m.activeCategoryId == null ? 'true' : 'false'}
                  onClick={() => setActiveCategory(null)}
                >
                  {' Gewoon verlof '}
                </button>
                {m.categories.map((c, ci) => {
                  const isActive = m.activeCategoryId === c.id
                  return (
                    <button
                      key={ci}
                      type="button"
                      className={isActive ? 'wc-pill wc-pill-active' : 'wc-pill'}
                      style={parseStyle(isActive ? `background:${c.color}; border-color:${c.color}; color:#fff;` : `border-color:${c.color}; color:${c.color};`)}
                      aria-pressed={isActive ? 'true' : 'false'}
                      onClick={() => setActiveCategory(c.id)}
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="wc-legend">
              <span>
                <span className="wc-dot-inline wc-dot-holiday"></span>Feestdag
              </span>{' '}
              <span>
                <span className="wc-dot-inline wc-dot-school"></span>Schoolvakantie
              </span>{' '}
              <span>
                <span className="wc-weekend-swatch"></span>Weekend
              </span>{' '}
              <span>
                <span className="wc-swatch" style={parseStyle('background:var(--rz-info)')}></span>Verlof
              </span>
              {m.extraShifts.length > 0 && (
                <span>
                  <span className="wc-swatch" style={parseStyle('background:#7B4FB8')}></span>Extra shift
                </span>
              )}
              {m.restShifts.some(r => r.code == null) && (
                <span>
                  <span className="wc-swatch wc-swatch-rest"></span>Rust
                </span>
              )}
              {m.restShifts.some(r => r.code != null) && (
                <span title="Andere afwezigheid of uren verlof, aangeduid door je verantwoordelijke">
                  <span className="wc-swatch" style={parseStyle('background:#4A5568')}></span>Afwezig / uren
                </span>
              )}
            </div>
          </div>
          {showCategories && (
            <div className="wc-hint wc-no-export">
              {m.activeCategoryId == null ? 'Klik op een shift om verlof aan of uit te zetten.' : 'Klik op een shift om deze categorie te geven; nog eens klikken zet de shift weer uit.'}
            </div>
          )}

          {/* Maanden */}
          <div className="wc-months">
            {m.monthGroups.map((month, mi) => {
              const monthCount = month.workDays.filter(wd => m.selectedDays.some(d => sameDay(d.date, wd.date) && d.shift === wd.shift)).length
              return (
                <section key={mi} className="wc-month">
                  <header className="wc-month-header">
                    <span className="wc-month-name">{capitalize(month.monthName)}</span>{' '}
                    <span className={monthCount > 0 ? 'wc-month-count wc-month-count-active' : 'wc-month-count'}>{monthCount} verlof</span>
                  </header>{' '}
                  <div className="wc-chips">
                    {m.chipItems(month).map((item, ii) => {
                      if (item.day == null) {
                        // Extra shift in een andere ploeg (aangeduid door een verantwoordelijke; geen verlof)
                        const x = item.extra!
                        return (
                          <span
                            key={ii}
                            className="wc-chip wc-chip-extra"
                            title={`${formatDate(x.date, 'dddd d MMMM', 'nl-BE')} · ${shiftText(x.shift)} · extra shift in ${x.team}` + (!x.note ? '' : ` · ${x.note}`)}
                          >
                            <span className="wc-chip-day">{formatDate(x.date, 'dd')}</span>{' '}
                            <span className="wc-chip-meta">
                              {x.shift} · {x.team.replaceAll('Ploeg', 'P')}
                            </span>
                          </span>
                        )
                      }
                      const day = item.day
                      const ownExtra = item.extra
                      const mark = ownExtra == null ? m.restShifts.find(r => sameDay(r.date, day.date) && r.shift === day.shift) : undefined
                      if (mark) {
                        // Rust (Ploeg0) of een andere afwezigheid/uurcode (Dispatching): aangeduid door een verantwoordelijke; geen verlof, niet klikbaar
                        const other = findOtherAbsence(mark.code)
                        const markText = other == null ? 'rust' : `${other.code} (${other.name})`
                        return (
                          <span
                            key={ii}
                            className={other == null ? 'wc-chip wc-chip-rest' : other.absent ? 'wc-chip wc-chip-code wc-chip-code-absent' : 'wc-chip wc-chip-code wc-chip-code-hour'}
                            title={`${formatDate(day.date, 'dddd d MMMM', 'nl-BE')} · ${shiftText(day.shift)} · ${markText}`}
                          >
                            <span className="wc-chip-day">{formatDate(day.date, 'dd')}</span>{' '}
                            <span className="wc-chip-meta">
                              {day.shift} · {other?.code ?? 'rust'}
                            </span>
                          </span>
                        )
                      }
                      const selected = m.selectedDays.find(d => d.date.getTime() === day.date.getTime() && d.shift === day.shift)
                      const category = selected?.leaveCategoryId != null ? m.categories.find(c => c.id === selected.leaveCategoryId) : undefined
                      const holidayName = m.publicHolidayName(day.date)
                      const schoolName = holidayName == null ? m.schoolHolidayName(day.date) : null
                      const isWeekend = day.date.getDay() === 6 || day.date.getDay() === 0
                      const isLoose = selected != null && m.isLoose(selected)

                      return (
                        <button
                          key={ii}
                          type="button"
                          className={chipClass(selected != null, category != null, isWeekend) + (isLoose ? ' wc-chip-loose' : '') + (ownExtra != null ? ' wc-chip-extra-mark' : '')}
                          style={category ? parseStyle(`background:${category.color}; border-color:${category.color};`) : undefined}
                          title={chipTitle(day, category, holidayName, schoolName) + (isLoose ? ' · Losse shift' : '') + (ownExtra != null ? ` · extra shift in ${ownExtra.team}` : '')}
                          aria-pressed={selected != null ? 'true' : 'false'}
                          onClick={() => onDayClicked(day)}
                        >
                          <span className="wc-chip-day">{formatDate(day.date, 'dd')}</span>{' '}
                          <span className="wc-chip-meta">
                            {day.shift} · {formatDate(day.date, 'ddd', 'nl-BE')}
                          </span>
                          {holidayName != null ? <span className="wc-dot wc-dot-holiday"></span> : schoolName != null ? <span className="wc-dot wc-dot-school"></span> : null}
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        </div>{' '}
        {/* Feestdagen en schoolvakanties (niet in de PDF) */}
        <div id="holidays-grid" className="wc-holidays">
          <Panel
            allowCollapse
            collapsed
            headerTemplate={
              <span className="wc-holidays-title">
                <i className="rzi">celebration</i> Feestdagen en schoolvakanties {selectedYear}
              </span>
            }
          >
            <DataGrid data={m.getAllHolidaysForGrid()} columns={holidayColumns} attributes={{ showpagination: 'false' }} />
          </Panel>
        </div>
      </div>
    </>
  )
}
