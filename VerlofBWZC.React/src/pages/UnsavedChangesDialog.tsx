import { Button } from '../radzen/Button'
import { dialogService } from '../radzen/Dialog'

// Zelfde als VerlofBWZC/Pages/UnsavedChangesDialog.razor.
// Vraag bij niet-opgeslagen wijzigingen: opslaan, niet opslaan of terug. Resultaat: "save", "discard" of null.
function UnsavedChangesDialog({ message = 'Je hebt niet-opgeslagen wijzigingen.' }: { message?: string }) {
  return (
    <div className="uc">
      <p className="uc-text">{message}</p>
      <div className="uc-actions">
        <Button text="Annuleren" buttonStyle="Light" onClick={() => dialogService.close(null)} />{' '}
        <Button text="Niet opslaan" buttonStyle="Danger" variant="Outlined" onClick={() => dialogService.close('discard')} />{' '}
        <Button text="Opslaan" icon="save" buttonStyle="Primary" onClick={() => dialogService.close('save')} />
      </div>
    </div>
  )
}

// Toont de vraag; geeft "save", "discard" of null (annuleren) terug
export async function askUnsavedChanges(message: string): Promise<string | null> {
  const result = await dialogService.open<string | null>('Niet-opgeslagen wijzigingen', <UnsavedChangesDialog message={message} />, {
    width: '460px',
    closeDialogOnEsc: true,
    showClose: true,
  })
  return typeof result === 'string' ? result : null
}
