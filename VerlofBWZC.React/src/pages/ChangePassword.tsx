import { useRef, useState } from 'react'
import { EditForm } from '../radzen/EditForm'
import { Button } from '../radzen/Button'
import { Password } from '../radzen/Inputs'
import { notificationService } from '../radzen/Notification'
import { personApi, type ChangePasswordDTO } from '../api/person'
import * as tokens from '../auth/tokens'
import { getClaim, mustChangePassword } from '../auth/jwt'
import { markAuthenticated, markLoggedOut } from '../auth/AuthState'
import { PasswordMinLength, validatePassword } from '../rules'
import { useNavigateTo, usePageTitle } from '../app/navigation'

// Zelfde als VerlofBWZC/Pages/ChangePassword.razor (@page "/wachtwoord-wijzigen", [Authorize])
export function ChangePassword() {
  usePageTitle('Wachtwoord wijzigen')
  const navigateTo = useNavigateTo()
  const model = useRef<ChangePasswordDTO>({ currentPassword: '', newPassword: '', rememberMe: false })
  const confirm = useRef('')
  const [newInput, setNewInput] = useState('')
  const [, setVersion] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [{ forced, email }] = useState(() => {
    const token = tokens.getItem(tokens.AuthTokenKey)
    return { forced: mustChangePassword(token), email: getClaim(token, 'email') }
  })

  const policyError = validatePassword(newInput, email)
  const set = (patch: Partial<ChangePasswordDTO>) => {
    model.current = { ...model.current, ...patch }
    setVersion(v => v + 1)
  }

  const save = async () => {
    setErrorMessage(null)
    const m = model.current
    if (m.newPassword !== confirm.current) {
      setErrorMessage('De nieuwe wachtwoorden komen niet overeen.')
      return
    }
    const policy = validatePassword(m.newPassword, email)
    if (policy) {
      setErrorMessage(policy)
      return
    }

    set({ rememberMe: tokens.getRemember() })
    setBusy(true)
    const result = await personApi.changePassword(model.current)
    setBusy(false)
    if (!result.ok || !result.value) {
      setErrorMessage(result.error)
      return
    }

    // Nieuw, volwaardig token en vernieuwingstoken (andere toestellen zijn afgemeld)
    markAuthenticated(result.value.token, result.value.refreshToken)
    notificationService.notify('Success', 'Wachtwoord gewijzigd', 'Je nieuwe wachtwoord is opgeslagen.')
    navigateTo('/', forced)
  }

  const logout = async () => {
    await markLoggedOut()
    navigateTo('/login')
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h3 className="text-center mb-2">Wachtwoord wijzigen</h3>
        {forced && <p className="pw-intro">Je logt in met een tijdelijk of te zwak wachtwoord. Kies eerst een nieuw wachtwoord dat alleen jij kent.</p>}
        <EditForm onValidSubmit={save}>
          <div className="mb-3">
            <label className="pw-label" htmlFor="current">
              {forced ? 'Tijdelijk / huidig wachtwoord' : 'Huidig wachtwoord'}
            </label>
            <Password value={model.current.currentPassword} onChange={v => set({ currentPassword: v })} name="current" style="width:100%" autoComplete="current-password" />
          </div>
          <div className="mb-3">
            <label className="pw-label" htmlFor="new">
              Nieuw wachtwoord
            </label>
            <Password
              value={model.current.newPassword}
              onChange={v => set({ newPassword: v })}
              onInput={v => setNewInput(v)}
              name="new"
              style="width:100%"
              autoComplete="new-password"
            />
            <div className={policyError === null && newInput.length > 0 ? 'pw-hint pw-ok' : 'pw-hint'}>
              {newInput.length === 0
                ? `Minstens ${PasswordMinLength} tekens, niet je naam of e-mailadres. Een zin werkt goed, bv. 'mijn fiets is blauw'.`
                : (policyError ?? 'Sterk genoeg.')}
            </div>
          </div>
          <div className="mb-3">
            <label className="pw-label" htmlFor="confirm">
              Herhaal nieuw wachtwoord
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
          <Button buttonType="submit" text="Wachtwoord opslaan" icon="lock" style="width:100%" disabled={busy} />
          {errorMessage && <div className="text-danger mt-3 text-center">{errorMessage}</div>}
          {forced && (
            <div className="text-center mt-3">
              <Button text="Afmelden" buttonStyle="Light" size="Small" onClick={logout} />
            </div>
          )}
        </EditForm>
      </div>
    </div>
  )
}
