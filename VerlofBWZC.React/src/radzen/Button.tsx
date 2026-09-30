import { useRef, type MouseEvent, type ReactNode } from 'react'
import { cls, parseStyle, withClass } from './core'

// RadzenButton (Radzen.Blazor 8: RadzenButton.razor)
export type ButtonStyle = 'Primary' | 'Secondary' | 'Light' | 'Base' | 'Dark' | 'Success' | 'Warning' | 'Danger' | 'Info'
export type ButtonSize = 'Small' | 'Medium' | 'Large' | 'ExtraSmall'
export type Variant = 'Filled' | 'Flat' | 'Outlined' | 'Text'
export type Shade = 'Default' | 'Light' | 'Dark' | 'Lighter' | 'Darker'

const sizeClass: Record<ButtonSize, string> = {
  Small: 'rz-button-sm',
  Medium: 'rz-button-md',
  Large: 'rz-button-lg',
  ExtraSmall: 'rz-button-xs',
}

export interface ButtonProps {
  text?: string
  icon?: string
  iconColor?: string
  buttonStyle?: ButtonStyle
  size?: ButtonSize
  variant?: Variant
  shade?: Shade
  buttonType?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  isBusy?: boolean
  busyText?: string
  tabIndex?: number
  style?: string
  className?: string
  title?: string
  ariaLabel?: string
  id?: string
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void | Promise<unknown>
  children?: ReactNode
}

export function Button({
  text,
  icon,
  iconColor,
  buttonStyle = 'Primary',
  size = 'Medium',
  variant = 'Filled',
  shade = 'Default',
  buttonType = 'button',
  disabled = false,
  isBusy = false,
  busyText,
  tabIndex = 0,
  style,
  className,
  title,
  ariaLabel,
  id,
  onClick,
  children,
}: ButtonProps) {
  const isDisabled = disabled || isBusy
  // Zoals Radzen: geen tweede klik terwijl de vorige nog bezig is
  const clicking = useRef(false)
  const componentClass = cls(
    'rz-button',
    sizeClass[size],
    `rz-variant-${variant.toLowerCase()}`,
    `rz-${buttonStyle.toLowerCase()}`,
    isDisabled && 'rz-state-disabled',
    `rz-shade-${shade.toLowerCase()}`,
    !text && icon && 'rz-button-icon-only',
  )

  return (
    <button
      style={parseStyle(style)}
      disabled={isDisabled || undefined}
      tabIndex={disabled ? -1 : tabIndex}
      type={buttonType}
      className={withClass(componentClass, className)}
      title={title}
      aria-label={ariaLabel}
      id={id}
      onClick={async e => {
        if (isDisabled || clicking.current || !onClick) return
        clicking.current = true
        try {
          await onClick(e)
        } finally {
          clicking.current = false
        }
      }}
    >
      <span className="rz-button-box">
        {children ??
          (isBusy ? (
            <>
              <i className="notranslate rzi" style={{ animation: 'rotation 700ms linear infinite' }}>
                refresh
              </i>
              {busyText && <span className="rz-button-text">{busyText}</span>}
            </>
          ) : (
            <>
              {icon && (
                <i className="notranslate rz-button-icon-left rzi" style={iconColor ? { color: iconColor } : undefined}>
                  {icon}
                </i>
              )}
              {text && <span className="rz-button-text">{text}</span>}
            </>
          ))}
      </span>
    </button>
  )
}
