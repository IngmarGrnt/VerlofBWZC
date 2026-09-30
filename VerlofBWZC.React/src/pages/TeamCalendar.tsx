import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { Button } from '../radzen/Button'
import { DropDown } from '../radzen/DropDown'
import { dialogService } from '../radzen/Dialog'
import { notificationService } from '../radzen/Notification'
import { parseStyle } from '../radzen/core'
import { getJson, postJson, send } from '../api/http'
import type { PersonBaseDTO } from '../api/person'
import { lotteryApi, type LotteryDrawDTO, type RestoredDayOffDTO, type Stats } from '../api/lottery'
import { scopeService, AllSpecialities } from '../services/scope'
import { getCurrentPerson, isMobile, scrollToId } from '../services/browser'
import {
  AllTeamsSpeciality,
  ExtraShiftQuotaBonus,
  MinTeamsForAllTeamsView,
  NoRegimeTeam,
  allowsAllTeamsView,
  allowsExtraShifts,
  allowsOtherAbsences,
  allowsRestShifts,
  countsAsStaff,
  countsForOtherTeamsOccupancy,
  defaultShiftQuota,
  findOtherAbsence,
  initialsFor,
  lotteryPerShift,
  pairRulesApply,
} from '../rules'
import { capitalize, formatDate, format0dd, parseDate, toApiDate } from '../util/dotnet'
import { NavigationLock, usePageTitle } from '../app/navigation'
import { askUnsavedChanges } from './UnsavedChangesDialog'
import { ExtraShiftDialog, type ExtraShiftDTO } from './ExtraShiftDialog'
import { OtherAbsenceDialog } from './OtherAbsenceDialog'
import { LotteryForm, type LotteryCandidate, type LotteryFormContext, type LotteryFormProps } from './LotteryForm'

// Zelfde als VerlofBWZC/Pages/TeamCalendar.razor (@page "/teamcalendar", [Authorize]).
// Shiften als rijen, personen als kolommen (raster, aanduiden) of een lijst per shift (enkel bekijken, standaard op gsm).
// De toestand staat in een Model (zoals de velden in @code); render() = StateHasChanged.

