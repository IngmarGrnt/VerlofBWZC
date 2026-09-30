import { Button } from '../radzen/Button'
import { Stack } from '../radzen/Layout'
import { dialogService } from '../radzen/Dialog'
import type { InstallState } from '../services/install'

// Zelfde als VerlofBWZC/Layout/InstallHelpDialog.razor: uitleg om de Verlofplanner als app op het beginscherm te zetten
function InstallHelpDialog({ ios, mobile }: { ios: boolean; mobile: boolean }) {
  return (
    <div className="ih">
      <div className="ih-app">
        <img src="icon-192.png" alt="" width={48} height={48} />
        <div>
          <div className="ih-app-name">Verlofplanner</div>
          <div className="ih-app-sub">Opent als app, zonder adresbalk</div>
        </div>
      </div>

      <section className={ios ? 'ih-step ih-step-mine' : 'ih-step'}>
        <h3>
          <i className="bi bi-apple" aria-hidden="true" /> iPhone of iPad (Safari)
        </h3>
        <ol>
          <li>
            Tik onderaan op <strong>Delen</strong> <i className="bi bi-box-arrow-up" aria-hidden="true" />.
          </li>
          <li>
            Kies <strong>Zet op beginscherm</strong> <i className="bi bi-plus-square" aria-hidden="true" />.
          </li>
          <li>
            Tik op <strong>Voeg toe</strong>.
          </li>
        </ol>
      </section>

      <section className={!ios && mobile ? 'ih-step ih-step-mine' : 'ih-step'}>
        <h3>
          <i className="bi bi-android2" aria-hidden="true" /> Android (Chrome)
        </h3>
        <ol>
          <li>
            Tik rechtsboven op het menu <strong>⋮</strong>.
          </li>
          <li>
            Kies <strong>App installeren</strong> of <strong>Toevoegen aan startscherm</strong>.
          </li>
        </ol>
      </section>

      <section className={!mobile ? 'ih-step ih-step-mine' : 'ih-step'}>
        <h3>
          <i className="bi bi-laptop" aria-hidden="true" /> Pc (Chrome of Edge)
        </h3>
        <ol>
          <li>
            Klik in de adresbalk op het icoon <strong>Installeren</strong> <i className="bi bi-download" aria-hidden="true" />{', of kies in het menu '}
            <strong>App installeren</strong>.
          </li>
        </ol>
      </section>

      <Stack orientation="Horizontal" justifyContent="End">
        <Button text="Sluiten" buttonStyle="Light" onClick={() => dialogService.close()} />
      </Stack>
    </div>
  )
}

export const showInstallHelp = (state: InstallState) =>
  dialogService.open('App installeren', <InstallHelpDialog ios={state.ios} mobile={state.mobile} />, {
    width: '460px',
    closeDialogOnEsc: true,
    closeDialogOnOverlayClick: true,
  })
