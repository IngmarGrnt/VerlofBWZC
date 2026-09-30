import { useEffect, useRef, useState } from 'react'
import { Button } from '../radzen/Button'
import { DropDown } from '../radzen/DropDown'
import { notificationService } from '../radzen/Notification'
import { getJson } from '../api/http'
import { lotteryApi, type LotteryDrawDTO, type RestoredDayOffDTO, type Stats } from '../api/lottery'
import type { PersonBaseDTO } from '../api/person'
import { scopeService } from '../services/scope'
import { getCurrentPerson } from '../services/browser'
import { hasNoRegime, AllTeamsSpeciality } from '../rules'
import { formatDate, parseDate, dateOnly, addDays } from '../util/dotnet'
import { usePageTitle, useNavigateTo } from '../app/navigation'
import { LotteryForm, BlazorCheckbox, type LotteryCandidate, type LotteryFormContext } from './LotteryForm'

// Zelfde als VerlofBWZC/Pages/RandomNamePicker.razor (@page "/Random-picker", [Authorize]): de loterijpagina.
// Links een shiftpaar kiezen en loten (LotteryForm), rechts de resultaten van het jaar.

// VerlofBWZC.DataContracts.DTO.Calendar.WorkDay
interface WorkDay {
  date: string
  shift: string
  leaveCategoryId?: number | null
}

// RandomNamePicker.TeamDayOff
interface TeamDayOff {
  personId: number
  date: string
  shift: string
  leaveCategoryId?: number | null
}

// VerlofBWZC.DataContracts.DTO.Leave.LeaveCategoryDTO (enkel wat deze pagina gebruikt)
interface LeaveCategoryDTO {
  id: number
  name: string
  color: string
}

// VerlofBWZC.DataContracts.DTO.Leave.ShiftQuotaDTO
interface ShiftQuotaDTO {
  id: number
  team: string
  speciality: string
  year?: number | null
  dayMax: number
  nightMax: number
}

// VerlofBWZC.DataContracts.DTO.Access.CalendarPermissionsDTO
interface CalendarPermissionsDTO {
  canSeeTeamCalendar: boolean
  canSaveWorkCalendar: boolean
  canSaveTeamCalendar: boolean
}

// Shift null = paar dag + nacht; "D"/"N" = één shift (Ploeg0 zonder werkregime)
interface Pair {
  day: Date
  night: Date
  dayCount: number
  nightCount: number
  over: boolean
  hasDraw: boolean
  drawApplied: boolean
  shift: string | null
  key: string
}

// Werkregels (VerlofBWZC.DataContracts/Werkregels.cs)
const lotteryPerShift = (team: string | null | undefined) => hasNoRegime(team)
const countsAsStaff = (speciality: string | null | undefined, role: string | null | undefined) => !(speciality === AllTeamsSpeciality && role === 'Manager')
const defaultShiftQuota = (members: number) => Math.max(1, Math.trunc(members / 4))
const maxFor = (q: ShiftQuotaDTO, shift: string | null | undefined) => (shift === 'N' ? q.nightMax : q.dayMax)

const pad = (n: number, len = 2) => String(n).padStart(len, '0')
const keyOf = (day: Date, shift: string | null) => `${pad(day.getFullYear(), 4)}${pad(day.getMonth() + 1)}${pad(day.getDate())}${shift ?? ''}`
const sameDate = (a: Date, b: Date) => dateOnly(a).getTime() === dateOnly(b).getTime()
const upper = (s: string) => s.toUpperCase()
const contains = (text: string, search: string) => upper(text).includes(upper(search))
const cmp = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').localeCompare(b ?? '')

const StatusOptions = ['Alle', 'Niet toegepast', 'Toegepast']

