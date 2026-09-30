import { useEffect, useRef, useState } from 'react'
import { Button } from '../radzen/Button'
import { DropDown } from '../radzen/DropDown'
import { TextBox } from '../radzen/Inputs'
import { Stack } from '../radzen/Layout'
import { DatePicker } from '../radzen/DatePicker'
import { notificationService } from '../radzen/Notification'
import { deleteRequest, getJson, postJson } from '../api/http'
import type { PersonBaseDTO } from '../api/person'
import { scopeService } from '../services/scope'
import { AllTeamsSpeciality, extraShiftAllowedOnOwnShift, hasNoRegime } from '../rules'
import { dateOnly, formatDate, parseDate, toApiDate } from '../util/dotnet'

// Zelfde als VerlofBWZC/Pages/ExtraShiftDialog.razor.
// Extra shift: iemand (Dispatching) werkt een dag- of nachtshift in een andere ploeg.
// Geen verlof; het verlofmaximum van die ploeg op die shift gaat met 1 omhoog. Wordt meteen bewaard.

// VerlofBWZC.DataContracts.DTO.Calendar.ExtraShiftDTO
export interface ExtraShiftDTO {
  id: number
  personId: number
  date: string
  shift: string
  // Ploeg waarin de persoon die shift werkt
  team: string
  note?: string | null
  // Enkel om te tonen (antwoord van de server)
  firstName?: string | null
  lastName?: string | null
  initials?: string | null
  personTeam?: string | null
  personSpeciality?: string | null
}

interface WorkDayDTO {
  date: string
  shift: string
}

export interface ExtraShiftDialogProps {
  date: Date
  shift?: string
  team?: string | null
  // Aangeduid in de teamkalender: persoon al gekozen, enkel nog bevestigen (venster sluit na bewaren)
  personId?: number | null
  onClose?: () => void | Promise<void>
}

const css = `
    .xs-form { display:flex; flex-direction:column; gap:.6rem; margin-bottom:1rem; }
    .xs-field label { display:block; font-size:.8rem; font-weight:600; color:var(--bwzc-navy); margin-bottom:.2rem; }
    .xs-item { display:flex; align-items:center; gap:.5rem; padding:.35rem .5rem; border-radius:6px; background:var(--bwzc-ice); margin-bottom:.3rem; }
    .xs-item-text { flex:1; font-size:.875rem; }
    .xs-note { color:var(--rz-text-secondary-color); }
    .xs-swatch { width:12px; height:12px; border-radius:3px; background:var(--bwzc-extra, #7B4FB8); flex:none; }
`

const Speciality = AllTeamsSpeciality
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

interface PersonChoice {
  id: number
  text: string
}

// De toestand van het component (zoals de velden in @code), met render() = StateHasChanged
class Model {
  render: () => void = () => {}
  props!: ExtraShiftDialogProps

  date = new Date()
  shift = 'D'
  team: string | null = null
  personId: number | null = null
  note: string | null = null
  loading = true
  busy = false

  teams: string[] = []
  persons: PersonBaseDTO[] = []
  extras: ExtraShiftDTO[] = []
  // Rooster per jaar en ploeg
  rosters = new Map<string, Set<string>>()

  async init() {
    const p = this.props
    this.date = dateOnly(p.date)
    this.shift = p.shift === 'N' ? 'N' : 'D'

    await scopeService.load()
    this.teams = scopeService.teamsFor(Speciality)
    for (const t of this.teams) this.persons.push(...((await getJson<PersonBaseDTO[] | null>(`api/person/team/${t}/${Speciality}`)) ?? []))

    await this.loadYear(this.date.getFullYear())
    this.team = p.team != null && this.teamChoices.includes(p.team) ? p.team : (this.teamChoices.find(t => !hasNoRegime(t)) ?? null)
    if (p.personId != null && this.personChoices.some(c => c.id === p.personId)) this.personId = p.personId
    this.loading = false
  }

  async loadYear(year: number) {
    for (const t of this.teams.filter(t => !this.rosters.has(`${year}|${t}`))) {
      const days = (await getJson<WorkDayDTO[] | null>(`api/calender?teamName=${t}&year=${year}`)) ?? []
      this.rosters.set(`${year}|${t}`, new Set(days.map(d => `${dayKey(parseDate(d.date))}|${d.shift}`)))
    }
    await this.loadExtras(year)
  }

  async loadExtras(year: number) {
    const list: ExtraShiftDTO[] = []
    for (const t of this.teams) list.push(...((await getJson<ExtraShiftDTO[] | null>(`api/extra-shifts?team=${t}&year=${year}&speciality=${Speciality}`)) ?? []))
    this.extras = list
  }

