import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { cls, parseStyle, uniqueId, withClass } from './core'
import { DropDown } from './DropDown'
import { formatDate } from '../util/dotnet'

// RadzenDatePicker<DateTime> (Radzen.Blazor 8.0.4: RadzenDatePicker.razor + Radzen.createDatePicker/openPopup),
// zonder tijdkiezer (ShowTime="false"). Het invoerveld en de knop zoals Radzen; de knop opent de kalender als popup
// onder het veld (in <body>, zoals Radzen.openPopup). Een dag kiezen sluit de popup en geeft de nieuwe datum door
// (ValueChanged). Maand en jaar kiezen met de keuzelijsten bovenaan of de pijltjes.
export interface DatePickerProps {
  value: Date | null | undefined
  onChange?: (value: Date) => void | Promise<unknown>
  // .NET-opmaak, bv. "ddd d MMMM yyyy" (huidige cultuur, zoals Radzen)
  dateFormat?: string
  name?: string
  placeholder?: string
  style?: string
  className?: string
  inputClass?: string
  buttonClass?: string
  disabled?: boolean
  readOnly?: boolean
  allowInput?: boolean
  tabIndex?: number
  min?: Date | null
  max?: Date | null
  // YearRange, standaard 1950 tot binnen 30 jaar
  yearRange?: string
}

// CultureInfo.CurrentCulture: taal van de browser (nl: week begint op maandag, zoals nl-BE)
const isNl = () => (navigator.language || 'en').toLowerCase().startsWith('nl')
const monthNames = () =>
  isNl()
    ? ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
    : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const abbrDayNames = () => (isNl() ? ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
const firstDayOfWeek = () => (isNl() ? 1 : 0)

const dateOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const sameDate = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds())
const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
const withTime = (d: Date, t: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.getHours(), t.getMinutes(), t.getSeconds())