// Velden van de Razor-pagina (zelfde namen); gewijzigd zoals in Blazor en dan opnieuw getekend
interface Model {
  isLoading: boolean
  isAdmin: boolean
  busy: boolean
  formVersion: number
  pendingApply: number | null
  pendingDelete: number | null
  showStandings: boolean
  selectedYear: number
  selectedMonth: number
  onlyOver: boolean
  selectedPair: string | null
  selectedTeam: string | null
  selectedSpeciality: string | null
  teamOptions: string[]
  specialityOptions: string[]
  search: string | null
  statusFilter: string
  workDays: WorkDay[]
  teamMembers: PersonBaseDTO[]
  daysOff: TeamDayOff[]
  categories: LeaveCategoryDTO[]
  draws: LotteryDrawDTO[]
  perms: CalendarPermissionsDTO | null
  quotaRule: ShiftQuotaDTO | null
}

export function RandomNamePicker() {
  usePageTitle('Loterij')
  const navigateTo = useNavigateTo()
  const [, setTick] = useState(0)
  const render = () => setTick(t => t + 1)
  const m = useRef<Model>({
    isLoading: true,
    isAdmin: false,
    busy: false,
    formVersion: 0,
    pendingApply: null,
    pendingDelete: null,
    showStandings: false,
    selectedYear: new Date().getFullYear() + 1,
    selectedMonth: 1,
    onlyOver: true,
    selectedPair: null,
    selectedTeam: null,
    selectedSpeciality: null,
    teamOptions: [],
    specialityOptions: [],
    search: null,
    statusFilter: 'Alle',
    workDays: [],
    teamMembers: [],
    daysOff: [],
    categories: [],
    draws: [],
    perms: null,
    quotaRule: null,
  }).current

  // Zoals een Blazor-gebeurtenis: tekenen na het synchrone deel en nog eens als de taak klaar is
  const handle = (fn: () => unknown) => async () => {
    const r = fn()
    if (r instanceof Promise) {
      render()
      try {
        await r
      } finally {
        render()
      }
    } else render()
  }

  const minYear = () => new Date().getFullYear() - 1
  const maxYear = () => new Date().getFullYear() + 10

  // Ploeg zonder werkregime (Werkregels): loting per shift in plaats van per paar
  const isNoRegime = () => lotteryPerShift(m.selectedTeam)

  // Maximum per shift: ingestelde regel (Instellingen > Max per shift) of standaard een kwart van de personen
  const quotaFor = (shift: string) => (m.quotaRule ? maxFor(m.quotaRule, shift) : defaultShiftQuota(m.teamMembers.filter(t => countsAsStaff(t.speciality, t.role)).length))
  const canApply = () => m.isAdmin || (m.perms?.canSaveTeamCalendar ?? false)

  // Lotingen van deze ploeg/specialiteit: minstens één deelnemer is lid
  const teamDraws = () => m.draws.filter(d => [...d.winners, ...d.losers].some(x => m.teamMembers.some(t => t.id === x.personId)))

  // Lotingen voor een periode; met shift enkel lotingen op een paar of op precies die shift
  const drawsFor = (day: Date, night: Date, shift: string | null = null) =>
    teamDraws()
      .filter(d => dateOnly(parseDate(d.fromDate)).getTime() <= night.getTime() && dateOnly(parseDate(d.toDate)).getTime() >= day.getTime())
      .filter(d => shift === null || d.shift == null || d.shift === shift)

  const allAppliedOrNoLosers = (draws: LotteryDrawDTO[]) => draws.length > 0 && draws.every(d => lotteryApi.isApplied(d) || d.losers.length === 0)

  // --- Shiftparen: dagshift op dag X + nachtshift op dag X+1 ---
  const pairs = (): Pair[] => {
    if (isNoRegime()) return singleShifts()
    const qd = quotaFor('D')
    const qn = quotaFor('N')
    return m.workDays
      .filter(w => w.shift === 'D')
      .map(w => ({ w, date: parseDate(w.date) }))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map(({ date }) => {
        const day = dateOnly(date)
        const night = addDays(day, 1)
        const dc = m.daysOff.filter(d => sameDate(parseDate(d.date), day) && d.shift === 'D').length
        const nc = m.daysOff.filter(d => sameDate(parseDate(d.date), night) && d.shift === 'N').length
        const draws = drawsFor(day, night)
        return { day, night, dayCount: dc, nightCount: nc, over: dc > qd || nc > qn, hasDraw: draws.length > 0, drawApplied: allAppliedOrNoLosers(draws), shift: null, key: keyOf(day, null) }
      })
  }

  // Ploeg0: elke shift apart
  const singleShifts = (): Pair[] =>
    m.workDays
      .map(w => ({ w, date: parseDate(w.date) }))
      .sort((a, b) => a.date.getTime() - b.date.getTime() || (a.w.shift === 'D' ? 0 : 1) - (b.w.shift === 'D' ? 0 : 1))
      .map(({ w, date: d }) => {
        const date = dateOnly(d)
        const count = m.daysOff.filter(x => sameDate(parseDate(x.date), date) && x.shift === w.shift).length
        const draws = drawsFor(date, date, w.shift)
        return {
          day: date,
          night: date,
          dayCount: w.shift === 'D' ? count : 0,
          nightCount: w.shift === 'N' ? count : 0,
          over: count > quotaFor(w.shift),
          hasDraw: draws.length > 0,
          drawApplied: allAppliedOrNoLosers(draws),
          shift: w.shift,
          key: keyOf(date, w.shift),
        }
      })

  const yearDraws = () => teamDraws().filter(d => parseDate(d.fromDate).getFullYear() === m.selectedYear || parseDate(d.toDate).getFullYear() === m.selectedYear)

  const filteredDraws = () =>
    yearDraws()
      .filter(d => (m.statusFilter === 'Toegepast' ? lotteryApi.isApplied(d) : m.statusFilter === 'Niet toegepast' ? d.losers.length > 0 && !lotteryApi.isApplied(d) : true))
      .filter(
        d =>
          !m.search?.trim() ||
          contains(d.drawName, m.search) ||
          [...d.winners, ...d.losers].some(x => contains(`${x.firstName} ${x.lastName}`, m.search!)),
      )
      .sort((a, b) => parseDate(b.fromDate).getTime() - parseDate(a.fromDate).getTime() || parseDate(b.createdAtUtc).getTime() - parseDate(a.createdAtUtc).getTime())

  const shortMonth = (month: number) => formatDate(new Date(2000, month - 1, 1), 'MMM', 'nl-BE').replace(/\.+$/, '')

  const pairText = (p: Pair) =>
    p.shift !== null
      ? `${formatDate(p.day, 'ddd d', 'nl-BE')} · ${p.shift === 'D' ? 'dag' : 'nacht'}`
      : `${formatDate(p.day, 'ddd d', 'nl-BE')} – ${formatDate(p.night, p.day.getMonth() === p.night.getMonth() ? 'ddd d' : 'ddd d MMM', 'nl-BE')}`

  const drawPeriod = (d: LotteryDrawDTO) => {
    const from = parseDate(d.fromDate)
    const to = parseDate(d.toDate)
    if (sameDate(from, to)) {
      const shift = d.shift ?? m.workDays.find(w => sameDate(parseDate(w.date), from))?.shift ?? null
      return `${formatDate(from, 'ddd d MMM', 'nl-BE')}${shift != null ? ` (${shift})` : ''}`
    }
    const sameMonth = from.getMonth() === to.getMonth()
    return `${formatDate(from, sameMonth ? 'ddd d' : 'ddd d MMM', 'nl-BE')} – ${formatDate(to, 'ddd d MMM', 'nl-BE')} (D+N)`
  }

  // --- Laden ---

  useEffect(() => {
    void handle(async () => {
      const person = await getCurrentPerson()
      m.selectedTeam = person?.team ?? null
      m.selectedSpeciality = person?.speciality ?? null
      m.isAdmin = (person?.role ?? '').toLowerCase() === 'admin'

      // Admin: alle ploegen; Manager: de ploegen en specialiteiten die hij beheert
      await scopeService.load(true)
      if (scopeService.hasChoice) {
        m.teamOptions = scopeService.teams
        if (!m.teamOptions.includes(m.selectedTeam ?? '')) m.selectedTeam = m.teamOptions[0] ?? null
        m.selectedSpeciality = scopeService.fixSpeciality(m.selectedTeam, m.selectedSpeciality)
        m.specialityOptions = scopeService.specialitiesFor(m.selectedTeam)
      }

      await reloadAllAsync()
      m.selectedMonth = m.selectedYear === new Date().getFullYear() ? new Date().getMonth() + 1 : 1
      m.isLoading = false
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function changeYear(delta: number) {
    const year = m.selectedYear + delta
    if (year < minYear() || year > maxYear()) return
    m.selectedYear = year
    m.selectedMonth = m.selectedYear === new Date().getFullYear() ? new Date().getMonth() + 1 : 1
    await reloadAllAsync()
  }

  async function reloadAllAsync() {
    m.selectedPair = null
    m.pendingApply = m.pendingDelete = null
    if (!m.selectedTeam || !m.selectedSpeciality) return

    const team = m.selectedTeam
    const spec = m.selectedSpeciality
    const year = m.selectedYear
    try {
      m.teamMembers = (await getJson<PersonBaseDTO[] | null>(`api/person/team/${team}/${spec}`)) ?? []
      m.workDays = (await getJson<WorkDay[] | null>(`api/calender?teamName=${team}&year=${year}`)) ?? []
      try {
        m.categories = (await getJson<LeaveCategoryDTO[] | null>(`api/leave-categories?team=${team}&speciality=${spec}&year=${year}`)) ?? []
      } catch {
        m.categories = []
      }
      await loadDaysOffAsync()
      m.draws = await lotteryApi.getDraws()
      await loadPermissionsAsync()
      try {
        const quotas = (await getJson<ShiftQuotaDTO[] | null>(`api/shift-quotas?team=${team}&year=${year}`)) ?? []
        m.quotaRule = quotas.find(q => q.speciality === spec) ?? null
      } catch {
        m.quotaRule = null
      }
    } catch (ex) {
      notificationService.notify('Error', 'Laden mislukt', ex instanceof Error ? ex.message : String(ex))
    }
    m.formVersion++
  }

  async function loadDaysOffAsync() {
    m.daysOff = (await getJson<TeamDayOff[] | null>(`api/person/team-days-off/${m.selectedTeam}/${m.selectedYear}/${m.selectedSpeciality}`)) ?? []
  }

  async function loadPermissionsAsync() {
    if (m.isAdmin) {
      m.perms = null
      return
    }
    try {
      // Rechten van de gekozen ploeg/specialiteit (een manager kan meerdere ploegen beheren)
      m.perms = await getJson<CalendarPermissionsDTO>(
        `api/access/calendar-permissions?year=${m.selectedYear}&team=${encodeURIComponent(m.selectedTeam ?? '')}&speciality=${encodeURIComponent(m.selectedSpeciality ?? '')}`,
      )
    } catch {
      m.perms = null
    }
  }

  // --- Formulier (links) ---

  async function loadFormContext(pair: Pair): Promise<LotteryFormContext> {
    m.draws = await lotteryApi.getDraws()
    return {
      candidates: buildCandidates(pair.day, pair.night),
      existingDraws: drawsFor(pair.day, pair.night, pair.shift),
      teamMembers: m.teamMembers,
      stats: lotteryApi.statsFor(teamDraws(), m.selectedYear),
      nextDrawNumber: m.draws.length === 0 ? 1 : Math.max(...m.draws.map(d => d.drawNumber)) + 1,
    }
  }

  // Iedereen met verlof op de dag- en/of nachtshift van het paar
  function buildCandidates(day: Date, night: Date): LotteryCandidate[] {
    const groups = new Map<number, TeamDayOff[]>()
    for (const d of m.daysOff.filter(d => (sameDate(parseDate(d.date), day) && d.shift === 'D') || (sameDate(parseDate(d.date), night) && d.shift === 'N'))) {
      const g = groups.get(d.personId)
      if (g) g.push(d)
      else groups.set(d.personId, [d])
    }
    const result: LotteryCandidate[] = []
    for (const [personId, g] of groups) {
      const member = m.teamMembers.find(t => t.id === personId)
      if (!member) continue
      const catId = g.map(d => d.leaveCategoryId).find(id => id != null)
      const category = catId != null ? m.categories.find(c => c.id === catId) : undefined
      const shifts = [...new Set(g.map(d => d.shift))].sort((a, b) => (a === 'D' ? 0 : 1) - (b === 'D' ? 0 : 1))
      result.push({
        personId: member.id,
        firstName: member.firstName ?? '',
        lastName: member.lastName ?? '',
        category: category?.name ?? null,
        color: category?.color ?? null,
        shifts: shifts.join('+'),
      })
    }
    return result.sort((a, b) => cmp(a.lastName, b.lastName) || cmp(a.firstName, b.firstName))
  }

  const sameDayOff = (d: TeamDayOff, r: RestoredDayOffDTO) => r.personId === d.personId && sameDate(parseDate(r.date), parseDate(d.date)) && r.shift === d.shift

  const onRemovedAsync = (removed: RestoredDayOffDTO[]) => {
    m.daysOff = m.daysOff.filter(d => !removed.some(r => sameDayOff(d, r)))
    render()
  }

  const onRestoredAsync = (restored: RestoredDayOffDTO[]) => {
    for (const r of restored.filter(r => !m.daysOff.some(d => sameDayOff(d, r))))
      m.daysOff.push({ personId: r.personId, date: r.date, shift: r.shift, leaveCategoryId: r.leaveCategoryId })
    render()
  }

  const onFormChangedAsync = async () => {
    m.draws = await lotteryApi.getDraws()
    render()
  }

  // --- Resultaten (rechts) ---

  async function applyDrawAsync(d: LotteryDrawDTO) {
    m.busy = true
    try {
      const res = await lotteryApi.apply(d.drawNumber)
      if (!res.ok) {
        notificationService.notify('Error', 'Niet toegepast', res.error ?? '')
        return
      }
      onRemovedAsync(res.value ?? [])
      notificationService.notify('Success', 'Loting toegepast', d.drawName)
      m.pendingApply = null
      m.draws = await lotteryApi.getDraws()
      m.formVersion++ // formulier links opnieuw opbouwen
    } finally {
      m.busy = false
    }
  }

  async function deleteDrawAsync(d: LotteryDrawDTO) {
    m.busy = true
    try {
      const res = await lotteryApi.remove(d.drawNumber)
      if (!res.ok) {
        notificationService.notify('Error', 'Niet verwijderd', res.error ?? '')
        return
      }
      const value = res.value ?? []
      onRestoredAsync(value)
      notificationService.notify('Success', 'Loting verwijderd', value.length > 0 ? `${d.drawName}: verlof teruggezet.` : d.drawName)
      m.pendingDelete = null
      m.draws = await lotteryApi.getDraws()
      m.formVersion++
    } finally {
      m.busy = false
    }
  }

  function openInTeamCalendar(d: LotteryDrawDTO) {
    const from = parseDate(d.fromDate)
    let url = `teamcalendar?jaar=${from.getFullYear()}&maand=${from.getMonth() + 1}`
    if (scopeService.hasChoice) url += `&ploeg=${encodeURIComponent(m.selectedTeam ?? '')}&spec=${encodeURIComponent(m.selectedSpeciality ?? '')}`
    navigateTo(url)
  }

  // --- Weergave (zelfde HTML als RandomNamePicker.razor) ---

  if (m.isLoading)
    return (
      <>
        <h1>Loterij</h1>
        <p className="wc-loading">Loterij laden…</p>
      </>
    )

  const allPairs = pairs()
  const visiblePairs = allPairs.filter(p => p.day.getMonth() + 1 === m.selectedMonth).filter(p => !m.onlyOver || p.over || p.hasDraw || p.key === m.selectedPair)
  const overPairsYear = allPairs.filter(p => p.over && !p.hasDraw).length
  const yearDrawList = yearDraws()
  const openDrawsYear = yearDrawList.filter(d => d.losers.length > 0 && !lotteryApi.isApplied(d)).length
  const filtered = filteredDraws()
  const pair = m.selectedPair !== null ? allPairs.find(p => p.key === m.selectedPair) : undefined
  const qd = quotaFor('D')
  const qn = quotaFor('N')

  return (
    <>
      <div className="wc-header">
        <div className="wc-title">
          <h1>Loterij</h1>{' '}
          <div className="wc-year" role="group" aria-label="Jaar kiezen">
            <button type="button" className="wc-year-btn" aria-label="Vorig jaar" disabled={m.selectedYear <= minYear()} onClick={handle(() => changeYear(-1))}>
              <i className="rzi">chevron_left</i>
            </button>{' '}
            <span className="wc-year-label">{m.selectedYear}</span>{' '}
            <button type="button" className="wc-year-btn" aria-label="Volgend jaar" disabled={m.selectedYear >= maxYear()} onClick={handle(() => changeYear(1))}>
              <i className="rzi">chevron_right</i>
            </button>
          </div>
          {scopeService.hasChoice ? (
            <>
              <DropDown<string, string>
                value={m.selectedTeam}
                data={m.teamOptions}
                placeholder="Ploeg"
                style="width:140px"
                onChange={v =>
                  void handle(async () => {
                    m.selectedTeam = v
                    m.selectedSpeciality = scopeService.fixSpeciality(m.selectedTeam, m.selectedSpeciality)
                    m.specialityOptions = scopeService.specialitiesFor(m.selectedTeam)
                    await reloadAllAsync()
                  })()
                }
              />{' '}
              <DropDown<string, string>
                value={m.selectedSpeciality}
                data={m.specialityOptions}
                placeholder="Specialiteit"
                style="width:200px"
                onChange={v =>
                  void handle(async () => {
                    m.selectedSpeciality = v
                    await reloadAllAsync()
                  })()
                }
              />
            </>
          ) : (
            <span className="tc-scope">
              {m.selectedTeam} · {m.selectedSpeciality}
            </span>
          )}
        </div>{' '}
        <div className="lp-kpis">
          <span className="lp-kpi">
            Paren boven max <strong className={overPairsYear > 0 ? 'lp-red' : ''}>{overPairsYear}</strong>
          </span>{' '}
          <span className="lp-kpi">
            Lotingen <strong>{yearDrawList.length}</strong> · niet toegepast <strong className={openDrawsYear > 0 ? 'lp-orange' : ''}>{openDrawsYear}</strong>
          </span>
        </div>
      </div>{' '}
      <div className="lp-grid">
        {/* Links: nieuwe loting */}
        <section className="lp-card">
          <div className="lp-step">1 · Kies een shiftpaar</div>{' '}
          <div className="tc-months" role="group" aria-label="Maand kiezen">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
              const hasOver = allPairs.some(p => p.day.getMonth() + 1 === month && p.over && !p.hasDraw)
              return (
                <button
                  key={month}
                  type="button"
                  className={m.selectedMonth === month ? 'tc-month tc-month-active' : 'tc-month'}
                  aria-pressed={m.selectedMonth === month ? 'true' : 'false'}
                  title={hasOver ? 'Deze maand heeft paren boven het maximum zonder loting' : undefined}
                  onClick={handle(() => (m.selectedMonth = month))}
                >
                  {shortMonth(month)}
                  {hasOver && <span className="tc-month-dot"></span>}
                </button>
              )
            })}
            <label className="tc-two-months" title="Enkel paren waar meer personen verlof hebben dan het maximum">
              <BlazorCheckbox checked={m.onlyOver} onChange={on => void handle(() => (m.onlyOver = on))()} /> enkel boven max
            </label>
          </div>{' '}
          <div className="lp-pairs">
            {visiblePairs.map(p => {
              const active = m.selectedPair === p.key
              return (
                <button key={p.key} type="button" className={active ? 'lp-pair lp-pair-active' : 'lp-pair'} onClick={handle(() => (m.selectedPair = p.key))}>
                  <span className="lp-pair-date">{pairText(p)}</span> <span className="lp-pair-shifts">{p.shift ?? 'D+N'}</span>
                  {p.hasDraw && (
                    <span className={p.drawApplied ? 'tl-status tl-status-done' : 'tl-status tl-status-open'}>
                      <i className="rzi">task_alt</i> {p.drawApplied ? 'geloot' : 'niet toegepast'}
                    </span>
                  )}
                  <span className="lp-pair-count">
                    {p.shift !== 'N' && <span className={p.dayCount > qd ? 'tc-count tc-count-over' : 'tc-count'}>{p.dayCount}/{qd}</span>}
                    {p.shift !== 'D' && <span className={p.nightCount > qn ? 'tc-count tc-count-over' : 'tc-count'}>{p.nightCount}/{qn}</span>}
                  </span>
                </button>
              )
            })}
            {visiblePairs.length === 0 && <p className="tl-hint">{m.onlyOver ? 'Geen paren boven het maximum in deze maand.' : 'Geen shiften in deze maand.'}</p>}
          </div>
          {pair ? (
            <>
              <div className="lp-step lp-step-2">2 · Loting {pairText(pair)}</div>{' '}
              <LotteryForm
                key={`${pair.key}-${m.formVersion}`}
                dayDate={pair.day}
                nightDate={pair.night}
                quota={pair.shift !== null ? quotaFor(pair.shift) : Math.max(qd, qn)}
                onlyShift={pair.shift}
                canApply={canApply()}
                allowAddPeople
                load={() => loadFormContext(pair)}
                onRemoved={onRemovedAsync}
                onRestored={onRestoredAsync}
                onChanged={onFormChangedAsync}
              />
            </>
          ) : (
            <p className="tl-hint lp-pick-hint">
              {isNoRegime() ? 'Kies hierboven een shift: in Ploeg0 geldt de loting per shift.' : 'Kies hierboven een shiftpaar: de dag- en nachtshift worden samen genomen.'}
            </p>
          )}
        </section>{' '}
        {/* Rechts: resultaten */}
        <section className="lp-card">
          <div className="lp-results-head">
            <span className="lp-step" style={{ margin: 0 }}>
              Resultaten {m.selectedYear}
            </span>{' '}
            <input
              type="search"
              className="rz-textbox lp-search"
              value={m.search ?? ''}
              onChange={e => void handle(() => (m.search = e.currentTarget.value))()}
              placeholder="Zoek op naam…"
              aria-label="Zoek op naam"
            />{' '}
            <DropDown<string, string> value={m.statusFilter} data={StatusOptions} onChange={v => void handle(() => (m.statusFilter = v ?? ''))()} style="width:150px" />
          </div>

          {/* Stand per persoon: gewonnen/verloren lotingen dit jaar */}
          <button type="button" className="lp-standings-toggle" aria-expanded={m.showStandings ? 'true' : 'false'} onClick={handle(() => (m.showStandings = !m.showStandings))}>
            <i className="rzi">{m.showStandings ? 'expand_less' : 'expand_more'}</i> Stand per persoon {m.selectedYear}
          </button>
          {m.showStandings && <Standings members={m.teamMembers} stats={lotteryApi.statsFor(teamDraws(), m.selectedYear)} />}

          {filtered.map(d => {
            const applied = lotteryApi.isApplied(d)
            return (
              <div key={d.drawNumber} className={applied || d.losers.length === 0 ? 'lp-draw' : 'lp-draw lp-draw-open'}>
                <div className="lp-draw-head">
                  <button type="button" className="lp-draw-title" title="Openen in de teamkalender" onClick={handle(() => openInTeamCalendar(d))}>
                    {drawPeriod(d)}
                  </button>{' '}
                  <span className="lp-draw-name">{d.drawName}</span>{' '}
                  <span className={applied ? 'tl-status tl-status-done' : 'tl-status tl-status-open'}>
                    {applied ? 'toegepast' : d.losers.length > 0 ? 'niet toegepast' : 'geen verliezers'}
                  </span>{' '}
                  <span className="lp-draw-actions">
                    {!applied && canApply() && d.losers.length > 0 && (
                      <Button
                        text="Toepassen"
                        icon="done_all"
                        size="ExtraSmall"
                        buttonStyle="Primary"
                        variant="Outlined"
                        onClick={handle(() => {
                          m.pendingApply = d.drawNumber
                          m.pendingDelete = null
                        })}
                      />
                    )}
                    <Button
                      icon="delete"
                      size="ExtraSmall"
                      buttonStyle="Danger"
                      variant="Outlined"
                      title="Loting verwijderen"
                      ariaLabel="Loting verwijderen"
                      onClick={handle(() => {
                        m.pendingDelete = d.drawNumber
                        m.pendingApply = null
                      })}
                    />
                  </span>
                </div>{' '}
                <div className="lp-draw-people">
                  {d.winners.map((w, i) => (
                    <span key={`w${i}`} className="tl-tag tl-tag-win">
                      {w.firstName} {w.lastName}
                    </span>
                  ))}
                  {d.losers.map((l, i) => (
                    <span key={`l${i}`} className="tl-tag tl-tag-lose">
                      {l.firstName} {l.lastName}
                    </span>
                  ))}
                </div>
                {m.pendingApply === d.drawNumber && (
                  <div className="tl-confirm">
                    <div className="tl-confirm-title">
                      <i className="rzi">help_outline</i> Loting toepassen?
                    </div>
                    <div className="tl-hint">
                      {d.losers.map(l => `${l.firstName} ${l.lastName}`).join(', ')} {d.losers.length === 1 ? 'verliest' : 'verliezen'} hun verlof op {drawPeriod(d)}. Dit wordt meteen
                      opgeslagen.
                    </div>
                    <div className="tl-actions">
                      <Button text="Terug" buttonStyle="Light" size="Small" onClick={handle(() => (m.pendingApply = null))} />{' '}
                      <Button text="Ja, toepassen" icon="done_all" buttonStyle="Primary" size="Small" disabled={m.busy} onClick={handle(() => applyDrawAsync(d))} />
                    </div>
                  </div>
                )}
                {m.pendingDelete === d.drawNumber && (
                  <div className="tl-confirm tl-confirm-danger">
                    <div className="tl-confirm-title">
                      <i className="rzi">delete</i> Loting verwijderen?
                    </div>
                    <div className="tl-hint">{applied ? 'De verliezers krijgen hun verlof terug (met hun verlofregel).' : 'Er werd nog geen verlof weggehaald.'}</div>
                    <div className="tl-actions">
                      <Button text="Terug" buttonStyle="Light" size="Small" onClick={handle(() => (m.pendingDelete = null))} />{' '}
                      <Button text="Ja, verwijderen" icon="delete" buttonStyle="Danger" size="Small" disabled={m.busy} onClick={handle(() => deleteDrawAsync(d))} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && <p className="tl-hint">Geen lotingen gevonden.</p>}
          <p className="tl-hint lp-foot">
            <i className="rzi">event</i> Klik op de datum van een loting om ze in de teamkalender te openen.
          </p>
        </section>
      </div>
    </>
  )
}

// Stand per persoon: meest verloren eerst, dan minst gewonnen, dan familienaam
function Standings({ members, stats }: { members: PersonBaseDTO[]; stats: Map<number, Stats> }) {
  const rows = members
    .map(member => ({ member, st: stats.get(member.id) ?? { won: 0, lost: 0 } }))
    .sort((a, b) => b.st.lost - a.st.lost || a.st.won - b.st.won || cmp(a.member.lastName, b.member.lastName))
  return (
    <div className="lp-standings">
      {rows.map(({ member, st }) => (
        <div key={member.id} className="lp-standing">
          <span className="lp-standing-name">
            {member.firstName} {member.lastName}
          </span>{' '}
          <span className="tl-record-w">{st.won} gew.</span> <span className="tl-record-l">{st.lost} verl.</span>
        </div>
      ))}
    </div>
  )
}
