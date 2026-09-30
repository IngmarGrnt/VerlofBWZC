import { useEffect, useMemo, useState } from 'react'
import { Button } from '../radzen/Button'
import { Stack, Alert } from '../radzen/Layout'
import { DropDown } from '../radzen/DropDown'
import { Badge, Card, Fieldset } from '../radzen/Misc'
import { notificationService } from '../radzen/Notification'
import { deleteRequest, getJson, postJson, putJson } from '../api/http'
import { scopeService } from '../services/scope'
import { getCurrentPerson, isAdminPerson } from '../services/browser'
import { allowsAllTeamsView } from '../rules'

// Zelfde als VerlofBWZC/Pages/ManagerPanel.razor (@page "/ManagerPanel", Admin/Manager)

// VerlofBWZC.DataContracts.DTO.Access.CalendarAccessRuleDTO
export interface CalendarAccessRuleDTO {
  id: number
  team: string
  speciality: string
  year?: number | null
  canSeeTeamCalendar: boolean
  canSaveWorkCalendar: boolean
  canSaveTeamCalendar: boolean
  // Enkel Dispatching: personen van deze ploeg mogen de teamkalender van alle ploegen bekijken (standaard aan)
  canSeeAllTeams: boolean
}


type Option<T> = { text: string; value: T }
const allYesNo: Option<boolean | null>[] = [
  { text: 'Alle', value: null },
  { text: 'Ja', value: true },
  { text: 'Nee', value: false },
]
const yesNo: Option<boolean>[] = [
  { text: 'Ja', value: true },
  { text: 'Nee', value: false },
]
const optionText = <T,>(o: Option<T>) => o.text
const optionValue = <T,>(o: Option<T>) => o.value
const allYesNoValue = (o: Option<boolean | null>) => o.value

// Zoals de MarkupString-badges in de Blazor-pagina
const yesNoBadge = (value: boolean) => (value ? <span className="rz-badge rz-badge-success">Ja</span> : <span className="rz-badge rz-badge-secondary">Nee</span>)

// Zoals Comparer<string>.Default (cultuurgevoelig)
const compareText = (a: string, b: string) => a.localeCompare(b)

