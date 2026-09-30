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

// --- ManagerScopesDialog ----------------------------------------------------------------------
export const AllSpecialitiesLabel = 'Alle specialiteiten'
export const chipText = (team: string | null | undefined, speciality: string | null | undefined) =>
  !speciality ? `${team} · alle specialiteiten` : `${team} · ${speciality}`