  works(t: string | null | undefined, d: Date, s: string) {
    return t != null && (this.rosters.get(`${d.getFullYear()}|${t}`)?.has(`${dayKey(d)}|${s}`) ?? false)
  }

  // Ploegen die deze shift werken
  get teamChoices() {
    return this.teams.filter(t => this.works(t, this.date, this.shift))
  }

  get onThisShift() {
    return this.extras
      .filter(e => dayKey(parseDate(e.date)) === dayKey(this.date) && e.shift === this.shift)
      .map((e, i) => ({ e, i }))
      .sort((a, b) => compare(a.e.team, b.e.team) || compare(a.e.lastName, b.e.lastName) || a.i - b.i)
      .map(x => x.e)
  }

  // Wie kan bijspringen: andere ploeg, werkt die shift niet zelf (behalve zonder werkregime), nog geen extra shift dan
  get personChoices(): PersonChoice[] {
    const team = this.team
    if (!team) return []
    return this.persons
      .filter(p => p.team !== team)
      .filter(p => !this.works(p.team, this.date, this.shift) || extraShiftAllowedOnOwnShift(p.team))
      .filter(p => !this.extras.some(e => e.personId === p.id && dayKey(parseDate(e.date)) === dayKey(this.date) && e.shift === this.shift))
      .map((p, i) => ({ p, i }))
      .sort((a, b) => compare(a.p.lastName, b.p.lastName) || compare(a.p.firstName, b.p.firstName) || a.i - b.i)
      .map(({ p }) => ({ id: p.id, text: `${p.lastName ?? ''} ${p.firstName ?? ''} (${p.team ?? ''})` }))
  }

  async setDate(d: Date) {
    const year = this.date.getFullYear()
    this.date = dateOnly(d)
    if (d.getFullYear() !== year) await this.loadYear(d.getFullYear())
    this.fixTeam()
  }

  setShift(s: string) {
    this.shift = s
    this.fixTeam()
  }

  fixTeam() {
    if (!this.teamChoices.includes(this.team ?? '')) this.team = this.teamChoices.find(t => !hasNoRegime(t)) ?? null
    if (this.personId != null && this.personChoices.every(p => p.id !== this.personId)) this.personId = null
  }

  async add() {
    this.busy = true
    this.render()
    try {
      const resp = await postJson('api/extra-shifts', {
        id: 0,
        personId: this.personId!,
        date: toApiDate(this.date),
        shift: this.shift,
        team: this.team!,
        note: this.note,
        firstName: null,
        lastName: null,
        initials: null,
        personTeam: null,
        personSpeciality: null,
      })
      if (resp.ok) {
        // Aangeduid in de teamkalender: bevestigd, venster dicht
        if (this.props.personId != null) {
          await this.props.onClose?.()
          return
        }
        this.personId = null
        this.note = null
        await this.loadExtras(this.date.getFullYear())
      } else {
        this.notify(resp.status === 403 ? 'Je mag voor deze ploeg geen extra shift aanduiden.' : await resp.text())
      }
    } finally {
      this.busy = false
    }
  }

  async remove(e: ExtraShiftDTO) {
    this.busy = true
    this.render()
    try {
      const resp = await deleteRequest(`api/extra-shifts/${e.id}`)
      if (resp.ok) await this.loadExtras(this.date.getFullYear())
      else this.notify(resp.status === 403 ? 'Je mag deze extra shift niet verwijderen.' : await resp.text())
    } finally {
      this.busy = false
    }
  }

  notify(detail: string) {
    notificationService.notify('Error', 'Extra shift', !detail.trim() ? 'Bewaren mislukt.' : detail, 5000)
  }
}

// OrderBy op tekst (cultuurgevoelig, zoals .NET)
const collator = new Intl.Collator(undefined)
const compare = (a: string | null | undefined, b: string | null | undefined) => (a == null ? (b == null ? 0 : -1) : b == null ? 1 : collator.compare(a, b))

