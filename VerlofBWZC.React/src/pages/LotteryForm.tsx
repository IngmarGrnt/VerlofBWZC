import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../radzen/Button'
import { DropDown } from '../radzen/DropDown'
import { TextBox } from '../radzen/Inputs'
import { Numeric } from '../radzen/Misc'
import { dialogService, type DialogOptions } from '../radzen/Dialog'
import { notificationService } from '../radzen/Notification'
import { lotteryApi, type LotteryDrawDTO, type LotteryPersonDTO, type RestoredDayOffDTO, type Stats } from '../api/lottery'
import type { PersonBaseDTO } from '../api/person'
import { formatDate, toApiDate, dateOnly } from '../util/dotnet'

// Zelfde als VerlofBWZC/Pages/LotteryForm.razor: loting voor één shiftpaar (dag + nacht), of enkel de dag- of nachtshift.
// Gedeeld door de teamkalender (popup, zie openLotteryForm) en de loterijpagina (inline). Alles gaat via api/lottery.
//
// Props (= de [Parameter]s van LotteryForm.razor in camelCase):
//   dayDate: Date            dagshift van het paar (DayDate)
//   nightDate: Date          nachtshift = dag erna (NightDate); bij onlyShift is dayDate = nightDate = de datum
//   quota: number            maximum per shift (Quota)
//   canApply?: boolean       mag toepassen (CanApply, standaard true)
//   allowAddPeople?: boolean personen van de ploeg toevoegen (AllowAddPeople, standaard false)
//   onlyShift?: string|null  "D" of "N": enkel die shift, zonder keuze dag + nacht (OnlyShift)
//   load: () => Promise<LotteryFormContext>   gegevens van het formulier (Load); opnieuw opgeroepen na toepassen/verwijderen
//   onRemoved?: (removed: RestoredDayOffDTO[]) => Promise<void> | void    verlof weggehaald (OnRemoved)
//   onRestored?: (restored: RestoredDayOffDTO[]) => Promise<void> | void  verlof teruggezet (OnRestored)
//   onChanged?: () => Promise<void> | void    loting bewaard/toegepast/verwijderd (OnChanged)
//   onClose?: () => void | Promise<void>      EventCallback OnClose: met onClose verschijnen Annuleren/Sluiten
// Zoals in Blazor wordt alles opnieuw geladen als dayDate verandert (andere datum), niet bij andere props.

// LotteryForm.Candidate
export interface LotteryCandidate {
  personId: number
  firstName: string
  lastName: string
  category?: string | null
  color?: string | null
  shifts: string // "D", "N", "D+N"; "" = handmatig toegevoegd (geen verlof)
}

// LotteryForm.Context: wat het formulier nodig heeft; wordt opnieuw opgehaald na toepassen of verwijderen
export interface LotteryFormContext {
  candidates: LotteryCandidate[]
  existingDraws: LotteryDrawDTO[]
  teamMembers: PersonBaseDTO[]
  nextDrawNumber: number
  // Gewonnen/verloren lotingen dit jaar per persoon (lotteryApi.statsFor)
  stats: Map<number, Stats>
}

export interface LotteryFormProps {
  dayDate: Date
  nightDate: Date
  quota: number
  canApply?: boolean
  allowAddPeople?: boolean
  onlyShift?: string | null
  load?: () => Promise<LotteryFormContext>
  onRemoved?: ((removed: RestoredDayOffDTO[]) => Promise<void> | void) | null
  onRestored?: ((restored: RestoredDayOffDTO[]) => Promise<void> | void) | null
  onChanged?: (() => Promise<void> | void) | null
  onClose?: (() => void | Promise<void>) | null
}

// Zoals DialogService.OpenAsync<LotteryForm>(title, parameters, new DialogOptions { Width = "580px", CloseDialogOnEsc = true })
// in TeamCalendar.razor. Zonder onClose wordt het dialogService.close() (zoals EventCallback => DialogService.Close()).
export function openLotteryForm(title: string, props: LotteryFormProps, options: DialogOptions = { width: '580px', closeDialogOnEsc: true }) {
  return dialogService.open(title, <LotteryForm {...props} onClose={props.onClose === undefined ? () => dialogService.close() : props.onClose} />, options)
}

