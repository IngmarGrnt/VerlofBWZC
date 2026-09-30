// Vaste regels uit VerlofBWZC.DataContracts (PasswordPolicy.cs, Werkregels.cs, RegisterDTO.cs).
// Wijzigt een regel daar, dan ook hier aanpassen (de API blijft bindend; dit is enkel voor meteen feedback).

// --- PasswordPolicy ---------------------------------------------------------------------------
export const PasswordMinLength = 8
export const PasswordMaxLength = 128

const blocked = [
  'root1234', '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000',
  'password', 'password1', 'wachtwoord', 'wachtwoord1', 'azerty123', 'qwerty123', 'abcd1234',
  'welkom01', 'welkom123', 'brandweer', 'brandweer1', 'brandweer123', 'verlof123', 'planner1',
]

// null = in orde, anders de reden (Nederlands, voor de gebruiker)
export function validatePassword(password: string | null | undefined, email?: string | null, firstName?: string | null, lastName?: string | null): string | null {
  if (!password || password.length < PasswordMinLength) return `Het wachtwoord moet minstens ${PasswordMinLength} tekens lang zijn.`
  if (password.length > PasswordMaxLength) return `Het wachtwoord mag maximaal ${PasswordMaxLength} tekens lang zijn.`

  const lower = password.toLowerCase()
  if (blocked.includes(lower)) return 'Dit wachtwoord is te voor de hand liggend. Kies een ander.'
  if (new Set(password).size < 4) return 'Gebruik meer verschillende tekens in je wachtwoord.'

  const localPart = email?.split('@')[0].toLowerCase()
  if (localPart && localPart.trim() && localPart.length >= 3 && lower.includes(localPart)) return 'Het wachtwoord mag je e-mailadres niet bevatten.'
  for (const name of [firstName, lastName]) {
    const n = name?.replaceAll(' ', '').toLowerCase()
    if (n && n.trim() && n.length >= 3 && lower.replaceAll(' ', '').includes(n)) return 'Het wachtwoord mag je naam niet bevatten.'
  }
  return null
}

// --- RegistrationRules ------------------------------------------------------------------------
export const RegistrationEmailDomain = '@bwzc.be'
export const RegistrationTeam = 'Ploeg1'

// --- Werkregels -------------------------------------------------------------------------------
export const NoRegimeTeam = 'Ploeg0'
export const hasNoRegime = (team: string | null | undefined) => team === NoRegimeTeam
export const AllTeamsSpeciality = 'Dispatching'

// "Per 2 shiften" (dagshift + nachtshift erna) en loting per paar gelden niet voor de ploeg zonder werkregime
export const pairRulesApply = (team: string | null | undefined) => !hasNoRegime(team)
export const lotteryPerShift = (team: string | null | undefined) => hasNoRegime(team)
// Rust aanduiden: enkel voor de ploeg zonder werkregime
export const allowsRestShifts = (team: string | null | undefined) => hasNoRegime(team)

// Andere afwezigheden en uurcodes (enkel Dispatching). absent = false: uurcode, telt als aanwezig
export interface OtherAbsence {
  code: string
  name: string
  absent: boolean
}
export const OtherAbsences: readonly OtherAbsence[] = [
  { code: 'AOV', name: 'Aanvraag onbetaald verlof', absent: true },
  { code: 'OV', name: 'Onbetaald verlof', absent: true },
  { code: 'ZK', name: 'Ziek', absent: true },
  { code: 'OUD', name: 'Ouderschapsverlof', absent: true },
  { code: 'O1', name: 'Omstandigheidsverlof', absent: true },
  { code: 'DV', name: 'Dienstvrijstelling', absent: true },
  { code: 'APL', name: 'Andere ploeg/plaats', absent: true },
  { code: 'AFL', name: 'Afgelost', absent: true },
  { code: '3U/', name: 'Eerste 3 uur verlof', absent: false },
  { code: '6U/', name: 'Eerste 6 uur verlof', absent: false },
  { code: '9U/', name: 'Eerste 9 uur verlof', absent: false },
  { code: '/3U', name: 'Laatste 3 uur verlof', absent: false },
  { code: '/6U', name: 'Laatste 6 uur verlof', absent: false },
  { code: '/9U', name: 'Laatste 9 uur verlof', absent: false },
]
export const allowsOtherAbsences = (speciality: string | null | undefined) => speciality === AllTeamsSpeciality
export const findOtherAbsence = (code: string | null | undefined): OtherAbsence | null =>
  code == null ? null : (OtherAbsences.find(a => a.code === code) ?? null)