// --- DTO's (VerlofBWZC.DataContracts) ---
interface WorkDayDTO {
  date: string
  shift: string
  leaveCategoryId?: number | null
}
interface TeamDayOffDTO {
  personId: number
  date: string
  shift: string
  leaveCategoryId?: number | null
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
interface ShiftQuotaDTO {
  id: number
  team: string
  speciality: string
  year?: number | null
  dayMax: number
  nightMax: number
}
interface RestShiftDTO {
  personId: number
  date: string
  shift: string
  code?: string | null
}
interface NameTranslationDTO {
  language: string
  text: string
}
interface HolidayDTO {
  name?: NameTranslationDTO[] | null
  startDate: string
  endDate: string
  type?: string
}
interface CalendarPermissionsDTO {
  canSeeTeamCalendar: boolean
  canSaveWorkCalendar: boolean
  canSaveTeamCalendar: boolean
}

// --- In het geheugen (datum als Date, k = yyyymmdd om snel te vergelijken) ---
interface WorkDay {
  date: Date
  shift: string
  k: number
}
interface SelectedDayOff {
  personId: number
  date: Date
  k: number
  shift: string
  leaveCategoryId?: number | null
}
interface RestShift {
  personId: number
  date: Date
  k: number
  shift: string
  // null = rust (Ploeg0); anders een andere afwezigheid of uurcode
  code?: string | null
}
interface ExtraShift extends ExtraShiftDTO {
  d: Date
  k: number
}
interface Holiday {
  name?: NameTranslationDTO[] | null
  sk: number
  ek: number
}
interface MonthGroup {
  year: number
  month: number
  days: WorkDay[]
}
interface ListChip {
  order: number
  css: string
  style: string | null
  title: string
  text: string
}

const Nl = 'nl-BE'
const AllTeams = 'Alle ploegen'
const Dispatching = AllTeamsSpeciality
const ViewKey = 'teamCalendarView'

const dk = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
const dayOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const pad2 = (n: number) => String(n).padStart(2, '0')
const key3 = (personId: number, k: number, shift: string) => `${personId}|${k}|${shift}`

// OrderBy op tekst: cultuurgevoelig zoals .NET (Comparer<string>.Default)
const collator = new Intl.Collator(undefined)
const compareText = (a: string | null | undefined, b: string | null | undefined) => (a == null ? (b == null ? 0 : -1) : b == null ? 1 : collator.compare(a, b))
// Stabiel sorteren (zoals LINQ OrderBy/ThenBy)
function orderBy<T>(list: readonly T[], ...cmps: ((a: T, b: T) => number)[]): T[] {
  return list
    .map((v, i) => ({ v, i }))
    .sort((a, b) => {
      for (const c of cmps) {
        const r = c(a.v, b.v)
        if (r !== 0) return r
      }
      return a.i - b.i
    })
    .map(x => x.v)
}
// GroupBy met de volgorde van het eerste voorkomen (zoals LINQ)
function groupBy<T, K>(list: readonly T[], keyOf: (v: T) => K): { key: K; items: T[] }[] {
  const map = new Map<K, T[]>()
  for (const v of list) {
    const k = keyOf(v)
    const g = map.get(k)
    if (g) g.push(v)
    else map.set(k, [v])
  }
  return [...map].map(([key, items]) => ({ key, items }))
}

const isNullOrWhiteSpace = (s: string | null | undefined) => !s || !s.trim()

// Zoals de <script> onderaan TeamCalendar.razor (die voert de browser daar uit; een <script> uit React niet)
declare global {
  interface Window {
    downloadFileFromBase64?: (filename: string, base64: string) => void
  }
}
const downloadScript = `
    function downloadFileFromBase64(filename, base64) {
        var link = document.createElement('a');
        link.download = filename;
        link.href = "data:text/csv;base64," + base64;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
`
function ensureDownloadFunction() {
  window.downloadFileFromBase64 ??= (filename: string, base64: string) => {
    const link = document.createElement('a')
    link.download = filename
    link.href = 'data:text/csv;base64,' + base64
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
}

// Optioneel via de link, bv. /teamcalendar?jaar=2027&maand=1 (admin ook &ploeg=...&spec=...)
interface QueryParams {
  jaar: number | null
  maand: number | null
  ploeg: string | null
  spec: string | null
}

const intParam = (v: string | null) => (v != null && /^\s*[+-]?\d+\s*$/.test(v) ? Number.parseInt(v, 10) : null)

const isStaff = (m: PersonBaseDTO) => countsAsStaff(m.speciality, m.role)

const shortTeam = (team: string | null | undefined) => (!team ? '-' : team.replaceAll('Ploeg', 'P'))

const shortMonth = (month: number) => formatDate(new Date(2000, month - 1, 1), 'MMM', Nl).replace(/\.+$/, '')

const rowId = (wd: WorkDay) => `tc-${wd.date.getFullYear()}${pad2(wd.date.getMonth() + 1)}${pad2(wd.date.getDate())}-${wd.shift}`

// Een loting gaat altijd over een paar: dagshift op dag X + nachtshift op dag X+1
const pairOf = (wd: WorkDay): [Date, Date] => (wd.shift === 'D' ? [dayOnly(wd.date), addDays(wd.date, 1)] : [addDays(wd.date, -1), dayOnly(wd.date)])

const shortSpeciality = (speciality: string | null | undefined) => {
  switch (speciality) {
    case null:
    case undefined:
    case '':
      return '-'
    case 'Onderofficieren':
      return 'OOff'
    case 'Officieren':
      return 'Off'
    case 'Chauffeur':
      return 'Chauf'
    case 'Dispatching':
      return 'Disp'
    case 'RedTeam':
      return 'Red'
    case 'Duiker':
      return 'Duik'
    default:
      return speciality
  }
}

const countClass = (count: number, quota: number) => (count > quota ? 'tc-count tc-count-over' : count === quota ? 'tc-count tc-count-full' : 'tc-count')

class Model {
  render: () => void = () => {}
  query: QueryParams = { jaar: null, maand: null, ploeg: null, spec: null }

  selectedYear = new Date().getFullYear() + 1
  years = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 1 + i)

  workDays: WorkDay[] = []
  monthGroups: MonthGroup[] = []

  teamMembers: PersonBaseDTO[] = []
  teamDaysOff: TeamDayOffDTO[] = []

  // Getoonde maand (null = hele jaar) en niet-opgeslagen wijzigingen
  selectedMonth: number | null = null
  twoMonths = false
  isDirty = false

  publicHolidays: Holiday[] = []
  schoolHolidays: Holiday[] = []

  currentUserRole: string | null = null
  perms: CalendarPermissionsDTO | null = null

  // Verlofcategorieën van de getoonde ploeg/specialiteit (kleur in de kalender)
  leaveCategories: LeaveCategoryDTO[] = []
  activeCategoryName: string | null = null

  shownTeams: string[] = []
  workDaysByTeam = new Map<string, WorkDay[]>()
  rowTeams = new Map<string, string[]>()
  // Ingestelde maxima per shift (Instellingen > Max per shift) van de getoonde ploegen
  shiftQuotaRules: ShiftQuotaDTO[] = []
  extraShifts: ExtraShift[] = []

  selectedDays: SelectedDayOff[] = []

  selectedTeam: string | null = null
  selectedSpeciality: string | null = null
  teamOptions: string[] = []
  specialityOptions: string[] = []

  draws: LotteryDrawDTO[] = []
  // Gewonnen/verloren lotingen dit jaar per persoon (kolomkop en tooltip)
  lotteryStats = new Map<number, Stats>()

  // Eén status per persoon en shift (code null = rust)
  restShifts: RestShift[] = []
  restMode = false
  otherMode = false

  listView = false

  // --- Snelle opzoekingen (zelfde resultaat als de LINQ-zoekopdrachten); opnieuw opgebouwd na elke wijziging ---
  private cache: {
    members: Map<number, PersonBaseDTO>
    days: Map<string, SelectedDayOff>
    counts: Map<string, number>
    marks: Map<string, RestShift>
    quota: Map<string, number>
  } | null = null
  invalidate() {
    this.cache = null
  }
  private get c() {
    if (this.cache) return this.cache
    const members = new Map<number, PersonBaseDTO>()
    for (const m of this.teamMembers) if (!members.has(m.id)) members.set(m.id, m)
    const days = new Map<string, SelectedDayOff>()
    for (const d of this.selectedDays) {
      const k = key3(d.personId, d.k, d.shift)
      if (!days.has(k)) days.set(k, d)
    }
    const marks = new Map<string, RestShift>()
    for (const r of this.restShifts) {
      const k = key3(r.personId, r.k, r.shift)
      if (!marks.has(k)) marks.set(k, r)
    }
    this.cache = { members, days, counts: new Map(), marks, quota: new Map() }
    return this.cache
  }

  schoolHolidayName(date: Date): string | null {
    const k = dk(date)
    const h = this.schoolHolidays.find(h => h.sk <= k && h.ek >= k)
    return !h ? null : (h.name?.find(n => n.language === 'NL')?.text ?? h.name?.[0]?.text ?? 'Schoolvakantie')
  }

  // Autorisatie (rolgebaseerd)
  get canManageCalendar() {
    const r = (this.currentUserRole ?? '').toLowerCase()
    return this.currentUserRole != null && (r === 'admin' || r === 'manager')
  }
  // Rechten uit de regels van het Manager Paneel
  get canSaveTeamCalendar() {
    return (this.perms?.canSaveTeamCalendar ?? true) && this.canManageCalendar
  }
  get canExport() {
    return this.canManageCalendar
  }

  // Actieve categorie in de balk, op naam: bij "Alle specialiteiten" heeft elke specialiteit eigen categorieën
  get categoryChoices(): LeaveCategoryDTO[] {
    return groupBy(
      orderBy(this.leaveCategories, (a, b) => a.sortOrder - b.sortOrder),
      c => c.name,
    ).map(g => g.items[0])
  }

  categoryFor(member: PersonBaseDTO, name: string) {
    return this.leaveCategories.find(c => c.name === name && c.team === member.team && c.speciality === member.speciality) ?? null
  }

  categoryUsage(personId: number, categoryId: number) {
    return this.selectedDays.filter(d => d.personId === personId && d.leaveCategoryId === categoryId && d.date.getFullYear() === this.selectedYear).length
  }

  // Tooltip per persoon, bv. " | Groot verlof 3/8, Verlof 4 1/4"
  categoryUsageText(member: PersonBaseDTO) {
    const own = orderBy(
      this.leaveCategories.filter(c => c.team === member.team && c.speciality === member.speciality),
      (a, b) => a.sortOrder - b.sortOrder,
    )
    return own.length === 0 ? '' : ' | ' + own.map(c => `${c.name} ${this.categoryUsage(member.id, c.id)}/${c.maxShifts}`).join(', ')
  }

  // Aantal werkdagen in het jaar (zelfde eenheid als mg.Days.Count: rijen datum+shift)
  get yearTotalWorkDays() {
    return this.workDays.length
  }

  // Maximum voor de dagshift van de getoonde ploeg (samenvatting, minimum verlof p.p.)
  get dailyQuota() {
    return Math.max(1, this.teamQuota(this.selectedTeam ?? '', 'D'))
  }

  // --- Alle ploegen (zelfde specialiteit van elke ploeg naast elkaar) ---
  get showAllTeams() {
    return this.selectedTeam === AllTeams
  }

  teamsOn(wd: { k: number; shift: string }): string[] {
    return this.rowTeams.get(`${wd.k}|${wd.shift}`) ?? []
  }

  // Werkt de ploeg van deze persoon deze shift?
  memberWorks(member: PersonBaseDTO, wd: WorkDay) {
    return !this.showAllTeams || this.teamsOn(wd).includes(member.team ?? '')
  }

  // Maximum van één ploeg voor een shift. Per specialiteit geldt de ingestelde regel;
  // zonder regels de standaard: een kwart van de getoonde personen van die ploeg (minstens 1).
  teamQuota(team: string, shift = 'D'): number {
    const cacheKey = `${team}|${shift}`
    const cached = this.c.quota.get(cacheKey)
    if (cached !== undefined) return cached
    const members = this.teamMembers.filter(m => m.team === team && isStaff(m))
    let result: number
    if (members.length === 0) result = 0 // ploeg zonder personen telt niet mee
    else {
      const rules = groupBy(members, m => m.speciality ?? '').map(g => ({
        g,
        rule: this.shiftQuotaRules.find(r => r.team === team && r.speciality === g.key) ?? null,
      }))
      if (rules.every(x => x.rule == null)) result = defaultShiftQuota(members.length)
      else result = rules.reduce((sum, x) => sum + (x.rule ? (shift === 'N' ? x.rule.nightMax : x.rule.dayMax) : defaultShiftQuota(x.g.items.length)), 0)
    }
    this.c.quota.set(cacheKey, result)
    return result
  }

  // Maximum voor een rij: bij alle ploegen de som van de ploegen die die shift werken.
  // Elke extra shift in een ploeg verhoogt het maximum van die ploeg op die shift (ExtraShiftQuotaBonus).
  quotaFor(wd: { k: number; shift: string }): number {
    return this.showAllTeams
      ? Math.max(
          1,
          this.teamsOn(wd)
            .filter(countsForOtherTeamsOccupancy)
            .reduce((s, t) => s + this.teamQuota(t, wd.shift) + this.extraBonus(t, wd), 0),
        )
      : this.teamQuota(this.selectedTeam ?? '', wd.shift) + this.extraBonus(this.selectedTeam ?? '', wd)
  }
  quotaForDate(date: Date, shift: string) {
    return this.quotaFor({ k: dk(date), shift })
  }

  // --- Extra shiften (Dispatching: iemand werkt een shift in een andere ploeg) ---
  // Enkel waar de specialiteit het toelaat
  get showsExtraShifts() {
    return allowsExtraShifts(this.selectedSpeciality)
  }
  get canManageExtraShifts() {
    return this.showsExtraShifts && this.canSaveTeamCalendar
  }

  // Extra shiften die in deze ploeg op deze shift gewerkt worden
  extrasIn(team: string, wd: { k: number; shift: string }) {
    return this.extraShifts.filter(e => e.team === team && e.k === wd.k && e.shift === wd.shift)
  }

  extraBonus(team: string, wd: { k: number; shift: string }) {
    return this.extrasIn(team, wd).length * ExtraShiftQuotaBonus
  }

  // Extra shiften op deze rij in de getoonde ploeg(en)
  extrasOnRow(wd: WorkDay) {
    return this.showAllTeams ? this.teamsOn(wd).flatMap(t => this.extrasIn(t, wd)) : this.extrasIn(this.selectedTeam ?? '', wd)
  }

  // Extra shift van een persoon op deze rij (in welke ploeg dan ook)
  extraOf(personId: number, wd: WorkDay) {
    return this.extraShifts.find(e => e.personId === personId && e.k === wd.k && e.shift === wd.shift) ?? null
  }

  async loadExtraShifts() {
    if (!this.showsExtraShifts) {
      this.extraShifts = []
      return
    }
    const list: ExtraShiftDTO[] = []
    // Getoonde ploegen en (voor wie bij een andere ploeg bijspringt) alle ploegen van deze specialiteit
    for (const team of [...new Set([...this.shownTeams, ...scopeService.teamsFor(this.selectedSpeciality, true)])]) {
      try {
        list.push(...((await getJson<ExtraShiftDTO[] | null>(`api/extra-shifts?team=${team}&year=${this.selectedYear}&speciality=${this.selectedSpeciality ?? ''}`)) ?? []))
      } catch {
        // geen toegang tot die ploeg
      }
    }
    this.extraShifts = groupBy(list, e => e.id).map(g => {
      const e = g.items[0]
      const d = parseDate(e.date)
      return { ...e, d, k: dk(d) }
    })
  }

  // Ploeg (met werkregime) die deze shift werkt: daar springt iemand bij
  extraTargetTeam(wd: WorkDay) {
    return this.teamsOn(wd).find(countsForOtherTeamsOccupancy) ?? null
  }

  // Alle ploegen: grijs vakje (eigen ploeg werkt niet) van iemand die een extra shift mag doen, op een shift die een andere ploeg werkt
  canMarkExtraShift(member: PersonBaseDTO, wd: WorkDay) {
    if (!(this.canManageExtraShifts && this.showAllTeams && allowsExtraShifts(member.speciality))) return false
    const t = this.extraTargetTeam(wd)
    return t != null && t !== member.team
  }

  // personId: aangeduid in het raster, het venster vraagt enkel nog bevestiging
  async openExtraShifts(wd: WorkDay | null, personId: number | null = null, targetTeam: string | null = null) {
    const firstDay = this.workDays.find(w => this.selectedMonth == null || w.date.getMonth() + 1 === this.selectedMonth)
    const today = dayOnly(new Date())
    const date =
      wd?.date ??
      (this.selectedYear === today.getFullYear() && (this.selectedMonth == null || this.selectedMonth === today.getMonth() + 1)
        ? today
        : (firstDay?.date ?? new Date(this.selectedYear, 0, 1)))
    const team = targetTeam ?? (this.showAllTeams ? (wd != null ? this.extraTargetTeam(wd) : null) : this.selectedTeam)

    await dialogService.open(
      personId != null ? 'Extra shift bevestigen' : 'Extra shift',
      <ExtraShiftDialog date={date} shift={wd?.shift ?? 'D'} team={team} personId={personId} onClose={() => dialogService.close()} />,
      { width: '520px', closeDialogOnEsc: true },
    )

    await this.loadExtraShifts()
    this.render()
  }

  get quotaDiffersPerShift() {
    return this.teamQuota(this.selectedTeam ?? '', 'D') !== this.teamQuota(this.selectedTeam ?? '', 'N')
  }

  get maxPerShiftText() {
    return this.quotaDiffersPerShift
      ? `D ${this.teamQuota(this.selectedTeam ?? '', 'D')} · N ${this.teamQuota(this.selectedTeam ?? '', 'N')}`
      : String(this.dailyQuota)
  }

  // Eerste kolom van een ploeg: dikkere lijn als scheiding
  isTeamStart(member: PersonBaseDTO) {
    return this.showAllTeams && this.teamMembers.find(m => m.team === member.team)?.id === member.id && this.teamMembers[0]?.id !== member.id
  }

  get teamCompositionText() {
    return this.shownTeams
      .filter(t => this.teamMembers.some(m => m.team === t))
      .map(t => `${shortTeam(t)} ${this.teamMembers.filter(m => m.team === t).length}`)
      .join(', ')
  }

  // Minimum verlof per persoon = totaal werkdagen * quota / aantal personen
  get minimumLeavePerPerson() {
    return this.teamMembers.length === 0 ? 0 : (this.yearTotalWorkDays * this.dailyQuota) / this.teamMembers.length
  }

  get minimumLeavePerPersonText() {
    return format0dd(this.minimumLeavePerPerson)
  }

  get showAllSpecialities() {
    return this.selectedSpeciality === AllSpecialities
  }

  async init() {
    // Ingelogde gebruiker bepaalt de standaardselectie
    const person = await getCurrentPerson()
    this.selectedTeam = person?.team ?? null
    this.selectedSpeciality = person?.speciality ?? null
    this.currentUserRole = person?.role ?? null // rol voor de autorisatie

    // Admin: alle ploegen; Manager: de ploegen en specialiteiten die hij beheert
    await scopeService.load(true)
    if (scopeService.hasViewChoice) {
      // Link vanaf de loterijpagina: die ploeg/specialiteit tonen (als dat mag)
      if (this.query.spec) this.selectedSpeciality = this.query.spec
      this.buildTeamOptions()
      if (this.query.ploeg && this.teamOptions.includes(this.query.ploeg)) this.selectedTeam = this.query.ploeg
      if (!this.teamOptions.includes(this.selectedTeam ?? '')) this.selectedTeam = this.teamOptions[0] ?? null
      this.selectedSpeciality = this.showAllTeams ? Dispatching : scopeService.fixSpeciality(this.selectedTeam, this.selectedSpeciality, true, true)
      this.buildSpecialityOptions()
      this.buildTeamOptions()
    }

    const y = this.query.jaar
    if (y != null && this.years.includes(y)) this.selectedYear = y

    this.loadViewMode()
    await this.loadPermissions()
    await this.loadTeamCalendar()
    const maand = this.query.maand
    this.selectedMonth = maand != null && maand >= 1 && maand <= 12 ? maand : this.selectedYear === new Date().getFullYear() ? new Date().getMonth() + 1 : 1
  }

  // Specialiteiten van de gekozen ploeg, met "Alle specialiteiten" als dat mag
  buildSpecialityOptions() {
    this.specialityOptions = []
    if (this.showAllTeams) {
      // Alle ploegen bestaat enkel voor Dispatching
      this.specialityOptions.push(Dispatching)
      return
    }
    if (scopeService.canSeeAllSpecialities(this.selectedTeam, true)) this.specialityOptions.push(AllSpecialities)
    this.specialityOptions.push(...scopeService.specialitiesFor(this.selectedTeam, true))
  }

  // Ploegen; bij Dispatching ook "Alle ploegen" als de gebruiker Dispatching van minstens 2 ploegen mag zien
  buildTeamOptions() {
    this.teamOptions = [...scopeService.viewTeams]
    if (allowsAllTeamsView(this.selectedSpeciality) && scopeService.teamsFor(this.selectedSpeciality, true).length >= MinTeamsForAllTeamsView)
      this.teamOptions.push(AllTeams)
  }

  async onTeamChanged() {
    this.selectedSpeciality = this.showAllTeams ? Dispatching : scopeService.fixSpeciality(this.selectedTeam, this.selectedSpeciality, true, true)
    this.buildSpecialityOptions()
    this.buildTeamOptions()
    await this.loadPermissions()
    await this.loadTeamCalendar()
  }

  async onTeamOrSpecialityChanged() {
    this.buildTeamOptions()
    await this.loadPermissions()
    // De dropdown is dan al gewijzigd: niet-opgeslagen wijzigingen van de vorige selectie vervallen
    await this.loadTeamCalendar()
  }

  async changeYear(delta: number) {
    const year = this.selectedYear + delta
    if (year < Math.min(...this.years) || year > Math.max(...this.years)) return

    if (!(await this.canLeave('Je hebt niet-opgeslagen wijzigingen. Wil je ze opslaan voor je van jaar wisselt?'))) return

    this.selectedYear = year
    await this.loadTeamCalendar()
    await this.loadPermissions()
    this.selectedMonth = this.selectedYear === new Date().getFullYear() ? new Date().getMonth() + 1 : 1
  }

  // Niet-opgeslagen wijzigingen: opslaan, niet opslaan of annuleren. true = mag verder.
  async canLeave(question: string): Promise<boolean> {
    if (!this.isDirty) return true
    const choice = await askUnsavedChanges(question)
    if (choice === 'discard') {
      this.isDirty = false // wijzigingen laten vallen
      return true
    }
    if (choice === 'save') {
      await this.saveTeamDaysOff()
      return !this.isDirty // enkel verder als het opslaan gelukt is
    }
    return false
  }

  async onBeforeInternalNavigation(): Promise<boolean> {
    const ok = await this.canLeave('Je hebt niet-opgeslagen wijzigingen. Wil je ze opslaan voor je de pagina verlaat?')
    this.render()
    return ok
  }

  // --- Weergave ---
  get visibleMonths(): MonthGroup[] {
    const m = this.selectedMonth
    if (m == null) return this.monthGroups
    // 2 maanden: de maand ervoor + de gekozen maand (januari: januari + februari)
    return this.monthGroups.filter(g => (this.twoMonths ? g.month === Math.max(m, 2) - 1 || g.month === Math.max(m, 2) : g.month === m))
  }

  get gridTitle() {
    const months = this.visibleMonths
    if (this.selectedMonth == null || months.length === 0) return String(this.selectedYear)
    const name = (g: MonthGroup) => capitalize(formatDate(new Date(g.year, g.month - 1, 1), 'MMMM', Nl))
    return months.length === 1 ? name(months[0]) : `${shortMonth(months[0].month)} – ${shortMonth(months[months.length - 1].month)}`
  }

  get compositionText() {
    return groupBy(this.teamMembers, m => (isNullOrWhiteSpace(m.speciality) ? '(geen)' : m.speciality))
      .map(g => `${shortSpeciality(g.key)} ${g.items.length}`)
      .join(', ')
  }

  yearCount(personId: number) {
    return this.selectedDays.filter(d => d.personId === personId && d.date.getFullYear() === this.selectedYear).length
  }

  memberTitle(member: PersonBaseDTO) {
    const used = this.yearCount(member.id)
    let text =
      `${member.firstName ?? ''} ${member.lastName ?? ''} - ${member.speciality ?? ''} | verlof ${used}` +
      (member.leaveAllowance != null ? `/${member.leaveAllowance}` : '') +
      this.categoryUsageText(member)
    const loose = this.looseCount(member.id)
    const ls = this.lotteryStats.get(member.id)
    if (ls) text += ` | lotingen ${this.selectedYear}: ${ls.won} gewonnen, ${ls.lost} verloren`
    if (!isStaff(member)) text += ' | manager: telt niet mee in de bezetting'
    return loose > 0 ? `${text} | ${loose} losse shift(en)` : text
  }

  publicHolidayName(date: Date): string | null {
    const k = dk(date)
    const h = this.publicHolidays.find(h => h.sk === k)
    return !h ? null : (h.name?.find(n => n.language === 'NL')?.text ?? h.name?.[0]?.text ?? 'Feestdag')
  }

  // Shiften (rijen) waar meer personen verlof hebben dan het maximum
  get overQuotaRows(): WorkDay[] {
    return orderBy(
      this.workDays.filter(wd => this.getTotalSelectedDays(wd) > this.quotaFor(wd)),
      (a, b) => a.k - b.k,
      (a, b) => (a.shift === 'D' ? 0 : 1) - (b.shift === 'D' ? 0 : 1),
    )
  }

  get looseShiftsAll(): SelectedDayOff[] {
    return orderBy(
      this.selectedDays.filter(d => d.date.getFullYear() === this.selectedYear && this.c.members.has(d.personId) && this.isLoose(d)),
      (a, b) => a.date.getTime() - b.date.getTime(),
      (a, b) => (a.shift === 'D' ? 0 : 1) - (b.shift === 'D' ? 0 : 1),
    )
  }

  monthHasIssue(mg: MonthGroup) {
    return (
      mg.days.some(wd => this.getTotalSelectedDays(wd) > this.quotaFor(wd)) ||
      this.selectedDays.some(d => d.date.getFullYear() === mg.year && d.date.getMonth() + 1 === mg.month && this.c.members.has(d.personId) && this.isLoose(d))
    )
  }

  // --- Loting vanuit de teamkalender (bewaard via api/lottery, dus ook op de loterijpagina) ---
  async loadDraws() {
    if (!this.canManageCalendar) {
      this.draws = []
      this.lotteryStats = new Map()
      return
    }
    try {
      this.draws = (await getJson<LotteryDrawDTO[] | null>('api/lottery/draws')) ?? []
      this.lotteryStats = lotteryApi.statsFor(this.draws, this.selectedYear)
    } catch {
      this.draws = []
    }
  }

  // Lotingen voor deze datum waarin iemand van de getoonde personen meedeed
  drawsFor(date: Date): LotteryDrawDTO[] {
    const k = dk(date)
    return this.draws
      .filter(d => dk(parseDate(d.fromDate)) <= k && dk(parseDate(d.toDate)) >= k)
      .filter(d => [...d.winners, ...d.losers].some(p => this.c.members.has(p.personId)))
  }

  // Loting op deze shift: een loting op een paar (Shift null) of op precies deze shift
  hasDraw(wd: WorkDay) {
    return this.drawsFor(wd.date).some(d => d.shift == null || d.shift === wd.shift)
  }

  shiftCount(k: number, shift: string) {
    const cacheKey = `${k}|${shift}`
    const cached = this.c.counts.get(cacheKey)
    if (cached !== undefined) return cached
    const n = this.selectedDays.filter(d => d.k === k && d.shift === shift && this.countsForOccupancy(d.personId)).length
    this.c.counts.set(cacheKey, n)
    return n
  }

  // Bij "Alle ploegen" telt Ploeg0 niet mee voor de bezetting van een andere ploeg (enkel in de eigen weergave van Ploeg0).
  // Een manager van Dispatching telt nooit mee (countsAsStaff).
  countsForOccupancy(personId: number) {
    const member = this.c.members.get(personId)
    if (!member || !isStaff(member)) return false
    return !this.showAllTeams || countsForOtherTeamsOccupancy(member.team)
  }

  // Extra kolom "Totaal": enkel bij alle ploegen, als er Ploeg0-personen getoond worden
  get showTotalColumn() {
    return this.showAllTeams && this.teamMembers.some(m => m.team === NoRegimeTeam)
  }

  // Aanwezig op deze shift: wie werkt (eigen ploeg van dienst, Ploeg0, of een extra shift),
  // geen verlof, geen rust en geen afwezigheidscode heeft (uurcodes tellen als aanwezig)
  presentOnShift(wd: WorkDay) {
    return this.teamMembers
      .filter(isStaff)
      .filter(m => (this.extraOf(m.id, wd) != null || (this.memberWorks(m, wd) && !this.isAbsentByMark(m.id, wd))) && !this.c.days.has(key3(m.id, wd.k, wd.shift)))
      .length
  }

  get showsRest() {
    return this.teamMembers.some(m => allowsRestShifts(m.team))
  }
  get showsOtherAbsences() {
    return this.teamMembers.some(m => allowsOtherAbsences(m.speciality))
  }

  markOf(personId: number, wd: WorkDay) {
    return this.c.marks.get(key3(personId, wd.k, wd.shift)) ?? null
  }

  // Rust of een afwezigheidscode (niet de uurcodes)
  isAbsentByMark(personId: number, wd: WorkDay) {
    const m = this.markOf(personId, wd)
    return m != null && (m.code == null || findOtherAbsence(m.code)?.absent === true)
  }

  dayOffOf(personId: number, wd: WorkDay) {
    return this.c.days.get(key3(personId, wd.k, wd.shift)) ?? null
  }

  // Vakje aangeklikt: in de modus "Andere" een code kiezen, anders verlof/categorie/rust
  async onCellClicked(personId: number, wd: WorkDay) {
    if (this.otherMode) await this.pickOtherAbsence(personId, wd)
    else this.onDayClicked(personId, wd)
  }

  async pickOtherAbsence(personId: number, wd: WorkDay) {
    const member = this.teamMembers.find(m => m.id === personId)!
    if (!allowsOtherAbsences(member.speciality)) {
      notificationService.notify('Warning', 'Andere afwezigheid', `Andere afwezigheden kunnen enkel voor ${AllTeamsSpeciality}.`, 4000)
      return
    }

    const leave = this.dayOffOf(personId, wd)
    const mark = this.markOf(personId, wd)
    const result = await dialogService.open<string | null>(
      `Andere afwezigheid · ${initialsFor(member)}`,
      <OtherAbsenceDialog
        personName={`${member.firstName ?? ''} ${member.lastName ?? ''}`}
        shiftText={`${formatDate(wd.date, 'dddd d MMMM', Nl)} · ${wd.shift === 'D' ? 'dagshift' : 'nachtshift'}`}
        currentCode={mark?.code ?? null}
        hasLeave={leave != null}
        hasRest={mark != null && mark.code == null}
      />,
      { width: '520px', closeDialogOnEsc: true },
    )

    if (typeof result !== 'string') return // geannuleerd
    const code = result

    if (code === '') {
      if (mark?.code != null) this.restShifts.splice(this.restShifts.indexOf(mark), 1)
    } else {
      // Eén status per shift: code vervangt rust of een andere code; verlof gaat weg
      this.restShifts = this.restShifts.filter(r => !(r.personId === personId && r.k === wd.k && r.shift === wd.shift))
      this.restShifts.push({ personId, date: dayOnly(wd.date), k: wd.k, shift: wd.shift, code })
      if (leave != null) this.selectedDays.splice(this.selectedDays.indexOf(leave), 1)
    }
    this.invalidate()
    this.isDirty = true
    this.render()
  }

  toggleRest(personId: number, day: WorkDay, leave: SelectedDayOff | null) {
    const member = this.teamMembers.find(m => m.id === personId)!
    if (!allowsRestShifts(member.team)) {
      notificationService.notify('Warning', 'Rust', `Rust aanduiden kan enkel voor ${NoRegimeTeam}; de andere ploegen hebben hun vrije shiften al in het rooster.`, 4000)
      return
    }

    const existing = this.markOf(personId, day)
    if (existing != null && existing.code == null) this.restShifts.splice(this.restShifts.indexOf(existing), 1)
    else {
      // Rust vervangt een eventuele code op die shift
      if (existing != null) this.restShifts.splice(this.restShifts.indexOf(existing), 1)
      this.restShifts.push({ personId, date: dayOnly(day.date), k: day.k, shift: day.shift, code: null })
      // Rust en verlof samen kan niet: het verlof op die shift gaat weg
      if (leave != null) this.selectedDays.splice(this.selectedDays.indexOf(leave), 1)
    }
    this.invalidate()
    this.isDirty = true
  }

  async loadRestShifts() {
    const list: RestShift[] = []
    // Ploegen met rust (Ploeg0), en bij Dispatching (of alle specialiteiten) elke ploeg voor de codes
    const loadAll = this.showAllSpecialities || allowsOtherAbsences(this.selectedSpeciality)
    for (const team of this.shownTeams.filter(t => loadAll || allowsRestShifts(t))) {
      const url = this.showAllSpecialities
        ? `api/rest-shifts?team=${team}&year=${this.selectedYear}`
        : `api/rest-shifts?team=${team}&year=${this.selectedYear}&speciality=${this.selectedSpeciality ?? ''}`
      try {
        for (const r of (await getJson<RestShiftDTO[] | null>(url)) ?? []) {
          const d = parseDate(r.date)
          list.push({ personId: r.personId, date: d, k: dk(d), shift: r.shift, code: r.code ?? null })
        }
      } catch {
        // geen rust
      }
    }
    this.restShifts = list
    this.invalidate()
  }

  // Rust en codes van de getoonde personen opslaan (vervangt ze in dit jaar). true = gelukt.
  async saveRestShifts(): Promise<boolean> {
    const persons = this.teamMembers.filter(m => allowsRestShifts(m.team) || allowsOtherAbsences(m.speciality))
    if (persons.length === 0) return true

    const request = {
      year: this.selectedYear,
      persons: persons.map(m => ({
        personId: m.id,
        days: this.restShifts
          .filter(r => r.personId === m.id && r.date.getFullYear() === this.selectedYear)
          .map(r => ({ personId: r.personId, date: toApiDate(r.date), shift: r.shift, code: r.code ?? null })),
      })),
    }
    const response = await postJson('api/rest-shifts/save', request)
    if (response.ok) return true

    const serverText = response.status === 400 || response.status === 403 ? await response.text() : null
    notificationService.notify(
      'Error',
      'Rust/afwezigheden niet opgeslagen',
      isNullOrWhiteSpace(serverText) ? 'Opslaan van rust en afwezigheden mislukt.' : serverText!,
      5000,
    )
    return false
  }

  // Minimum aanwezig: per ploeg van dienst (Ploeg1-4) het aantal personen min het verlofmaximum van die shift.
  // Zonder de verhoging door extra shiften: wie bijspringt telt al als aanwezig.
  minimumOnShift(wd: WorkDay) {
    return this.teamsOn(wd)
      .filter(countsForOtherTeamsOccupancy)
      .reduce((s, t) => s + Math.max(0, this.teamMembers.filter(m => m.team === t && isStaff(m)).length - this.teamQuota(t, wd.shift)), 0)
  }

  // Gelden de regels "per 2 shiften" (losse shiften, paren) niet voor deze persoon?
  isNoRegime(personId: number) {
    return !pairRulesApply(this.c.members.get(personId)?.team)
  }

  // Loting per shift in plaats van per paar: de getoonde ploeg heeft geen werkregime, of iedereen op die shift niet
  lotteryPerShift(wd: WorkDay) {
    if (!this.showAllTeams) return lotteryPerShift(this.selectedTeam)
    const teams = this.teamsOn(wd)
    return teams.length > 0 && teams.every(lotteryPerShift)
  }

  pairOverQuota(wd: WorkDay) {
    if (this.lotteryPerShift(wd)) return this.shiftCount(wd.k, wd.shift) > this.quotaFor(wd)
    const [day, night] = pairOf(wd)
    return this.shiftCount(dk(day), 'D') > this.quotaForDate(day, 'D') || this.shiftCount(dk(night), 'N') > this.quotaForDate(night, 'N')
  }

  // Iedereen met verlof op de dag- en/of nachtshift van het paar
  buildCandidates(day: Date, night: Date): LotteryCandidate[] {
    const dayK = dk(day)
    const nightK = dk(night)
    const groups = groupBy(
      this.selectedDays
        .filter(d => (d.k === dayK && d.shift === 'D') || (d.k === nightK && d.shift === 'N'))
        .filter(d => this.countsForOccupancy(d.personId)), // alle ploegen: Ploeg0 loot niet mee met een andere ploeg
      d => d.personId,
    )
    const list = groups
      .map((g): LotteryCandidate | null => {
        const member = this.teamMembers.find(m => m.id === g.key)
        const catId = g.items.map(d => d.leaveCategoryId).find(id => id != null)
        const category = catId != null ? (this.leaveCategories.find(c => c.id === catId) ?? null) : null
        const shifts = orderBy([...new Set(g.items.map(d => d.shift))], (a, b) => (a === 'D' ? 0 : 1) - (b === 'D' ? 0 : 1))
        return !member
          ? null
          : {
              personId: member.id,
              firstName: member.firstName ?? '',
              lastName: member.lastName ?? '',
              category: category?.name ?? null,
              color: category?.color ?? null,
              shifts: shifts.join('+'),
            }
      })
      .filter((c): c is LotteryCandidate => c != null)
    return orderBy(
      list,
      (a, b) => compareText(a.lastName, b.lastName),
      (a, b) => compareText(a.firstName, b.firstName),
    )
  }

  // Popup met het gedeelde lotingformulier (zelfde als op de loterijpagina)
  async openLottery(wd: WorkDay) {
    // Ploeg0: loting op deze ene shift; anders per paar (dag + nacht erna)
    const perShift = this.lotteryPerShift(wd)
    const [day, night] = perShift ? [dayOnly(wd.date), dayOnly(wd.date)] : pairOf(wd)
    const dayText = day.getMonth() === night.getMonth() ? formatDate(day, '%d', Nl) : formatDate(day, 'd MMMM', Nl)
    const title = perShift
      ? `Loting · ${formatDate(wd.date, 'd MMMM yyyy', Nl)} · ${wd.shift === 'D' ? 'dagshift' : 'nachtshift'}`
      : `Loting · ${dayText}–${formatDate(night, 'd MMMM yyyy', Nl)}`

    const props: LotteryFormProps = {
      dayDate: day,
      nightDate: night,
      quota: perShift ? this.quotaFor(wd) : Math.max(this.quotaForDate(day, 'D'), this.quotaForDate(night, 'N')),
      canApply: this.canSaveTeamCalendar,
      allowAddPeople: true,
      load: async (): Promise<LotteryFormContext> => {
        await this.loadDraws()
        return {
          candidates: this.buildCandidates(day, night),
          existingDraws: groupBy([...this.drawsFor(day), ...this.drawsFor(night)], d => d.drawNumber)
            .map(g => g.items[0])
            .filter(d => !perShift || d.shift == null || d.shift === wd.shift),
          teamMembers: this.teamMembers,
          stats: lotteryApi.statsFor(this.draws, this.selectedYear),
          nextDrawNumber: this.draws.length === 0 ? 1 : Math.max(...this.draws.map(d => d.drawNumber)) + 1,
        }
      },
      onRemoved: (removed: RestoredDayOffDTO[]) => {
        // Server haalde het verlof al weg: hier ook uit het raster (niet-opgeslagen wijzigingen blijven)
        const keys = new Set(removed.map(r => key3(r.personId, dk(parseDate(r.date)), r.shift)))
        this.selectedDays = this.selectedDays.filter(d => !keys.has(key3(d.personId, d.k, d.shift)))
        this.invalidate()
        this.render()
      },
      onRestored: (restored: RestoredDayOffDTO[]) => {
        for (const r of restored) {
          const date = parseDate(r.date)
          if (this.selectedDays.some(d => d.personId === r.personId && d.k === dk(date) && d.shift === r.shift)) continue
          this.selectedDays.push({ personId: r.personId, date, k: dk(date), shift: r.shift, leaveCategoryId: r.leaveCategoryId ?? null })
        }
        this.invalidate()
        this.render()
      },
      onClose: () => dialogService.close(),
    }
    if (perShift) props.onlyShift = wd.shift

    await dialogService.open(title, <LotteryForm {...props} />, { width: '580px', closeDialogOnEsc: true })

    await this.loadDraws()
  }

  // Naar de maand van een datum springen en die rij in beeld brengen
  async jumpTo(date: Date | null | undefined) {
    if (!date) return
    this.selectedMonth = date.getMonth() + 1
    flushSync(() => this.render())
    await Promise.resolve()
    const row = this.workDays.find(w => w.k === dk(date))
    if (row) scrollToId(rowId(row))
  }

  async loadPermissions() {
    try {
      // Rechten van de getoonde ploeg/specialiteit (een manager kan meerdere ploegen beheren)
      let url = `api/access/calendar-permissions?year=${this.selectedYear}`
      if (this.selectedTeam && this.selectedSpeciality && !this.showAllSpecialities && !this.showAllTeams)
        url += `&team=${encodeURIComponent(this.selectedTeam)}&speciality=${encodeURIComponent(this.selectedSpeciality)}`

      const resp = await send(url)
      if (resp.ok) {
        this.perms = (await resp.json()) as CalendarPermissionsDTO | null
      } else {
        this.perms = null
        notificationService.notify('Warning', 'Permissies', `Permissies laden mislukt (${resp.status}).`, 4000)
      }
    } catch (ex) {
      this.perms = null
      notificationService.notify('Error', 'Permissies', ex instanceof Error ? ex.message : String(ex), 4000)
    }
  }

  // Aantal personen met verlof op deze shift (kolom "Verlof").
  // Bij "Alle ploegen" telt Ploeg0 niet mee voor de bezetting van de andere ploegen.
  getTotalSelectedDays(wd: WorkDay) {
    return this.shiftCount(wd.k, wd.shift)
  }

  onDayClicked(personId: number, day: WorkDay) {
    const existing = this.dayOffOf(personId, day)

    if (this.restMode) {
      this.toggleRest(personId, day, existing)
      return
    }

    if (this.activeCategoryName == null) {
      // Gewoon verlof: aan/uit
      if (existing == null) this.selectedDays.push({ personId, date: day.date, k: day.k, shift: day.shift })
      else this.selectedDays.splice(this.selectedDays.indexOf(existing), 1)
    } else {
      // Categorie van de specialiteit van deze persoon
      const member = this.teamMembers.find(m => m.id === personId)!
      const category = this.categoryFor(member, this.activeCategoryName)
      if (category == null) {
        notificationService.notify('Warning', this.activeCategoryName, `'${this.activeCategoryName}' bestaat niet voor ${member.speciality ?? ''}.`, 4000)
        return
      }

      if (existing?.leaveCategoryId === category.id) {
        // Nog eens klikken zet de shift volledig uit
        this.selectedDays.splice(this.selectedDays.indexOf(existing), 1)
        this.invalidate()
        this.isDirty = true
        return
      }

      if (this.categoryUsage(personId, category.id) >= category.maxShifts) {
        notificationService.notify(
          'Warning',
          category.name,
          `${member.firstName ?? ''} ${member.lastName ?? ''} heeft al ${category.maxShifts} shiften als '${category.name}'.`,
          4000,
        )
        return
      }

      if (existing == null) this.selectedDays.push({ personId, date: day.date, k: day.k, shift: day.shift, leaveCategoryId: category.id })
      else existing.leaveCategoryId = category.id
    }
    this.invalidate()

    this.isDirty = true

    // Verlof en rust samen kan niet: verlof gaat voor
    if (this.dayOffOf(personId, day) != null) {
      this.restShifts = this.restShifts.filter(r => !(r.personId === personId && r.k === day.k && r.shift === day.shift))
      this.invalidate()
    }

    // Enkel melden voor de rij die net gewijzigd werd
    const count = this.getTotalSelectedDays(day)
    const quota = this.quotaFor(day)

    if (count > quota) {
      notificationService.notify(
        'Error',
        'Fout',
        `Opgelet: ${count} verlofdagen voor ${pad2(day.date.getDate())}/${pad2(day.date.getMonth() + 1)}/${day.date.getFullYear()} (quota: ${quota}).`,
        5000,
      )
    }
  }

  async loadTeamCalendar() {
    const speciality = this.selectedSpeciality

    // "Alle ploegen": dezelfde specialiteit van elke ploeg die de gebruiker mag zien, naast elkaar
    this.shownTeams = this.showAllTeams ? scopeService.teamsFor(speciality, true) : [this.selectedTeam ?? '']

    const members: PersonBaseDTO[] = []
    const daysOff: TeamDayOffDTO[] = []
    const categories: LeaveCategoryDTO[] = []
    const quotaRules: ShiftQuotaDTO[] = []
    this.workDaysByTeam = new Map()
    for (const teamName of this.shownTeams) {
      // Teamleden
      members.push(
        ...((this.showAllSpecialities
          ? await getJson<PersonBaseDTO[] | null>(`api/person/team/${teamName}`)
          : await getJson<PersonBaseDTO[] | null>(`api/person/team/${teamName}/${speciality ?? ''}`)) ?? []),
      )

      // Werkdagen van de ploeg (elke ploeg heeft zijn eigen rooster)
      this.workDaysByTeam.set(
        teamName,
        ((await getJson<WorkDayDTO[] | null>(`api/calender?teamName=${teamName}&year=${this.selectedYear}`)) ?? []).map(w => {
          const date = parseDate(w.date)
          return { date, shift: w.shift, k: dk(date) }
        }),
      )

      // Verlofdagen per ploeg (en specialiteit)
      const daysOffUrl = this.showAllSpecialities
        ? `api/person/team-days-off/${teamName}/${this.selectedYear}`
        : `api/person/team-days-off/${teamName}/${this.selectedYear}/${speciality ?? ''}`
      daysOff.push(...((await getJson<TeamDayOffDTO[] | null>(daysOffUrl)) ?? []))

      // Verlofcategorieën (kleuren) per ploeg/specialiteit
      try {
        const catUrl = this.showAllSpecialities
          ? `api/leave-categories?team=${teamName}&year=${this.selectedYear}`
          : `api/leave-categories?team=${teamName}&speciality=${speciality ?? ''}&year=${this.selectedYear}`
        categories.push(...((await getJson<LeaveCategoryDTO[] | null>(catUrl)) ?? []))
      } catch {
        // geen categorieën voor deze ploeg
      }

      // Ingestelde maxima per shift van deze ploeg (zonder regel: standaard)
      try {
        quotaRules.push(...((await getJson<ShiftQuotaDTO[] | null>(`api/shift-quotas?team=${teamName}&year=${this.selectedYear}`)) ?? []))
      } catch {
        // standaard
      }
    }
    this.shiftQuotaRules = quotaRules

    // Gegroepeerd per ploeg (volgorde van de keuzelijst)
    this.teamMembers = orderBy(members, (a, b) => this.shownTeams.indexOf(a.team ?? '') - this.shownTeams.indexOf(b.team ?? ''))
    this.leaveCategories = groupBy(categories, c => c.id).map(g => g.items[0])
    this.teamDaysOff = daysOff

    // Rijen: elke shift waarop minstens één getoonde ploeg werkt (bij alle ploegen: enkel ploegen met personen)
    const rowSource =
      this.showAllTeams && this.teamMembers.length > 0 ? [...this.workDaysByTeam].filter(([team]) => this.teamMembers.some(m => m.team === team)) : [...this.workDaysByTeam]
    const rowTeams = new Map<string, string[]>()
    const rowKeys = new Map<string, WorkDay>()
    for (const [team, days] of rowSource)
      for (const w of days) {
        const key = `${w.k}|${w.shift}`
        const teams = rowTeams.get(key)
        if (!teams) {
          rowTeams.set(key, [team])
          rowKeys.set(key, { date: dayOnly(w.date), shift: w.shift, k: w.k })
        } else if (!teams.includes(team)) teams.push(team)
      }
    this.rowTeams = rowTeams
    this.workDays = orderBy(
      [...rowKeys.values()],
      (a, b) => a.k - b.k,
      (a, b) => (a.shift === 'D' ? 0 : 1) - (b.shift === 'D' ? 0 : 1),
    )

    // Synchroniseer selectie met bestaande verlofdagen
    this.selectedDays = this.teamDaysOff.map(d => {
      const date = parseDate(d.date)
      return { personId: d.personId, date, k: dk(date), shift: d.shift, leaveCategoryId: d.leaveCategoryId ?? null }
    })
    this.invalidate()

    if (this.activeCategoryName != null && this.leaveCategories.every(c => c.name !== this.activeCategoryName)) this.activeCategoryName = null

    const toHolidays = (list: HolidayDTO[]): Holiday[] => list.map(h => ({ name: h.name, sk: dk(parseDate(h.startDate)), ek: dk(parseDate(h.endDate)) }))

    // Schoolvakanties (stipje in de datumkolom)
    try {
      this.schoolHolidays = toHolidays((await getJson<HolidayDTO[] | null>(`api/holidays/school/${this.selectedYear}`)) ?? [])
    } catch {
      this.schoolHolidays = []
    }

    // Feestdagen (stipje in de datumkolom)
    try {
      this.publicHolidays = toHolidays((await getJson<HolidayDTO[] | null>(`api/holidays/public/${this.selectedYear}`)) ?? [])
    } catch {
      this.publicHolidays = []
    }

    await this.loadDraws()
    await this.loadExtraShifts()
    await this.loadRestShifts()
    if (!this.showsOtherAbsences) this.otherMode = false
    if (!this.showsRest) this.restMode = false

    this.isDirty = false

    // Bouw maand-groepen
    this.monthGroups = groupBy(this.workDays, w => w.date.getFullYear() * 100 + w.date.getMonth() + 1)
      .sort((a, b) => a.key - b.key)
      .map(g => ({
        year: Math.trunc(g.key / 100),
        month: g.key % 100,
        days: orderBy(g.items, (a, b) => a.date.getTime() - b.date.getTime()),
      }))

    this.invalidate()
    this.render()
  }

  // --- Weergave: raster of lijst per shift (enkel bekijken; standaard op gsm) ---
  loadViewMode() {
    try {
      const saved = localStorage.getItem(ViewKey)
      this.listView = saved === 'list' || (saved !== 'grid' && isMobile())
    } catch {
      this.listView = false
    }
  }

  setListView(list: boolean) {
    this.listView = list
    try {
      localStorage.setItem(ViewKey, list ? 'list' : 'grid')
    } catch {
      /* niet bewaard: enkel voor deze keer */
    }
  }

  // Wie op deze shift afwezig is (verlof, code, rust) of bijspringt (extra shift), voor de lijstweergave
  listItems(wd: WorkDay): ListChip[] {
    const chips: ListChip[] = []
    const when = `${formatDate(wd.date, 'ddd d MMM', Nl)} ${wd.shift}`
    for (const m of this.teamMembers) {
      const extra = this.extraOf(m.id, wd)
      if (!this.memberWorks(m, wd) && extra == null) continue
      const name = `${m.firstName ?? ''} ${m.lastName ?? ''}`
      const label = (this.showAllTeams ? shortTeam(m.team) + ' ' : '') + initialsFor(m)

      const leave = this.dayOffOf(m.id, wd)
      if (leave != null) {
        const cat = leave.leaveCategoryId != null ? (this.leaveCategories.find(c => c.id === leave.leaveCategoryId) ?? null) : null
        const loose = this.isLoose(leave)
        chips.push({
          order: 0,
          css: loose ? 'tc-lchip tc-lchip-leave tc-lchip-loose' : 'tc-lchip tc-lchip-leave',
          style: `background:${cat?.color ?? 'var(--rz-info)'};`,
          title: `${name} · ${when} · ${cat?.name ?? 'Verlof'}` + (loose ? ' · Losse shift' : ''),
          text: label,
        })
        continue
      }

      const mark = this.markOf(m.id, wd)
      const other = findOtherAbsence(mark?.code)
      if (other != null)
        chips.push({
          order: 1,
          css: other.absent ? 'tc-lchip tc-lchip-absent' : 'tc-lchip tc-lchip-hour',
          style: null,
          title: `${name} · ${when} · ${other.code} (${other.name})`,
          text: `${label} ${other.code}`,
        })
      else if (mark != null) chips.push({ order: 2, css: 'tc-lchip tc-lchip-rest', style: null, title: `${name} · ${when} · Rust`, text: `${label} rust` })

      if (extra != null && !this.memberWorks(m, wd))
        chips.push({
          order: 3,
          css: 'tc-lchip tc-lchip-extra',
          style: null,
          title: `${name} · ${when} · extra shift in ${extra.team}`,
          text: `${label} → ${shortTeam(extra.team)}`,
        })
    }

    // Eén ploeg: wie uit een andere ploeg bijspringt
    for (const e of this.extrasOnRow(wd).filter(e => !this.c.members.has(e.personId)))
      chips.push({
        order: 3,
        css: 'tc-lchip tc-lchip-extra',
        style: null,
        title: `${e.firstName ?? ''} ${e.lastName ?? ''} (${e.personTeam ?? ''}) · ${when} · extra shift`,
        text: `${e.initials ?? ''} +${shortTeam(e.personTeam)}`,
      })

    return orderBy(
      chips,
      (a, b) => a.order - b.order,
      (a, b) => compareText(a.text, b.text),
    )
  }

  // Per persoon: categorieën met "aansluitend" waarvan de shiften geen ononderbroken reeks in het rooster vormen
  notConsecutiveWarnings(): string[] {
    const sortRoster = (list: WorkDay[]) =>
      orderBy(
        list,
        (a, b) => a.date.getTime() - b.date.getTime(),
        (a, b) => (a.shift === 'D' ? 0 : 1) - (b.shift === 'D' ? 0 : 1),
      )
    const allRoster = sortRoster(this.workDays)
    const warnings: string[] = []

    for (const member of this.teamMembers) {
      // Rooster van de ploeg van deze persoon (bij alle ploegen verschilt het per persoon)
      const own = this.workDaysByTeam.get(member.team ?? '')
      const roster = own ? sortRoster(own) : allRoster
      for (const category of this.leaveCategories.filter(c => c.mustBeConsecutive && c.team === member.team && c.speciality === member.speciality)) {
        const positions = roster
          .map((w, i) => ({ w, i }))
          .filter(x => this.selectedDays.some(d => d.personId === member.id && d.k === x.w.k && d.shift === x.w.shift && d.leaveCategoryId === category.id))
          .map(x => x.i)

        if (positions.length > 1 && Math.max(...positions) - Math.min(...positions) + 1 !== positions.length)
          warnings.push(`${member.firstName ?? ''} ${member.lastName ?? ''}: '${category.name}' is niet aansluitend`)
      }
    }
    return warnings
  }

  // Verlof neem je normaal per 2 shiften: dagshift (D) op dag X + nachtshift (N) op dag X+1.
  // Een losse shift is een aangeduide shift waarvan de partner (voor dezelfde persoon) niet aangeduid is.
  isLoose(day: SelectedDayOff) {
    // Ploeg0 heeft geen werkregime: daar gelden losse shiften en paren niet
    if (this.isNoRegime(day.personId)) return false
    const partnerDate = day.shift === 'D' ? addDays(day.date, 1) : addDays(day.date, -1)
    const partnerShift = day.shift === 'D' ? 'N' : 'D'
    return !this.c.days.has(key3(day.personId, dk(partnerDate), partnerShift))
  }

  looseCount(personId: number) {
    return this.selectedDays.filter(d => d.personId === personId && d.date.getFullYear() === this.selectedYear && this.isLoose(d)).length
  }

  async saveTeamDaysOff() {
    if (!this.canManageCalendar) {
      notificationService.notify('Warning', 'Geen toegang', 'Je hebt geen toestemming om te bewaren.', 3000)
      return
    }

    // Categorieën die aansluitend moeten zijn: niet opslaan zolang het bij iemand niet aansluit
    const notConsecutive = this.notConsecutiveWarnings()
    if (notConsecutive.length > 0) {
      notificationService.notify('Error', 'Niet opgeslagen: niet aansluitend', notConsecutive.join('; '), 8000)
      return
    }

    // Losse shiften mogen, maar enkel bewust: eerst bevestigen
    const loose = this.teamMembers.map(m => ({ member: m, count: this.looseCount(m.id) })).filter(x => x.count > 0)
    if (loose.length > 0) {
      const list =
        loose
          .slice(0, 8)
          .map(x => `${x.member.firstName ?? ''} ${x.member.lastName ?? ''} (${x.count})`)
          .join(', ') + (loose.length > 8 ? ` en nog ${loose.length - 8} personen` : '')
      const confirmed = await dialogService.confirm(
        `Er zijn losse shiften (dag zonder nacht of omgekeerd) bij: ${list}. Verlof neem je normaal per 2 shiften. Toch opslaan?`,
        'Losse shiften',
        { okButtonText: 'Opslaan', cancelButtonText: 'Terug' },
      )
      if (confirmed !== true) return
    }

    // Stuur ALLE teamleden mee, ook met lege 'Days' (maakt verwijderen mogelijk)
    const persons = this.teamMembers.map(m => ({
      persoonId: m.id,
      days: this.selectedDays
        .filter(d => d.personId === m.id && d.date.getFullYear() === this.selectedYear)
        .map(d => ({ date: toApiDate(d.date), shift: d.shift, leaveCategoryId: d.leaveCategoryId ?? null })),
    }))

    const payload = { year: this.selectedYear, persons }

    const response = await postJson('api/calender/add-multiple-dayoff', payload)

    if (response.ok) {
      // Daarna de rust (Ploeg0); lukt dat niet, dan blijven de wijzigingen "niet opgeslagen"
      if (!(await this.saveRestShifts())) return
      this.isDirty = false
      notificationService.notify(
        'Success',
        'Opgeslagen',
        this.showsOtherAbsences ? 'Verlof en afwezigheden zijn opgeslagen.' : this.showsRest ? 'Verlof en rust zijn opgeslagen.' : 'Geselecteerde verlofdagen zijn opgeslagen.',
        2000,
      )
    } else {
      // 400 (validatie) of 403 (bv. demo modus): de reden van de server tonen als die er is
      const serverText = response.status === 400 || response.status === 403 ? await response.text() : null
      const reason = isNullOrWhiteSpace(serverText) ? 'Opslaan van verlofdagen mislukt.' : serverText!
      notificationService.notify('Error', 'Fout', reason, 5000)
    }
  }

  exportToCsv() {
    const lines: string[] = []

    // Groepeer per datum en shift
    const grouped = orderBy(
      groupBy(this.selectedDays, d => `${d.k}|${d.shift}`),
      (a, b) => a.items[0].k - b.items[0].k,
      (a, b) => compareText(a.items[0].shift, b.items[0].shift),
    )

    // Bepaal het maximum aantal personen met verlof op één dag/shift
    const maxCount = grouped.length > 0 ? Math.max(...grouped.map(g => g.items.length)) : 0

    // Bouw de header: Datum,Shift,V1,V2,...
    let header = 'Datum,Shift'
    for (let i = 1; i <= maxCount; i++) header += `,V${i}`
    lines.push(header)

    // Vul de rijen
    for (const group of grouped) {
      // Initialen ophalen en sorteren
      const initials = orderBy(
        [
          ...new Set(
            group.items
              .map(d => {
                const person = this.teamMembers.find(p => p.id === d.personId)
                return person ? initialsFor(person) : ''
              })
              .filter(i => !isNullOrWhiteSpace(i)),
          ),
        ],
        compareText,
      )

      // Bouw de regel: Datum,Shift,V1,V2,...
      const d = group.items[0].date
      let row = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())},${group.items[0].shift}`
      for (let i = 0; i < maxCount; i++) {
        row += ','
        if (i < initials.length) row += initials[i]
      }
      lines.push(row)
    }

    // AppendLine (Environment.NewLine in de browser = "\n"), UTF-8 zonder BOM, base64
    const csv = lines.map(l => l + '\n').join('')
    const bytes = new TextEncoder().encode(csv)
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    const base64 = btoa(bin)

    ensureDownloadFunction()
    window.downloadFileFromBase64!('teamkalender.csv', base64)
  }
}

type Ev = <A extends unknown[]>(fn: (...args: A) => unknown) => (...args: A) => void

export function TeamCalendar() {
  usePageTitle('Teamkalender')
  const [searchParams] = useSearchParams()
  const [, setTick] = useState(0)
  const ref = useRef<Model | null>(null)
  if (!ref.current) {
    ref.current = new Model()
    ref.current.query = {
      jaar: intParam(searchParams.get('jaar')),
      maand: intParam(searchParams.get('maand')),
      ploeg: searchParams.get('ploeg'),
      spec: searchParams.get('spec'),
    }
  }
  const m = ref.current
  m.render = () => setTick(t => t + 1)
  m.invalidate()

  useEffect(() => {
    ensureDownloadFunction()
    void m.init().finally(() => m.render())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // EventCallback: render na het synchrone deel en na afloop
  const ev: Ev =
    fn =>
    (...args) => {
      const r = fn(...args)
      m.render()
      if (r instanceof Promise) void r.finally(() => m.render())
    }

  // Waarschuwen bij verlaten van de pagina met niet-opgeslagen wijzigingen
  const lock = <NavigationLock confirmExternalNavigation={m.isDirty} onBeforeInternalNavigation={() => m.onBeforeInternalNavigation()} active={m.isDirty} />
  const script = <script dangerouslySetInnerHTML={{ __html: downloadScript }} />

  if (m.monthGroups.length === 0)
    return (
      <>
        {lock}
        <h1>Teamkalender</h1>
        {'\n    '}
        <p className="wc-loading">Teamkalender laden…</p>
        {script}
      </>
    )

  const overRows = m.overQuotaRows
  const loose = m.looseShiftsAll
  const canSave = m.canSaveTeamCalendar
  const visibleMonths = m.visibleMonths
  const showAllTeams = m.showAllTeams
  const showAllSpecialities = m.showAllSpecialities
  const showTotal = m.showTotalColumn
  const plainActive = m.activeCategoryName == null && !m.restMode && !m.otherMode

  return (
    <>
      {lock}
      {/* Kop: titel, jaar, ploeg/specialiteit, acties */}
      <div className="wc-header">
        <div className="wc-title">
          <h1>Teamkalender</h1>{' '}
          <div className="wc-year" role="group" aria-label="Jaar kiezen">
            <button type="button" className="wc-year-btn" aria-label="Vorig jaar" disabled={m.selectedYear <= Math.min(...m.years)} onClick={ev(() => m.changeYear(-1))}>
              <i className="rzi">chevron_left</i>
            </button>{' '}
            <span className="wc-year-label">{m.selectedYear}</span>{' '}
            <button type="button" className="wc-year-btn" aria-label="Volgend jaar" disabled={m.selectedYear >= Math.max(...m.years)} onClick={ev(() => m.changeYear(1))}>
              <i className="rzi">chevron_right</i>
            </button>
          </div>
          {scopeService.hasViewChoice ? (
            <>
              <DropDown
                data={m.teamOptions}
                value={m.selectedTeam}
                onChange={ev((v: string | null) => {
                  m.selectedTeam = v
                  return m.onTeamChanged()
                })}
                placeholder="Ploeg"
                style="width:140px"
              />{' '}
              <DropDown
                data={m.specialityOptions}
                value={m.selectedSpeciality}
                onChange={ev((v: string | null) => {
                  m.selectedSpeciality = v
                  return m.onTeamOrSpecialityChanged()
                })}
                placeholder="Specialiteit"
                style="width:200px"
              />
            </>
          ) : (
            <span className="tc-scope">
              {m.selectedTeam ?? ''} · {m.selectedSpeciality ?? ''}
            </span>
          )}
          {m.isDirty && (
            <span className="wc-dirty">
              <i className="rzi">edit</i> Niet opgeslagen
            </span>
          )}
        </div>{' '}
        <div className="wc-actions">
          {/* Raster (aanduiden) of lijst per shift (enkel bekijken, standaard op gsm) */}
          <div className="tc-view-toggle" role="group" aria-label="Weergave">
            <button
              type="button"
              className={m.listView ? 'tc-view-btn' : 'tc-view-btn tc-view-active'}
              aria-pressed={m.listView ? 'false' : 'true'}
              title="Raster: personen naast elkaar (aanduiden)"
              onClick={ev(() => m.setListView(false))}
            >
              <i className="rzi">grid_on</i>
              <span className="tc-view-text">Raster</span>
            </button>{' '}
            <button
              type="button"
              className={m.listView ? 'tc-view-btn tc-view-active' : 'tc-view-btn'}
              aria-pressed={m.listView ? 'true' : 'false'}
              title="Lijst per shift: wie is er afwezig (enkel bekijken)"
              onClick={ev(() => m.setListView(true))}
            >
              <i className="rzi">view_agenda</i>
              <span className="tc-view-text">Lijst</span>
            </button>
          </div>
          {m.canExport && <Button text="Export" icon="download" buttonStyle="Light" onClick={ev(() => m.exportToCsv())} title="Exporteren naar CSV" />}
          {canSave && <Button text="Opslaan" icon="save" buttonStyle="Primary" onClick={ev(() => m.saveTeamDaysOff())} />}
        </div>
      </div>{' '}
      {/* Samenvatting */}
      <div className="wc-summary">
        <div className="wc-stat">
          <div className="wc-stat-label">Personen</div> <div className="wc-stat-value">{m.teamMembers.length}</div>{' '}
          <div className="wc-stat-note">{showAllSpecialities ? m.compositionText : showAllTeams ? m.teamCompositionText : m.selectedSpeciality}</div>
        </div>{' '}
        <div className="wc-stat">
          <div className="wc-stat-label">Max per shift</div>
          {showAllTeams ? (
            <>
              <div className="wc-stat-value">per ploeg</div>{' '}
              <div className="wc-stat-note">
                {m.shownTeams
                  .filter(t => m.teamQuota(t) > 0 && countsForOtherTeamsOccupancy(t))
                  .map(t => (m.teamQuota(t, 'D') === m.teamQuota(t, 'N') ? `${shortTeam(t)}: ${m.teamQuota(t)}` : `${shortTeam(t)}: D ${m.teamQuota(t, 'D')} / N ${m.teamQuota(t, 'N')}`))
                  .join(' · ')}
              </div>
            </>
          ) : (
            <>
              <div className="wc-stat-value">{m.maxPerShiftText}</div>{' '}
              <div className="wc-stat-note">min. verlof p.p.: {m.minimumLeavePerPersonText}</div>
            </>
          )}
        </div>
        <button
          type="button"
          className={overRows.length > 0 ? 'wc-stat tc-stat-btn wc-stat-over' : 'wc-stat tc-stat-btn'}
          disabled={overRows.length === 0}
          title={overRows.length > 0 ? 'Spring naar de eerste shift boven het maximum' : undefined}
          onClick={ev(() => m.jumpTo(overRows[0]?.date))}
        >
          <span className={overRows.length > 0 ? 'wc-stat-label tc-label-over' : 'wc-stat-label'}>Shiften boven max</span>{' '}
          <span className={`wc-stat-value ${overRows.length > 0 ? 'tc-value-over' : ''}`}>{overRows.length}</span>{' '}
          <span className="wc-stat-note">{overRows.length > 0 ? 'klik om te bekijken' : 'alles binnen het maximum'}</span>
        </button>{' '}
        <button
          type="button"
          className={loose.length > 0 ? 'wc-stat tc-stat-btn wc-stat-warn' : 'wc-stat tc-stat-btn'}
          disabled={loose.length === 0}
          title={loose.length > 0 ? 'Spring naar de eerste losse shift' : undefined}
          onClick={ev(() => m.jumpTo(loose[0]?.date))}
        >
          <span className={loose.length > 0 ? 'wc-stat-label tc-label-warn' : 'wc-stat-label'}>Losse shiften</span>{' '}
          <span className={`wc-stat-value ${loose.length > 0 ? 'tc-value-warn' : ''}`}>{loose.length}</span>{' '}
          <span className="wc-stat-note">{loose.length > 0 ? 'dag zonder nacht of omgekeerd' : 'alles per 2 shiften'}</span>
        </button>
      </div>{' '}
      {/* Maanden */}
      <div className="tc-months" role="group" aria-label="Maand kiezen">
        {m.monthGroups.map((mg, mi) => {
          const isActive = m.selectedMonth != null && visibleMonths.some(v => v.month === mg.month)
          const hasIssue = m.monthHasIssue(mg)
          return (
            <button
              key={mi}
              type="button"
              className={isActive ? 'tc-month tc-month-active' : 'tc-month'}
              aria-pressed={isActive ? 'true' : 'false'}
              title={hasIssue ? 'Deze maand heeft shiften boven het maximum of losse shiften' : undefined}
              onClick={ev(() => {
                m.selectedMonth = mg.month
              })}
            >
              {shortMonth(mg.month)}
              {hasIssue && <span className="tc-month-dot" />}
            </button>
          )
        })}
        <button
          type="button"
          className={m.selectedMonth == null ? 'tc-month tc-month-active' : 'tc-month'}
          aria-pressed={m.selectedMonth == null ? 'true' : 'false'}
          onClick={ev(() => {
            m.selectedMonth = null
          })}
        >
          {'\n            Hele jaar\n        '}
        </button>{' '}
        <label className="tc-two-months" title="Toon de gekozen maand samen met de maand ervoor, handig voor verlof dat over de maandgrens loopt">
          <input
            type="checkbox"
            checked={m.twoMonths}
            disabled={m.selectedMonth == null}
            onChange={ev((e: ChangeEvent<HTMLInputElement>) => {
              m.twoMonths = e.target.checked
            })}
          />
          {'\n            2 maanden\n        '}
        </label>
      </div>{' '}
      {/* Aanduiden als + legende */}
      <div className="wc-toolbar">
        {(m.leaveCategories.length > 0 || m.showsRest || m.showsOtherAbsences) && canSave && !m.listView ? (
          <div className="wc-categories" role="group" aria-label="Aanduiden als">
            <span className="wc-toolbar-label">Aanduiden als</span>{' '}
            <button
              type="button"
              className="wc-pill"
              style={parseStyle(plainActive ? 'background:var(--rz-info); border-color:var(--rz-info); color:#fff;' : 'border-color:var(--rz-info); color:var(--rz-info-dark);')}
              aria-pressed={plainActive ? 'true' : 'false'}
              onClick={ev(() => {
                m.activeCategoryName = null
                m.restMode = false
                m.otherMode = false
              })}
            >
              {'\n                    Gewoon verlof\n                '}
            </button>
            {m.categoryChoices.map(c => {
              const isActive = m.activeCategoryName === c.name && !m.restMode && !m.otherMode
              return (
                <button
                  key={c.name}
                  type="button"
                  className="wc-pill"
                  style={parseStyle(isActive ? `background:${c.color}; border-color:${c.color}; color:#fff;` : `border-color:${c.color}; color:${c.color};`)}
                  aria-pressed={isActive ? 'true' : 'false'}
                  onClick={ev(() => {
                    m.activeCategoryName = c.name
                    m.restMode = false
                    m.otherMode = false
                  })}
                >
                  {c.name}
                </button>
              )
            })}
            {m.showsRest && (
              // Ploeg0 (geen werkregime): shift waarop iemand niet werkt, geen verlof
              <button
                type="button"
                className={m.restMode ? 'wc-pill tc-pill-rest tc-pill-rest-active' : 'wc-pill tc-pill-rest'}
                aria-pressed={m.restMode ? 'true' : 'false'}
                title={`Rust voor ${NoRegimeTeam}: een shift waarop iemand niet werkt. Geen verlof, maar hij is dan niet aanwezig.`}
                onClick={ev(() => {
                  m.restMode = true
                  m.otherMode = false
                })}
              >
                Rust ({shortTeam(NoRegimeTeam)})
              </button>
            )}
            {m.showsOtherAbsences && (
              // Dispatching: andere afwezigheden (ZK, OV, ...) en uurcodes (3U/, ...), gekozen in een popup per vakje
              <button
                type="button"
                className={m.otherMode ? 'wc-pill tc-pill-other tc-pill-other-active' : 'wc-pill tc-pill-other'}
                aria-pressed={m.otherMode ? 'true' : 'false'}
                title="Andere afwezigheden (AOV, OV, ZK, OUD, O1, DV, APL, AFL) en uren verlof (3U/, /3U, ...). Klik daarna op een vakje om een code te kiezen."
                onClick={ev(() => {
                  m.otherMode = true
                  m.restMode = false
                })}
              >
                {'\n                        Andere…\n                    '}
              </button>
            )}
          </div>
        ) : m.leaveCategories.length > 0 ? (
          <div className="wc-legend">
            {m.categoryChoices.map(c => (
              <span key={c.name}>
                <span className="wc-swatch" style={parseStyle(`background:${c.color}`)} />
                {c.name}
              </span>
            ))}
          </div>
        ) : null}
        <div className="wc-legend">
          <span>
            <span className="wc-swatch" style={parseStyle('background:var(--rz-info)')} />
            Verlof
          </span>{' '}
          <span>
            <span className="wc-dot-inline wc-dot-holiday" />
            Feestdag
          </span>{' '}
          <span>
            <span className="wc-dot-inline wc-dot-school" />
            Schoolvakantie
          </span>{' '}
          <span>
            <span className="tc-legend-loose" />
            Losse shift
          </span>
        </div>
      </div>
      {canSave && m.listView ? (
        <div className="wc-hint">
          Lijst: enkel bekijken. Kies <strong>Raster</strong> om aan te duiden.
        </div>
      ) : canSave ? (
        <div className="wc-hint">
          {m.otherMode
            ? 'Klik op een vakje om een andere afwezigheid of uren verlof te kiezen.'
            : m.restMode
              ? `Klik op een shift van ${NoRegimeTeam} om rust aan of uit te zetten.`
              : m.activeCategoryName == null
                ? 'Klik op een vakje om verlof aan of uit te zetten.'
                : 'Klik op een vakje om deze categorie te geven; nog eens klikken zet het weer uit.'}
          {m.canManageExtraShifts && showAllTeams && <span> Klik op een grijs vakje om een extra shift aan te duiden.</span>}
        </div>
      ) : null}
      {m.listView ? (
        <ListView m={m} months={visibleMonths} showTotal={showTotal} />
      ) : (
        <Grid m={m} months={visibleMonths} ev={ev} canSave={canSave} showAllTeams={showAllTeams} showAllSpecialities={showAllSpecialities} showTotal={showTotal} />
      )}
      {'\n'}
      {script}
    </>
  )
}

