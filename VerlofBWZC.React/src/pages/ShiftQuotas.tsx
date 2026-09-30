import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../radzen/Button'
import { Stack } from '../radzen/Layout'
import { DropDown } from '../radzen/DropDown'
import { MultiDropDown } from '../radzen/MultiDropDown'
import { Numeric, Card } from '../radzen/Misc'
import { DataGrid, type DataGridColumn } from '../radzen/DataGrid'
import { dialogService } from '../radzen/Dialog'
import { notificationService, type NotificationSeverity } from '../radzen/Notification'
import { deleteRequest, getJson, postJson, putJson } from '../api/http'
import { scopeService } from '../services/scope'
import { getCurrentPerson, isAdminPerson } from '../services/browser'

// Zelfde als VerlofBWZC/Pages/ShiftQuotas.razor (@page "/max-per-shift", Admin/Manager)

// VerlofBWZC.DataContracts.DTO.Leave.ShiftQuotaDTO: maximum aantal personen met verlof per shift.
// Year null = standaard voor alle jaren. Geen regel = een kwart van de personen (minstens 1).
export interface ShiftQuotaDTO {
  id: number
  team: string
  speciality: string
  year?: number | null
  dayMax: number
  nightMax: number
}

const newShiftQuota = (): ShiftQuotaDTO => ({ id: 0, team: '', speciality: '', year: null, dayMax: 5, nightMax: 5 })

const notify = (severity: NotificationSeverity, detail: string) => notificationService.notify(severity, 'Max per shift', detail, 4000)

// Foutmelding van de API (403 = geen rechten; JSON of leeg = statuscode)
async function errorOf(resp: Response): Promise<string> {
  if (resp.status === 403) return 'Je hebt geen rechten voor deze ploeg of specialiteit.'
  const text = (await resp.text()).trim().replace(/^"+|"+$/g, '')
  return !text.trim() || text.startsWith('{') ? `Mislukt (${resp.status}).` : text
}

