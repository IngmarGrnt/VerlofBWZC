import { errorText, getJson, postJson, send } from './http'
import type { LoginResultDTO } from '../auth/tokens'

// Zelfde als VerlofBWZC/Services/PersonApiService.cs (voorlopig de delen die de schermen van stap 1 gebruiken)

export interface PersonBaseDTO {
  id: number
  firstName: string
  lastName: string
  email: string
  team: string
  speciality: string
  grade: string
  role: string
  leaveAllowance?: number | null
  initials?: string | null
  mustChangePassword: boolean
  isApproved: boolean
  registeredAtUtc?: string | null
}

export interface LoginDTO {
  email: string
  password: string
  rememberMe: boolean
}

export interface ChangePasswordDTO {
  currentPassword: string
  newPassword: string
  rememberMe: boolean
}

export interface RegisterDTO {
  firstName: string
  lastName: string
  email: string
  speciality: string
  grade: string
  password: string
}

// Resultaat met de foutmelding van de server (Nederlands) als het mislukt
export type Result<T> = { ok: true; value: T | null; error: null } | { ok: false; value: null; error: string }
const ok = <T>(value: T | null): Result<T> => ({ ok: true, value, error: null })
const fail = <T>(error: string): Result<T> => ({ ok: false, value: null, error })

const readJson = async <T>(response: Response): Promise<T | null> => {
  const text = await response.text()
  return text ? (JSON.parse(text) as T) : null
}

export interface PersonCreateDTO {
  firstName: string
  lastName: string
  email: string
  team: string
  speciality: string
  grade: string
  role: string
  leaveAllowance?: number | null
  initials?: string | null
  password?: string | null
  passwordHash?: string
  salt?: string
}

export interface TemporaryPasswordDTO {
  personId: number
  temporaryPassword: string
}

const postResult = async (path: string, fallback: string): Promise<Result<boolean>> => {
  try {
    const response = await send(path, { method: 'POST' })
    return response.ok ? ok(true) : fail(await errorText(response, fallback))
  } catch (ex) {
    return fail(ex instanceof Error ? ex.message : String(ex))
  }
}

export const personApi = {
  getPersonById: (id: number) => getJson<PersonBaseDTO | null>(`api/person/${id}`),

  // Admin/Manager: nieuw tijdelijk wachtwoord (eenmalig getoond)
  async resetPassword(id: number): Promise<Result<TemporaryPasswordDTO>> {
    try {
      const response = await send(`api/person/${id}/reset-password`, { method: 'POST' })
      if (response.ok) return ok(await readJson<TemporaryPasswordDTO>(response))
      return fail(await errorText(response, 'Wachtwoord resetten is mislukt.'))
    } catch (ex) {
      return fail(ex instanceof Error ? ex.message : String(ex))
    }
  },

  // Registraties die wachten op goedkeuring (Admin/Manager)
  async getPending(): Promise<PersonBaseDTO[]> {
    try {
      return (await getJson<PersonBaseDTO[] | null>('api/person/pending')) ?? []
    } catch {
      return []
    }
  },

  approve: (id: number) => postResult(`api/person/${id}/approve`, 'Goedkeuren is mislukt.'),
  reject: (id: number) => postResult(`api/person/${id}/reject`, 'Weigeren is mislukt.'),

  getAllPersons: () => getJson<PersonBaseDTO[] | null>('api/allPersons'),

  // Nieuwe persoon; de server maakt een tijdelijk wachtwoord aan
  async createPerson(person: PersonCreateDTO): Promise<Result<TemporaryPasswordDTO>> {
    try {
      const response = await postJson('api/person', person)
      if (response.ok) return ok(await readJson<TemporaryPasswordDTO>(response))
      return fail(await errorText(response, 'Toevoegen is mislukt.'))
    } catch (ex) {
      return fail(ex instanceof Error ? ex.message : String(ex))
    }
  },

  async updatePerson(id: number, person: PersonCreateDTO): Promise<boolean> {
    const response = await postJson(`api/person/update/${id}`, person)
    return response.ok
  },

  async deletePerson(id: number): Promise<boolean> {
    const response = await send(`api/person/${id}`, { method: 'DELETE' })
    return response.ok
  },

  async login(login: LoginDTO): Promise<Result<LoginResultDTO>> {
    try {
      const response = await postJson('api/person/login', login)
      if (response.ok) return ok(await readJson<LoginResultDTO>(response))
      return fail(await errorText(response, 'Ongeldige inloggegevens.'))
    } catch {
      return fail('De server is niet bereikbaar. Probeer het later opnieuw.')
    }
  },

  // Eigen wachtwoord wijzigen; geeft een nieuw token terug
  async changePassword(dto: ChangePasswordDTO): Promise<Result<LoginResultDTO>> {
    try {
      const response = await postJson('api/person/change-password', dto)
      if (response.ok) return ok(await readJson<LoginResultDTO>(response))
      return fail(await errorText(response, 'Wachtwoord wijzigen is mislukt.'))
    } catch (ex) {
      return fail(ex instanceof Error ? ex.message : String(ex))
    }
  },

  // Zelf registreren (zonder login)
  async register(dto: RegisterDTO): Promise<Result<boolean>> {
    try {
      const response = await postJson('api/person/register', dto)
      if (response.ok) return ok(true)
      if (response.status === 429) return fail('Te veel aanvragen. Probeer het over enkele minuten opnieuw.')
      return fail(await errorText(response, 'Registreren is mislukt.'))
    } catch {
      return fail('De server is niet bereikbaar. Probeer het later opnieuw.')
    }
  },
}
