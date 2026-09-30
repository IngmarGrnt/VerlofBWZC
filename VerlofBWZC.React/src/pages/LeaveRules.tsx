import { useEffect, useMemo, useState } from 'react'
import { Button } from '../radzen/Button'
import { Stack } from '../radzen/Layout'
import { DropDown } from '../radzen/DropDown'
import { MultiDropDown } from '../radzen/MultiDropDown'
import { Numeric, Card } from '../radzen/Misc'
import { TextBox, CheckBox, Label } from '../radzen/Inputs'
import { DataGrid, type DataGridColumn } from '../radzen/DataGrid'
import { dialogService } from '../radzen/Dialog'
import { notificationService, type NotificationSeverity } from '../radzen/Notification'
import { parseStyle } from '../radzen/core'
import { deleteRequest, getJson, postJson, putJson } from '../api/http'
import { scopeService } from '../services/scope'
import { getCurrentPerson, isAdminPerson } from '../services/browser'
import { usePageTitle } from '../app/navigation'

// Zelfde als VerlofBWZC/Pages/LeaveRules.razor (@page "/verlofregels", Admin/Manager)

// VerlofBWZC.DataContracts.DTO.Leave.LeaveCategoryDTO
export interface LeaveCategoryDTO {
  id: number
  team: string
  speciality: string
  year?: number | null
  name: string
  maxShifts: number
  color: string
  sortOrder: number
  // Shiften moeten aansluitend zijn (één ononderbroken reeks in het werkrooster)
  mustBeConsecutive: boolean
}

const newLeaveCategory = (): LeaveCategoryDTO => ({
  id: 0,
  team: '',
  speciality: '',
  year: null,
  name: '',
  maxShifts: 0,
  color: '#E8590C',
  sortOrder: 0,
  mustBeConsecutive: false,
})

// Goed te onderscheiden van de huisstijl (rood #F13F3F, blauw #2F80ED) en verlof (blauwgroen), leesbaar met witte tekst
const palette = ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#1E88E5', '#8E24AA', '#6D4C41', '#546E7A']

const notify = (severity: NotificationSeverity, detail: string) => notificationService.notify(severity, 'Verlofcategorieën', detail, 4000)

