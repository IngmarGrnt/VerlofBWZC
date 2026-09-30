import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cls, parseStyle, withClass } from './core'
import { useFieldClass } from './EditForm'

// Kleinere Radzen-componenten (Radzen.Blazor 8): Numeric, Card, Badge, Panel, Fieldset.

// RadzenNumeric<int> / <int?>: tekstveld met pijltjes. Enkel cijfers (en '-') intypen; bij verlaten binnen Min/Max.
export function Numeric({
  value,
  onChange,
  min,
  max,
  placeholder,
  disabled = false,
  style,
  className,
  name,
  nullable = false,
}: {
  value: number | null | undefined
  onChange: (value: number | null) => void
  min?: number
  max?: number
  placeholder?: string
  disabled?: boolean
  style?: string
  className?: string
  name?: string
  nullable?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const { fieldClass, notifyChanged } = useFieldClass(name)
  const formatted = value === null || value === undefined ? '' : String(value)
  const hasValue = nullable ? value !== null && value !== undefined : value !== 0 && value !== null && value !== undefined

  useEffect(() => {
    if (input.current && document.activeElement !== input.current) input.current.value = formatted
  }, [formatted])

  const clamp = (v: number) => {
    if (max !== undefined && v > max) return max
    if (min !== undefined && v < min) return min
    return v
  }

  const commit = (text: string) => {
    const digits = text.replace(/[^\d-]/g, '')
    let next: number | null = digits === '' || digits === '-' ? (nullable ? null : 0) : Number.parseInt(digits, 10)
    if (next !== null && Number.isNaN(next)) next = nullable ? null : 0
    if (next !== null) next = clamp(next)
    if (input.current) input.current.value = next === null ? '' : String(next)
    if (next !== (value ?? (nullable ? null : 0))) {
      notifyChanged()
      onChange(next)
    }
  }

  const step = (up: boolean) => {
    if (disabled) return
    const current = value ?? 0
    const next = up ? current + 1 : current - 1
    if ((max !== undefined && next > max) || (min !== undefined && next < min) || next === value) return
    if (input.current) input.current.value = String(next)
    notifyChanged()
    onChange(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const key = e.code || e.key
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      e.preventDefault()
      step(key === 'ArrowUp')
    }
  }

  // Zoals Radzen.numericKeyPress (geheel getal): andere tekens niet toelaten
  const onKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.metaKey || e.ctrlKey || e.key === 'Tab' || e.key === 'Backspace' || e.key === 'Enter') return
    if (!/^[\d-]$/.test(e.key)) e.preventDefault()
  }

  return (
    <span style={parseStyle(style)} className={withClass(cls('rz-numeric', disabled && 'rz-state-disabled', fieldClass, !hasValue && 'rz-state-empty'), className)}>
      <input
        ref={input}
        inputMode="decimal"
        type="text"
        name={name}
        disabled={disabled || undefined}
        className={cls('rz-numeric-input', disabled && 'rz-state-disabled', fieldClass, !hasValue && 'rz-state-empty', 'rz-inputtext', 'rz-text-align-left')}
        tabIndex={disabled ? -1 : 0}
        id={name}
        placeholder={placeholder}
        autoComplete="on"
        defaultValue={formatted}
        onKeyPress={onKeyPress}
        onKeyDown={onKeyDown}
        onBlur={e => commit(e.currentTarget.value)}
        onChange={() => undefined}
      />
      <button aria-label="Up" type="button" className="rz-numeric-button rz-numeric-up rz-button" tabIndex={-1} onClick={() => step(true)}>
        <span className="notranslate rz-numeric-button-icon rzi rzi-caret-up" />
      </button>
      <button aria-label="Down" type="button" className="rz-numeric-button rz-numeric-down rz-button" tabIndex={-1} onClick={() => step(false)}>
        <span className="notranslate rz-numeric-button-icon rzi rzi-caret-down" />
      </button>
    </span>
  )
}

// RadzenCard (Variant Filled)
export function Card({ style, className, children }: { style?: string; className?: string; children?: ReactNode }) {
  return (
    <div className={withClass('rz-card rz-variant-filled', className)} style={parseStyle(style)}>
      {children}
    </div>
  )
}

// RadzenBadge (standaard Primary, Filled, Default)
export function Badge({
  badgeStyle = 'Primary',
  variant = 'Filled',
  shade = 'Default',
  isPill = false,
  style,
  children,
}: {
  badgeStyle?: string
  variant?: string
  shade?: string
  isPill?: boolean
  style?: string
  children?: ReactNode
}) {
  return (
    <span style={parseStyle(style)} className={cls('rz-badge', `rz-badge-${badgeStyle.toLowerCase()}`, `rz-variant-${variant.toLowerCase()}`, `rz-shade-${shade.toLowerCase()}`, isPill && 'rz-badge-pill')}>
      {children}
    </span>
  )
}

function Expander({ expanded, cssClass, id, children }: { expanded: boolean; cssClass: string; id?: string; children: ReactNode }) {
  return (
    <div role="region" aria-hidden={expanded ? 'false' : 'true'} className={cls('rz-expander', expanded ? 'rz-state-expanded' : 'rz-state-collapsed', cssClass)} id={id}>
      <div className="rz-expander-content">{children}</div>
    </div>
  )
}

// RadzenPanel met AllowCollapse en HeaderTemplate
export function Panel({
  allowCollapse = false,
  collapsed: initialCollapsed = false,
  headerTemplate,
  onExpand,
  children,
}: {
  allowCollapse?: boolean
  collapsed?: boolean
  headerTemplate?: ReactNode
  onExpand?: () => void
  children?: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const toggle = () => {
    setCollapsed(c => !c)
    if (collapsed) onExpand?.()
  }
  return (
    <div className="rz-panel">
      <div className="rz-panel-titlebar">
        {headerTemplate}
        {allowCollapse && (
          <a
            onClick={e => {
              e.preventDefault()
              toggle()
            }}
            className="rz-panel-titlebar-icon rz-panel-titlebar-toggler"
            role="button"
            aria-controls="rz-panel-0-content"
            aria-expanded={collapsed ? 'false' : 'true'}
            title={collapsed ? 'Expand' : 'Collapse'}
            tabIndex={0}
            onKeyPress={e => {
              if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault()
                toggle()
              }
            }}
          >
            <span className={`notranslate rzi ${collapsed ? 'rzi-plus' : 'rzi-minus'}`} />
          </a>
        )}
      </div>
      <Expander expanded={!collapsed} cssClass="rz-panel-content-wrapper">
        <div className="rz-panel-content">{children}</div>
      </Expander>
    </div>
  )
}

// RadzenFieldset. Let op: de Blazor-website zet Toggleable="true", dat Radzen 8 niet kent: het wordt een gewoon
// HTML-attribuut en de fieldset is niet inklapbaar. Daarom hier ook.
export function Fieldset({ text, attributes, children }: { text?: string; attributes?: Record<string, string>; children?: ReactNode }) {
  return (
    <fieldset {...attributes} className="rz-fieldset">
      {text && (
        <legend className="rz-fieldset-legend" style={{ whiteSpace: 'nowrap' }}>
          <span className="rz-fieldset-legend-text">{text}</span>
        </legend>
      )}
      <Expander expanded cssClass="rz-fieldset-content-wrapper" id="rz-fieldset-0-content">
        <div className="rz-fieldset-content">{children}</div>
      </Expander>
    </fieldset>
  )
}
