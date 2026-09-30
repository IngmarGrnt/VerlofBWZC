import { useEffect, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { cls, parseStyle, withClass } from './core'
import { useFieldClass } from './EditForm'

// RadzenTextBox en RadzenPassword (Radzen.Blazor 8). Zoals bij Blazor wordt de waarde pas doorgegeven
// bij het native "change"-event (verlaten van het veld of Enter), niet bij elke toets. onInput volgt wel elke toets.
interface TextInputProps {
  value: string | null | undefined
  onChange: (value: string) => void
  onInput?: (value: string) => void
  name?: string
  id?: string
  placeholder?: string
  style?: string
  className?: string
  disabled?: boolean
  readOnly?: boolean
  maxLength?: number
  autoComplete?: string
  tabIndex?: number
}

function TextInput({ type, ...p }: TextInputProps & { type?: 'password' }) {
  const ref = useRef<HTMLInputElement>(null)
  const { fieldClass, notifyChanged } = useFieldClass(p.name)
  const onChangeRef = useRef(p.onChange)
  onChangeRef.current = p.onChange
  const valueRef = useRef(p.value ?? '')
  valueRef.current = p.value ?? ''

  // Native change-event (React's onChange volgt elke toets)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handler = () => {
      if (el.value !== valueRef.current) notifyChanged()
      onChangeRef.current(el.value)
    }
    el.addEventListener('change', handler)
    return () => el.removeEventListener('change', handler)
  })

  // Zoals Blazor: de waarde in het veld zetten als ze van buitenaf verandert
  useEffect(() => {
    if (ref.current && ref.current.value !== (p.value ?? '')) ref.current.value = p.value ?? ''
  }, [p.value])

  const componentClass = cls('rz-textbox', p.disabled && 'rz-state-disabled', fieldClass, !p.value && 'rz-state-empty')
  const common = {
    ref,
    id: p.id ?? p.name,
    disabled: p.disabled || undefined,
    readOnly: p.readOnly || undefined,
    name: p.name,
    style: parseStyle(p.style),
    className: withClass(componentClass, p.className),
    tabIndex: p.disabled ? -1 : (p.tabIndex ?? 0),
    placeholder: p.placeholder,
    autoComplete: p.autoComplete ?? 'on',
    defaultValue: p.value ?? '',
    onInput: (e: FormEvent<HTMLInputElement>) => p.onInput?.(e.currentTarget.value),
  }
  return type === 'password' ? (
    <input {...common} type="password" />
  ) : (
    <input {...common} maxLength={p.maxLength} />
  )
}

export function TextBox(props: TextInputProps) {
  return <TextInput {...props} />
}

export function Password(props: TextInputProps) {
  return <TextInput {...props} type="password" />
}

// RadzenCheckBox<bool>
export function CheckBox({
  value,
  onChange,
  name,
  disabled,
  readOnly,
  tabIndex = 0,
  style,
  className,
}: {
  value: boolean
  onChange: (value: boolean) => void
  name?: string
  disabled?: boolean
  readOnly?: boolean
  tabIndex?: number
  style?: string
  className?: string
}) {
  const { fieldClass, notifyChanged } = useFieldClass(name)
  const toggle = () => {
    if (disabled || readOnly) return
    notifyChanged()
    onChange(!value)
  }
  const onKeyPress = (e: KeyboardEvent) => {
    e.preventDefault()
    if (e.code === 'Space') toggle()
  }
  const componentClass = cls('rz-chkbox', disabled && 'rz-state-disabled', fieldClass, !value && 'rz-state-empty')
  return (
    <div
      className={withClass(componentClass, className)}
      onKeyPress={onKeyPress}
      style={parseStyle(style)}
      tabIndex={disabled || readOnly ? -1 : tabIndex}
    >
      <div className="rz-helper-hidden-accessible">
        <input
          type="checkbox"
          onChange={toggle}
          value={String(value)}
          name={name}
          id={name}
          checked={value}
          aria-checked={value ? 'true' : 'false'}
          tabIndex={-1}
          readOnly={readOnly || undefined}
        />
      </div>
      <div
        className={cls('rz-chkbox-box', value && 'rz-state-active', disabled && 'rz-state-disabled')}
        onClick={e => {
          e.preventDefault()
          toggle()
        }}
      >
        <span className={cls('notranslate rz-chkbox-icon', value && 'rzi rzi-check')} />
      </div>
    </div>
  )
}

// RadzenLabel
export function Label({ text, component, style, className, children }: { text?: string; component?: string; style?: string; className?: string; children?: ReactNode }) {
  return (
    <label htmlFor={component} style={parseStyle(style)} className={withClass('rz-label', className)}>
      {children ?? text}
    </label>
  )
}