// Telt deze ploeg mee voor de bezetting van een andere ploeg die dezelfde shift werkt? (niet Ploeg0)
export const countsForOtherTeamsOccupancy = (team: string | null | undefined) => !hasNoRegime(team)
// Een manager van Dispatching telt niet mee in de bezetting
export const NotStaffRole = 'Manager'
export const countsAsStaff = (speciality: string | null | undefined, role: string | null | undefined) =>
  !(speciality === AllTeamsSpeciality && role === NotStaffRole)

// Teamkalender "Alle ploegen"
export const MinTeamsForAllTeamsView = 2
export const allowsAllTeamsView = (speciality: string | null | undefined) => speciality === AllTeamsSpeciality

// Extra shift (bijspringen in een andere ploeg)
export const allowsExtraShifts = (speciality: string | null | undefined) => speciality === AllTeamsSpeciality
export const ExtraShiftQuotaBonus = 1
export const extraShiftAllowedOnOwnShift = (team: string | null | undefined) => hasNoRegime(team)

// Maximum per shift zonder regel: een kwart van de personen, minstens 1 (ShiftQuotaDTO.DefaultFor)
export const defaultShiftQuota = (members: number) => Math.max(1, Math.trunc(members / 4))

// --- ManagerScopesDialog ----------------------------------------------------------------------
export const AllSpecialitiesLabel = 'Alle specialiteiten'
export const chipText = (team: string | null | undefined, speciality: string | null | undefined) =>
  !speciality ? `${team} · alle specialiteiten` : `${team} · ${speciality}`

// --- PersonInitials ---------------------------------------------------------------------------
// Standaardregel op de achternaam: samengestelde naam = 2 letters van het eerste deel + 1 van het tweede
// (De Leenheer -> DEL), anders de eerste 3 letters (Baute -> BAU). Per persoon aanpasbaar.
export const InitialsMaxLength = 10

export function initialsFromLastName(lastName: string | null | undefined): string {
  const last = lastName?.trim()
  if (!last) return ''
  const parts = last.split(' ').filter(p => p.length > 0)
  if (parts.length >= 2) return (parts[0].slice(0, 2) + parts[1][0]).toUpperCase()
  return last.slice(0, 3).toUpperCase()
}

// Opgeslagen initialen, of anders de standaardregel (PersonInitials.For)
export const initialsFor = (person: { initials?: string | null; lastName?: string | null } | null | undefined): string =>
  !person ? '' : person.initials?.trim() ? person.initials.trim() : initialsFromLastName(person.lastName)

// Invoer opschonen: hoofdletters, geen spaties, max. lengte; leeg = standaardregel (PersonInitials.Normalize)
export function normalizeInitials(initials: string | null | undefined, lastName: string | null | undefined): string {
  let value = (initials ?? '').replaceAll(' ', '').trim().toUpperCase()
  if (value.length > InitialsMaxLength) value = value.slice(0, InitialsMaxLength)
  return value.length > 0 ? value : initialsFromLastName(lastName)
}

// --- PersonDefaults ---------------------------------------------------------------------------
// Standaard aantal verlofshiften per jaar voor een nieuwe persoon
export const DefaultLeaveAllowance = 44
