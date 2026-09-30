import { useEffect, useMemo, useState } from 'react'
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

// Zelfde als VerlofBWZC/Pages/QuarterLimits.razor (@page "/kwartaalmaxima", Admin/Manager)

// VerlofBWZC.DataContracts.DTO.Leave.QuarterLimitDTO (standaard 14 / 16 / 14)
export interface QuarterLimitDTO {
  id: number
  team: string
  speciality: string
  year?: number | null
  q1Max: number
  q2Max: number
  q3Max: number
  isDefault?: boolean
}

const newQuarterLimit = (): QuarterLimitDTO => ({ id: 0, team: '', speciality: '', year: null, q1Max: 14, q2Max: 16, q3Max: 14, isDefault: false })

const notify = (severity: NotificationSeverity, detail: string) => notificationService.notify(severity, 'Kwartaalmaxima', detail, 4000)

export function QuarterLimits() {
  const [teams, setTeams] = useState<string[]>([])
  const [specialities, setSpecialities] = useState<string[]>([])
  const years = useMemo(() => Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - 1 + i), [])
  const [teamFilter, setTeamFilter] = useState<string | null>(null)
  const [specialityFilter, setSpecialityFilter] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [hasChoice, setHasChoice] = useState(false)

  const [quarterRules, setQuarterRules] = useState<QuarterLimitDTO[]>([])
  const [editingQuarter, setEditingQuarter] = useState<QuarterLimitDTO | null>(null)
  const [quarterTeams, setQuarterTeams] = useState<string[]>([])
  const [quarterSpecialities, setQuarterSpecialities] = useState<string[]>([])

  const filteredQuarterRules = quarterRules.filter(r => teamFilter === null || r.team === teamFilter).filter(r => specialityFilter === null || r.speciality === specialityFilter)

  const loadQuarterRules = async () => setQuarterRules((await getJson<QuarterLimitDTO[] | null>('api/quarter-limits/rules')) ?? [])

  useEffect(() => {
    void (async () => {
      let t = (await getJson<string[] | null>('api/meta/teams')) ?? []
      let s = (await getJson<string[] | null>('api/meta/specialities')) ?? []

      // Manager: enkel zijn eigen ploeg en specialiteit (de API controleert dit ook)
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
      await loadQuarterRules()
    })()
  }, [])

  const startCreateQuarter = () => {
    setEditingQuarter(newQuarterLimit()) // standaard 14 / 16 / 14
    setQuarterTeams(teamFilter !== null ? [teamFilter] : [])
    setQuarterSpecialities(specialityFilter !== null ? [specialityFilter] : [])
  }

  const startEditQuarter = (r: QuarterLimitDTO) =>
    setEditingQuarter({ ...newQuarterLimit(), id: r.id, team: r.team, speciality: r.speciality, year: r.year, q1Max: r.q1Max, q2Max: r.q2Max, q3Max: r.q3Max })

  const edit = (patch: Partial<QuarterLimitDTO>) => setEditingQuarter(e => (e ? { ...e, ...patch } : e))

  const saveQuarter = async () => {
    if (!editingQuarter) return

    if (editingQuarter.id === 0) {
      if (quarterTeams.length === 0 || quarterSpecialities.length === 0) {
        notify('Warning', 'Kies minstens één ploeg en één specialiteit.')
        return
      }

      let created = 0
      for (const team of quarterTeams)
        for (const spec of quarterSpecialities) {
          const dto: QuarterLimitDTO = {
            ...newQuarterLimit(),
            team,
            speciality: spec,
            year: editingQuarter.year,
            q1Max: editingQuarter.q1Max,
            q2Max: editingQuarter.q2Max,
            q3Max: editingQuarter.q3Max,
          }
          const resp = await postJson('api/quarter-limits/rules', dto)
          if (!resp.ok) {
            notify('Error', await resp.text())
            await loadQuarterRules()
            return
          }
          created++
        }
      notify('Success', `${created} kwartaalregel(s) toegevoegd.`)
    } else {
      const resp = await putJson(`api/quarter-limits/rules/${editingQuarter.id}`, editingQuarter)
      if (!resp.ok) {
        notify('Error', await resp.text())
        return
      }
      notify('Success', 'Kwartaalregel bijgewerkt.')
    }

    setEditingQuarter(null)
    await loadQuarterRules()
  }

  const deleteQuarter = async (r: QuarterLimitDTO) => {
    const ok = await dialogService.confirm(`Kwartaalregel voor ${r.team}/${r.speciality} verwijderen? Daarna gelden weer 14 / 16 / 14.`, 'Verwijderen', {
      okButtonText: 'Verwijderen',
      cancelButtonText: 'Annuleren',
    })
    if (ok !== true) return

    const resp = await deleteRequest(`api/quarter-limits/rules/${r.id}`)
    if (resp.ok) {
      notify('Success', 'Kwartaalregel verwijderd.')
      await loadQuarterRules()
    } else {
      notify('Error', 'Verwijderen mislukt.')
    }
  }

  const columns: DataGridColumn<QuarterLimitDTO>[] = [
    { property: r => r.team, title: 'Ploeg', width: '110px' },
    { property: r => r.speciality, title: 'Specialiteit', width: '150px' },
    { property: r => r.year, title: 'Jaar', width: '100px', template: r => (r.year != null ? String(r.year) : 'Alle jaren') },
    { property: r => r.q1Max, title: 'KW1 (jan–apr)', width: '130px' },
    { property: r => r.q2Max, title: 'KW2 (mei–aug)', width: '130px' },
    { property: r => r.q3Max, title: 'KW3 (sep–dec)', width: '130px' },
    {
      title: '',
      width: '120px',
      sortable: false,
      template: r => (
        <>
          <Button icon="edit" size="Small" buttonStyle="Light" onClick={() => startEditQuarter(r)} disabled={editingQuarter !== null} />{' '}
          <Button icon="delete" size="Small" buttonStyle="Danger" onClick={() => deleteQuarter(r)} disabled={editingQuarter !== null} />
        </>
      ),
    },
  ]

  return (
    <>
      <h3>Kwartaalmaxima</h3>
      <p className="rz-text-secondary" style={{ maxWidth: 900 }}>
        Maximum aantal verlofshiften per kwartaal: KW1 januari–april, KW2 mei–augustus, KW3 september–december. Waar niets is ingesteld gelden{' '}
        <strong>14 / 16 / 14</strong>. Medewerkers zien de tellers in hun werkkalender en krijgen een melding als ze erover gaan.
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

      <Button icon="add" text="Kwartaalregel toevoegen" onClick={startCreateQuarter} disabled={editingQuarter !== null} style="margin-bottom:1rem" />

      {editingQuarter && (
        <Card style="margin-bottom:1rem; max-width:900px;">
          <h5>{editingQuarter.id === 0 ? 'Nieuwe kwartaalregel' : 'Kwartaalregel wijzigen'}</h5>
          <Stack orientation="Horizontal" wrap="Wrap" gap="1rem">
            {editingQuarter.id === 0 ? (
              <>
                <div>
                  <label>Ploeg(en)</label>{' '}
                  <MultiDropDown data={teams} value={quarterTeams} onChange={setQuarterTeams} chips style="width:260px" />
                </div>
                <div>
                  <label>Specialiteit(en)</label>{' '}
                  <MultiDropDown data={specialities} value={quarterSpecialities} onChange={setQuarterSpecialities} chips style="width:320px" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label>Ploeg</label>{' '}
                  <DropDown data={teams} value={editingQuarter.team} onChange={v => edit({ team: v ?? '' })} style="width:160px" />
                </div>
                <div>
                  <label>Specialiteit</label>{' '}
                  <DropDown data={specialities} value={editingQuarter.speciality} onChange={v => edit({ speciality: v ?? '' })} style="width:200px" />
                </div>
              </>
            )}
            <div>
              <label>Jaar (leeg = alle jaren)</label>{' '}
              <DropDown data={years} value={editingQuarter.year ?? null} onChange={v => edit({ year: v })} allowClear placeholder="Alle jaren" style="width:160px" />
            </div>
          </Stack>
          <Stack orientation="Horizontal" wrap="Wrap" gap="1rem" style="margin-top:1rem">
            <div>
              <label>KW1 (jan–apr)</label>{' '}
              <Numeric value={editingQuarter.q1Max} onChange={v => edit({ q1Max: v ?? 0 })} min={0} max={250} style="width:120px" />
            </div>
            <div>
              <label>KW2 (mei–aug)</label>{' '}
              <Numeric value={editingQuarter.q2Max} onChange={v => edit({ q2Max: v ?? 0 })} min={0} max={250} style="width:120px" />
            </div>
            <div>
              <label>KW3 (sep–dec)</label>{' '}
              <Numeric value={editingQuarter.q3Max} onChange={v => edit({ q3Max: v ?? 0 })} min={0} max={250} style="width:120px" />
            </div>
          </Stack>
          <Stack orientation="Horizontal" gap="0.5rem" style="margin-top:1rem">
            <Button icon="save" text="Opslaan" onClick={saveQuarter} />
            <Button icon="close" text="Annuleren" buttonStyle="Light" onClick={() => setEditingQuarter(null)} />
          </Stack>
        </Card>
      )}

      <DataGrid data={filteredQuarterRules} columns={columns} allowSorting emptyText="Nog geen kwartaalregels: overal gelden 14 / 16 / 14." />
    </>
  )
}
