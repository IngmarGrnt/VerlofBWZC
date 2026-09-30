import { useState } from 'react'
import { Button } from '../radzen/Button'
import { TextBox } from '../radzen/Inputs'
import { DropDown } from '../radzen/DropDown'
import { Numeric } from '../radzen/Misc'
import { dialogService } from '../radzen/Dialog'
import { notificationService } from '../radzen/Notification'
import { getJson } from '../api/http'
import { personApi, type PersonBaseDTO, type PersonCreateDTO } from '../api/person'
import { chipText, initialsFor, initialsFromLastName, InitialsMaxLength, normalizeInitials } from '../rules'
import type { ScopeItemDTO } from '../services/demo'
import { openManagerScopes, type ManagerScopesDTO } from './ManagerScopesDialog'

// Zelfde als VerlofBWZC/Pages/PersonForm.razor.
// Formulier om een persoon toe te voegen of aan te passen (zijpaneel in Personen).
// Sluit met een PersonFormResult: changed = lijst herladen; temporaryPassword = eenmalig tonen.

export interface PersonFormResult {
  changed: boolean
  passwordFor?: string | null
  temporaryPassword?: string | null
}

export interface PersonFormProps {
  // original = de persoon uit de lijst (niet aangepast tot het opslaan); id 0 = nieuwe persoon
  original: PersonBaseDTO
  isAdmin: boolean
  allPersons: PersonBaseDTO[]
  teams: string[]
  specialities: string[]
  grades: string[]
  roles: string[]
  scopes: ScopeItemDTO[]
}

const sameText = (a: string, b: string) => a.toUpperCase() === b.toUpperCase()

