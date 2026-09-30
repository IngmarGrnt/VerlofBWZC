import { useEffect, useState, type KeyboardEvent } from 'react'
import { Button } from '../radzen/Button'
import { DropDown } from '../radzen/DropDown'
import { dialogService } from '../radzen/Dialog'
import { notificationService } from '../radzen/Notification'
import { getJson } from '../api/http'
import { personApi, type PersonBaseDTO } from '../api/person'
import { getCurrentPerson, isAdminPerson, isMobile } from '../services/browser'
import type { ScopeItemDTO } from '../services/demo'
import { chipText, DefaultLeaveAllowance, initialsFor } from '../rules'
import { formatDate } from '../util/dotnet'
import { PersonForm, type PersonFormResult } from './PersonForm'
import type { ManagerScopesDTO } from './ManagerScopesDialog'
import { showTemporaryPassword } from './TemporaryPasswordDialog'

// Zelfde als VerlofBWZC/Pages/PersonCRUD.razor (@page "/person-crud", Admin/Manager)

// --- Zoeken, filteren en sorteren ---
type Column = { key: string; title: string }
const columns: Column[] = [
  { key: 'name', title: 'Naam' },
  { key: 'initials', title: 'Initialen' },
  { key: 'team', title: 'Ploeg' },
  { key: 'speciality', title: 'Specialiteit' },
  { key: 'grade', title: 'Graad' },
  { key: 'role', title: 'Rol' },
  { key: 'leave', title: 'Verlof/jaar' },
]

