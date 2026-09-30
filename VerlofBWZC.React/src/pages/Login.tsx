import { useEffect, useRef, useState } from 'react'
import { EditForm } from '../radzen/EditForm'
import { Button } from '../radzen/Button'
import { CheckBox, Label, Password, TextBox } from '../radzen/Inputs'
import { personApi, type LoginDTO } from '../api/person'
import * as tokens from '../auth/tokens'
import { markAuthenticated } from '../auth/AuthState'
import { installState, onInstallChanged, promptInstall, type InstallState } from '../services/install'
import { showInstallHelp } from '../layout/InstallHelpDialog'
import { RouterLink, useNavigateTo } from '../app/navigation'

// Zelfde als VerlofBWZC/Pages/Login.razor (@page "/login")
export function Login() {
  const navigateTo = useNavigateTo()
  const [model, setModel] = useState<LoginDTO>({ email: '', password: '', rememberMe: false })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [slow, setSlow] = useState(false)
  const busyRef = useRef(false)
  // Meteen bijwerken (niet pas na de volgende weergave): bij Enter komt het change-event vlak voor het verzenden
  const modelRef = useRef(model)
  const update = (patch: Partial<LoginDTO>) => {
    modelRef.current = { ...modelRef.current, ...patch }
    setModel(modelRef.current)
  }

  // App installeren (Blazor: pas na de eerste weergave, dus hier in een effect)
  const [install, setInstall] = useState<InstallState | null>(null)
  useEffect(() => {
    setInstall(installState())
    return onInstallChanged(() => setInstall(installState()))
  }, [])

  const installApp = async () => {
    if (install?.canPrompt) await promptInstall()
    else if (install) await showInstallHelp(install)
  }

  // "Ingelogd blijven" standaard aan op een gsm of in de geïnstalleerde app, uit op een pc
  useEffect(() => {
    try {
      const state = installState()
      update({ rememberMe: state.mobile || state.standalone })
    } catch {
      update({ rememberMe: false })
    }
  }, [])

  const handleLogin = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setErrorMessage(null)
    setBusy(true)
    setSlow(false)

    // Na 3 seconden extra uitleg tonen
    const timer = window.setTimeout(() => setSlow(true), 3000)
    const login = modelRef.current

    try {
      // Oude (demo-)sessie wissen en afmelden: een nieuwe login begint altijd zonder demo modus
      await tokens.logout()
      const result = await personApi.login(login)
      if (result.ok && result.value?.token?.trim()) {
        markAuthenticated(result.value.token, result.value.refreshToken, login.rememberMe)
        // Tijdelijk of zwak wachtwoord: eerst een nieuw kiezen (knop blijft "bezig" tot de pagina wisselt)
        navigateTo(result.value.mustChangePassword ? '/wachtwoord-wijzigen' : '/')
        return
      }
      setErrorMessage(result.error ?? 'Ongeldige inloggegevens.')
    } catch {
      setErrorMessage('De server is niet bereikbaar. Probeer het straks opnieuw.')
    } finally {
      window.clearTimeout(timer)
    }
    busyRef.current = false
    setBusy(false)
    setSlow(false)
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h3 className="text-center mb-2">Inloggen</h3>
        <EditForm onValidSubmit={handleLogin}>
          <div className="mb-3">
            <TextBox value={model.email} onChange={v => update({ email: v })} name="Email" placeholder="E-mail" style="width:100%" disabled={busy} />
          </div>
          <div className="mb-3">
            <Password value={model.password} onChange={v => update({ password: v })} name="Password" placeholder="Wachtwoord" style="width:100%" disabled={busy} />
          </div>
          <div className="login-remember">
            <CheckBox value={model.rememberMe} onChange={v => update({ rememberMe: v })} name="RememberMe" disabled={busy} />
            <Label text="Ingelogd blijven op dit toestel" component="RememberMe" />
            <div className="login-remember-hint">30 dagen, telkens verlengd als je de app gebruikt. Niet aanvinken op een gedeelde pc.</div>
          </div>
          <Button buttonType="submit" text="Inloggen" icon="login" buttonStyle="Primary" size="Large" isBusy={busy} busyText="Bezig met inloggen…" style="width:100%" />
          {busy && (
            // Feedback tijdens het wachten; na een paar seconden uitleg (server op Azure kan nog opstarten)
            <div className="login-wait" role="status" aria-live="polite">
              {slow ? 'Dit duurt even langer: de server wordt mogelijk opgestart. Even geduld…' : 'Je gegevens worden gecontroleerd…'}
            </div>
          )}
          {errorMessage && (
            <div className="login-error" role="alert">
              <i className="rzi">error</i> {errorMessage}
            </div>
          )}
        </EditForm>
        <div className="text-center mt-3">
          <RouterLink href="/registreren" className="reg-link">
            Nog geen account? Registreren
          </RouterLink>
          {install && !install.standalone && (
            // Op elk toestel: de Verlofplanner als app installeren (installatievraag of uitleg)
            <div className="mt-2">
              <button type="button" className="reg-link login-install" onClick={installApp}>
                <i className="bi bi-phone" aria-hidden="true" /> Installeer als app
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