// Lijst per shift (gsm): per shift wie er afwezig is, enkel bekijken
function ListView({ m, months, showTotal }: { m: Model; months: MonthGroup[]; showTotal: boolean }) {
  const out: ReactNode[] = []
  for (const mg of months) {
    out.push(
      <div key={`m${out.length}`} className="tc-list-month">
        {capitalize(formatDate(new Date(mg.year, mg.month - 1, 1), 'MMMM yyyy', Nl))}
      </div>,
    )
    for (const wd of mg.days) {
      const count = m.getTotalSelectedDays(wd)
      const quota = m.quotaFor(wd)
      const holiday = m.publicHolidayName(wd.date)
      const school = holiday == null ? m.schoolHolidayName(wd.date) : null
      const items = m.listItems(wd)
      let total: ReactNode = null
      if (showTotal) {
        const present = m.presentOnShift(wd)
        const minimum = m.minimumOnShift(wd)
        total = (
          <>
            <span className="tc-lcount-label">Totaal</span>{' '}
            <span className={present < minimum ? 'tc-count tc-count-over' : 'tc-count'}>
              {present}/{minimum}
            </span>
          </>
        )
      }
      out.push(
        <div key={`d${out.length}`} className={wd.shift === 'N' ? 'tc-lcard tc-lcard-night' : 'tc-lcard'} id={rowId(wd)}>
          <div className="tc-lhead">
            <span className="tc-ldate">
              {capitalize(formatDate(wd.date, 'ddd d MMM', Nl))} · {wd.shift === 'D' ? 'Dag' : 'Nacht'}
              {holiday != null ? (
                <span className="wc-dot-inline wc-dot-holiday" title={`Feestdag: ${holiday}`} />
              ) : school != null ? (
                <span className="wc-dot-inline wc-dot-school" title={`Schoolvakantie: ${school}`} />
              ) : null}
            </span>{' '}
            <span className="tc-lcounts">
              <span className="tc-lcount-label">Verlof</span>{' '}
              <span className={countClass(count, quota)}>
                {count}/{quota}
              </span>
              {total}
            </span>
          </div>
          {items.length > 0 ? (
            <div className="tc-lchips">
              {items.map((it, i) => (
                <span key={i} className={it.css} style={parseStyle(it.style ?? undefined)} title={it.title}>
                  {it.text}
                </span>
              ))}
            </div>
          ) : (
            <div className="tc-lempty">Niemand afwezig</div>
          )}
        </div>,
      )
    }
  }
  return <div className="tc-list">{out}</div>
}

