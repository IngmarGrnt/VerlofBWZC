import { Button } from '../radzen/Button'
import { Stack } from '../radzen/Layout'
import { dialogService } from '../radzen/Dialog'
import { OtherAbsences } from '../rules'

// Zelfde als VerlofBWZC/Pages/OtherAbsenceDialog.razor.
// Andere afwezigheid of uurcode kiezen voor één shift (Dispatching). Sluit met de code, "" = weghalen, null = annuleren.
export interface OtherAbsenceDialogProps {
  personName: string
  shiftText: string
  currentCode?: string | null
  hasLeave?: boolean
  hasRest?: boolean
}

const css = `
    .oa-who { font-weight:600; color:var(--bwzc-navy); margin-bottom:.5rem; }
    .oa-warn { font-size:.8rem; color:#8A5A00; background:#FFF6E0; border-radius:6px; padding:.35rem .5rem; margin-bottom:.5rem; display:flex; gap:.35rem; align-items:center; }
    .oa-warn .rzi { font-size:16px; }
    .oa-sub { font-weight:400; color:var(--rz-text-secondary-color); }
    .oa-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:.35rem; margin-bottom:.5rem; }
    .oa-btn { display:flex; align-items:center; gap:.45rem; padding:.35rem .5rem; border:1px solid var(--bwzc-line); border-radius:8px; background:var(--bwzc-white); cursor:pointer; text-align:left; font:inherit; }
    .oa-btn:hover { border-color:var(--bwzc-navy); }
    .oa-btn-active { border-color:var(--bwzc-navy); box-shadow:inset 0 0 0 1px var(--bwzc-navy); }
    .oa-code { min-width:36px; padding:1px 4px; border-radius:5px; background:#4A5568; color:#fff; font-weight:700; font-size:.75rem; text-align:center; }
    .oa-btn-hour .oa-code { background:#F2C94C; color:#3D2E00; }
    .oa-name { font-size:.8rem; color:var(--bwzc-navy); }
`

export function OtherAbsenceDialog({ personName, shiftText, currentCode = null, hasLeave = false, hasRest = false }: OtherAbsenceDialogProps) {
  const current = currentCode ?? null
  return (
    <>
      <div className="oa">
        <div className="oa-who">
          {personName} · {shiftText}
        </div>
        {hasLeave ? (
          <div className="oa-warn">
            <i className="rzi">info</i> Deze shift heeft verlof. Een code kiezen haalt het verlof weg.
          </div>
        ) : hasRest ? (
          <div className="oa-warn">
            <i className="rzi">info</i> Deze shift heeft rust. Een code kiezen vervangt de rust.
          </div>
        ) : null}
        <div className="tl-section-title">Afwezig</div>{' '}
        <div className="oa-grid">
          {OtherAbsences.filter(a => a.absent).map(a => (
            <button key={a.code} type="button" className={a.code === current ? 'oa-btn oa-btn-active' : 'oa-btn'} title={a.name} onClick={() => dialogService.close(a.code)}>
              <span className="oa-code">{a.code}</span> <span className="oa-name">{a.name}</span>
            </button>
          ))}
        </div>{' '}
        <div className="tl-section-title">
          Uren verlof <span className="oa-sub">(telt als aanwezig)</span>
        </div>{' '}
        <div className="oa-grid">
          {OtherAbsences.filter(a => !a.absent).map(a => (
            <button
              key={a.code}
              type="button"
              className={a.code === current ? 'oa-btn oa-btn-hour oa-btn-active' : 'oa-btn oa-btn-hour'}
              title={a.name}
              onClick={() => dialogService.close(a.code)}
            >
              <span className="oa-code">{a.code}</span> <span className="oa-name">{a.name}</span>
            </button>
          ))}
        </div>{' '}
        <Stack orientation="Horizontal" justifyContent="End" gap="0.5rem" style="margin-top:1rem">
          {current != null && <Button text="Code weghalen" icon="delete" buttonStyle="Danger" variant="Outlined" onClick={() => dialogService.close('')} />}
          <Button text="Annuleren" buttonStyle="Light" onClick={() => dialogService.close(null)} />
        </Stack>
      </div>
      {'\n\n'}
      <style>{css}</style>
    </>
  )
}
