import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { Icon } from './Layout'

// DialogService + RadzenDialog + DialogContainer (Radzen.Blazor 8), met het gedrag van Radzen.openDialog:
// masker achter de laatste dialoog, na 500 ms focus op het eerste veld, Tab blijft in de dialoog,
// Escape sluit (CloseDialogOnEsc), body krijgt "no-scroll" als de pagina scrolt.
export interface DialogOptions {
  width?: string
  height?: string
  top?: string
  left?: string
  bottom?: string
  style?: string
  cssClass?: string
  wrapperCssClass?: string
  contentCssClass?: string
  icon?: string
  iconColor?: string
  iconStyle?: string
  showTitle?: boolean
  showClose?: boolean
  closeDialogOnEsc?: boolean
  closeDialogOnOverlayClick?: boolean
  autoFocusFirstElement?: boolean
  closeTabIndex?: number
}

interface OpenDialog {
  id: number
  title: string
  content: ReactNode
  options: DialogOptions
  resolve: (result: unknown) => void
}

let dialogs: OpenDialog[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const dialogService = {
  // Zoals DialogService.OpenAsync: de belofte geeft het resultaat van close(result)
  open<T = unknown>(title: string, content: ReactNode, options: DialogOptions = {}): Promise<T | undefined> {
    return new Promise(resolve => {
      dialogs = [...dialogs, { id: nextId++, title, content, options, resolve: resolve as (r: unknown) => void }]
      emit()
    })
  },
  close(result?: unknown) {
    const last = dialogs[dialogs.length - 1]
    if (!last) return
    dialogs = dialogs.slice(0, -1)
    if (dialogs.length === 0) document.body.classList.remove('no-scroll')
    emit()
    last.resolve(result)
  },
}

function focusableElements(el: Element): HTMLElement[] {
  return [
    ...el.querySelectorAll<HTMLElement>(
      'a, button, input, textarea, select, details, iframe, embed, object, summary dialog, audio[controls], video[controls], [contenteditable], [tabindex]',
    ),
  ].filter(e => e && e.tabIndex > -1 && !e.hasAttribute('disabled') && e.offsetParent !== null)
}

function DialogContainer({ dialog, showMask }: { dialog: OpenDialog; showMask: boolean }) {
  const content = useRef<HTMLDivElement>(null)
  const o = dialog.options
  const showTitle = o.showTitle ?? true
  const showClose = o.showClose ?? true

  useEffect(() => {
    if (document.documentElement.scrollHeight > document.documentElement.clientHeight) document.body.classList.add('no-scroll')
    const timer = window.setTimeout(() => {
      if ((o.autoFocusFirstElement ?? true) && content.current) focusableElements(content.current)[0]?.focus()
    }, 500)
    return () => window.clearTimeout(timer)
  }, [o.autoFocusFirstElement])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !content.current) return
    const focusable = focusableElements(content.current)
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (first && last && e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (first && last && !e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const style: React.CSSProperties = {
    ...(o.width ? { width: o.width } : {}),
    ...(o.height ? { height: o.height } : {}),
    ...(o.top ? { top: o.top } : {}),
    ...(o.left ? { left: o.left } : {}),
    ...(o.bottom ? { bottom: o.bottom } : {}),
  }

  return (
    <div className={['rz-dialog-wrapper', o.wrapperCssClass].filter(Boolean).join(' ')}>
      <div className={['rz-dialog rz-open', o.cssClass].filter(Boolean).join(' ')} role="dialog" aria-labelledby="rz-dialog-0-label" style={style}>
        {showTitle && (
          <div className="rz-dialog-titlebar">
            <div className="rz-dialog-title" id="rz-dialog-0-label">
              {o.icon && <Icon icon={o.icon} iconColor={o.iconColor} style={o.iconStyle} />}
              {dialog.title}
            </div>
            {showClose && (
              <a
                onClick={e => {
                  e.preventDefault()
                  dialogService.close()
                }}
                onKeyDown={e => {
                  const key = e.code || e.key
                  if (key === 'Space' || key === 'Enter') dialogService.close()
                }}
                role="button"
                className="rz-dialog-titlebar-icon rz-dialog-titlebar-close"
                tabIndex={o.closeTabIndex ?? 0}
              >
                <span className="notranslate rzi rzi-times" />
              </a>
            )}
          </div>
        )}
        <div ref={content} className={['rz-dialog-content', o.contentCssClass].filter(Boolean).join(' ')} onKeyDown={onKeyDown}>
          {dialog.content}
        </div>
      </div>
      {showMask &&
        (o.closeDialogOnOverlayClick ? (
          <div onClick={() => dialogService.close()} className="rz-dialog-mask" />
        ) : (
          <div className="rz-dialog-mask" style={{ pointerEvents: 'none' }} />
        ))}
    </div>
  )
}

export function Dialog() {
  const list = useSyncExternalStore(subscribe, () => dialogs)

  // Escape sluit de laatste dialoog (niet als er nog een keuzelijst open staat)
  useEffect(() => {
    if (list.length === 0) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Esc') return
      for (const p of document.querySelectorAll<HTMLElement>('.rz-popup,.rz-overlaypanel')) if (p.style.display !== 'none') return
      const last = list[list.length - 1]
      if (last && (last.options.closeDialogOnEsc ?? true)) dialogService.close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [list])

  return (
    <>
      {list.map((d, i) => (
        <DialogContainer key={d.id} dialog={d} showMask={i === list.length - 1} />
      ))}
    </>
  )
}