export function ExtraShiftDialog(props: ExtraShiftDialogProps) {
  const [, setTick] = useState(0)
  const ref = useRef<Model | null>(null)
  if (!ref.current) ref.current = new Model()
  const m = ref.current
  m.props = props
  m.render = () => setTick(t => t + 1)

  useEffect(() => {
    void m.init().finally(() => m.render())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // EventCallback: render na het synchrone deel en na afloop
  const ev =
    <A extends unknown[]>(fn: (...args: A) => unknown) =>
    (...args: A) => {
      const r = fn(...args)
      m.render()
      if (r instanceof Promise) void r.finally(() => m.render())
    }

  const onThisShift = m.onThisShift
  const personChoices = m.personChoices
  const teamChoices = m.teamChoices

  return (
    <>
      <div className="xs">
        {m.loading ? (
          <p className="tl-hint">Laden…</p>
        ) : (
          <>
            <div className="xs-form">
              <div className="xs-field">
                <label>Datum</label>{' '}
                <DatePicker value={m.date} onChange={ev((d: Date) => m.setDate(d))} dateFormat="ddd d MMMM yyyy" style="width:100%" />
              </div>{' '}
              <div className="xs-field">
                <label>Shift</label>{' '}
                <div className="tl-scope" role="group" aria-label="Shift">
                  {['D', 'N'].map(s => (
                    <button
                      key={s}
                      type="button"
                      className={m.shift === s ? 'tl-scope-btn tl-scope-active' : 'tl-scope-btn'}
                      aria-pressed={m.shift === s ? 'true' : 'false'}
                      onClick={ev(() => m.setShift(s))}
                    >
                      {s === 'D' ? 'Dagshift' : 'Nachtshift'}
                    </button>
                  ))}
                </div>
              </div>{' '}
              <div className="xs-field">
                <label>Werkt in ploeg</label>{' '}
                <DropDown
                  data={teamChoices}
                  value={m.team}
                  onChange={ev((v: string | null) => {
                    m.team = v
                    m.personId = null
                  })}
                  placeholder="Ploeg"
                  style="width:100%"
                />
                {teamChoices.length === 0 && <div className="tl-hint">Geen enkele ploeg werkt deze shift.</div>}
              </div>{' '}
              <div className="xs-field">
                <label>Persoon</label>{' '}
                <DropDown
                  data={personChoices}
                  textProperty={p => p.text}
                  valueProperty={p => p.id}
                  value={m.personId}
                  onChange={ev((v: number | null) => {
                    m.personId = v
                  })}
                  placeholder={!m.team ? 'Kies eerst een ploeg' : 'Wie springt bij?'}
                  allowFiltering
                  caseInsensitive
                  style="width:100%"
                />
                {!!m.team && personChoices.length === 0 && <div className="tl-hint">Niemand beschikbaar: de anderen werken dan zelf of springen al bij.</div>}
              </div>{' '}
              <div className="xs-field">
                <label>Opmerking (optioneel)</label>{' '}
                <TextBox
                  value={m.note}
                  onChange={ev((v: string) => {
                    m.note = v
                  })}
                  maxLength={200}
                  placeholder="bv. ziekte vervangen"
                  style="width:100%"
                />
              </div>{' '}
              <Stack orientation="Horizontal" justifyContent="End">
                {props.personId != null && <Button text="Annuleren" buttonStyle="Light" onClick={() => props.onClose?.()} />}
                <Button
                  text={props.personId != null ? 'Bevestigen' : 'Extra shift toevoegen'}
                  icon={props.personId != null ? 'check' : 'add'}
                  buttonStyle="Primary"
                  onClick={ev(() => m.add())}
                  disabled={m.busy || m.personId == null || !m.team}
                />
              </Stack>
            </div>{' '}
            <div className="tl-section-title">
              Extra shiften op {formatDate(m.date, 'ddd d MMMM', 'nl-BE')} · {m.shift === 'D' ? 'dag' : 'nacht'}
            </div>
            {onThisShift.length === 0 && <p className="tl-hint">Nog geen extra shiften op deze shift.</p>}
            {onThisShift.map(e => (
              <div key={e.id} className="xs-item">
                <span className="xs-swatch" />{' '}
                <span className="xs-item-text">
                  <strong>
                    {e.firstName ?? ''} {e.lastName ?? ''}
                  </strong>{' '}
                  ({e.personTeam ?? ''}) werkt in <strong>{e.team}</strong>
                  {!!e.note && <span className="xs-note">· {e.note}</span>}
                </span>{' '}
                <button type="button" className="ms-chip-x" title="Extra shift verwijderen" aria-label="Extra shift verwijderen" disabled={m.busy} onClick={ev(() => m.remove(e))}>
                  <i className="rzi">delete</i>
                </button>
              </div>
            ))}
            {props.personId == null && (
              <Stack orientation="Horizontal" justifyContent="End" style="margin-top:1rem">
                <Button text="Sluiten" buttonStyle="Light" onClick={() => props.onClose?.()} />
              </Stack>
            )}
          </>
        )}
      </div>
      {'\n\n'}
      <style>{css}</style>
    </>
  )
}