type Scope = 'Pair' | 'Day' | 'Night'
const Scopes: Scope[] = ['Pair', 'Day', 'Night']

interface AddOption {
  id: number
  text: string
}

// Velden van de Razor-component (zelfde namen); gewijzigd zoals in Blazor en dan opnieuw getekend
interface Model {
  loading: boolean
  loadedFor: number | null
  scope: Scope
  cands: LotteryCandidate[]
  existing: LotteryDrawDTO[]
  teamMembers: PersonBaseDTO[]
  nextDrawNumber: number
  stats: Map<number, Stats>
  selected: Set<number>
  drawName: string
  winnersCount: number
  busy: boolean
  confirming: boolean
  applyNow: boolean
  pendingDelete: number | null
  pendingApply: number | null
  personToAdd: number | null
  result: LotteryDrawDTO | null
  resultApplied: boolean
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)
const isNullOrEmpty = (s: string | null | undefined) => !s
const loserNames = (d: LotteryDrawDTO) => d.losers.map(l => `${l.firstName} ${l.lastName}`).join(', ')
const pad2 = (n: number) => String(n).padStart(2, '0')

export function LotteryForm(props: LotteryFormProps) {
  const p = useRef(props)
  p.current = props
  const canApply = props.canApply ?? true
  const [, setTick] = useState(0)
  const render = () => setTick(t => t + 1)
  const m = useRef<Model>({
    loading: true,
    loadedFor: null,
    scope: 'Pair',
    cands: [],
    existing: [],
    teamMembers: [],
    nextDrawNumber: 1,
    stats: new Map(),
    selected: new Set(),
    drawName: '',
    winnersCount: 0,
    busy: false,
    confirming: false,
    applyNow: true,
    pendingDelete: null,
    pendingApply: null,
    personToAdd: null,
    result: null,
    resultApplied: false,
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

  const dayDate = () => p.current.dayDate
  const nightDate = () => p.current.nightDate
  const quota = () => p.current.quota
  const canApplyNow = () => p.current.canApply ?? true

  // Kandidaten binnen de gekozen shift(en); handmatig toegevoegden doen altijd mee
  const scoped = (): LotteryCandidate[] =>
    m.scope === 'Day' ? m.cands.filter(c => c.shifts.includes('D') || c.shifts === '') : m.scope === 'Night' ? m.cands.filter(c => c.shifts.includes('N') || c.shifts === '') : m.cands
  const withLeave = () => scoped().filter(c => c.shifts !== '')
  const dayCount = () => m.cands.filter(c => c.shifts.includes('D')).length
  const nightCount = () => m.cands.filter(c => c.shifts.includes('N')).length
  const selectedCount = () => scoped().filter(c => m.selected.has(c.personId)).length

  const fromDate = () => dateOnly(m.scope === 'Night' ? nightDate() : dayDate())
  const toDate = () => dateOnly(m.scope === 'Day' ? dayDate() : nightDate())

  const addablePeople = (): AddOption[] =>
    m.teamMembers
      .filter(t => m.cands.every(c => c.personId !== t.id))
      .sort((a, b) => cmp(a.lastName, b.lastName) || cmp(a.firstName, b.firstName))
      .map(t => ({ id: t.id, text: `${t.firstName} ${t.lastName}` }))

  const scopeLabel = (s: Scope) =>
    s === 'Day' ? `Enkel dag (${formatDate(dayDate(), 'ddd d/M', 'nl-BE')})` : s === 'Night' ? `Enkel nacht (${formatDate(nightDate(), 'ddd d/M', 'nl-BE')})` : 'Dag + nacht'

  // Ander paar gekozen (loterijpagina): alles opnieuw
  const dayKey = props.dayDate.getTime()
  useEffect(() => {
    if (m.loadedFor === dayKey) return
    m.loadedFor = dayKey
    m.result = null
    const only = p.current.onlyShift
    m.scope = only === 'N' ? 'Night' : only === 'D' ? 'Day' : 'Pair'
    void handle(() => reloadAsync(true))()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey])

  async function reloadAsync(resetSelection: boolean) {
    m.loading = m.cands.length === 0 && m.existing.length === 0
    const load = p.current.load ?? (async () => ({ candidates: [], existingDraws: [], teamMembers: [], nextDrawNumber: 1, stats: new Map() }))
    const ctx = await load()
    // Handmatig toegevoegden behouden zolang ze geen verlof kregen
    const manual = m.cands.filter(c => c.shifts === '' && ctx.candidates.every(n => n.personId !== c.personId))
    m.cands = resetSelection ? ctx.candidates : [...ctx.candidates, ...manual]
    m.existing = ctx.existingDraws
    m.teamMembers = ctx.teamMembers
    m.nextDrawNumber = ctx.nextDrawNumber
    m.stats = ctx.stats
    if (resetSelection) resetSelectionNow()
    setScope(m.scope)
    m.loading = false
  }

  // Standaard doet enkel gewoon verlof mee; verlof uit een verlofregel (categorie) houdt zeker verlof
  function resetSelectionNow() {
    m.selected.clear()
    for (const c of m.cands.filter(c => isNullOrEmpty(c.category))) m.selected.add(c.personId)
  }

  function setScope(s: Scope) {
    m.scope = s
    m.confirming = false
    const day = dayDate()
    const night = nightDate()
    m.drawName =
      s === 'Day'
        ? `Loting ${formatDate(day, 'd MMM yyyy', 'nl-BE')} (D)`
        : s === 'Night'
          ? `Loting ${formatDate(night, 'd MMM yyyy', 'nl-BE')} (N)`
          : `Loting ${day.getMonth() === night.getMonth() ? formatDate(day, '%d', 'nl-BE') : formatDate(day, 'd MMM', 'nl-BE')}–${formatDate(night, 'd MMM yyyy', 'nl-BE')} (D+N)`
    recalcWinners()
  }

  function toggle(personId: number, on: boolean) {
    if (on) m.selected.add(personId)
    else m.selected.delete(personId)
    m.confirming = false
    recalcWinners()
  }

  function addPerson() {
    const t = m.teamMembers.find(x => x.id === m.personToAdd)
    if (!t) return
    m.cands.push({ personId: t.id, firstName: t.firstName ?? '', lastName: t.lastName ?? '', shifts: '' })
    m.selected.add(t.id)
    m.personToAdd = null
    m.confirming = false
    recalcWinners()
  }

  // Standaard: max per shift min wie zeker verlof houdt (niet aangevinkt), zodat het totaal precies het maximum is
  function recalcWinners() {
    m.winnersCount = clamp(quota() - (scoped().length - selectedCount()), 0, selectedCount())
  }

  async function drawAsync() {
    m.busy = true
    try {
      // Schudden (Fisher–Yates)
      const list = scoped().filter(c => m.selected.has(c.personId))
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[list[i], list[j]] = [list[j], list[i]]
      }

      const count = clamp(m.winnersCount, 0, list.length)
      const person = (c: LotteryCandidate): LotteryPersonDTO => ({
        personId: c.personId,
        firstName: c.firstName,
        lastName: c.lastName,
        removedDay: false,
        removedNight: false,
        dayLeaveCategoryId: null,
        nightLeaveCategoryId: null,
      })
      const from = fromDate()
      const dto: LotteryDrawDTO = {
        drawNumber: m.nextDrawNumber,
        drawName: !m.drawName.trim() ? `Loting ${pad2(from.getDate())}-${pad2(from.getMonth() + 1)}-${from.getFullYear()}` : m.drawName.trim(),
        fromDate: toApiDate(from),
        toDate: toApiDate(toDate()),
        shift: m.scope === 'Day' ? 'D' : m.scope === 'Night' ? 'N' : null,
        createdAtUtc: new Date().toISOString(),
        winners: list.slice(0, count).map(person),
        losers: list.slice(count).map(person),
      }

      const created = await lotteryApi.create(dto)
      if (!created.ok) {
        notificationService.notify('Error', 'Loting niet bewaard', created.error ?? '')
        return
      }
      dto.drawNumber = created.value ?? 0
      m.result = dto
      m.resultApplied = false
      m.confirming = false

      if (m.applyNow && canApplyNow() && dto.losers.length > 0) await applyAsync(dto.drawNumber, dto.drawName)
      else {
        notificationService.notify('Success', 'Loting bewaard', `${dto.drawName}: ${dto.winners.length} winnaar(s).`)
        if (p.current.onChanged) await p.current.onChanged()
      }
    } finally {
      m.busy = false
    }
  }

  async function applyAsync(drawNumber: number, name: string) {
    m.busy = true
    try {
      const applied = await lotteryApi.apply(drawNumber)
      if (!applied.ok) {
        notificationService.notify('Error', 'Niet toegepast', applied.error ?? '')
        return
      }
      const value = applied.value ?? []
      if (p.current.onRemoved && value.length > 0) await p.current.onRemoved(value)
      if (m.result?.drawNumber === drawNumber) m.resultApplied = true
      notificationService.notify('Success', 'Loting toegepast', `${name}: ${new Set(value.map(r => r.personId)).size} persoon/personen verloren hun verlof.`)
      m.pendingApply = null
      await reloadAsync(m.result === null)
      if (p.current.onChanged) await p.current.onChanged()
    } finally {
      m.busy = false
    }
  }

  async function deleteAsync(draw: LotteryDrawDTO) {
    m.busy = true
    try {
      const deleted = await lotteryApi.remove(draw.drawNumber)
      if (!deleted.ok) {
        notificationService.notify('Error', 'Niet verwijderd', deleted.error ?? '')
        return
      }
      const value = deleted.value ?? []
      if (p.current.onRestored && value.length > 0) await p.current.onRestored(value)
      notificationService.notify('Success', 'Loting verwijderd', value.length > 0 ? `${draw.drawName}: verlof teruggezet.` : draw.drawName)
      m.pendingDelete = null
      // Iedereen die (weer) verlof heeft opnieuw in de lijst, klaar voor een nieuwe loting
      await reloadAsync(true)
      if (p.current.onChanged) await p.current.onChanged()
    } finally {
      m.busy = false
    }
  }

  async function newDrawAsync() {
    m.result = null
    m.resultApplied = false
    m.pendingApply = null
    await reloadAsync(true)
  }

  const onClose = props.onClose

  // --- Weergave (zelfde HTML als LotteryForm.razor) ---
  const body = (): ReactNode => {
    if (m.loading) return <p className="tl-hint">Laden…</p>

    const sc = scoped()
    const selCount = selectedCount()
    const leave = withLeave()
    const q = props.quota
    const result = m.result
    const addable = addablePeople()

    return (
      <>
        {result === null && props.onlyShift == null && (
          <div className="tl-scope" role="group" aria-label="Loting over">
            {Scopes.map(s => (
              <button
                key={s}
                type="button"
                className={m.scope === s ? 'tl-scope-btn tl-scope-active' : 'tl-scope-btn'}
                aria-pressed={m.scope === s ? 'true' : 'false'}
                onClick={handle(() => setScope(s))}
              >
                {scopeLabel(s)}
              </button>
            ))}
          </div>
        )}

        <div className="tl-info">
          <span>
            <strong>{leave.length}</strong> personen met verlof
          </span>
          {m.scope !== 'Night' && (
            <span>
              dag {formatDate(props.dayDate, 'ddd d/M', 'nl-BE')}: <strong>{dayCount()}</strong>/{q}
            </span>
          )}
          {m.scope !== 'Day' && (
            <span>
              nacht {formatDate(props.nightDate, 'ddd d/M', 'nl-BE')}: <strong>{nightCount()}</strong>/{q}
            </span>
          )}
          {leave.length > q && <span className="tl-over">{leave.length - q} te veel</span>}
        </div>

        {m.existing.length > 0 && (
          <>
            <div className="tl-section-title">Eerdere loting(en)</div>
            {m.existing.map(d => {
              const applied = lotteryApi.isApplied(d)
              return (
                <div className="tl-result" key={d.drawNumber}>
                  <div className="tl-result-name">
                    {d.drawName}{' '}
                    <span className={applied ? 'tl-status tl-status-done' : 'tl-status tl-status-open'}>{applied ? 'toegepast' : 'niet toegepast'}</span>
                  </div>
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
                  {result === null && !applied && canApply && d.losers.length > 0 && (
                    <Button
                      text="Toepassen"
                      icon="done_all"
                      size="ExtraSmall"
                      buttonStyle="Primary"
                      variant="Outlined"
                      title="Verliezers van deze loting verliezen hun verlof op de shiften van deze loting"
                      onClick={handle(() => {
                        m.pendingApply = d.drawNumber
                        m.pendingDelete = null
                      })}
                    />
                  )}
                  {result === null && (
                    <Button
                      text="Verwijderen"
                      icon="delete"
                      size="ExtraSmall"
                      buttonStyle="Danger"
                      variant="Outlined"
                      title="Deze loting verwijderen (ook van de loterijpagina)"
                      onClick={handle(() => {
                        m.pendingDelete = d.drawNumber
                        m.pendingApply = null
                      })}
                    />
                  )}
                  {m.pendingApply === d.drawNumber && (
                    <div className="tl-confirm">
                      <div className="tl-confirm-title">
                        <i className="rzi">help_outline</i> Loting "{d.drawName}" toepassen?
                      </div>
                      <div className="tl-hint">
                        {loserNames(d)} {d.losers.length === 1 ? 'verliest' : 'verliezen'} hun verlof op de shift(en) van deze loting. Dit wordt meteen opgeslagen.
                      </div>
                      <div className="tl-actions">
                        <Button text="Terug" buttonStyle="Light" size="Small" onClick={handle(() => (m.pendingApply = null))} />{' '}
                        <Button text="Ja, toepassen" icon="done_all" buttonStyle="Primary" size="Small" disabled={m.busy} onClick={handle(() => applyAsync(d.drawNumber, d.drawName))} />
                      </div>
                    </div>
                  )}
                  {m.pendingDelete === d.drawNumber && (
                    <div className="tl-confirm tl-confirm-danger">
                      <div className="tl-confirm-title">
                        <i className="rzi">delete</i> Loting "{d.drawName}" verwijderen?
                      </div>
                      <div className="tl-hint">De loting verdwijnt ook van de loterijpagina. Was ze toegepast, dan krijgen de verliezers hun verlof terug (met hun verlofregel).</div>
                      <div className="tl-actions">
                        <Button text="Terug" buttonStyle="Light" size="Small" onClick={handle(() => (m.pendingDelete = null))} />{' '}
                        <Button text="Ja, verwijderen" icon="delete" buttonStyle="Danger" size="Small" disabled={m.busy} onClick={handle(() => deleteAsync(d))} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {result === null ? (
          <>
            <div className="tl-section-title">Wie gaat mee in de loting?</div>
            <div className="tl-hint">Niet aangevinkt = houdt zeker verlof. Verlof uit een verlofregel (bv. Groot verlof) is standaard niet aangevinkt.</div>
            <div className="tl-list">
              {[...sc]
                .sort((a, b) => Number(isNullOrEmpty(a.category)) - Number(isNullOrEmpty(b.category)) || Number(a.shifts === '') - Number(b.shifts === ''))
                .map(c => {
                  const isIn = m.selected.has(c.personId)
                  const st = m.stats.get(c.personId)
                  return (
                    <label key={c.personId} className={isIn ? 'tl-person tl-person-in' : 'tl-person'}>
                      <BlazorCheckbox checked={isIn} onChange={on => void handle(() => toggle(c.personId, on))()} />{' '}
                      <span className="tl-person-name">
                        {c.firstName} {c.lastName}
                      </span>
                      {st && (
                        <span className="tl-record" title={`Lotingen dit jaar: ${st.won} gewonnen, ${st.lost} verloren`}>
                          <span className="tl-record-w">{st.won} gew.</span> · <span className="tl-record-l">{st.lost} verl.</span>
                        </span>
                      )}
                      {c.shifts === '' ? (
                        <span className="tl-shifts tl-shifts-half" title="Toegevoegd, heeft geen verlof op deze shift(en)">
                          toegevoegd
                        </span>
                      ) : (
                        m.scope === 'Pair' && (
                          <span
                            className={c.shifts === 'D+N' ? 'tl-shifts' : 'tl-shifts tl-shifts-half'}
                            title={c.shifts === 'D+N' ? 'Verlof op dag- en nachtshift' : 'Enkel verlof op de ' + (c.shifts === 'D' ? 'dagshift' : 'nachtshift')}
                          >
                            {c.shifts}
                          </span>
                        )
                      )}
                      {!isNullOrEmpty(c.category) && (
                        <span className="tl-cat" style={{ borderColor: c.color ?? undefined, color: c.color ?? undefined }}>
                          {c.category}
                        </span>
                      )}
                    </label>
                  )
                })}
              {sc.length === 0 && <span className="tl-hint">Niemand heeft verlof op deze shift.</span>}
            </div>

            {(props.allowAddPeople ?? false) && addable.length > 0 && (
              <div className="tl-add">
                <DropDown<AddOption, number>
                  data={addable}
                  textProperty={o => o.text}
                  valueProperty={o => o.id}
                  value={m.personToAdd}
                  onChange={v => void handle(() => (m.personToAdd = v))()}
                  placeholder="Persoon van de ploeg toevoegen"
                  allowFiltering
                  caseInsensitive
                  style="width:100%"
                />{' '}
                <Button icon="add" text="Toevoegen" buttonStyle="Light" size="Small" disabled={m.personToAdd === null} onClick={handle(addPerson)} />
              </div>
            )}

            <div className="tl-form">
              <label>
                <span>Naam loting</span>{' '}
                <TextBox value={m.drawName} onChange={v => void handle(() => (m.drawName = v))()} style="width:100%" />
              </label>
              <label>
                <span>Aantal winnaars (houden verlof)</span>{' '}
                <Numeric value={m.winnersCount} onChange={v => void handle(() => (m.winnersCount = v ?? 0))()} min={0} max={selCount} style="width:120px" />
              </label>
            </div>
            <div className="tl-hint">
              {sc.length - selCount} zeker (niet aangevinkt) + {m.winnersCount} winnaar(s) = {sc.length - selCount + m.winnersCount} van max {q}.
            </div>

            {m.confirming ? (
              <div className="tl-confirm">
                <div className="tl-confirm-title">
                  <i className="rzi">help_outline</i> {m.applyNow && canApply ? 'Loting trekken, bewaren en toepassen?' : 'Loting trekken en bewaren?'}
                </div>
                <div>
                  <strong>{m.drawName}</strong> · {scopeLabel(m.scope)}
                  <br /> {selCount} deelnemer(s), {m.winnersCount} winnaar(s)
                  {sc.length - selCount > 0 ? `, ${sc.length - selCount} houden zeker verlof` : ''}.
                </div>
                {canApply && (
                  <label className="tl-apply-now">
                    <BlazorCheckbox checked={m.applyNow} onChange={on => void handle(() => (m.applyNow = on))()} /> Meteen toepassen (verliezers verliezen hun
                    verlof, dit wordt meteen opgeslagen)
                  </label>
                )}
                <div className="tl-hint">De loting wordt bewaard en is zichtbaar in de teamkalender en op de loterijpagina.</div>
                <div className="tl-actions">
                  <Button text="Terug" buttonStyle="Light" onClick={handle(() => (m.confirming = false))} />{' '}
                  <Button
                    text={m.applyNow && canApply ? 'Ja, trekken en toepassen' : 'Ja, trekken en bewaren'}
                    icon="casino"
                    buttonStyle="Primary"
                    disabled={m.busy}
                    onClick={handle(drawAsync)}
                  />
                </div>
              </div>
            ) : (
              <div className="tl-actions">
                {onClose && <Button text="Annuleren" buttonStyle="Light" onClick={handle(() => onClose())} />}
                <Button text="Loting trekken" icon="casino" buttonStyle="Primary" disabled={m.busy || selCount === 0} onClick={handle(() => (m.confirming = true))} />
              </div>
            )}
          </>
        ) : (
          <>
            <div className="tl-section-title">
              Resultaat: {result.drawName}{' '}
              <span className={m.resultApplied ? 'tl-status tl-status-done' : 'tl-status tl-status-open'}>{m.resultApplied ? 'toegepast' : 'niet toegepast'}</span>
            </div>
            <div className="tl-result">
              <div className="tl-result-label">Winnaars (houden verlof)</div>
              {result.winners.map((w, i) => (
                <span key={i} className="tl-tag tl-tag-win">
                  {w.firstName} {w.lastName}
                </span>
              ))}
              {result.winners.length === 0 && <span className="tl-hint">geen</span>}
            </div>
            <div className="tl-result">
              <div className="tl-result-label">Verliezers{m.resultApplied ? ' (verlof weggehaald)' : ''}</div>
              {result.losers.map((l, i) => (
                <span key={i} className="tl-tag tl-tag-lose">
                  {l.firstName} {l.lastName}
                </span>
              ))}
              {result.losers.length === 0 && <span className="tl-hint">geen</span>}
            </div>
            {m.pendingApply === result.drawNumber && (
              <div className="tl-confirm">
                <div className="tl-confirm-title">
                  <i className="rzi">help_outline</i> Loting toepassen?
                </div>
                <div className="tl-hint">
                  {loserNames(result)} {result.losers.length === 1 ? 'verliest' : 'verliezen'} hun verlof op de shift(en) van deze loting. Dit wordt meteen opgeslagen.
                </div>
                <div className="tl-actions">
                  <Button text="Terug" buttonStyle="Light" size="Small" onClick={handle(() => (m.pendingApply = null))} />{' '}
                  <Button text="Ja, toepassen" icon="done_all" buttonStyle="Primary" size="Small" disabled={m.busy} onClick={handle(() => applyAsync(result.drawNumber, result.drawName))} />
                </div>
              </div>
            )}
            <div className="tl-actions">
              {onClose && <Button text="Sluiten" buttonStyle="Light" onClick={handle(() => onClose())} />}
              <Button text="Nieuwe loting" icon="casino" buttonStyle="Light" onClick={handle(newDrawAsync)} />
              {!m.resultApplied && canApply && result.losers.length > 0 && m.pendingApply === null && (
                <Button
                  text="Toepassen"
                  icon="done_all"
                  buttonStyle="Primary"
                  title="Verliezers verliezen hun verlof op de shiften van deze loting"
                  onClick={handle(() => (m.pendingApply = result.drawNumber))}
                />
              )}
            </div>
          </>
        )}
      </>
    )
  }

  return <div className="tl">{body()}</div>
}

// <input type="checkbox" checked="@x" @onchange=...>: Blazor zet enkel de eigenschap checked, niet het attribuut
export function BlazorCheckbox({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    if (ref.current) ref.current.checked = checked
  })
  return <input ref={ref} type="checkbox" onChange={e => onChange(e.currentTarget.checked)} />
}

// string.CompareTo / OrderBy op tekst (cultuurgevoelig, zoals .NET)
function cmp(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? '').localeCompare(b ?? '')
}