export function LeaveRules() {
  usePageTitle('Verlofcategorieën')

  const [rules, setRules] = useState<LeaveCategoryDTO[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [specialities, setSpecialities] = useState<string[]>([])
  const years = useMemo(() => Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - 1 + i), [])

  const [teamFilter, setTeamFilter] = useState<string | null>(null)
  const [specialityFilter, setSpecialityFilter] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [hasChoice, setHasChoice] = useState(() => scopeService.hasChoice)

  const [editing, setEditing] = useState<LeaveCategoryDTO | null>(null)
  const [createTeams, setCreateTeams] = useState<string[]>([])
  const [createSpecialities, setCreateSpecialities] = useState<string[]>([])

  const filteredRules = rules.filter(r => teamFilter === null || r.team === teamFilter).filter(r => specialityFilter === null || r.speciality === specialityFilter)

  const loadRules = async () => setRules((await getJson<LeaveCategoryDTO[] | null>('api/leave-categories/rules')) ?? [])

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
      await loadRules()
    })()
  }, [])

  const startCreate = () => {
    setEditing({ ...newLeaveCategory(), maxShifts: 8, color: palette[0], sortOrder: 1 })
    setCreateTeams(teamFilter !== null ? [teamFilter] : [])
    setCreateSpecialities(specialityFilter !== null ? [specialityFilter] : [])
  }

  const startEdit = (r: LeaveCategoryDTO) =>
    setEditing({
      ...newLeaveCategory(),
      id: r.id,
      team: r.team,
      speciality: r.speciality,
      year: r.year,
      name: r.name,
      maxShifts: r.maxShifts,
      color: r.color,
      sortOrder: r.sortOrder,
      mustBeConsecutive: r.mustBeConsecutive,
    })

  const edit = (patch: Partial<LeaveCategoryDTO>) => setEditing(e => (e ? { ...e, ...patch } : e))

  const save = async () => {
    if (!editing) return

    if (editing.id === 0) {
      if (createTeams.length === 0 || createSpecialities.length === 0) {
        notify('Warning', 'Kies minstens één ploeg en één specialiteit.')
        return
      }

      // Eén categorie per gekozen combinatie ploeg x specialiteit
      let created = 0
      for (const team of createTeams)
        for (const spec of createSpecialities) {
          const dto: LeaveCategoryDTO = {
            ...newLeaveCategory(),
            team,
            speciality: spec,
            year: editing.year,
            name: editing.name,
            maxShifts: editing.maxShifts,
            color: editing.color,
            sortOrder: editing.sortOrder,
            mustBeConsecutive: editing.mustBeConsecutive,
          }
          const resp = await postJson('api/leave-categories/rules', dto)
          if (!resp.ok) {
            notify('Error', await resp.text())
            await loadRules()
            return
          }
          created++
        }
      notify('Success', `${created} categorie(ën) toegevoegd.`)
    } else {
      const resp = await putJson(`api/leave-categories/rules/${editing.id}`, editing)
      if (!resp.ok) {
        notify('Error', await resp.text())
        return
      }
      notify('Success', 'Categorie bijgewerkt.')
    }

    setEditing(null)
    await loadRules()
  }

  const remove = async (r: LeaveCategoryDTO) => {
    const ok = await dialogService.confirm(`'${r.name}' voor ${r.team}/${r.speciality} verwijderen? Aangeduide shiften worden weer gewoon verlof.`, 'Verwijderen', {
      okButtonText: 'Verwijderen',
      cancelButtonText: 'Annuleren',
    })
    if (ok !== true) return

    const resp = await deleteRequest(`api/leave-categories/rules/${r.id}`)
    if (resp.ok) {
      notify('Success', 'Categorie verwijderd.')
      await loadRules()
    } else {
      notify('Error', 'Verwijderen mislukt.')
    }
  }

  const columns: DataGridColumn<LeaveCategoryDTO>[] = [
    { property: r => r.team, title: 'Ploeg', width: '110px' },
    { property: r => r.speciality, title: 'Specialiteit', width: '150px' },
    { property: r => r.year, title: 'Jaar', width: '100px', template: r => (r.year != null ? String(r.year) : 'Alle jaren') },
    {
      property: r => r.name,
      title: 'Categorie',
      template: r => (
        <span style={parseStyle('display:inline-flex; align-items:center; gap:.4rem;')}>
          <span style={parseStyle(`display:inline-block; width:14px; height:14px; border-radius:50%; background:${r.color};`)} /> {r.name}
        </span>
      ),
    },
    { property: r => r.maxShifts, title: 'Max. shiften', width: '120px' },
    { property: r => r.mustBeConsecutive, title: 'Aansluitend', width: '120px', template: r => (r.mustBeConsecutive ? 'Ja' : 'Nee') },
    { property: r => r.sortOrder, title: 'Volgorde', width: '100px' },
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
      <h3>Verlofcategorieën</h3>
      <p className="rz-text-secondary" style={{ maxWidth: 900 }}>
        Per ploeg en specialiteit stel je verlofcategorieën in, bv. <em>Groot verlof</em> (max 8 shiften), <em>Verlof 4</em> (max 4) en <em>Verlof 2</em> (max 2).
        Medewerkers duiden die aan in hun werkkalender; in de teamkalender verschijnen ze in hun kleur. Een categorie zonder jaar geldt voor alle jaren;
        categorieën met een jaar vervangen voor dat jaar de standaard.
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
        <Button icon="add" text="Categorie toevoegen" onClick={startCreate} disabled={editing !== null} />
      </Stack>

      {editing && (
        <Card style="margin-bottom:1rem; max-width:900px;">
          <h5>{editing.id === 0 ? 'Nieuwe categorie' : 'Categorie wijzigen'}</h5>
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

          <Stack orientation="Horizontal" wrap="Wrap" gap="1rem" style="margin-top:1rem">
            <div>
              <label>Naam</label>{' '}
              <TextBox value={editing.name} onChange={v => edit({ name: v })} maxLength={50} placeholder="bv. Groot verlof" style="width:220px" />
            </div>
            <div>
              <label>Max. shiften</label>{' '}
              <Numeric value={editing.maxShifts} onChange={v => edit({ maxShifts: v ?? 0 })} min={0} max={366} style="width:120px" />
            </div>
            <div>
              <label>Volgorde</label>{' '}
              <Numeric value={editing.sortOrder} onChange={v => edit({ sortOrder: v ?? 0 })} min={0} max={99} style="width:100px" />
            </div>
            <div>
              <label>Aansluitend</label>{' '}
              <div style={parseStyle('display:flex; align-items:center; gap:.4rem; height:2.25rem;')}>
                <CheckBox value={editing.mustBeConsecutive} onChange={v => edit({ mustBeConsecutive: v })} name="consecutive" />{' '}
                <Label text="Shiften moeten een ononderbroken reeks zijn" component="consecutive" />
              </div>
            </div>
            <div>
              <label>Kleur</label>{' '}
              <div style={parseStyle('display:flex; align-items:center; gap:.35rem;')}>
                {palette.map(color => (
                  <button
                    key={color}
                    type="button"
                    title={color}
                    onClick={() => edit({ color })}
                    style={parseStyle(
                      `width:24px; height:24px; border-radius:50%; background:${color}; cursor:pointer; border:${editing.color?.toLowerCase() === color.toLowerCase() ? '3px solid #000' : '1px solid #ccc'};`,
                    )}
                  ></button>
                ))}
                <TextBox value={editing.color} onChange={v => edit({ color: v })} maxLength={7} style="width:100px" />
              </div>
            </div>
          </Stack>

          <Stack orientation="Horizontal" gap="0.5rem" style="margin-top:1rem">
            <Button icon="save" text="Opslaan" onClick={save} />{' '}
            <Button icon="close" text="Annuleren" buttonStyle="Light" onClick={() => setEditing(null)} />
          </Stack>
        </Card>
      )}

      <DataGrid data={filteredRules} columns={columns} allowSorting allowPaging pageSize={25} emptyText="Nog geen verlofcategorieën." />
    </>
  )
}
