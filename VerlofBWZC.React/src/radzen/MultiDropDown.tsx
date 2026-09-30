import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { cls, parseStyle, uniqueId, withClass } from './core'
import { useFieldClass } from './EditForm'

// RadzenDropDown met Multiple="true" (en optioneel Chips="true"), zoals RadzenDropDown.razor/RadzenDropDownItem.razor:
// lijst met vinkjes, bovenaan "alles kiezen" en een kruisje dat de keuze wist (AllowSelectAll, standaard aan).
// De keuze blijft in de volgorde waarin items gekozen zijn (HashSet in Radzen).
export function MultiDropDown<T extends string | number>({
  data,
  value,
  onChange,
  chips = false,
  name,
  placeholder,
  style,
  className,
  disabled = false,
  tabIndex = 0,
  popupStyle = 'max-height:200px;overflow-x:hidden',
}: {
  data: readonly T[] | null | undefined
  value: readonly T[] | null | undefined
  onChange: (value: T[]) => void
  chips?: boolean
  name?: string
  placeholder?: string
  style?: string
  className?: string
  disabled?: boolean
  tabIndex?: number
  popupStyle?: string
}) {
  const [id] = useState(uniqueId)
  const element = useRef<HTMLDivElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const [state, setState] = useState({ open: false, closing: false, top: 0, left: 0, width: 0 })
  const { fieldClass, notifyChanged } = useFieldClass(name)
  const items = data ?? []
  const selected = value ?? []
  const maxSelectedLabels = 4

  const open = useCallback(() => {
    if (disabled || !element.current) return
    const rect = element.current.getBoundingClientRect()
    setState({ open: true, closing: false, top: rect.bottom, left: rect.left, width: rect.width })
  }, [disabled])

  const close = useCallback(() => {
    setState(s => (s.open ? { ...s, closing: true } : s))
    window.setTimeout(() => setState(s => (s.closing ? { ...s, open: false, closing: false } : s)), 500)
  }, [])

  // Zoals Radzen.openPopup (met Chips wordt de popup na elke keuze opnieuw geplaatst, het veld kan hoger worden)
  useLayoutEffect(() => {
    if (!state.open || state.closing || !popup.current || !element.current) return
    const parentRect = element.current.getBoundingClientRect()
    const rect = popup.current.getBoundingClientRect()
    let top = parentRect.bottom
    let left = parentRect.left
    if (top + rect.height > window.innerHeight && parentRect.top > rect.height) top = parentRect.top - rect.height
    if (left + rect.width > window.innerWidth && window.innerWidth > rect.width) left = window.innerWidth - rect.width
    popup.current.style.top = `${top + document.documentElement.scrollTop}px`
    popup.current.style.left = `${left + document.documentElement.scrollLeft}px`
  }, [state, selected.length])

  useEffect(() => {
    if (!state.open || state.closing) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!element.current?.contains(target) && !popup.current?.contains(target)) close()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [state.open, state.closing, close])

  const set = (next: T[]) => {
    notifyChanged()
    onChange(next)
  }
  const toggle = (item: T) => set(selected.includes(item) ? selected.filter(x => x !== item) : [...selected, item])
  const allSelected = items.length > 0 && items.every(i => selected.includes(i))
  const selectAll = () => set(allSelected ? [] : [...items])
  const clearAll = () => set([])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const key = e.code || e.key
    if (key === 'Enter' || key === 'NumpadEnter' || (e.altKey && key === 'ArrowDown')) {
      e.preventDefault()
      if (!state.open || state.closing) open()
    } else if (key === 'Escape' || key === 'Tab') {
      close()
    }
  }

  const showChips = chips && selected.length > 0 && selected.length < maxSelectedLabels
  const componentClass = cls('rz-dropdown', disabled && 'rz-state-disabled', fieldClass, selected.length === 0 && 'rz-state-empty', chips && selected.length > 0 && 'rz-dropdown-chips')

  const label = showChips ? (
    <div className="rz-dropdown-chips-wrapper">
      {selected.map(item => (
        <div key={String(item)} className="rz-chip">
          <span className="rz-chip-text">{String(item)}</span>
          <button
            tabIndex={0}
            title={`Remove ${String(item)}`}
            type="button"
            className={`rz-button rz-button-sm rz-button-icon-only rz-base rz-shade-default ${disabled ? 'rz-state-disabled' : ''}`}
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              if (!disabled) toggle(item)
            }}
          >
            <i className="notranslate rzi">close</i>
          </button>
        </div>
      ))}
    </div>
  ) : selected.length > 0 ? (
    <span className="rz-dropdown-label rz-inputtext">{selected.length < maxSelectedLabels ? selected.map(String).join(',') : `${selected.length} items selected`}</span>
  ) : placeholder ? (
    <span className="rz-dropdown-label rz-inputtext rz-placeholder">{placeholder}</span>
  ) : (
    <span className="rz-dropdown-label rz-inputtext">&nbsp;</span>
  )

  const panel = state.open && (
    <div
      ref={popup}
      className={cls('rz-multiselect-panel', state.closing ? 'rz-close' : 'rz-open', 'rz-popup')}
      style={{ display: 'block', boxSizing: 'border-box', width: state.width, minWidth: state.width, zIndex: 2000, top: state.top, left: state.left }}
      onAnimationEnd={() => {
        if (state.closing) setState(s => ({ ...s, open: false, closing: false }))
      }}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      <div className="rz-multiselect-header rz-helper-clearfix" onClick={e => e.preventDefault()}>
        {items.length > 0 && (
          <div className="rz-chkbox" title="" onClick={selectAll}>
            <div className="rz-helper-hidden-accessible">
              <input readOnly type="checkbox" id={`${name ?? id + 'sa'}`} aria-label="Search" aria-checked={allSelected ? 'true' : 'false'} />
            </div>
            <div className={allSelected ? 'notranslate rz-chkbox-box rz-state-active' : 'notranslate rz-chkbox-box'}>
              <span className={allSelected ? 'notranslate rz-chkbox-icon rzi rzi-check' : 'notranslate rz-chkbox-icon'} />
            </div>
          </div>
        )}
        <a className="rz-multiselect-close " onClick={clearAll}>
          <span className="notranslate rzi rzi-times" />
        </a>
      </div>
      <div className="rz-multiselect-items-wrapper" style={parseStyle(popupStyle)}>
        {items.length > 0 && (
          <ul className="rz-multiselect-items rz-multiselect-list" role="listbox">
            {items.map(item => {
              const isSel = selected.includes(item)
              return (
                <li
                  key={String(item)}
                  className={`rz-multiselect-item ${isSel ? 'rz-state-highlight ' : ''}`}
                  aria-label={String(item)}
                  onMouseDown={e => e.preventDefault()}
                  onClick={e => {
                    e.preventDefault()
                    toggle(item)
                  }}
                >
                  <div className="rz-chkbox ">
                    <div className={`${isSel ? 'notranslate rz-chkbox-box rz-state-active' : 'notranslate rz-chkbox-box'} `}>
                      <span className={isSel ? 'notranslate rz-chkbox-icon rzi rzi-check' : 'notranslate rz-chkbox-icon'} />
                    </div>
                  </div>
                  <span className="rz-multiselect-item-content">{String(item)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )

  return (
    <div
      ref={element}
      className={withClass(componentClass, className)}
      onClick={e => {
        e.preventDefault()
        e.stopPropagation()
        if (state.open && !state.closing) close()
        else open()
      }}
      style={parseStyle(style)}
      tabIndex={disabled ? -1 : tabIndex}
      onKeyDown={onKeyDown}
      id={id}
    >
      <div className="rz-helper-hidden-accessible">
        <input disabled={disabled || undefined} aria-haspopup="listbox" readOnly type="text" tabIndex={-1} name={name} value={selected.length ? String(selected) : ''} id={name} aria-label="Empty" />
      </div>
      {label}
      <div className="rz-dropdown-trigger rz-corner-right">
        <span className="notranslate rz-dropdown-trigger-icon rzi rzi-chevron-down" />
      </div>
      {panel && createPortal(panel, document.body)}
    </div>
  )
}
