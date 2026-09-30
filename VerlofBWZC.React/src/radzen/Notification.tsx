import { useEffect, useSyncExternalStore } from 'react'

// NotificationService + RadzenNotification + RadzenNotificationMessage (Radzen.Blazor 8).
// notify(...) toont een melding rechtsboven die na 3 seconden (duration) verdwijnt.
export type NotificationSeverity = 'Error' | 'Info' | 'Success' | 'Warning'

export interface NotificationMessage {
  id: number
  severity: NotificationSeverity
  summary: string
  detail: string
  duration: number
  closeOnClick: boolean
  click?: () => void
}

let messages: NotificationMessage[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

export const notificationService = {
  notify(severity: NotificationSeverity = 'Info', summary = '', detail = '', duration = 3000, click?: () => void, closeOnClick = false) {
    // Zoals Radzen (if (!Messages.Contains(message))): een gelijke melding die nog zichtbaar is, niet nog eens tonen
    const same = (m: NotificationMessage) =>
      m.severity === severity && m.summary === summary && m.detail === detail && m.duration === duration && m.click === click && m.closeOnClick === closeOnClick
    if (messages.some(same)) return
    messages = [...messages, { id: nextId++, severity, summary, detail, duration, click, closeOnClick }]
    emit()
  },
  remove(id: number) {
    messages = messages.filter(m => m.id !== id)
    emit()
  },
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

const classes: Record<NotificationSeverity, [string, string]> = {
  Error: ['rz-notification-error', 'notranslate rzi-times'],
  Info: ['rz-notification-info', 'notranslate rzi-info-circle'],
  Success: ['rz-notification-success', 'notranslate rzi-check'],
  Warning: ['rz-notification-warn', 'notranslate rzi-exclamation-triangle'],
}

function NotificationMessageView({ message }: { message: NotificationMessage }) {
  useEffect(() => {
    const timer = window.setTimeout(() => notificationService.remove(message.id), message.duration)
    return () => window.clearTimeout(timer)
  }, [message.id, message.duration])

  const [itemClass, iconClass] = classes[message.severity]
  const clicked = () => {
    if (message.closeOnClick) notificationService.remove(message.id)
    message.click?.()
  }
  return (
    <div
      aria-live="polite"
      className={`rz-notification-item-wrapper rz-open ${itemClass}`}
      style={message.click || message.closeOnClick ? { cursor: 'pointer' } : undefined}
    >
      <div className="rz-notification-item">
        <div className="rz-notification-message-wrapper">
          <span className={`notranslate rzi rz-notification-icon ${iconClass}`} onClick={clicked} />
          <div className="rz-notification-message" onClick={clicked}>
            <div className="rz-notification-title">{message.summary}</div>
            <div className="rz-notification-content">{message.detail}</div>
          </div>
        </div>
        <div className="notranslate rzi rz-notification-close" onClick={() => notificationService.remove(message.id)} />
      </div>
    </div>
  )
}

export function Notification() {
  const list = useSyncExternalStore(subscribe, () => messages)
  return (
    <div aria-live="polite" className="rz-notification">
      {list.map(m => (
        <div key={m.id}>
          <NotificationMessageView message={m} />
        </div>
      ))}
    </div>
  )
}