export function PersonForm({ original, isAdmin, allPersons, teams, specialities, grades, roles, scopes: initialScopes }: PersonFormProps) {
  const [model, setModel] = useState<PersonBaseDTO>(() => ({
    ...original,
    id: original.id,
    firstName: original.firstName,
    lastName: original.lastName,
    email: original.email,
    team: original.team,
    speciality: original.speciality,
    grade: original.grade,
    role: original.role,
    leaveAllowance: original.leaveAllowance,
    initials: original.initials,
    mustChangePassword: original.mustChangePassword,
  }))
  const [scopes, setScopes] = useState<ScopeItemDTO[]>(() => [...initialScopes])
  const [scopesChanged, setScopesChanged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isNew = original.id === 0
  // Manager: geen Admin-accounts aanpassen (de API controleert dit ook)
  const readOnly = !isAdmin && original.role === 'Admin'
  const canResetPassword = isAdmin || original.role !== 'Admin'
  const roleChoices = isAdmin ? roles : roles.filter(r => r !== 'Admin')

  const edit = (patch: Partial<PersonBaseDTO>) => setModel(m => ({ ...m, ...patch }))

  // Andere personen in dezelfde ploeg en specialiteit met dezelfde initialen
  const duplicatesOf = (m: PersonBaseDTO) =>
    allPersons.filter(p => p.id !== m.id && p.team === m.team && p.speciality === m.speciality).filter(p => sameText(initialsFor(p), initialsFor(m)))
  const duplicateInitials = duplicatesOf(model)

  const close = (changed: boolean, passwordFor: string | null = null, password: string | null = null) =>
    dialogService.closeSide({ changed, passwordFor, temporaryPassword: password } satisfies PersonFormResult)

  const validate = (): string | null => {
    if (!model.firstName?.trim() || !model.lastName?.trim()) return 'Vul voornaam en achternaam in.'
    if (!model.email?.trim() || !model.email.includes('@')) return 'Vul een geldig e-mailadres in.'
    if (!model.team?.trim() || !model.speciality?.trim() || !model.role?.trim()) return 'Kies ploeg, specialiteit en rol.'
    return null
  }

  const saveAsync = async () => {
    const invalid = validate()
    setError(invalid)
    if (invalid !== null) return

    // Initialen opschonen (leeg = standaardregel); enkel tegenhouden als ze nieuw of gewijzigd zijn
    const m: PersonBaseDTO = { ...model, initials: normalizeInitials(model.initials, model.lastName) }
    setModel(m)
    const duplicates = duplicatesOf(m)
    const initialsChanged = isNew || !sameText(initialsFor(original), initialsFor(m)) || original.team !== m.team || original.speciality !== m.speciality
    if (initialsChanged && duplicates.length > 0) {
      setError(
        `De initialen ${initialsFor(m)} worden in ${m.team} · ${m.speciality} al gebruikt door ${duplicates.map(p => `${p.firstName} ${p.lastName}`).join(', ')}. Kies andere initialen.`,
      )
      return
    }

    const dto: PersonCreateDTO = {
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      team: m.team,
      speciality: m.speciality,
      grade: m.grade,
      role: m.role,
      leaveAllowance: m.leaveAllowance,
      initials: m.initials,
    }

    setBusy(true)
    try {
      if (isNew) {
        const created = await personApi.createPerson(dto)
        if (!created.ok || created.value === null) {
          setError(created.error ?? 'Toevoegen is mislukt.')
          return
        }
        notificationService.notify('Success', 'Toegevoegd', `${m.firstName} ${m.lastName} is toegevoegd.`)
        close(true, `${m.firstName} ${m.lastName}`, created.value.temporaryPassword)
      } else {
        if (!(await personApi.updatePerson(m.id, dto))) {
          setError('Aanpassen is mislukt (geen toegang of e-mailadres al in gebruik).')
          return
        }
        notificationService.notify('Success', 'Opgeslagen', `${m.firstName} ${m.lastName} is aangepast.`)
        close(true)
      }
    } finally {
      setBusy(false)
    }
  }

  const deleteAsync = async () => {
    const confirmed = await dialogService.confirm(`${original.firstName} ${original.lastName} verwijderen? Dit kan je niet ongedaan maken.`, 'Persoon verwijderen', {
      okButtonText: 'Verwijderen',
      cancelButtonText: 'Annuleren',
    })
    if (confirmed !== true) return

    setBusy(true)
    const ok = await personApi.deletePerson(original.id)
    setBusy(false)
    if (!ok) {
      setError('Verwijderen is mislukt.')
      return
    }
    notificationService.notify('Success', 'Verwijderd', `${original.firstName} ${original.lastName} is verwijderd.`)
    close(true)
  }

  // Nieuw tijdelijk wachtwoord (eenmalig getoond); de persoon kiest bij de volgende login een eigen wachtwoord
  const resetPasswordAsync = async () => {
    const confirmed = await dialogService.confirm(
      `Het wachtwoord van ${original.firstName} ${original.lastName} vervangen door een tijdelijk wachtwoord? Het huidige wachtwoord werkt dan niet meer.`,
      'Wachtwoord resetten',
      { okButtonText: 'Resetten', cancelButtonText: 'Annuleren' },
    )
    if (confirmed !== true) return

    setBusy(true)
    const result = await personApi.resetPassword(original.id)
    setBusy(false)
    if (!result.ok || result.value === null) {
      setError(result.error ?? 'Resetten is mislukt.')
      return
    }
    close(true, `${original.firstName} ${original.lastName}`, result.value.temporaryPassword)
  }

  const openScopesAsync = async () => {
    const saved = await openManagerScopes({
      personId: original.id,
      personName: `${original.firstName} ${original.lastName}`,
      ownTeam: model.team,
      ownSpeciality: model.speciality,
      teams,
      specialities,
      current: scopes,
    })
    if (saved !== true) return

    setScopesChanged(true)
    try {
      const all = (await getJson<ManagerScopesDTO[] | null>('api/manager-scopes')) ?? []
      setScopes(all.find(m => m.personId === original.id)?.scopes ?? [])
    } catch {
      // lijst wordt herladen bij het sluiten
    }
  }

  const defaultInitials = initialsFromLastName(model.lastName)

  return (
    <div className="pf">
      {readOnly && (
        <div className="pf-note">
          <i className="rzi">lock</i> Een Admin-account kan je als manager niet aanpassen.
        </div>
      )}
      <section className="pf-section">
        <h3 className="pf-title">Persoon</h3>{' '}
        <div className="pf-row">
          <div className="pf-field">
            <label htmlFor="pf-first">Voornaam</label> <TextBox id="pf-first" value={model.firstName} onChange={v => edit({ firstName: v })} disabled={readOnly} style="width:100%" />
          </div>{' '}
          <div className="pf-field">
            <label htmlFor="pf-last">Achternaam</label> <TextBox id="pf-last" value={model.lastName} onChange={v => edit({ lastName: v })} disabled={readOnly} style="width:100%" />
          </div>
        </div>{' '}
        <div className="pf-field">
          <label htmlFor="pf-email">E-mail</label> <TextBox id="pf-email" value={model.email} onChange={v => edit({ email: v })} disabled={readOnly} style="width:100%" />
        </div>{' '}
        <div className="pf-field pf-field-narrow">
          <label htmlFor="pf-initials">Initialen</label>{' '}
          <TextBox
            id="pf-initials"
            value={model.initials}
            onChange={v => edit({ initials: v })}
            maxLength={InitialsMaxLength}
            disabled={readOnly}
            placeholder={defaultInitials}
            style="width:100%"
          />{' '}
          <div className="pf-hint">Leeg laten = standaard volgens de achternaam ({defaultInitials}).</div>
          {duplicateInitials.length > 0 && (
            <div className="pf-warn">
              <i className="rzi">warning</i> {initialsFor(model)} wordt in {model.team} · {model.speciality} al gebruikt door{' '}
              {duplicateInitials.map(p => `${p.firstName} ${p.lastName}`).join(', ')}.
            </div>
          )}
        </div>
        {!isNew && original.mustChangePassword && (
          <div className="pf-hint">
            <span className="pc-temp-pw">tijdelijk wachtwoord</span> moet bij de volgende login een eigen wachtwoord kiezen.
          </div>
        )}
      </section>{' '}
      <section className="pf-section">
        <h3 className="pf-title">Plaats</h3>
        {isAdmin ? (
          <>
            <div className="pf-row">
              <div className="pf-field">
                <label>Ploeg</label> <DropDown data={teams} value={model.team} onChange={v => edit({ team: v ?? '' })} disabled={readOnly} style="width:100%" />
              </div>{' '}
              <div className="pf-field">
                <label>Specialiteit</label>{' '}
                <DropDown data={specialities} value={model.speciality} onChange={v => edit({ speciality: v ?? '' })} disabled={readOnly} style="width:100%" />
              </div>
            </div>{' '}
            <div className="pf-field">
              <label>Graad</label>{' '}
              <DropDown data={grades} value={model.grade} onChange={v => edit({ grade: v ?? '' })} disabled={readOnly} allowFiltering caseInsensitive style="width:100%" />
            </div>
          </>
        ) : (
          // Manager: ploeg, specialiteit en graad kan enkel de Admin aanpassen
          <div className="pf-fixed">
            {model.team} · {model.speciality} · {model.grade}
          </div>
        )}
      </section>{' '}
      <section className="pf-section">
        <h3 className="pf-title">Rechten</h3>{' '}
        <div className="pf-field">
          <label>Rol</label> <DropDown data={roleChoices} value={model.role} onChange={v => edit({ role: v ?? '' })} disabled={readOnly} style="width:100%" />
        </div>
        {isAdmin && model.role === 'Manager' && (
          <div className="pf-field">
            <label>Beheert</label>{' '}
            <div className="ms-chips">
              <span className="ms-chip ms-chip-own">{chipText(model.team, model.speciality)} (eigen)</span>
              {scopes.map((s, n) => (
                <span className="ms-chip" key={n}>
                  {chipText(s.team, s.speciality)}
                </span>
              ))}
            </div>
            {isNew ? (
              <div className="pf-hint">Extra ploegen kan je toevoegen na het opslaan.</div>
            ) : (
              <Button
                text="Beheerde ploegen aanpassen"
                icon="groups"
                buttonStyle="Warning"
                variant="Outlined"
                size="Small"
                onClick={openScopesAsync}
                style="margin-top:.35rem"
              />
            )}
          </div>
        )}
      </section>{' '}
      <section className="pf-section">
        <h3 className="pf-title">Verlof</h3>{' '}
        <div className="pf-field pf-field-narrow">
          <label>Verlofshiften per jaar</label>{' '}
          <Numeric
            value={model.leaveAllowance}
            onChange={v => edit({ leaveAllowance: v })}
            min={0}
            max={366}
            placeholder="geen"
            disabled={readOnly}
            nullable
            style="width:100%"
          />
        </div>
      </section>
      {!!error && (
        <div className="login-error" role="alert">
          <i className="rzi">error</i> {error}
        </div>
      )}
      <div className="pf-actions">
        {!readOnly && <Button text={isNew ? 'Toevoegen' : 'Opslaan'} icon="save" buttonStyle="Primary" isBusy={busy} busyText="Bezig…" onClick={saveAsync} />}
        <Button text={readOnly ? 'Sluiten' : 'Annuleren'} buttonStyle="Light" disabled={busy} onClick={() => close(scopesChanged)} />
      </div>
      {!isNew && (canResetPassword || isAdmin) && (
        <div className="pf-danger">
          {canResetPassword && (
            <Button text="Wachtwoord resetten" icon="lock_reset" buttonStyle="Info" variant="Outlined" size="Small" disabled={busy} onClick={resetPasswordAsync} />
          )}
          {isAdmin && <Button text="Verwijderen" icon="delete" buttonStyle="Danger" variant="Outlined" size="Small" disabled={busy} onClick={deleteAsync} />}
        </div>
      )}
    </div>
  )
}