export function ShiftQuotas() {
  const [teams, setTeams] = useState<string[]>([])
  const [specialities, setSpecialities] = useState<string[]>([])
  const years = useMemo(() => Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - 1 + i), [])
  const [teamFilter, setTeamFilter] = useState<string | null>(null)
  const [specialityFilter, setSpecialityFilter] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [hasChoice, setHasChoice] = useState(() => scopeService.hasChoice)

  const [rules, setRules] = useState<ShiftQuotaDTO[]>([])
  const [editing, setEditing] = useState<ShiftQuotaDTO | null>(null)
  const [sameForBoth, setSameForBoth] = useState(true)
  // Zoals Blazor checked="@sameForBoth": enkel de eigenschap, geen HTML-attribuut (React zet dat bij het aanmaken)
  const sameInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    sameInput.current?.removeAttribute('checked')
  })
  const [createTeams, setCreateTeams] = useState<string[]>([])
  const [createSpecialities, setCreateSpecialities] = useState<string[]>([])

  const filteredRules = rules.filter(r => teamFilter === null || r.team === teamFilter).filter(r => specialityFilter === null || r.speciality === specialityFilter)

  const loadRules = async () => setRules((await getJson<ShiftQuotaDTO[] | null>('api/shift-quotas/rules')) ?? [])

  useEffect(() => {
    void (async () => {
      let t = (await getJson<string[] | null>('api/meta/teams')) ?? []
      let s = (await getJson<string[] | null>('api/meta/specialities')) ?? []

      const me = await getCurrentPerson()
      const admin = isAdminPerson(me)
      setIsAdmin(admin)
      if (!admin && me) {
        // Manager: de ploegen en specialiteiten die hij beheert (de API controleert dit ook)
        await scopeService.load(true)
        t = scopeService.teams
        s = [...new Set(t.flatMap(x => scopeService.specialitiesFor(x)))].sort((a, b) => scopeService.allSpecialityNames.indexOf(a) - scopeService.allSpecialityNames.indexOf(b))
        if (!scopeService.hasChoice) {
          setTeamFilter(me.team)
          setSpecialityFilter(me.speciality)
        }
      }
      setHasChoice(scopeService.hasChoice)
      setTeams(t)
      setSpecialities(s)
      await loadRules()
    })()
  }, [])

  const edit = (patch: Partial<ShiftQuotaDTO>) => setEditing(e => (e ? { ...e, ...patch } : e))

  const toggleSame = (on: boolean) => {
    setSameForBoth(on)
    if (on) setEditing(e => (e ? { ...e, nightMax: e.dayMax } : e))
  }

  const startCreate = () => {
    setEditing(newShiftQuota())
    setSameForBoth(true)
    setCreateTeams(teamFilter !== null ? [teamFilter] : [])
    setCreateSpecialities(specialityFilter !== null ? [specialityFilter] : [])
  }

  const startEdit = (r: ShiftQuotaDTO) => {
    setEditing({ ...newShiftQuota(), id: r.id, team: r.team, speciality: r.speciality, year: r.year, dayMax: r.dayMax, nightMax: r.nightMax })
    setSameForBoth(r.dayMax === r.nightMax)
  }

  const save = async () => {
    if (!editing) return
    const current: ShiftQuotaDTO = sameForBoth ? { ...editing, nightMax: editing.dayMax } : editing
    if (sameForBoth) setEditing(current)

    if (current.id === 0) {
      if (createTeams.length === 0 || createSpecialities.length === 0) {
        notify('Warning', 'Kies minstens één ploeg en één specialiteit.')
        return
      }

      let created = 0
      for (const team of createTeams)
        for (const spec of createSpecialities) {
          const dto: ShiftQuotaDTO = { ...newShiftQuota(), team, speciality: spec, year: current.year, dayMax: current.dayMax, nightMax: current.nightMax }
          const resp = await postJson('api/shift-quotas/rules', dto)
          if (!resp.ok) {
            notify('Error', await errorOf(resp))
            await loadRules()
            return
          }
          created++
        }
      notify('Success', `${created} regel(s) toegevoegd.`)
    } else {
      const resp = await putJson(`api/shift-quotas/rules/${current.id}`, current)
      if (!resp.ok) {
        notify('Error', await errorOf(resp))
        return
      }
      notify('Success', 'Regel bijgewerkt.')
    }

    setEditing(null)
    await loadRules()
  }

  const remove = async (r: ShiftQuotaDTO) => {
    const ok = await dialogService.confirm(
      `Regel voor ${r.team}/${r.speciality} (${r.year != null ? String(r.year) : 'alle jaren'}) verwijderen? Daarna geldt weer de standaard (een kwart van de personen).`,
      'Verwijderen',
      { okButtonText: 'Verwijderen', cancelButtonText: 'Annuleren' },
    )
    if (ok !== true) return

    const resp = await deleteRequest(`api/shift-quotas/rules/${r.id}`)
    if (resp.ok) {
      notify('Success', 'Regel verwijderd.')
      await loadRules()
    } else {
      notify('Error', await errorOf(resp))
    }
  }

  const columns: DataGridColumn<ShiftQuotaDTO>[] = [
    { property: r => r.team, title: 'Ploeg', width: '110px' },
    { property: r => r.speciality, title: 'Specialiteit', width: '150px' },
    { property: r => r.year, title: 'Jaar', width: '100px', template: r => (r.year != null ? String(r.year) : 'Alle jaren') },
    { property: r => r.dayMax, title: 'Max dag', width: '110px' },
    { property: r => r.nightMax, title: 'Max nacht', width: '110px' },
    {
      title: '',
      width: '120px',
      sortable: false,
      template: r => (
        <>
          <Button icon="edit" size="Small" buttonStyle="Light" onClick={() => startEdit(r)} disabled={editing !== null} />{' '}
          <Button icon="delete" size="Small" buttonStyle="Danger" onClick={() => remove(r)} disabled={editing !== null} />
        </>
      ),
    },
  ]

  return (
    <>
      <h3>Max per shift</h3>
      <p className="rz-text-secondary" style={{ maxWidth: 900 }}>
        {/* Zelfde tekstknopen als Blazor (met de regeleinden), anders valt de laatste regel een fractie anders */}
        {'\n    Hoeveel personen van een ploeg en specialiteit tegelijk verlof mogen hebben op één shift.\n    Waar niets is ingesteld geldt de standaard: '}
        <strong>een kwart van de personen</strong>
        {' (minstens 1).\n    De teamkalender kleurt een shift rood als het maximum overschreden wordt, en toont dan de knop voor een loting.\n'}
      </p>

      {/* Filters */}
      <Stack orientation="Horizontal" wrap="Wrap" gap="0.5rem" alignItems="End" style="margin-bottom:1rem">
        <div>
          <label>Ploeg</label>{' '}
          <DropDown data={teams} value={teamFilter} onChange={setTeamFilter} allowClear={isAdmin || hasChoice} placeholder="Alle" style="width:160px" />
        </div>
        <div>
          <label>Specialiteit</label>{' '}
          <DropDown data={specialities} value={specialityFilter} onChange={setSpecialityFilter} allowClear={isAdmin || hasChoice} placeholder="Alle" style="width:200px" />
        </div>
      </Stack>

      <Button icon="add" text="Regel toevoegen" onClick={startCreate} disabled={editing !== null} style="margin-bottom:1rem" />

      {editing && (
        <Card style="margin-bottom:1rem; max-width:900px;">
          <h5>{editing.id === 0 ? 'Nieuwe regel' : 'Regel wijzigen'}</h5>
          <Stack orientation="Horizontal" wrap="Wrap" gap="1rem">
            {editing.id === 0 ? (
              <>
                <div>
                  <label>Ploeg(en)</label>{' '}
                  <MultiDropDown data={teams} value={createTeams} onChange={setCreateTeams} chips style="width:260px" />
                </div>
                <div>
                  <label>Specialiteit(en)</label>{' '}
                  <MultiDropDown data={specialities} value={createSpecialities} onChange={setCreateSpecialities} chips style="width:320px" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label>Ploeg</label>{' '}
                  <DropDown data={teams} value={editing.team} onChange={v => edit({ team: v ?? '' })} style="width:160px" />
                </div>
                <div>
                  <label>Specialiteit</label>{' '}
                  <DropDown data={specialities} value={editing.speciality} onChange={v => edit({ speciality: v ?? '' })} style="width:200px" />
                </div>
              </>
            )}
            <div>
              <label>Jaar (leeg = alle jaren)</label>{' '}
              <DropDown data={years} value={editing.year ?? null} onChange={v => edit({ year: v })} allowClear placeholder="Alle jaren" style="width:160px" />
            </div>
          </Stack>
          <Stack orientation="Horizontal" wrap="Wrap" gap="1rem" alignItems="End" style="margin-top:1rem">
            <div>
              <label className="sq-same">
                <input ref={sameInput} type="checkbox" checked={sameForBoth} onChange={e => toggleSame(e.currentTarget.checked)} /> Zelfde voor dag en nacht
              </label>
            </div>
            {sameForBoth ? (
              <div>
                <label>Max per shift (dag en nacht)</label>{' '}
                <Numeric value={editing.dayMax} onChange={v => edit({ dayMax: v ?? 0, nightMax: v ?? 0 })} min={0} max={100} style="width:140px" />
              </div>
            ) : (
              <>
                <div>
                  <label>Max dagshift</label>{' '}
                  <Numeric value={editing.dayMax} onChange={v => edit({ dayMax: v ?? 0 })} min={0} max={100} style="width:120px" />
                </div>
                <div>
                  <label>Max nachtshift</label>{' '}
                  <Numeric value={editing.nightMax} onChange={v => edit({ nightMax: v ?? 0 })} min={0} max={100} style="width:120px" />
                </div>
              </>
            )}
          </Stack>
          <Stack orientation="Horizontal" gap="0.5rem" style="margin-top:1rem">
            <Button icon="save" text="Opslaan" onClick={save} />{' '}
            <Button icon="close" text="Annuleren" buttonStyle="Light" onClick={() => setEditing(null)} />
          </Stack>
        </Card>
      )}

      <DataGrid data={filteredRules} columns={columns} allowSorting emptyText="Nog geen regels: overal geldt een kwart van de personen." />
    </>
  )
}
