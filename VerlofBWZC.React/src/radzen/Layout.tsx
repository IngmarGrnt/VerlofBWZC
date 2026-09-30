import { useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from './Button'
import { cls, parseStyle, withClass } from './core'

// RadzenLayout, RadzenHeader, RadzenSidebar, RadzenSidebarToggle, RadzenBody, RadzenStack, RadzenIcon en RadzenAlert
// (Radzen.Blazor 8). Binnen RadzenLayout hebben header, zijbalk en body geen eigen style (de CSS-grid van rz-layout).

export function Layout({ children }: { children: ReactNode }) {
  // "rz-" = ThemeService zonder gekozen thema, zoals bij de Blazor-website
  return <div className="rz-layout rz-">{children}</div>
}

export function Header({ children }: { children: ReactNode }) {
  return <div className="rz-header">{children}</div>
}

export function Sidebar({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  return (
    <div
      style={{}}
      className={cls('rz-sidebar', expanded ? 'rz-sidebar-expanded' : 'rz-sidebar-collapsed', 'rz-sidebar-responsive', 'rz-sidebar-start')}
    >
      {children}
    </div>
  )
}

export function SidebarToggle({ onClick, className, icon }: { onClick: () => void; className?: string; icon?: string }) {
  return (
    <button aria-label="Toggle" tabIndex={0} className={withClass('rz-sidebar-toggle', className)} onClick={onClick}>
      <i className="notranslate rzi rz-display-flex rz-align-items-center">{icon?.trim() ? icon : 'menu'}</i>
    </button>
  )
}

export function Body({ children }: { children: ReactNode }) {
  return (
    <div style={{}} className="rz-body">
      {children}
    </div>
  )
}

export type AlignItems = 'Normal' | 'Center' | 'Start' | 'End' | 'Stretch'
export type JustifyContent = 'Normal' | 'Center' | 'Start' | 'End' | 'Left' | 'Right' | 'SpaceBetween' | 'SpaceAround' | 'SpaceEvenly' | 'Stretch'

// Zoals GetFlexCSSClass: SpaceBetween -> space-between, Start/End -> flex-start/flex-end
const flexClass = (v: string) => {
  const value = v.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
  return value === 'start' || value === 'end' ? `flex-${value}` : value
}

export function Stack({
  orientation = 'Vertical',
  alignItems = 'Normal',
  justifyContent = 'Normal',
  gap,
  wrap = 'NoWrap',
  reverse = false,
  style,
  className,
  children,
}: {
  orientation?: 'Horizontal' | 'Vertical'
  alignItems?: AlignItems
  justifyContent?: JustifyContent
  gap?: string
  wrap?: 'NoWrap' | 'Wrap' | 'WrapReverse'
  reverse?: boolean
  style?: string
  className?: string
  children?: ReactNode
}) {
  const horizontal = orientation === 'Horizontal'
  const componentClass = `rz-stack rz-display-flex rz-flex-${horizontal ? 'row' : 'column'}${reverse ? '-reverse' : ''} rz-align-items-${flexClass(alignItems)} rz-justify-content-${flexClass(justifyContent)}`
  const css: Record<string, string> = { ...(parseStyle(style) as Record<string, string>) }
  if (gap) css['--rz-gap'] = /^\d+$/.test(gap) ? `${gap}px` : gap
  css.flexWrap = wrap === 'Wrap' ? 'wrap' : wrap === 'WrapReverse' ? 'wrap-reverse' : 'nowrap'
  return (
    <div className={withClass(componentClass, className)} style={css as CSSProperties}>
      {children}
    </div>
  )
}

export function Icon({ icon, iconColor, style, className }: { icon: string; iconColor?: string; style?: string; className?: string }) {
  const css = { ...(iconColor ? { color: iconColor } : {}), ...parseStyle(style) }
  return (
    <i style={css} className={withClass('notranslate rzi', className)}>
      {icon}
    </i>
  )
}

export type AlertStyle = 'Primary' | 'Secondary' | 'Light' | 'Base' | 'Dark' | 'Success' | 'Danger' | 'Warning' | 'Info'

// RadzenAlert (Radzen.Blazor 8). Let op: Radzen 8 kent geen Severity. <RadzenAlert Severity=...> in de Blazor-website
// komt als gewoon HTML-attribuut in de pagina en de melding blijft AlertStyle Base (grijs, lampje). Daarom hier ook.
export function Alert({
  alertStyle = 'Base',
  title,
  style,
  allowClose = true,
  attributes,
  children,
}: {
  alertStyle?: AlertStyle
  title?: string
  style?: string
  allowClose?: boolean
  attributes?: Record<string, string>
  children?: ReactNode
}) {
  const [visible, setVisible] = useState(true)
  if (!visible) return null
  const icon =
    alertStyle === 'Success' ? 'check_circle' : alertStyle === 'Danger' ? 'error' : alertStyle === 'Warning' ? 'warning_amber' : alertStyle === 'Info' ? 'info' : 'lightbulb'
  const closeStyle = alertStyle === 'Light' || alertStyle === 'Base' ? 'Dark' : 'Light'
  return (
    <div style={parseStyle(style)} {...attributes} className={`rz-alert rz-alert-md rz-variant-filled rz-${alertStyle.toLowerCase()} rz-shade-default`} aria-live="polite">
      <div className="rz-alert-item">
        <Icon icon={icon} className="rz-alert-icon" />
        <div className="rz-alert-message">
          {title && <div className="rz-alert-title">{title}</div>}
          <div className="rz-alert-content">{children}</div>
        </div>
      </div>
      {allowClose && <Button onClick={() => setVisible(false)} icon="close" variant="Text" buttonStyle={closeStyle} shade="Default" size="Small" />}
    </div>
  )
}
