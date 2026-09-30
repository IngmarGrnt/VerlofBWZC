import { useState } from 'react'
import { Button } from '../radzen/Button'
import { dialogService } from '../radzen/Dialog'

// Zelfde als VerlofBWZC/Pages/TemporaryPasswordDialog.razor.
// Tijdelijk wachtwoord: wordt maar één keer getoond; de persoon moet het bij de eerste login wijzigen
function TemporaryPasswordDialog({ personName, password }: { personName: string; password: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="tp">
      <p className="uc-text">
        Tijdelijk wachtwoord voor <strong>{personName}</strong>. Geef het persoonlijk door. Bij de eerste login moet {personName} een eigen wachtwoord kiezen.
      </p>
      <div className="tp-box">
        <code className="tp-code">{password}</code>{' '}
        <Button icon={copied ? 'check' : 'content_copy'} text={copied ? 'Gekopieerd' : 'Kopiëren'} buttonStyle="Light" size="Small" onClick={copy} />
      </div>
      <p className="tl-hint">Dit wachtwoord wordt nergens bewaard en is later niet meer op te vragen. Kwijt? Reset het wachtwoord opnieuw.</p>
      <div className="uc-actions">
        <Button text="Sluiten" buttonStyle="Primary" onClick={() => dialogService.close()} />
      </div>
    </div>
  )
}

export const showTemporaryPassword = (personName: string, password: string) =>
  dialogService.open('Tijdelijk wachtwoord', <TemporaryPasswordDialog personName={personName} password={password} />, {
    width: '460px',
    closeDialogOnEsc: false,
    closeDialogOnOverlayClick: false,
  })
