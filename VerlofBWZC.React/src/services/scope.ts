import { getJson } from '../api/http'
import type { ScopeItemDTO } from './demo'

// Zelfde als VerlofBWZC/Services/ScopeService.cs: welke ploegen en specialiteiten de ingelogde gebruiker mag kiezen.
// Admin: alles. Manager: zijn eigen ploeg + specialiteit en wat de Admin hem gaf. Anderen: enkel de eigen.
// view = true: enkel bekijken (teamkalender). Dan komen er bij Dispatching alle ploegen bij als het
// Manager Paneel dat toelaat (ViewScopes). Nooit gebruiken voor schermen waar je iets beheert.

export interface MyScopeDTO {
  isAdmin: boolean
  scopes: ScopeItemDTO[]
  viewScopes: ScopeItemDTO[]
}

export const AllSpecialities = 'Alle specialiteiten'

// Eén exemplaar per pagina (Blazor: scoped service = per app; hier gedeeld zolang de app open is)
let scope: MyScopeDTO | null = null
let allTeams: string[] | null = null
let allSpecialities: string[] | null = null

const items = (view: boolean): ScopeItemDTO[] => (view && (scope?.viewScopes.length ?? 0) > 0 ? scope!.viewScopes : (scope?.scopes ?? []))

export const scopeService = {
  get isAdmin() {
    return scope?.isAdmin ?? false
  },

  // Meer dan één keuze: dan tonen de schermen keuzelijsten
  get hasChoice() {
    return hasChoiceFor(false)
  },
  get hasViewChoice() {
    return hasChoiceFor(true)
  },

  async load(refresh = false) {
    if (scope && !refresh) return
    scope = (await getJson<MyScopeDTO | null>('api/meta/my-scope')) ?? { isAdmin: false, scopes: [], viewScopes: [] }
    allTeams ??= (await getJson<string[] | null>('api/meta/teams')) ?? []
    allSpecialities ??= (await getJson<string[] | null>('api/meta/specialities')) ?? []
  },

  // Na afmelden/inloggen of demo modus: opnieuw ophalen
  reset() {
    scope = null
  },

  get teams() {
    return teamsOf(false)
  },
  get viewTeams() {
    return teamsOf(true)
  },
  get allSpecialityNames() {
    return allSpecialities ?? []
  },

  // Specialiteiten die binnen een ploeg gekozen mogen worden
  specialitiesFor(team: string | null | undefined, view = false): string[] {
    if (scopeService.isAdmin || scopeService.canSeeAllSpecialities(team, view)) return allSpecialities ?? []
    const specs = items(view)
      .filter(s => s.team === team && s.speciality != null)
      .map(s => s.speciality!)
    return [...new Set(specs)].sort((a, b) => (allSpecialities ?? []).indexOf(a) - (allSpecialities ?? []).indexOf(b))
  },

  // Ploegen waarvan de gebruiker deze specialiteit mag zien (teamkalender "Alle ploegen")
  teamsFor(speciality: string | null | undefined, view = false): string[] {
    return scopeService.isAdmin ? (allTeams ?? []) : teamsOf(view).filter(t => scopeService.covers(t, speciality, view))
  },

  // "Alle specialiteiten" van een ploeg (teamkalender)
  canSeeAllSpecialities(team: string | null | undefined, view = false): boolean {
    return scopeService.isAdmin || items(view).some(s => s.team === team && s.speciality == null)
  },

  // Valt een (ploeg, specialiteit) onder de scopes?
  covers(team: string | null | undefined, speciality: string | null | undefined, view = false): boolean {
    return scopeService.isAdmin || items(view).some(s => s.team === team && (s.speciality == null || s.speciality === speciality))
  },

  // Geldige keuze na het wisselen van ploeg: huidige specialiteit behouden als dat mag, anders de eerste
  fixSpeciality(team: string | null | undefined, speciality: string | null | undefined, allowAll = false, view = false): string | null {
    if (allowAll && speciality === AllSpecialities && scopeService.canSeeAllSpecialities(team, view)) return speciality
    const options = scopeService.specialitiesFor(team, view)
    return options.includes(speciality ?? '') ? (speciality ?? null) : (options[0] ?? null)
  },
}

function hasChoiceFor(view: boolean) {
  return scopeService.isAdmin || items(view).length > 1 || items(view).some(s => s.speciality == null)
}

function teamsOf(view: boolean): string[] {
  if (scopeService.isAdmin) return allTeams ?? []
  const teams = [...new Set(items(view).map(s => s.team))]
  // Zoals OrderBy(IndexOf): onbekende ploegen (-1) eerst
  return teams.sort((a, b) => (allTeams ?? []).indexOf(a) - (allTeams ?? []).indexOf(b))
}