export function ManagerPanel() {
  // Data
  const [rules, setRules] = useState<CalendarAccessRuleDTO[]>([])

  // Meta data
  const [teams, setTeams] = useState<string[]>([])
  const [specialities, setSpecialities] = useState<string[]>([])
  const [years, setYears] = useState<number[]>([])

  // Filters
  const [teamFilter, setTeamFilter] = useState<string | null>(null)
  const [specialityFilter, setSpecialityFilter] = useState<string | null>(null)
  const [yearFilter, setYearFilter] = useState<number | null>(null)
  const [canSeeFilter, setCanSeeFilter] = useState<boolean | null>(null)
  const [canSaveWorkFilter, setCanSaveWorkFilter] = useState<boolean | null>(null)
  const [canSaveTeamFilter, setCanSaveTeamFilter] = useState<boolean | null>(null)

  // Editing state (single edit session at a time)
  const [editingModel, setEditingModel] = useState<CalendarAccessRuleDTO | null>(null)
  const [editingTarget, setEditingTarget] = useState<CalendarAccessRuleDTO | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isEditing = editingModel !== null

  const loadAsync = async () => setRules((await getJson<CalendarAccessRuleDTO[] | null>('api/access/calendar-rules')) ?? [])

  useEffect(() => {
    void (async () => {
      // LoadMetaAsync
      let t = (await getJson<string[] | null>('api/meta/teams')) ?? []
      let s = (await getJson<string[] | null>('api/meta/specialities')) ?? []

      // Manager: enkel zijn eigen ploeg en specialiteit (de API controleert dit ook)
      const me = await getCurrentPerson()
      if (!isAdminPerson(me) && me) {
        // Manager: de ploegen en specialiteiten die hij beheert (de API controleert dit ook)
        await scopeService.load(true)
        t = scopeService.teams
        s = [...new Set(t.flatMap(x => scopeService.specialitiesFor(x)))].sort(
          (a, b) => scopeService.allSpecialityNames.indexOf(a) - scopeService.allSpecialityNames.indexOf(b),
        )
        if (!scopeService.hasChoice) {
          setTeamFilter(me.team)
          setSpecialityFilter(me.speciality)
        }
      }
      setTeams(t)
      setSpecialities(s)

      // InitYears
      const start = new Date().getFullYear() + 1
      setYears(Array.from({ length: 10 }, (_, i) => start + i))

      await loadAsync()
    })()
  }, [])

  const filteredRules = useMemo(
    () =>
      rules
        .filter(r => !teamFilter || r.team === teamFilter)
        .filter(r => !specialityFilter || r.speciality === specialityFilter)
        .filter(r => yearFilter === null || r.year === yearFilter)
        .filter(r => canSeeFilter === null || r.canSeeTeamCalendar === canSeeFilter)
        .filter(r => canSaveWorkFilter === null || r.canSaveWorkCalendar === canSaveWorkFilter)
        .filter(r => canSaveTeamFilter === null || r.canSaveTeamCalendar === canSaveTeamFilter)
        .map((r, i) => ({ r, i }))
        .sort(
          (a, b) =>
            compareText(a.r.team, b.r.team) ||
            compareText(a.r.speciality, b.r.speciality) ||
            (a.r.year ?? Number.MAX_SAFE_INTEGER) - (b.r.year ?? Number.MAX_SAFE_INTEGER) ||
            a.i - b.i,
        )
        .map(x => x.r),
    [rules, teamFilter, specialityFilter, yearFilter, canSeeFilter, canSaveWorkFilter, canSaveTeamFilter],
  )

  const resetFilters = () => {
    setTeamFilter(null)
    setSpecialityFilter(null)
    setYearFilter(null)
    setCanSeeFilter(null)
    setCanSaveWorkFilter(null)
    setCanSaveTeamFilter(null)
  }

  // Create
  const startCreate = () => {
    if (isEditing) return

    setEditingTarget(null)
    setEditingModel({
      id: 0,
      team: teamFilter ?? teams[0] ?? '',
      speciality: specialityFilter ?? specialities[0] ?? '',
      year: yearFilter,
      canSeeTeamCalendar: false,
      canSaveWorkCalendar: false,
      canSaveTeamCalendar: false,
      canSeeAllTeams: true,
    })
  }

  // Edit
  const startEdit = (item: CalendarAccessRuleDTO) => {
    if (isEditing) return

    setEditingTarget(item)
    setEditingModel({
      id: item.id,
      team: item.team,
      speciality: item.speciality,
      year: item.year,
      canSeeTeamCalendar: item.canSeeTeamCalendar,
      canSaveWorkCalendar: item.canSaveWorkCalendar,
      canSaveTeamCalendar: item.canSaveTeamCalendar,
      canSeeAllTeams: item.canSeeAllTeams,
    })
  }

  const cancelEdit = () => {
    setEditingModel(null)
    setEditingTarget(null)
  }

  const edit = (patch: Partial<CalendarAccessRuleDTO>) => setEditingModel(m => (m ? { ...m, ...patch } : m))

  const saveAsync = async () => {
    if (editingModel === null) return

    setIsSaving(true)
    try {
      if (editingTarget === null) {
        // Create
        const resp = await postJson('api/access/calendar-rules', editingModel)
        if (resp.ok) {
          // Option 1: Reload all (simplest, consistent)
          await loadAsync()
          notificationService.notify('Success', 'Aangemaakt', 'Regel aangemaakt')
          cancelEdit()
        } else {
          notificationService.notify('Error', 'Fout', 'Aanmaken mislukt')
        }
      } else {
        // Update
        const resp = await putJson(`api/access/calendar-rules/${editingModel.id}`, editingModel)
        if (resp.ok) {
          // Apply changes locally
          const target = editingTarget
          const model = editingModel
          setRules(list =>
            list.map(r =>
              r === target
                ? {
                    ...r,
                    team: model.team,
                    speciality: model.speciality,
                    year: model.year,
                    canSeeTeamCalendar: model.canSeeTeamCalendar,
                    canSaveWorkCalendar: model.canSaveWorkCalendar,
                    canSaveTeamCalendar: model.canSaveTeamCalendar,
                    canSeeAllTeams: model.canSeeAllTeams,
                  }
                : r,
            ),
          )

          notificationService.notify('Success', 'Bijgewerkt', 'Regel bijgewerkt')
          cancelEdit()
        } else {
          notificationService.notify('Error', 'Fout', 'Bijwerken mislukt')
        }
      }
    } finally {
      setIsSaving(false)
    }
  }

  const deleteAsync = async (item: CalendarAccessRuleDTO) => {
    const resp = await deleteRequest(`api/access/calendar-rules/${item.id}`)
    if (resp.ok) {
      setRules(list => list.filter(r => r !== item))
      notificationService.notify('Success', 'Verwijderd', 'Regel verwijderd')
    } else {
      notificationService.notify('Error', 'Fout', 'Verwijderen mislukt')
    }
  }

  // Formulier van de regel die aangemaakt of bewerkt wordt (in beide gevallen dezelfde velden)
  const editForm = (model: CalendarAccessRuleDTO) => (
    <div className="rz-form">
      <div className="rz-form-field">
        <label>Team</label>{' '}
        <DropDown data={teams} value={model.team} onChange={v => edit({ team: v ?? '' })} allowFiltering caseInsensitive style="width:300px" />
      </div>{' '}
      <div className="rz-form-field">
        <label>Specialiteit</label>{' '}
        <DropDown data={specialities} value={model.speciality} onChange={v => edit({ speciality: v ?? '' })} allowFiltering caseInsensitive style="width:300px" />
      </div>{' '}
      <div className="rz-form-field">
        <label>Jaar (optioneel)</label>{' '}
        <DropDown data={years} value={model.year ?? null} onChange={v => edit({ year: v })} allowClear placeholder="Geen" style="width:200px" />
      </div>{' '}
      <div className="rz-form-field">
        <label>Kan teamkalender zien</label>{' '}
        <DropDown
          data={yesNo}
          textProperty={optionText}
          valueProperty={optionValue}
          value={model.canSeeTeamCalendar}
          onChange={v => edit({ canSeeTeamCalendar: v ?? false })}
          style="width:200px"
        />
      </div>{' '}
      <div className="rz-form-field">
        <label>Kan werkkalender opslaan</label>{' '}
        <DropDown
          data={yesNo}
          textProperty={optionText}
          valueProperty={optionValue}
          value={model.canSaveWorkCalendar}
          onChange={v => edit({ canSaveWorkCalendar: v ?? false })}
          style="width:200px"
        />
      </div>{' '}
      <div className="rz-form-field">
        <label>Kan teamkalender opslaan</label>{' '}
        <DropDown
          data={yesNo}
          textProperty={optionText}
          valueProperty={optionValue}
          value={model.canSaveTeamCalendar}
          onChange={v => edit({ canSaveTeamCalendar: v ?? false })}
          style="width:200px"
        />
      </div>
      {allowsAllTeamsView(model.speciality) && (
        <div className="rz-form-field">
          <label title="Personen van deze ploeg mogen de teamkalender van alle ploegen bekijken (enkel lezen)">Alle ploegen bekijken</label>{' '}
          <DropDown
            data={yesNo}
            textProperty={optionText}
            valueProperty={optionValue}
            value={model.canSeeAllTeams}
            onChange={v => edit({ canSeeAllTeams: v ?? false })}
            style="width:200px"
          />
        </div>
      )}
    </div>
  )

  const editButtons = (
    <Stack orientation="Horizontal" gap="0.5rem">
      <Button buttonStyle="Success" icon="save" text="Opslaan" onClick={saveAsync} disabled={isSaving} />{' '}
      <Button buttonStyle="Secondary" icon="cancel" text="Annuleren" onClick={cancelEdit} disabled={isSaving} />
    </Stack>
  )

  return (
    <div className="manager-panel">
      <h3>Managerpaneel - Kalendertoegang</h3>{' '}
      {/* Filters */}
      <Fieldset text="Filters" attributes={{ toggleable: 'true' }}>
        <Stack orientation="Horizontal" wrap="Wrap" gap="0.5rem">
          <div style={{ minWidth: 220, flex: 1 }}>
            <label>Team</label>{' '}
            <DropDown data={teams} value={teamFilter} onChange={setTeamFilter} allowFiltering allowClear caseInsensitive style="width:100%" />
          </div>{' '}
          <div style={{ minWidth: 220, flex: 1 }}>
            <label>Specialiteit</label>{' '}
            <DropDown data={specialities} value={specialityFilter} onChange={setSpecialityFilter} allowFiltering allowClear caseInsensitive style="width:100%" />
          </div>{' '}
          <div style={{ minWidth: 180, flex: 1 }}>
            <label>Jaar (optioneel)</label>{' '}
            <DropDown data={years} value={yearFilter} onChange={setYearFilter} allowClear placeholder="Alle" style="width:100%" />
          </div>{' '}
          <div style={{ minWidth: 160, flex: 1 }}>
            <label>Kan teamkalender zien</label>{' '}
            <DropDown data={allYesNo} textProperty={optionText} valueProperty={allYesNoValue} value={canSeeFilter} onChange={v => setCanSeeFilter(v)} style="width:100%" />
          </div>{' '}
          <div style={{ minWidth: 160, flex: 1 }}>
            <label>Kan werkkalender opslaan</label>{' '}
            <DropDown data={allYesNo} textProperty={optionText} valueProperty={allYesNoValue} value={canSaveWorkFilter} onChange={v => setCanSaveWorkFilter(v)} style="width:100%" />
          </div>{' '}
          <div style={{ minWidth: 180, flex: 1 }}>
            <label>Kan teamkalender opslaan</label>{' '}
            <DropDown data={allYesNo} textProperty={optionText} valueProperty={allYesNoValue} value={canSaveTeamFilter} onChange={v => setCanSaveTeamFilter(v)} style="width:100%" />
          </div>
        </Stack>{' '}
        <Stack orientation="Horizontal" gap="0.5rem" style="margin-top:0.75rem">
          <Button icon="refresh" text="Filters resetten" onClick={resetFilters} buttonStyle="Light" />{' '}
          <Button icon="add" text="Regel toevoegen" onClick={startCreate} disabled={isEditing} />{' '}
          <Badge style="margin-left:auto">
            {filteredRules.length} van {rules.length}
          </Badge>
        </Stack>
      </Fieldset>

      {/* Create or Edit Card */}
      {editingModel !== null && editingTarget === null && (
        <Card style="margin-top:1rem">
          {editForm(editingModel)} {editButtons}
        </Card>
      )}

      {/* Rules List */}
      {filteredRules.length === 0 && (editingModel === null || editingTarget !== null) && (
        <Alert attributes={{ severity: 'AlertSeverity.Info' }} style="margin-top:1rem">
          Geen regels voldoen aan de huidige filters.
        </Alert>
      )}

      {filteredRules.map(rule => {
        const isEditingThis = editingModel !== null && editingTarget === rule

        return (
          <Card style="margin-top:1rem" key={rule.id}>
            {!isEditingThis ? (
              <>
                <div className="rz-form">
                  <div className="rz-form-field">
                    <label>Team</label> <div>{rule.team}</div>
                  </div>{' '}
                  <div className="rz-form-field">
                    <label>Specialiteit</label> <div>{rule.speciality}</div>
                  </div>{' '}
                  <div className="rz-form-field">
                    <label>Jaar (optioneel)</label> <div>{rule.year?.toString() ?? '-'}</div>
                  </div>{' '}
                  <div className="rz-form-field">
                    <label>Kan teamkalender zien</label> <div>{yesNoBadge(rule.canSeeTeamCalendar)}</div>
                  </div>{' '}
                  <div className="rz-form-field">
                    <label>Kan werkkalender opslaan</label> <div>{yesNoBadge(rule.canSaveWorkCalendar)}</div>
                  </div>{' '}
                  <div className="rz-form-field">
                    <label>Kan teamkalender opslaan</label> <div>{yesNoBadge(rule.canSaveTeamCalendar)}</div>
                  </div>
                  {allowsAllTeamsView(rule.speciality) && (
                    <div className="rz-form-field">
                      <label title="Personen van deze ploeg mogen de teamkalender van alle ploegen bekijken (enkel lezen)">Alle ploegen bekijken</label>{' '}
                      <div>{yesNoBadge(rule.canSeeAllTeams)}</div>
                    </div>
                  )}
                </div>
                <Stack orientation="Horizontal" gap="0.5rem">
                  <Button buttonStyle="Primary" icon="edit" text="Bewerken" onClick={() => startEdit(rule)} disabled={isEditing} />{' '}
                  <Button buttonStyle="Danger" icon="delete" text="Verwijderen" onClick={() => deleteAsync(rule)} disabled={isEditing || isSaving} />
                </Stack>
              </>
            ) : (
              <>
                {editForm(editingModel)}
                {editButtons}
              </>
            )}
          </Card>
        )
      })}
    </div>
  )
}
