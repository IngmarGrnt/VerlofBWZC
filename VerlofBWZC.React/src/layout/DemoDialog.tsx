import { useEffect, useMemo, useState } from 'react'
import { Button } from '../radzen/Button'
import { Stack } from '../radzen/Layout'
import { DropDown } from '../radzen/DropDown'
import { TextBox } from '../radzen/Inputs'
import { dialogService } from '../radzen/Dialog'
import { getJson } from '../api/http'
import { getItem, setItem } from '../auth/tokens'
import { startDemo, type DemoInfo, type ScopeItemDTO } from '../services/demo'
import { AllSpecialitiesLabel, AllTeamsSpeciality, NoRegimeTeam, chipText, hasNoRegime } from '../rules'

// Zelfde als VerlofBWZC/Layout/DemoDialog.razor: demo modus starten of een lopende demo aanpassen.

interface DemoTemplate {
  Name: string
  Role: string
  Team: string
  Speciality: string
  Scopes: { Team: string; Speciality?: string | null }[]
}

// Zelfde sleutel en JSON-vorm (PascalCase) als de Blazor-website
const TemplatesKey = 'demoTemplates'

const scopeKey = (scopes: { team: string; speciality?: string | null }[]) =>
  scopes
    .map(s => `${s.team}:${s.speciality ?? ''}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .join(';')

const toScopes = (t: DemoTemplate): ScopeItemDTO[] => t.Scopes.map(s => ({ team: s.Team, speciality: s.Speciality ?? null }))

export function DemoDialog({ initial }: { initial?: DemoInfo }) {
  const [roles, setRoles] = useState<string[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [specialities, setSpecialities] = useState<string[]>([])
  const [role, setRole] = useState<string | null>('Manager')
  const [team, setTeam] = useState<string | null>(null)
  const [speciality, setSpeciality] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Extra ploegen/specialiteiten voor een demo als Manager
  const [extra, setExtra] = useState<ScopeItemDTO[]>([])
  const [newTeam, setNewTeam] = useState<string | null>(null)
  const [newSpeciality, setNewSpeciality] = useState<string | null>(null)
  const specialityChoices = useMemo(() => [AllSpecialitiesLabel, ...specialities], [specialities])

  // Sjablonen: vaste voorbeelden + zelf bewaarde (enkel in deze browser)
  const [saved, setSaved] = useState<DemoTemplate[]>([])
  const [builtIn, setBuiltIn] = useState<DemoTemplate[]>([])
  const [templateName, setTemplateName] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const r = (await getJson<string[] | null>('api/meta/roles')) ?? []
      const t = (await getJson<string[] | null>('api/meta/teams')) ?? []
      const sp = (await getJson<string[] | null>('api/meta/specialities')) ?? []
      setRoles(r)
      setTeams(t)
      setSpecialities(sp)
      setTeam(t.find(x => x === 'Ploeg1') ?? t[0] ?? null)
      setSpeciality(sp[0] ?? null)
      setBuiltIn(createBuiltInTemplates(t, sp))
      try {
        const json = getItem(TemplatesKey)
        setSaved(json ? ((JSON.parse(json) as DemoTemplate[] | null) ?? []) : [])
      } catch {
        setSaved([])
      }

      // Lopende demo aanpassen: huidige keuzes invullen
      if (initial) {
        setRole(initial.role)
        setTeam(initial.team)
        setSpeciality(initial.speciality)
        setExtra([...initial.scopes])
      }
    })()
  }, [initial])

  const add = () => {
    const spec = newSpeciality === AllSpecialitiesLabel ? null : newSpeciality
    if (spec !== null && newTeam === team && spec === speciality) return // de eigen ploeg en specialiteit telt al mee
    if (extra.some(e => e.team === newTeam && (!e.speciality || e.speciality === spec))) return
    let list = spec === null ? extra.filter(e => e.team !== newTeam) : [...extra]
    list.push({ team: newTeam!, speciality: spec })
    list = [...list].sort(
      (a, b) =>
        teams.indexOf(a.team) - teams.indexOf(b.team) ||
        (a.speciality == null ? -1 : specialities.indexOf(a.speciality)) - (b.speciality == null ? -1 : specialities.indexOf(b.speciality)),
    )
    setExtra(list)
    setNewSpeciality(null)
  }

  const apply = (t: DemoTemplate) => {
    setRole(t.Role)
    setTeam(t.Team)
    setSpeciality(t.Speciality)
    setExtra(toScopes(t))
    setError(null)
  }

  const isCurrent = (t: DemoTemplate) =>
    t.Role === role && t.Team === team && t.Speciality === speciality && (role !== 'Manager' || scopeKey(toScopes(t)) === scopeKey(extra))

  const describe = (t: DemoTemplate) => {
    let text = `${t.Role} · ${t.Team} · ${t.Speciality}`
    if (t.Role === 'Manager' && t.Scopes.length) text += ' · beheert ook: ' + t.Scopes.map(s => chipText(s.Team, s.Speciality)).join(', ')
    return text
  }

  const storeTemplates = (list: DemoTemplate[]) => {
    setSaved(list)
    setItem(TemplatesKey, JSON.stringify(list))
  }

  const saveTemplate = () => {
    const name = templateName!.trim()
    const list = saved.filter(t => t.Name !== name)
    list.push({
      Name: name,
      Role: role!,
      Team: team!,
      Speciality: speciality!,
      Scopes: role === 'Manager' ? extra.map(e => ({ Team: e.team, Speciality: e.speciality ?? null })) : [],
    })
    setTemplateName(null)
    storeTemplates(list)
  }

  const start = async () => {
    setBusy(true)
    setError(await startDemo(role!, team!, speciality!, role === 'Manager' ? extra : null))
    setBusy(false)
  }

  return (
    <>
      <p className="rz-text-secondary" style={{ marginTop: 0 }}>
        Bekijk de app zoals een medewerker met deze rol, ploeg en specialiteit hem ziet. In demo modus kan je <strong>niets opslaan</strong>. Stoppen doe
        je via de balk bovenaan.
      </p>

      <Stack gap="0.75rem">
        <div>
          <label>Sjabloon</label>
          <div className="demo-tpl">
            {[...builtIn, ...saved].map((t, i) => (
              <span key={`${i}-${t.Name}`} className={`ms-chip demo-tpl-chip ${isCurrent(t) ? 'demo-tpl-active' : ''}`} title={describe(t)} onClick={() => apply(t)}>
                {t.Name}
                {saved.includes(t) && (
                  <button
                    type="button"
                    className="ms-chip-x"
                    title="Sjabloon verwijderen"
                    aria-label="Sjabloon verwijderen"
                    onClick={e => {
                      e.stopPropagation()
                      storeTemplates(saved.filter(x => x !== t))
                    }}
                  >
                    <i className="rzi">close</i>
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
        <div>
          <label>Rol</label>
          <DropDown data={roles} value={role} onChange={setRole} style="width:100%" />
        </div>
        <div>
          <label>Ploeg</label>
          <DropDown data={teams} value={team} onChange={setTeam} style="width:100%" />
        </div>
        <div>
          <label>Specialiteit</label>
          <DropDown data={specialities} value={speciality} onChange={setSpeciality} style="width:100%" />
        </div>

        {role === 'Manager' && (
          // Manager: optioneel extra ploegen/specialiteiten, zoals een manager die meerdere ploegen beheert
          <div className="ms">
            <div className="ms-label">Beheert ook (optioneel)</div>
            <div className="ms-chips">
              {extra.map(e => (
                <span key={`${e.team}:${e.speciality ?? ''}`} className="ms-chip">
                  {chipText(e.team, e.speciality)}
                  <button type="button" className="ms-chip-x" title="Verwijderen" aria-label="Verwijderen" onClick={() => setExtra(extra.filter(x => x !== e))}>
                    <i className="rzi">close</i>
                  </button>
                </span>
              ))}
              {extra.length === 0 && <span className="tl-hint">Enkel de ploeg en specialiteit hierboven.</span>}
            </div>
            <div className="ms-add">
              <DropDown data={teams} value={newTeam} onChange={setNewTeam} placeholder="Ploeg" style="width:120px" />
              <DropDown data={specialityChoices} value={newSpeciality} onChange={setNewSpeciality} placeholder="Specialiteit" style="width:170px" />
              <Button icon="add" buttonStyle="Primary" variant="Outlined" title="Toevoegen" ariaLabel="Toevoegen" disabled={!newTeam || !newSpeciality} onClick={add} />
            </div>
          </div>
        )}

        <div className="demo-tpl-save">
          <TextBox value={templateName} onChange={setTemplateName} placeholder="Naam voor dit sjabloon" style="flex:1" />
          <Button
            text="Bewaar als sjabloon"
            icon="bookmark_add"
            buttonStyle="Secondary"
            variant="Outlined"
            size="Small"
            disabled={!templateName?.trim() || !role || !team || !speciality}
            onClick={saveTemplate}
          />
        </div>

        <style>{`
        .demo-tpl { display:flex; flex-wrap:wrap; gap:.35rem; margin-top:.25rem; }
        .demo-tpl-chip { cursor:pointer; }
        .demo-tpl-chip:hover { filter:brightness(.95); }
        .demo-tpl-active { outline:2px solid var(--rz-primary); }
        .demo-tpl-save { display:flex; gap:.5rem; align-items:center; }
    `}</style>

        {error && <div className="rz-color-danger">{error}</div>}
        <Stack orientation="Horizontal" justifyContent="End" gap="0.5rem">
          <Button text="Annuleren" buttonStyle="Light" onClick={() => dialogService.close()} />
          <Button
            text={initial ? 'Demo aanpassen' : 'Demo starten'}
            icon="visibility"
            buttonStyle="Primary"
            onClick={start}
            disabled={!role || !team || !speciality || busy}
          />
        </Stack>
      </Stack>
    </>
  )
}

// Vaste sjablonen, enkel met ploegen/specialiteiten die bestaan
function createBuiltInTemplates(teams: string[], specialities: string[]): DemoTemplate[] {
  const list: DemoTemplate[] = []
  const disp = AllTeamsSpeciality
  const first = teams.find(t => !hasNoRegime(t)) ?? teams[0]
  if (first === undefined) return list

  if (specialities.includes(disp)) {
    list.push({
      Name: 'Manager Dispatching – alle ploegen',
      Role: 'Manager',
      Team: first,
      Speciality: disp,
      Scopes: teams.filter(t => t !== first).map(t => ({ Team: t, Speciality: disp })),
    })
    list.push({ Name: `Medewerker Dispatching ${first}`, Role: 'User', Team: first, Speciality: disp, Scopes: [] })
    if (teams.includes(NoRegimeTeam)) list.push({ Name: `Medewerker Dispatching ${NoRegimeTeam}`, Role: 'User', Team: NoRegimeTeam, Speciality: disp, Scopes: [] })
  }
  const other = specialities.find(s => s !== disp)
  if (other !== undefined) {
    list.push({ Name: `Manager ${other} ${first}`, Role: 'Manager', Team: first, Speciality: other, Scopes: [] })
    list.push({ Name: `Medewerker ${other} ${first}`, Role: 'User', Team: first, Speciality: other, Scopes: [] })
  }
  return list
}
