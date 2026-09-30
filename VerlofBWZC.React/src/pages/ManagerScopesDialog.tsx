import { useState } from 'react'
import { Button } from '../radzen/Button'
import { DropDown } from '../radzen/DropDown'
import { dialogService } from '../radzen/Dialog'
import { notificationService } from '../radzen/Notification'
import { putJson } from '../api/http'
import { AllSpecialitiesLabel, chipText } from '../rules'
import type { ScopeItemDTO } from '../services/demo'

// Zelfde als VerlofBWZC/Pages/ManagerScopesDialog.razor.
// Admin: welke ploegen en specialiteiten een manager beheert, bovenop zijn eigen ploeg en specialiteit

// VerlofBWZC.DataContracts.DTO.Access.ManagerScopesDTO
export interface ManagerScopesDTO {
  personId: number
  scopes: ScopeItemDTO[]
}

export interface ManagerScopesDialogProps {
  personId: number
  personName: string
  ownTeam?: string | null
  ownSpeciality?: string | null
  teams: string[]
  specialities: string[]
  current: ScopeItemDTO[]
}

export function ManagerScopesDialog({ personId, personName, ownTeam, ownSpeciality, teams, specialities, current }: ManagerScopesDialogProps) {
  const [items, setItems] = useState<ScopeItemDTO[]>(() => current.map(s => ({ team: s.team, speciality: s.speciality })))
  const [newTeam, setNewTeam] = useState<string | null>(null)
  const [newSpeciality, setNewSpeciality] = useState<string | null>(null)
  const [addHint, setAddHint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const specialityChoices = [AllSpecialitiesLabel, ...specialities]

  const canAdd = !!newTeam && !!newSpeciality

  const add = () => {
    setAddHint(null)
    const spec = newSpeciality === AllSpecialitiesLabel ? null : newSpeciality

    if (spec !== null && newTeam === ownTeam && spec === ownSpeciality) {
      setAddHint('Dat is de eigen ploeg en specialiteit; die telt altijd mee.')
      return
    }
    if (items.some(i => i.team === newTeam && !i.speciality)) {
      setAddHint(`${newTeam} staat er al met alle specialiteiten.`)
      return
    }
    if (items.some(i => i.team === newTeam && (i.speciality ?? null) === spec)) {
      setAddHint('Staat er al.')
      return
    }

    // "Alle specialiteiten" vervangt de losse specialiteiten van die ploeg
    let next = spec === null ? items.filter(i => i.team !== newTeam) : [...items]
    next.push({ team: newTeam!, speciality: spec })
    const specIndex = (i: ScopeItemDTO) => (i.speciality == null ? -1 : specialities.indexOf(i.speciality))
    next = next
      .map((i, n) => ({ i, n }))
      .sort((a, b) => teams.indexOf(a.i.team) - teams.indexOf(b.i.team) || specIndex(a.i) - specIndex(b.i) || a.n - b.n)
      .map(x => x.i)
    setItems(next)
    setNewSpeciality(null)
  }

  const saveAsync = async () => {
    setBusy(true)
    try {
      const resp = await putJson(`api/manager-scopes/${personId}`, items)
      if (resp.ok) {
        notificationService.notify('Success', 'Opgeslagen', `${personName}: beheerde ploegen aangepast.`)
        dialogService.close(true)
        return
      }
      const text = (await resp.text()).trim().replace(/^"+|"+$/g, '')
      notificationService.notify('Error', 'Niet opgeslagen', !text.trim() || text.startsWith('{') ? `Opslaan mislukt (${resp.status}).` : text)
    } catch (ex) {
      notificationService.notify('Error', 'Fout', ex instanceof Error ? ex.message : String(ex))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ms">
      <div className="ms-label">Eigen ploeg (altijd)</div>{' '}
      <div className="ms-chips">
        <span className="ms-chip ms-chip-own">{chipText(ownTeam, ownSpeciality)}</span>
      </div>{' '}
      <div className="ms-label">Beheert ook</div>{' '}
      <div className="ms-chips">
        {items.map((s, n) => (
          <span className="ms-chip" key={n}>
            {chipText(s.team, s.speciality)}{' '}
            <button
              type="button"
              className="ms-chip-x"
              aria-label={`${chipText(s.team, s.speciality)} verwijderen`}
              title="Verwijderen"
              onClick={() => setItems(list => list.filter(x => x !== s))}
            >
              <i className="rzi">close</i>
            </button>
          </span>
        ))}
        {items.length === 0 && <span className="tl-hint">Nog niets: enkel de eigen ploeg en specialiteit.</span>}
      </div>{' '}
      <div className="ms-add">
        <DropDown data={teams} value={newTeam} onChange={setNewTeam} placeholder="Ploeg" style="width:150px" />{' '}
        <DropDown data={specialityChoices} value={newSpeciality} onChange={setNewSpeciality} placeholder="Specialiteit" style="width:210px" />{' '}
        <Button text="Toevoegen" icon="add" buttonStyle="Primary" variant="Outlined" disabled={!canAdd} onClick={add} />
      </div>
      {addHint !== null && <div className="tl-hint">{addHint}</div>}
      <div className="uc-actions ms-actions">
        <Button text="Annuleren" buttonStyle="Light" onClick={() => dialogService.close(false)} />{' '}
        <Button text="Opslaan" icon="save" buttonStyle="Primary" disabled={busy} onClick={saveAsync} />
      </div>
    </div>
  )
}

// Zoals DialogService.OpenAsync<ManagerScopesDialog>(..., new DialogOptions { Width = "580px", CloseDialogOnEsc = true })
export const openManagerScopes = (props: ManagerScopesDialogProps) =>
  dialogService.open<boolean>(`Beheert · ${props.personName}`, <ManagerScopesDialog {...props} />, { width: '580px', closeDialogOnEsc: true })
