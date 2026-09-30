import { useEffect, useState } from 'react'
import { Button } from '../radzen/Button'
import { installState, isSnoozed, onInstallChanged, promptInstall, snooze, type InstallState } from '../services/install'
import { showInstallHelp } from './InstallHelpDialog'

// Zelfde als VerlofBWZC/Layout/InstallBanner.razor.
// Gsm: voorstel om de Verlofplanner als app te installeren. Niet als ze al als app open is of na "Later" (2 weken).
export function InstallBanner() {
  const [state, setState] = useState<InstallState | null>(null)
  const [snoozed, setSnoozed] = useState(false)

  useEffect(() => {
    setState(installState())
    setSnoozed(isSnoozed())
    return onInstallChanged(() => setState(installState()))
  }, [])

  // Op gsm altijd tonen zolang de app niet geïnstalleerd is (met Installeren of met uitleg)
  if (!state || !(state.mobile && !state.standalone && !snoozed)) return null

  const later = () => {
    snooze()
    setSnoozed(true)
  }

  const install = async () => {
    const outcome = await promptInstall()
    if (outcome === 'dismissed') later()
  }

  return (
    <div className="install-banner" role="region" aria-label="App installeren">
      <img src="icon-192.png" alt="" width={36} height={36} className="install-icon" />
      <div className="install-text">
        <strong>Verlofplanner als app</strong>
        {state.canPrompt ? (
          <span>Zet de Verlofplanner op je beginscherm.</span>
        ) : state.ios ? (
          <span>
            Tik op <strong>Delen</strong> <i className="bi bi-box-arrow-up" aria-hidden="true" /> en kies <strong>Zet op beginscherm</strong>.
          </span>
        ) : (
          // Android zonder installatievraag van de browser (nog niet aangeboden, eerder geweigerd of andere browser)
          <span>
            Tik in het browsermenu <strong>⋮</strong> op <strong>App installeren</strong> of <strong>Toevoegen aan startscherm</strong>.
          </span>
        )}
      </div>
      <div className="install-actions">
        {state.canPrompt ? (
          <Button text="Installeren" icon="install_mobile" buttonStyle="Primary" size="Small" onClick={install} />
        ) : (
          <Button text="Hoe?" buttonStyle="Primary" variant="Outlined" size="Small" onClick={() => showInstallHelp(state)} />
        )}
        <Button text="Later" buttonStyle="Light" size="Small" onClick={later} />
      </div>
    </div>
  )
}