// Zoals Comparer<object>.Default: getallen als getal, tekst cultuurgevoelig, null eerst
function compareKeys(a: string | number | null | undefined, b: string | number | null | undefined): number {
  if (a == null || b == null) return a == null ? (b == null ? 0 : -1) : 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

// string.Contains(part, StringComparison.OrdinalIgnoreCase)
const contains = (text: string | null | undefined, part: string) => text != null && text.toUpperCase().includes(part.toUpperCase())

// DateTime (UTC) van de API naar lokale tijd, zoals ToLocalTime (zonder tijdzone = UTC)
function utcToLocal(value: string): Date {
  const v = value.replace(/(\.\d{3})\d+/, '$1')
  return /(Z|[+-]\d{2}:?\d{2})$/.test(v) ? new Date(v) : new Date(`${v}Z`)
}

const fullName = (p: PersonBaseDTO) => `${p.firstName} ${p.lastName}`

export function PersonCRUD() {
  const [persons, setPersons] = useState<PersonBaseDTO[]>([])
  const [loading, setLoading] = useState(true)

  const [teamOptions, setTeamOptions] = useState<string[]>([])
  const [specialityOptions, setSpecialityOptions] = useState<string[]>([])
  const [gradeOptions, setGradeOptions] = useState<string[]>([])
  const [roleOptions, setRoleOptions] = useState<string[]>([])

  const [search, setSearch] = useState('')
  const [filterTeam, setFilterTeam] = useState<string | null>(null)
  const [filterSpeciality, setFilterSpeciality] = useState<string | null>(null)
  const [filterRole, setFilterRole] = useState<string | null>(null)

  // Admin: alles; Manager: zijn ploegen, rol nooit Admin (de API controleert dit ook)
  const [isAdmin, setIsAdmin] = useState(false)

  const [sortKey, setSortKey] = useState('name')
  const [sortDesc, setSortDesc] = useState(false)

  // --- Registraties die wachten op goedkeuring ---
  const [pending, setPending] = useState<PersonBaseDTO[]>([])
  const [busyPending, setBusyPending] = useState(false)

  // Extra ploegen/specialiteiten per manager (bovenop de eigen)
  const [managerScopes, setManagerScopes] = useState<ManagerScopesDTO[]>([])

  // LoadPersons: alles in één keer tonen (zoals Blazor pas rendert na het laden)
  const loadPersons = async (admin: boolean) => {
    const all = (await personApi.getAllPersons()) ?? []
    const waiting = await personApi.getPending()
    let scopes = managerScopes
    if (admin) {
      try {
        scopes = (await getJson<ManagerScopesDTO[] | null>('api/manager-scopes')) ?? []
      } catch {
        scopes = []
      }
    }
    setPersons(all)
    setPending(waiting)
    setManagerScopes(scopes)
    setLoading(false)
  }

  useEffect(() => {
    void (async () => {
      const admin = isAdminPerson(await getCurrentPerson())
      // LoadMetaAsync
      const teams = (await getJson<string[] | null>('api/meta/teams')) ?? []
      const specialities = (await getJson<string[] | null>('api/meta/specialities')) ?? []
      const grades = (await getJson<string[] | null>('api/meta/grades')) ?? []
      const roles = (await getJson<string[] | null>('api/meta/roles')) ?? []
      setIsAdmin(admin)
      setTeamOptions(teams)
      setSpecialityOptions(specialities)
      setGradeOptions(grades)
      setRoleOptions(roles)
      await loadPersons(admin)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sortBy = (key: string) => {
    setSortDesc(sortKey === key && !sortDesc)
    setSortKey(key)
  }

  const filtered = (() => {
    let q = persons
    const s = search.trim()
    if (s.length > 0)
      q = q.filter(p => contains(`${p.firstName} ${p.lastName}`, s) || contains(`${p.lastName} ${p.firstName}`, s) || contains(p.email, s) || contains(initialsFor(p), s))
    if (filterTeam) q = q.filter(p => p.team === filterTeam)
    if (filterSpeciality) q = q.filter(p => p.speciality === filterSpeciality)
    if (filterRole) q = q.filter(p => p.role === filterRole)

    const key: (p: PersonBaseDTO) => string | number | null | undefined =
      sortKey === 'initials'
        ? p => initialsFor(p)
        : sortKey === 'team'
          ? p => teamOptions.indexOf(p.team ?? '')
          : sortKey === 'speciality'
            ? p => p.speciality
            : sortKey === 'grade'
              ? p => gradeOptions.indexOf(p.grade ?? '')
              : sortKey === 'role'
                ? p => p.role
                : sortKey === 'leave'
                  ? p => p.leaveAllowance ?? -1
                  : p => `${p.lastName} ${p.firstName}`
    return q
      .map((p, i) => ({ p, i, k: key(p) }))
      .sort((a, b) => {
        const primary = compareKeys(a.k, b.k)
        return (sortDesc ? -primary : primary) || compareKeys(a.p.lastName, b.p.lastName) || compareKeys(a.p.firstName, b.p.firstName) || a.i - b.i
      })
      .map(x => x.p)
  })()

  // Andere personen in dezelfde ploeg en specialiteit met dezelfde initialen
  const sameInitials = (person: PersonBaseDTO) =>
    persons
      .filter(p => p !== person && p.id !== person.id && p.team === person.team && p.speciality === person.speciality)
      .filter(p => initialsFor(p).toUpperCase() === initialsFor(person).toUpperCase())

  const scopesOf = (personId: number): ScopeItemDTO[] => managerScopes.find(m => m.personId === personId)?.scopes ?? []

  // Bv. "Ploeg1 · IGS (eigen), Ploeg2 · IGS, Ploeg3 · alle specialiteiten"
  const scopesTooltip = (person: PersonBaseDTO) =>
    [`${chipText(person.team, person.speciality)} (eigen)`, ...scopesOf(person.id).map(s => chipText(s.team, s.speciality))].join(', ')

  // --- Cellen ---
  const initialsCell = (p: PersonBaseDTO) => {
    const dup = sameInitials(p)
    return dup.length > 0 ? (
      <span className="pc-initials-dup" title={`Ook gebruikt door ${dup.map(fullName).join(', ')} in dezelfde ploeg en specialiteit`}>
        {initialsFor(p)} <i className="rzi">warning</i>
      </span>
    ) : (
      <span className="pc-initials">{initialsFor(p)}</span>
    )
  }

  const roleCell = (p: PersonBaseDTO) => (
    <>
      <span className={`pc-role pc-role-${p.role?.toLowerCase() ?? ''}`}>{p.role}</span>
      {isAdmin && p.role === 'Manager' && scopesOf(p.id).length > 0 && (
        <span className="pc-scopes" title={`Beheert: ${scopesTooltip(p)}`}>
          +{scopesOf(p.id).length}
        </span>
      )}
    </>
  )

  const approveAsync = async (p: PersonBaseDTO) => {
    setBusyPending(true)
    const result = await personApi.approve(p.id)
    setBusyPending(false)
    if (!result.ok) {
      notificationService.notify('Error', 'Niet goedgekeurd', result.error)
      return
    }
    notificationService.notify('Success', 'Goedgekeurd', `${p.firstName} ${p.lastName} kan nu inloggen.`)
    await loadPersons(isAdmin)
  }

  const rejectAsync = async (p: PersonBaseDTO) => {
    const confirmed = await dialogService.confirm(
      `De registratie van ${p.firstName} ${p.lastName} (${p.email}) weigeren? De aanvraag wordt verwijderd.`,
      'Registratie weigeren',
      { okButtonText: 'Weigeren', cancelButtonText: 'Annuleren' },
    )
    if (confirmed !== true) return

    setBusyPending(true)
    const result = await personApi.reject(p.id)
    setBusyPending(false)
    if (!result.ok) {
      notificationService.notify('Error', 'Niet geweigerd', result.error)
      return
    }
    notificationService.notify('Info', 'Geweigerd', `De registratie van ${p.firstName} ${p.lastName} is verwijderd.`)
    await loadPersons(isAdmin)
  }

  // --- Formulier (zijpaneel; op gsm volledig scherm) ---
  const openAsync = async (person: PersonBaseDTO) => {
    let mobile: boolean
    try {
      mobile = isMobile()
    } catch {
      mobile = false
    }

    const result = await dialogService.openSide<PersonFormResult>(
      person.id === 0 ? 'Nieuwe persoon' : `${person.firstName} ${person.lastName}`,
      <PersonForm
        original={person}
        isAdmin={isAdmin}
        allPersons={persons}
        teams={teamOptions}
        specialities={specialityOptions}
        grades={gradeOptions}
        roles={roleOptions}
        scopes={scopesOf(person.id)}
      />,
      {
        position: 'Right',
        width: mobile ? '100%' : '520px',
        closeDialogOnOverlayClick: true,
        showMask: true,
      },
    )

    if (result && result.changed) {
      await loadPersons(isAdmin)
      if (result.temporaryPassword) await showTemporaryPassword(result.passwordFor ?? '', result.temporaryPassword)
    }
  }

  const addPerson = () =>
    openAsync({
      id: 0,
      firstName: '',
      lastName: '',
      email: '',
      team: teamOptions[0] ?? '',
      speciality: specialityOptions[0] ?? '',
      leaveAllowance: DefaultLeaveAllowance,
      grade: gradeOptions[0] ?? '',
      role: roleOptions.find(r => r === 'User') ?? roleOptions[0] ?? '',
      initials: null,
      mustChangePassword: false,
      isApproved: false,
    })

  const onRowKey = async (e: KeyboardEvent, p: PersonBaseDTO) => {
    if (e.key === 'Enter' || e.key === ' ') await openAsync(p)
  }

  return (
    <>
      <div className="pc-header">
        <h1>Personen</h1>
        {isAdmin && <Button icon="person_add" text="Nieuwe persoon" buttonStyle="Primary" onClick={addPerson} />}
      </div>
      {!isAdmin && (
        <p className="rz-text-secondary">
          Personen van de ploegen en specialiteiten die je beheert. Je kan naam, initialen, e-mail, rol (geen Admin) en verlofaantal aanpassen, en het wachtwoord resetten.
        </p>
      )}

      {pending.length > 0 && (
        // Zelf geregistreerde personen: pas na goedkeuring kunnen ze inloggen
        <div className="pc-pending">
          <div className="pc-pending-title">
            <i className="rzi">how_to_reg</i> Wacht op goedkeuring ({pending.length})
          </div>
          {pending.map(p => {
            const dup = sameInitials(p)
            return (
              <div className="pc-pending-row" key={p.id}>
                <div className="pc-pending-who">
                  <span className="pc-pending-name">
                    {p.firstName} {p.lastName}
                  </span>{' '}
                  <span className="pc-pending-meta">
                    {p.email} · {p.team} · {p.speciality} · {p.grade}
                    {p.registeredAtUtc && <> · aangevraagd {formatDate(utcToLocal(p.registeredAtUtc), 'd MMM HH:mm', 'nl-BE')}</>}
                  </span>
                  {dup.length > 0 && (
                    <span className="pc-pending-warn">
                      <i className="rzi">warning</i> Initialen {initialsFor(p)} al gebruikt door {dup.map(fullName).join(', ')}: pas ze na goedkeuring aan.
                    </span>
                  )}
                </div>{' '}
                <div className="pc-pending-actions">
                  <Button text="Goedkeuren" icon="check" buttonStyle="Success" size="Small" disabled={busyPending} onClick={() => approveAsync(p)} />{' '}
                  <Button text="Weigeren" icon="close" buttonStyle="Danger" variant="Outlined" size="Small" disabled={busyPending} onClick={() => rejectAsync(p)} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Zoeken en filteren */}
      <div className="pc-filters">
        <div className="pc-search">
          <i className="rzi">search</i>{' '}
          <input
            type="search"
            className="pc-search-input"
            placeholder="Zoek op naam, e-mail of initialen"
            aria-label="Zoeken"
            value={search}
            onChange={e => setSearch(e.currentTarget.value ?? '')}
          />
        </div>{' '}
        <DropDown data={teamOptions} value={filterTeam} onChange={setFilterTeam} allowClear placeholder="Alle ploegen" className="pc-filter" />{' '}
        <DropDown data={specialityOptions} value={filterSpeciality} onChange={setFilterSpeciality} allowClear placeholder="Alle specialiteiten" className="pc-filter" />{' '}
        <DropDown data={roleOptions} value={filterRole} onChange={setFilterRole} allowClear placeholder="Alle rollen" className="pc-filter" />{' '}
        <span className="pc-count">
          {filtered.length} van {persons.length}
        </span>
      </div>

      {loading ? (
        <p className="rz-text-secondary">Personen laden…</p>
      ) : filtered.length === 0 ? (
        <p className="rz-text-secondary">Geen personen gevonden.</p>
      ) : (
        <>
          {/* Pc: tabel; klik op een rij om te openen */}
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  {columns.map(col => (
                    <th key={col.key}>
                      <button type="button" className="pc-sort" onClick={() => sortBy(col.key)}>
                        {col.title}
                        {sortKey === col.key && <i className="rzi">{sortDesc ? 'arrow_downward' : 'arrow_upward'}</i>}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, n) => (
                  <tr key={n} className="pc-row" tabIndex={0} onClick={() => openAsync(p)} onKeyDown={e => onRowKey(e, p)} title="Klik om te openen">
                    <td>
                      <span className="pc-name">
                        {p.lastName} {p.firstName}
                      </span>
                      {p.mustChangePassword && (
                        <span className="pc-temp-pw" title="Heeft een tijdelijk wachtwoord en moet bij de volgende login een eigen wachtwoord kiezen">
                          tijdelijk wachtwoord
                        </span>
                      )}
                      {/* Blazor zet na het tijdelijk-wachtwoordlabel een spatie vooraan in het e-mailveld */}
                      <span className="pc-email">
                        {p.mustChangePassword && ' '}
                        {p.email}
                      </span>
                    </td>{' '}
                    <td>{initialsCell(p)}</td> <td>{p.team}</td> <td>{p.speciality}</td> <td>{p.grade}</td> <td>{roleCell(p)}</td>{' '}
                    <td className="pc-num">{p.leaveAllowance?.toString() ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Gsm: kaartjes; tik om te openen */}
          <div className="pc-cards">
            {filtered.map((p, n) => (
              <button key={n} type="button" className="pc-card" onClick={() => openAsync(p)}>
                <span className="pc-card-top">
                  <span className="pc-name">
                    {p.lastName} {p.firstName}
                  </span>{' '}
                  {initialsCell(p)}
                </span>{' '}
                <span className="pc-card-meta">
                  {p.team} · {p.speciality} · {p.grade}
                </span>{' '}
                <span className="pc-card-meta">
                  {roleCell(p)} · verlof {p.leaveAllowance?.toString() ?? '-'}
                  {p.mustChangePassword && <span className="pc-temp-pw">tijdelijk wachtwoord</span>}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}