// Raster: shiften als rijen, personen als kolommen
function Grid({
  m,
  months,
  ev,
  canSave,
  showAllTeams,
  showAllSpecialities,
  showTotal,
}: {
  m: Model
  months: MonthGroup[]
  ev: Ev
  canSave: boolean
  showAllTeams: boolean
  showAllSpecialities: boolean
  showTotal: boolean
}) {
  const members = m.teamMembers
  const teamStart = new Map(members.map(mb => [mb.id, m.isTeamStart(mb)]))
  const rows: ReactNode[] = []
  let dayIndex = 0
  for (const mg of months) {
    if (months.length > 1)
      rows.push(
        <tr key={`m${rows.length}`} className="tc-month-row">
          <td className="tc-col-date">{capitalize(formatDate(new Date(mg.year, mg.month - 1, 1), 'MMMM', Nl))}</td>{' '}
          <td className="tc-col-count" />
          {showTotal && <td className="tc-col-total" />}
          <td colSpan={Math.max(1, members.length)} />
        </tr>,
      )
    for (const wd of mg.days) {
      const count = m.getTotalSelectedDays(wd)
      const holiday = m.publicHolidayName(wd.date)
      const school = holiday == null ? m.schoolHolidayName(wd.date) : null
      const isNight = wd.shift === 'N'
      const quota = m.quotaFor(wd)
      const rowExtras = m.extrasOnRow(wd)
      const when = formatDate(wd.date, 'ddd d MMM', Nl)
      let countTitle: string | undefined
      if (showAllTeams) {
        const teams = m.teamsOn(wd)
        countTitle = `Werkt: ${teams.join(', ')}` + (teams.includes(NoRegimeTeam) ? ' (verlof van Ploeg0 telt hier niet mee)' : '')
      }

      let extraBadge: ReactNode = null
      if (rowExtras.length > 0) {
        const extraTitle =
          'Extra shift (maximum +' + rowExtras.length + '): ' + rowExtras.map(e => `${e.firstName ?? ''} ${e.lastName ?? ''} (${e.personTeam ?? ''}) in ${e.team}`).join(', ')
        extraBadge = m.canManageExtraShifts ? (
          <button type="button" className="tc-extra-badge" title={extraTitle} aria-label="Extra shiften bekijken" onClick={ev(() => m.openExtraShifts(wd))}>
            +{rowExtras.length}
          </button>
        ) : (
          <span className="tc-extra-badge" title={extraTitle}>
            +{rowExtras.length}
          </span>
        )
      }

      let lottery: ReactNode = null
      if (m.canManageCalendar && (m.pairOverQuota(wd) || m.hasDraw(wd))) {
        const hasDraw = m.hasDraw(wd)
        lottery = (
          <button
            type="button"
            className={hasDraw ? 'tc-lottery-btn tc-lottery-done' : 'tc-lottery-btn'}
            title={hasDraw ? 'Loting gedaan: resultaat bekijken of opnieuw loten' : 'Wie heeft verlof? Loting houden (dag + nacht)'}
            aria-label="Loting"
            onClick={ev(() => m.openLottery(wd))}
          >
            <i className="rzi">{hasDraw ? 'task_alt' : 'casino'}</i>
          </button>
        )
      }

      let totalCell: ReactNode = null
      if (showTotal) {
        // Dispatching, alle ploegen: wie deze shift werkt (ploeg van dienst + Ploeg0 + extra shiften) tegenover het minimum
        const present = m.presentOnShift(wd)
        const minimum = m.minimumOnShift(wd)
        totalCell = (
          <td
            className="tc-col-total"
            title={`Aanwezig: ${present} (ploeg van dienst, Ploeg0 en extra shiften, zonder verlof) · minimum ${minimum}` + (present < minimum ? ` · ${minimum - present} te weinig` : '')}
          >
            <span className={present < minimum ? 'tc-count tc-count-over' : 'tc-count'}>
              {present}/{minimum}
            </span>
          </td>
        )
      }

      const cells = members.map((member, ci) => {
        const memberExtra = m.extraOf(member.id, wd)
        const start = teamStart.get(member.id)
        if (!m.memberWorks(member, wd)) {
          // Alle ploegen: de ploeg van deze persoon werkt deze shift niet (of hij werkt een extra shift in een andere ploeg)
          if (memberExtra != null) {
            const extraTitle =
              `${member.firstName ?? ''} ${member.lastName ?? ''} · ${when} ${wd.shift} · extra shift in ${memberExtra.team}` + (!memberExtra.note ? '' : ` · ${memberExtra.note}`)
            return (
              <td key={ci} className={start ? 'tc-cell tc-cell-extra tc-team-start' : 'tc-cell tc-cell-extra'}>
                {m.canManageExtraShifts ? (
                  <button type="button" className="tc-cell-btn" title={extraTitle + ' · klik om te bekijken of te verwijderen'} onClick={ev(() => m.openExtraShifts(wd, null, memberExtra.team))}>
                    <span className="tc-extra-team">{shortTeam(memberExtra.team)}</span>
                  </button>
                ) : (
                  <span className="tc-extra-team" title={extraTitle}>
                    {shortTeam(memberExtra.team)}
                  </span>
                )}
              </td>
            )
          }
          if (m.canMarkExtraShift(member, wd)) {
            // Klikken: extra shift aanduiden, ter controle in het venster
            return (
              <td key={ci} className={start ? 'tc-cell tc-cell-off tc-team-start' : 'tc-cell tc-cell-off'}>
                <button
                  type="button"
                  className="tc-cell-btn tc-cell-add"
                  title={`${member.firstName ?? ''} ${member.lastName ?? ''} · ${when} ${wd.shift} · klik om een extra shift aan te duiden`}
                  onClick={ev(() => m.openExtraShifts(wd, member.id, m.extraTargetTeam(wd)))}
                />
              </td>
            )
          }
          return <td key={ci} className={start ? 'tc-cell tc-cell-off tc-team-start' : 'tc-cell tc-cell-off'} />
        }
        const dayOff = m.dayOffOf(member.id, wd)
        const category = dayOff?.leaveCategoryId != null ? (m.leaveCategories.find(c => c.id === dayOff.leaveCategoryId) ?? null) : null
        const isLoose = dayOff != null && m.isLoose(dayOff)
        const blockClass = dayOff == null ? 'tc-block' : isLoose ? 'tc-block tc-block-on tc-block-loose' : 'tc-block tc-block-on'
        const blockStyle = category != null ? parseStyle(`background:${category.color};`) : undefined
        let title =
          `${member.firstName ?? ''} ${member.lastName ?? ''} · ${when} ${wd.shift}` +
          (dayOff != null ? ' · ' + (category?.name ?? 'Verlof') : '') +
          (isLoose ? ' · Losse shift' : '') +
          (memberExtra != null ? ` · extra shift in ${memberExtra.team}` : '')
        const mark = m.markOf(member.id, wd)
        const isRest = mark != null && mark.code == null
        const other = findOtherAbsence(mark?.code)
        if (isRest) title += ' · Rust'
        if (other != null) title += ` · ${other.code} (${other.name})`
        return (
          <td key={ci} className={'tc-cell' + (start ? ' tc-team-start' : '') + (memberExtra != null ? ' tc-cell-extra-mark' : '') + (isRest ? ' tc-cell-rest' : '')}>
            {canSave ? (
              <button type="button" className="tc-cell-btn" title={title} aria-pressed={dayOff != null ? 'true' : 'false'} onClick={ev(() => m.onCellClicked(member.id, wd))}>
                {other != null ? <span className={other.absent ? 'tc-code tc-code-absent' : 'tc-code tc-code-hour'}>{other.code}</span> : <span className={blockClass} style={blockStyle} />}
              </button>
            ) : other != null ? (
              <span className={other.absent ? 'tc-code tc-code-absent' : 'tc-code tc-code-hour'} title={title}>
                {other.code}
              </span>
            ) : (
              <span className={blockClass} style={blockStyle} title={title} />
            )}
          </td>
        )
      })

      rows.push(
        <tr key={`d${dayIndex++}`} className={isNight ? 'tc-row tc-row-night' : 'tc-row'} id={rowId(wd)}>
          <td className="tc-col-date" title={holiday != null ? `Feestdag: ${holiday}` : school != null ? `Schoolvakantie: ${school}` : undefined}>
            <span className="tc-date">{formatDate(wd.date, 'ddd dd', Nl)}</span> <span className="tc-shift">{wd.shift}</span>
            {holiday != null ? <span className="wc-dot-inline wc-dot-holiday" /> : school != null ? <span className="wc-dot-inline wc-dot-school" /> : null}
          </td>{' '}
          <td className="tc-col-count">
            <span className={countClass(count, quota)} title={countTitle}>
              {count}/{quota}
            </span>
            {extraBadge}
            {lottery}
          </td>
          {totalCell}
          {cells}
        </tr>,
      )
    }
  }

  return (
    <div className="tc-grid-wrap">
      <table className="tc-grid">
        <thead>
          <tr>
            <th className="tc-col-date">{m.gridTitle}</th>{' '}
            <th className="tc-col-count" title="Aantal personen met verlof op deze shift / maximum per shift">
              Verlof
            </th>
            {showTotal && (
              <th
                className="tc-col-total"
                title="Aanwezig (ploeg van dienst, Ploeg0 en extra shiften, zonder verlof) / minimum (personen van de ploeg van dienst min het verlofmaximum). Rood = te weinig."
              >
                Totaal
              </th>
            )}
            {members.map((member, ci) => {
              const used = m.yearCount(member.id)
              const allowance = member.leaveAllowance
              const over = allowance != null && used > allowance
              return (
                <th key={ci} className={'tc-col-member' + (over ? ' tc-member-over' : '') + (teamStart.get(member.id) ? ' tc-team-start' : '')} title={m.memberTitle(member)}>
                  {showAllTeams && <span className="tc-team">{shortTeam(member.team)}</span>}
                  <span className="tc-initials">{initialsFor(member)}</span>
                  {showAllSpecialities && <span className="tc-spec">{shortSpeciality(member.speciality)}</span>}
                  <span className="tc-used">
                    {used}
                    {allowance != null ? `/${allowance}` : ''}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  )
}