// DateTime.TryParseExact(tekst, formaat) voor de gewone opmaakcodes, anders DateTime.TryParse (d/M/yyyy, d-M-yyyy, yyyy-M-d)
function parseInput(text: string, format: string | undefined): Date | null {
  const t = text.trim()
  if (!t) return null
  if (format) {
    const nl = isNl()
    const months = monthNames().map(m => m.toLowerCase())
    const abbrMonths = (nl ? ['jan.', 'feb.', 'mrt.', 'apr.', 'mei', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'] : ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const parts: string[] = []
    let pattern = ''
    for (let i = 0; i < format.length; ) {
      const ch = format[i]
      let run = 1
      while (format[i + run] === ch) run++
      if (ch === 'd') {
        pattern += run <= 2 ? '(\\d{1,2})' : '(\\S+)'
        parts.push(run <= 2 ? 'd' : 'ddd')
      } else if (ch === 'M') {
        pattern += run <= 2 ? '(\\d{1,2})' : '(\\S+)'
        parts.push(run <= 2 ? 'M' : run === 3 ? 'MMM' : 'MMMM')
      } else if (ch === 'y') {
        pattern += '(\\d{1,4})'
        parts.push('y')
      } else pattern += esc(ch.repeat(run))
      i += run
    }
    const m = new RegExp(`^${pattern}$`, 'i').exec(t)
    if (m) {
      let day = NaN
      let month = NaN
      let year = NaN
      parts.forEach((p, i) => {
        const v = m[i + 1]
        if (p === 'd') day = +v
        else if (p === 'M') month = +v - 1
        else if (p === 'MMM') month = abbrMonths.indexOf(v.toLowerCase())
        else if (p === 'MMMM') month = months.indexOf(v.toLowerCase())
        else if (p === 'y') year = +v
      })
      if (day >= 1 && month >= 0 && year >= 1 && day <= daysInMonth(year, month)) return new Date(year, month, day)
    }
  }
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t)
  if (m) {
    const [day, month, year] = nlOrder(+m[1], +m[2], +m[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month - 1)) return new Date(year, month - 1, day)
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= daysInMonth(+m[1], +m[2] - 1)) return new Date(+m[1], +m[2] - 1, +m[3])
  return null
}
const nlOrder = (a: number, b: number, y: number): [number, number, number] => (isNl() ? [a, b, y] : [b, a, y])

// moved: de popup staat (sinds de eerste keer openen) in <body>, zoals na Radzen.openPopup; opened: al eens geopend
type PopupState = { open: boolean; moved: boolean; reopened: boolean }

export function DatePicker({
  value,
  onChange,
  dateFormat,
  name,
  placeholder,
  style,
  className,
  inputClass,
  buttonClass,
  disabled = false,
  readOnly = false,
  allowInput = true,
  tabIndex = 0,
  min,
  max,
  yearRange = `1950:${new Date().getFullYear() + 30}`,
}: DatePickerProps) {
  const [id] = useState(uniqueId)
  const popupId = `popup${id}`
  const element = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const [popupState, setPopupState] = useState<PopupState>({ open: false, moved: false, reopened: false })

  const hasValue = !!value && !Number.isNaN(value.getTime()) && value.getFullYear() > 1
  const format = dateFormat ?? (isNl() ? 'd/MM/yyyy H:mm:ss' : 'M/d/yyyy h:mm:ss tt')
  const formattedValue = hasValue ? formatDate(value!, format, 'current') : ''

  // CurrentDate (getoonde maand) en FocusedDate; een nieuwe waarde zet de getoonde maand terug
  const [current, setCurrentRaw] = useState<Date | null>(null)
  const [focused, setFocused] = useState<Date>(() => new Date())
  const valueTime = hasValue ? value!.getTime() : null
  const lastValue = useRef(valueTime)
  if (lastValue.current !== valueTime) {
    lastValue.current = valueTime
    if (current !== null) setCurrentRaw(null)
  }
  const currentDate = current ?? (hasValue ? value! : dateOnly(new Date()))
  const setCurrentDate = (d: Date) => {
    setCurrentRaw(d)
    setFocused(d)
  }

  const [yearFrom, yearTo] = [min ? min.getFullYear() : +yearRange.split(':')[0], max ? max.getFullYear() : +yearRange.split(':').slice(-1)[0]]
  const months = monthNames().map((n, i) => ({ name: n, value: i + 1 }))
  const years = yearFrom <= yearTo ? Array.from({ length: yearTo - yearFrom + 1 }, (_, i) => ({ name: String(yearFrom + i).padStart(4, '0'), value: yearFrom + i })) : []

  const isReadonly = readOnly || !allowInput
  const isDisabledDate = (d: Date) => (!!min && d < min) || (!!max && d > max)

  // Zoals Blazor: de tekst in het veld volgt de waarde (value is een property, geen attribuut)
  useEffect(() => {
    if (input.current && input.current.value !== formattedValue) input.current.value = formattedValue
  }, [formattedValue])

  const openPopup = () => setPopupState(s => (s.open ? s : { open: true, moved: true, reopened: s.moved }))
  const closePopup = () => setPopupState(s => (s.open ? { ...s, open: false } : s))
  const isOpen = popupState.open

  // Radzen.openPopup: onder het veld, boven als er onderaan geen plaats is, links opschuiven als het niet past
  useLayoutEffect(() => {
    if (!isOpen || !popup.current || !element.current) return
    const parentRect = element.current.getBoundingClientRect()
    const rect = popup.current.getBoundingClientRect()
    let top = parentRect.bottom
    let left = parentRect.left
    if (top + rect.height > window.innerHeight && parentRect.top > rect.height) top = parentRect.top - rect.height
    if (left + rect.width > window.innerWidth && window.innerWidth > rect.width) left = window.innerWidth - rect.width
    popup.current.style.zIndex = '2000'
    popup.current.style.left = `${left + document.documentElement.scrollLeft}px`
    popup.current.style.top = `${top + document.documentElement.scrollTop}px`
  }, [isOpen])

  // Sluiten bij klikken buiten het veld en de kalender (niet in de open keuzelijst van maand/jaar), of bij een andere venstergrootte
  useEffect(() => {
    if (!isOpen) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Element
      if (element.current?.contains(target) || popup.current?.contains(target)) return
      if (target.closest?.('.rz-dropdown-panel')) return
      closePopup()
    }
    const onResize = () => {
      const tag = document.activeElement?.tagName.toLowerCase() ?? ''
      if (!/Android/i.test(navigator.userAgent) && !['input', 'textarea'].includes(tag)) closePopup()
    }
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('resize', onResize)
    }
  }, [isOpen])

  const focusInput = () => input.current?.focus()

  // SetDay + OkClick: popup dicht, dan de nieuwe waarde doorgeven
  const setDay = async (d: Date) => {
    const date = withTime(d, currentDate)
    setCurrentDate(date)
    closePopup()
    if ((min && date < min) || (max && date > max)) return
    if (!disabled) await onChange?.(date)
    focusInput()
  }

  // ParseDate: getypte datum (bij het verlaten van het veld of Enter)
  const onInputChange = async () => {
    const el = input.current
    if (!el) return
    const parsed = parseInput(el.value, dateFormat)
    const valid = parsed && !isDisabledDate(parsed)
    if (!valid) {
      el.value = formattedValue // niet leeg te maken (DateTime)
      return
    }
    if (!hasValue || parsed!.getTime() !== value!.getTime()) await onChange?.(parsed!)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
    const key = e.code || e.key
    if (e.altKey && key === 'ArrowDown') {
      e.preventDefault()
      openPopup()
    } else if (key === 'Enter') {
      e.preventDefault()
      if (isOpen) closePopup()
      else openPopup()
    } else if (key === 'Escape') {
      closePopup()
      focusInput()
    }
  }

  const onCalendarKeyDown = async (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const key = e.code || e.key
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      e.preventDefault()
      setCurrentDate(addDays(focused, key === 'ArrowLeft' ? -1 : 1))
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      e.preventDefault()
      setCurrentDate(addDays(focused, key === 'ArrowUp' ? -7 : 7))
    } else if (key === 'Enter') {
      e.preventDefault()
      if (!isDisabledDate(focused) && !readOnly) await setDay(focused)
    } else if (key === 'Escape' || key === 'Tab') {
      closePopup()
      focusInput()
    }
  }

  // Eerste dag in de kalender: maandag (nl) of zondag voor de eerste van de maand
  const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  const startDate = addDays(first, -((7 + first.getDay() - firstDayOfWeek()) % 7))
  const dayNames = abbrDayNames()
  const shiftedDayNames = Array.from({ length: 7 }, (_, i) => dayNames[(firstDayOfWeek() + i) % 7])
  const today = new Date()

  const dayClass = (date: Date, forCell: boolean) =>
    cls(
      !forCell && 'rz-state-default',
      currentDate.getMonth() !== date.getMonth() && 'rz-calendar-other-month',
      !forCell && hasValue && sameDate(value!, date) && 'rz-state-active',
      !forCell && sameDate(today, date) && 'rz-calendar-today',
      !forCell && sameDate(focused, date) && 'rz-state-focused',
      !forCell && isDisabledDate(date) && 'rz-state-disabled',
    )

  const calendar = (
    <div className="rz-calendar" onKeyDown={e => {
      const key = e.code || e.key
      if (key === 'Escape') {
        closePopup()
        focusInput()
      }
    }}>
      <div className="rz-calendar-header">
        <a
          id={`${id}pm`}
          tabIndex={-1}
          aria-label="Previous month"
          className="rz-button rz-button-md rz-variant-text rz-button-icon-only rz-secondary rz-shade-default rz-calendar-prev"
          onClick={e => {
            e.preventDefault()
            if (disabled) return
            const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, Math.min(currentDate.getDate(), daysInMonth(currentDate.getFullYear(), (currentDate.getMonth() + 11) % 12)))
            if (d.getFullYear() >= yearFrom) setCurrentDate(withTime(d, currentDate))
          }}
        >
          <span className="notranslate rzi rz-calendar-prev-icon" />
        </a>
        <a
          id={`${id}nm`}
          tabIndex={-1}
          aria-label="Next month"
          className="rz-button rz-button-md rz-variant-text rz-button-icon-only rz-secondary rz-shade-default rz-calendar-next"
          onClick={e => {
            e.preventDefault()
            if (disabled) return
            const y = currentDate.getMonth() === 11 ? currentDate.getFullYear() + 1 : currentDate.getFullYear()
            const mo = (currentDate.getMonth() + 1) % 12
            const d = new Date(y, mo, Math.min(currentDate.getDate(), daysInMonth(y, mo)))
            if (d.getFullYear() <= yearTo) setCurrentDate(withTime(d, currentDate))
          }}
        >
          <span className="notranslate rzi rz-calendar-next-icon" />
        </a>
        <div className="rz-calendar-title">
          <DropDown
            className="rz-calendar-month-dropdown"
            tabIndex={tabIndex}
            value={currentDate.getMonth() + 1}
            disabled={disabled}
            data={months}
            textProperty={m => m.name}
            valueProperty={m => m.value}
            onChange={m => {
              if (m == null) return
              const y = currentDate.getFullYear()
              setCurrentDate(new Date(y, m - 1, Math.min(currentDate.getDate(), daysInMonth(y, m - 1)), currentDate.getHours(), currentDate.getMinutes(), currentDate.getSeconds()))
            }}
          />
          <DropDown
            className="rz-calendar-year-dropdown"
            tabIndex={tabIndex}
            value={currentDate.getFullYear()}
            disabled={disabled}
            data={years}
            textProperty={y => y.name}
            valueProperty={y => y.value}
            onChange={y => {
              if (y == null) return
              const mo = currentDate.getMonth()
              setCurrentDate(new Date(y, mo, Math.min(currentDate.getDate(), daysInMonth(y, mo)), currentDate.getHours(), currentDate.getMinutes(), currentDate.getSeconds()))
            }}
          />
        </div>
      </div>
      <div className="rz-calendar-view-container" tabIndex={disabled ? -1 : tabIndex} onKeyDown={onCalendarKeyDown}>
        <table className="rz-calendar-view rz-calendar-month-view" style={{ width: '100%' }}>
          <thead>
            <tr>
              {shiftedDayNames.map(day => (
                <th key={day} scope="col">
                  <span>{day}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }, (_, i) => (
              <tr key={i}>
                {Array.from({ length: 7 }, (_, j) => {
                  const date = addDays(startDate, i * 7 + j)
                  const dayDisabled = isDisabledDate(date)
                  return (
                    <td
                      key={j}
                      className={dayClass(date, true)}
                      onClick={async () => {
                        if (!disabled && !dayDisabled) await setDay(date)
                      }}
                    >
                      <span className={dayClass(date, false)}>{date.getDate()}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  // Popup (Radzen.Blazor.Rendering.Popup): verborgen in het veld; open in <body> met rz-open/rz-popup
  // (klassen zoals classList.add/remove ze achterlaten: eerst "rz-open rz-popup", daarna "rz-popup rz-close" / "rz-popup rz-open")
  const popupClass = !popupState.open
    ? 'rz-datepicker-popup-container rz-popup rz-close'
    : popupState.reopened
      ? 'rz-datepicker-popup-container rz-popup rz-open'
      : 'rz-datepicker-popup-container rz-open rz-popup'
  const popupEl = popupState.moved ? (
    createPortal(
      <div
        ref={popup}
        className={popupClass}
        style={{ display: popupState.open ? 'block' : 'none' }}
        id={popupId}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        {calendar}
      </div>,
      document.body,
    )
  ) : (
    <div className="rz-datepicker-popup-container " style={{ display: 'none' }} id={popupId}>
      {calendar}
    </div>
  )

  const componentClass = cls('rz-datepicker', disabled && 'rz-state-disabled', !hasValue && 'rz-state-empty')

  return (
    <div ref={element} className={withClass(componentClass, className)} style={parseStyle(style)} id={id}>
      <input
        ref={input}
        disabled={disabled || undefined}
        readOnly={isReadonly || undefined}
        defaultValue={formattedValue}
        tabIndex={disabled ? -1 : tabIndex}
        onChange={() => {}}
        onBlur={() => void onInputChange()}
        onKeyDown={e => {
          onKeyDown(e)
          if ((e.code || e.key) === 'Enter') void onInputChange()
        }}
        autoComplete="off"
        type="text"
        name={name}
        className={`rz-inputtext ${inputClass ?? ''} ${readOnly ? 'rz-readonly' : ''} `}
        id={name}
        placeholder={placeholder}
      />
      <button
        aria-label="Toggle"
        className={`rz-datepicker-trigger rz-datepicker-field-button rz-button rz-button-icon-only${disabled ? ' rz-state-disabled' : ''} ${buttonClass ?? ''}`}
        tabIndex={-1}
        type="button"
        onClick={e => {
          // Radzen.createDatePicker: de knop opent of sluit de kalender
          if (e.currentTarget.classList.contains('rz-state-disabled') || input.current?.classList.contains('rz-readonly')) return
          if (isOpen) closePopup()
          else openPopup()
        }}
      >
        <span aria-hidden="true" className="notranslate rz-button-icon-left rzi rzi-calendar" />
        <span className="rz-button-text" />
      </button>
      {popupEl}
    </div>
  )
}
