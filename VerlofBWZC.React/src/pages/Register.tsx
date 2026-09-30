import { useEffect, useRef, useState } from 'react'
import { EditForm } from '../radzen/EditForm'
import { Button } from '../radzen/Button'
import { DropDown } from '../radzen/DropDown'
import { Password, TextBox } from '../radzen/Inputs'
import { getJson } from '../api/http'
import { personApi, type RegisterDTO } from '../api/person'
import { PasswordMinLength, RegistrationEmailDomain, RegistrationTeam, validatePassword } from '../rules'
import { RouterLink, useNavigateTo, usePageTitle } from '../app/navigation'

// Zelfde als VerlofBWZC/Pages/Register.razor (@page "/registreren")
export function Register() {
  usePageTitle('Registreren')
  const navigateTo = useNavigateTo()
  const model = useRef<RegisterDTO>({ firstName: '', lastName: '', email: '', speciality: '', grade: '', password: '' })
  const confirm = useRef('')
  const [pwInput, setPwInput] = useState('')
  const [, setVersion] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [specialities, setSpecialities] = useState<string[]>([])
  const [grades, setGrades] = useState<string[]>([])

  const m = model.current
  const policyError = validatePassword(pwInput, m.email, m.firstName, m.lastName)
  const set = (patch: Partial<RegisterDTO>) => {
    model.current = { ...model.current, ...patch }
    setVersion(v => v + 1)
  }

  useEffect(() => {
    void (async () => {
      try {
        setSpecialities((await getJson<string[] | null>('api/meta/specialities')) ?? [])
        setGrades((await getJson<string[] | null>('api/meta/grades')) ?? [])
      } catch {
        setErrorMessage('De server is niet bereikbaar. Probeer het later opnieuw.')
      }
    })()
  }, [])

  const submit = async () => {
    setErrorMessage(null)
    set({ email: model.current.email?.trim() ?? '' })
    const r = model.current
    let error: string | null = null
    if (!r.firstName?.trim() || !r.lastName?.trim()) error = 'Vul je voornaam en naam in.'
    else if (!r.email.toLowerCase().endsWith(RegistrationEmailDomain.toLowerCase())) error = `Gebruik je e-mailadres van de zone (${RegistrationEmailDomain}).`
    else if (!r.speciality || !r.grade) error = 'Kies je specialiteit en graad.'
    else error = validatePassword(r.password, r.email, r.firstName, r.lastName) ?? (r.password !== confirm.current ? 'De wachtwoorden komen niet overeen.' : null)
    if (error !== null) {
      setErrorMessage(error)
      return
    }

    setBusy(true)
    const result = await personApi.register(r)
    setBusy(false)
    if (result.ok) setDone(true)
    else setErrorMessage(result.error)
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h3 className="text-center mb-2">Registreren</h3>

        {done ? (
          <>
            <p className="reg-done">
              <i className="rzi">mark_email_read</i>
              Je aanvraag is verstuurd. Zodra een verantwoordelijke ze goedkeurt, kan je inloggen met je e-mailadres en wachtwoord.
            </p>
            <Button text="Naar inloggen" style="width:100%" onClick={() => navigateTo('/login')} />
          </>
        ) : (
          <>
            <p className="pw-hint reg-intro">Na je registratie keurt een verantwoordelijke je account goed.</p>
            <EditForm onValidSubmit={submit}>
              <div className="reg-row">
                <div className="mb-3">
                  <label className="pw-label" htmlFor="firstName">
                    Voornaam
                  </label>
                  <TextBox value={m.firstName} onChange={v => set({ firstName: v })} name="firstName" style="width:100%" autoComplete="given-name" maxLength={100} />
                </div>
                <div className="mb-3">
                  <label className="pw-label" htmlFor="lastName">
                    Naam
                  </label>
                  <TextBox value={m.lastName} onChange={v => set({ lastName: v })} name="lastName" style="width:100%" autoComplete="family-name" maxLength={100} />
                </div>
              </div>
              <div className="mb-3">
                <label className="pw-label" htmlFor="email">
                  E-mail ({RegistrationEmailDomain})
                </label>
                <TextBox value={m.email} onChange={v => set({ email: v })} name="email" style="width:100%" autoComplete="email" placeholder={`voornaam.naam${RegistrationEmailDomain}`} />
              </div>
              <div className="reg-row">
                <div className="mb-3">
                  <label className="pw-label">Ploeg</label>
                  <div className="reg-fixed">{RegistrationTeam}</div>
                </div>
                <div className="mb-3">
                  <label className="pw-label" htmlFor="speciality">
                    Specialiteit
                  </label>
                  <DropDown data={specialities} value={m.speciality} onChange={v => set({ speciality: v ?? '' })} name="speciality" placeholder="Kies" style="width:100%" />
                </div>
              </div>
              <div className="mb-3">
                <label className="pw-label" htmlFor="grade">
                  Graad
                </label>
                <DropDown data={grades} value={m.grade} onChange={v => set({ grade: v ?? '' })} name="grade" placeholder="Kies" style="width:100%" />
              </div>
              <div className="mb-3">
                <label className="pw-label" htmlFor="password">
                  Wachtwoord
                </label>
                <Password value={m.password} onChange={v => set({ password: v })} onInput={setPwInput} name="password" style="width:100%" autoComplete="new-password" />
                <div className={policyError === null && pwInput.length > 0 ? 'pw-hint pw-ok' : 'pw-hint'}>
                  {pwInput.length === 0 ? `Minstens ${PasswordMinLength} tekens, niet je naam of e-mailadres.` : (policyError ?? 'Sterk genoeg.')}
                </div>
              </div>
              <div className="mb-3">
                <label className="pw-label" htmlFor="confirm">
                  Herhaal wachtwoord
                </label>
                <Password
                  value={confirm.current}
                  onChange={v => {
                    confirm.current = v
                    setVersion(x => x + 1)
                  }}
                  name="confirm"
                  style="width:100%"
                  autoComplete="new-password"
                />
              </div>
              <Button buttonType="submit" text="Registreren" icon="person_add" style="width:100%" disabled={busy} />
              {errorMessage && <div className="text-danger mt-3 text-center">{errorMessage}</div>}
            </EditForm>
            <div className="text-center mt-3">
              <RouterLink href="/login" className="reg-link">
                Heb je al een account? Inloggen
              </RouterLink>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
