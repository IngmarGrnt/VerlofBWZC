import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cls, parseStyle, scrollableParents, uniqueId, withClass } from './core'
import { useFieldClass } from './EditForm'

// RadzenDropDown (enkelvoudige keuze, met AllowClear en AllowFiltering), zoals RadzenDropDown.razor en Radzen.openPopup:
// de lijst opent als popup onder het veld (in <body>, zoals Radzen), met dezelfde klassen en animatie.
export interface DropDownProps<TItem, TValue> {
  data: readonly TItem[] | null | undefined
  value: TValue | null | undefined
  onChange: (value: TValue | null) => void
  textProperty?: (item: TItem) => string
  valueProperty?: (item: TItem) => TValue
  template?: (item: TItem) => ReactNode
  name?: string
  placeholder?: string
  style?: string
  className?: string
  disabled?: boolean
  tabIndex?: number
  popupStyle?: string
  // Kruisje om de keuze te wissen (AllowClear)
  allowClear?: boolean
  // Zoekveld bovenaan de lijst (AllowFiltering, "bevat"); caseInsensitive = FilterCaseSensitivity.CaseInsensitive
  allowFiltering?: boolean
  caseInsensitive?: boolean
  filterPlaceholder?: string
}

type PopupState = { open: boolean; closing: boolean; top: number; left: number; width: number }

export function DropDown<TItem, TValue = TItem>({
  data,
  value,
  onChange,
  textProperty,
  valueProperty,
  template,
  name,
  placeholder,
  style,
  className,
  disabled = false,
  tabIndex = 0,
  popupStyle = 'max-height:200px;overflow-x:hidden',
  allowClear = false,
  allowFiltering = false,
  caseInsensitive = false,
  filterPlaceholder = '',
}: DropDownProps<TItem, TValue>) {
  const [id] = useState(uniqueId)
  const popupId = `popup${id}${useId().replace(/:/g, '')}`
  const element = useRef<HTMLDivElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [state, setState] = useState<PopupState>({ open: false, closing: false, top: 0, left: 0, width: 0 })
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const { fieldClass, notifyChanged } = useFieldClass(name)

  const search = useRef<HTMLInputElement>(null)
  const [searchText, setSearchText] = useState('')
  const [filterText, setFilterText] = useState('')
  const valueOf = useCallback((item: TItem) => (valueProperty ? valueProperty(item) : (item as unknown as TValue)), [valueProperty])
  const textOf = useCallback((item: TItem) => (textProperty ? textProperty(item) : String(item ?? '')), [textProperty])
  // De lijst in de popup: bij AllowFiltering enkel de items die de zoektekst bevatten
  const items = useMemo(() => {
    const all = data ?? []
    if (!allowFiltering || !filterText) return all
    const needle = caseInsensitive ? filterText.toLowerCase() : filterText
    return all.filter(item => (caseInsensitive ? textOf(item).toLowerCase() : textOf(item)).includes(needle))
  }, [data, allowFiltering, filterText, caseInsensitive, textOf])
  const selectedIndex = items.findIndex(item => Object.is(valueOf(item), value) || valueOf(item) === value)
  const allItems = data ?? []
  const selectedIndexAll = allItems.findIndex(item => Object.is(valueOf(item), value) || valueOf(item) === value)
  // Zoals SelectItemFromValue: zonder ValueProperty is de waarde zelf het gekozen item (ook als ze niet in de lijst
  // staat, bv. "" = leeg label zonder placeholder); met ValueProperty het item uit de lijst. Nog geen lijst = niets.
  const selectedItem: TItem | undefined =
    data == null || value === null || value === undefined ? undefined : valueProperty ? (selectedIndexAll >= 0 ? allItems[selectedIndexAll] : undefined) : (value as unknown as TItem)
  const hasValue = value !== null && value !== undefined && value !== ''

  const open = useCallback(() => {
    if (disabled || !element.current) return
    const rect = element.current.getBoundingClientRect()
    setState({ open: true, closing: false, top: rect.bottom, left: rect.left, width: rect.width })
    setFocusedIndex(selectedIndex)
    // Met zoekveld: de focus gaat naar het zoekveld (Radzen.focusElement)
    if (allowFiltering) window.setTimeout(() => search.current?.focus())
  }, [disabled, selectedIndex, allowFiltering])

  // Zoals Radzen: filteren terwijl je typt, na een korte pauze (FilterDelay 500 ms)
  useEffect(() => {
    if (!allowFiltering) return
    const timer = window.setTimeout(() => setFilterText(searchText), 500)
    return () => window.clearTimeout(timer)
  }, [searchText, allowFiltering])

  const close = useCallback(() => {
    setState(s => (s.open ? { ...s, closing: true } : s))
    // Normaal sluit de popup na de animatie (rz-close); zonder animatie toch sluiten
    window.setTimeout(() => setState(s => (s.closing ? { ...s, open: false, closing: false } : s)), 500)
  }, [])

  // Zoals Radzen.openPopup: boven het veld als er onderaan geen plaats is, links opschuiven als het niet past
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
  }, [state])

  // Zoals Radzen.repositionPopup na het filteren: de lijst is korter/langer, dus opnieuw onder (of boven) het veld
  const lastFilter = useRef(filterText)
  useLayoutEffect(() => {
    if (lastFilter.current === filterText) return
    lastFilter.current = filterText
    if (!state.open || state.closing || !popup.current || !element.current) return
    const parentRect = element.current.getBoundingClientRect()
    const rect = popup.current.getBoundingClientRect()
    const scrollTop = document.documentElement.scrollTop
    let top = parentRect.bottom + scrollTop
    if (top + rect.height > window.innerHeight + scrollTop && parentRect.top > rect.height) top = parentRect.top - rect.height + scrollTop
    popup.current.style.top = `${top}px`
  }, [filterText, state])

  // Sluiten bij klikken buiten het veld of de lijst, en bij het wijzigen van de venstergrootte
  useEffect(() => {
    if (!state.open || state.closing) return
    // Zoals Radzen.closePopup: na het sluiten de focus terug naar het veld (of naar het aangeklikte element als dat
    // focus kan krijgen), als de focus nog op het veld of nergens (body) staat
    const closeAndRefocus = (e: Event) => {
      close()
      const active = element.current
      if (active && (document.activeElement === active || document.activeElement === document.body)) {
        window.setTimeout(() => {
          const target = e.target as HTMLElement | null
          const next = target && typeof target.tabIndex === 'number' && target.tabIndex !== -1 && 'focus' in target ? target : active
          next.focus()
        })
      }
    }
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!element.current?.contains(target) && !popup.current?.contains(target)) closeAndRefocus(e)
    }
    const onResize = () => {
      const tag = document.activeElement?.tagName.toLowerCase() ?? ''
      if (!/Android/i.test(navigator.userAgent) && !['input', 'textarea'].includes(tag)) close()
    }
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('resize', onResize)
    // Zoals Radzen.openPopup: sluiten als een scrollbare ouder scrollt (closeAllPopups)
    const scrollParents = scrollableParents(element.current)
    scrollParents.forEach(p => p.addEventListener('scroll', closeAndRefocus))
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('resize', onResize)
      scrollParents.forEach(p => p.removeEventListener('scroll', closeAndRefocus))
    }
  }, [state.open, state.closing, close])

  // Gefocust item in beeld houden (Radzen.focusListItem)
  useEffect(() => {
    if (!state.open || focusedIndex < 0) return
    const li = listRef.current?.children[focusedIndex] as HTMLElement | undefined
    li?.scrollIntoView({ block: 'nearest' })
  }, [focusedIndex, state.open])

  const select = (item: TItem | null) => {
    const newValue = item === null ? null : valueOf(item)
    if (newValue !== value) {
      notifyChanged()
      onChange(newValue)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const key = e.code || e.key
    const isOpen = state.open && !state.closing
    if (!e.altKey && ['ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight'].includes(key)) {
      e.preventDefault()
      const forward = key === 'ArrowDown' || key === 'ArrowRight'
      const start = isOpen ? focusedIndex : selectedIndex
      const next = Math.min(Math.max(forward ? start + 1 : start - 1, 0), items.length - 1)
      setFocusedIndex(next)
      if (!isOpen && items[next] !== undefined) select(items[next])
    } else if (key === 'Enter' || key === 'NumpadEnter' || key === 'Space') {
      e.preventDefault()
      if (isOpen && focusedIndex >= 0 && focusedIndex < items.length) select(items[focusedIndex])
      if (!isOpen) {
        if (key !== 'Space') open()
      } else {
        close()
        element.current?.focus()
      }
    } else if (e.altKey && key === 'ArrowDown') {
      e.preventDefault()
      open()
    } else if (key === 'Escape' || key === 'Tab') {
      close()
    } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault()
      const letter = e.key.toLowerCase()
      const matches = items.map((item, i) => ({ item, i })).filter(x => textOf(x.item).toLowerCase().startsWith(letter))
      if (matches.length) {
        const after = matches.find(x => x.i > (isOpen ? focusedIndex : selectedIndex)) ?? matches[0]
        setFocusedIndex(after.i)
        select(after.item)
      }
    }
  }

  const clearAll = () => {
    if (disabled) return
    setSearchText('')
    setFilterText('')
    if (search.current) search.current.value = ''
    notifyChanged()
    onChange(null)
  }

  // Toetsen in het zoekveld: pijltjes en Enter werken op de lijst, andere toetsen typen gewoon
  const onFilterKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
    const key = e.code || e.key
    if (['ArrowDown', 'ArrowUp'].includes(key)) {
      e.preventDefault()
      setFocusedIndex(i => Math.min(Math.max(key === 'ArrowDown' ? i + 1 : i - 1, 0), items.length - 1))
    } else if (key === 'Enter' || key === 'NumpadEnter') {
      e.preventDefault()
      if (focusedIndex >= 0 && focusedIndex < items.length) select(items[focusedIndex])
      close()
      element.current?.focus()
    } else if (key === 'Escape' || key === 'Tab') {
      close()
    }
  }

  const componentClass = cls('rz-dropdown', disabled && 'rz-state-disabled', fieldClass, !hasValue && 'rz-state-empty', allowClear && 'rz-clear')

  const label =
    selectedItem !== undefined ? (
      template ? (
        <span className="rz-dropdown-label rz-inputtext">{template(selectedItem)}</span>
      ) : (
        <span className="rz-dropdown-label rz-inputtext">{textOf(selectedItem)}</span>
      )
    ) : placeholder ? (
      <span className="rz-dropdown-label rz-inputtext rz-placeholder">{placeholder}</span>
    ) : (
      <span className="rz-dropdown-label rz-inputtext">&nbsp;</span>
    )

  const panel = state.open && (
    <div
      ref={popup}
      id={popupId}
      className={cls('rz-dropdown-panel', state.closing ? 'rz-close' : 'rz-open', 'rz-popup')}
      style={{ display: 'block', boxSizing: 'border-box', width: state.width, minWidth: state.width, zIndex: 2000, top: state.top, left: state.left }}
      onAnimationEnd={() => {
        if (state.closing) setState(s => ({ ...s, open: false, closing: false }))
      }}
      // De popup staat in <body>, maar React laat klikken en toetsen doorborrelen naar het veld
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      {allowFiltering && (
        <div className="rz-dropdown-filter-container">
          <input
            ref={search}
            aria-label="Search"
            tabIndex={disabled ? -1 : tabIndex}
            placeholder={filterPlaceholder}
            className="rz-dropdown-filter rz-inputtext"
            autoComplete="Off"
            aria-autocomplete="none"
            type="text"
            defaultValue={searchText}
            onInput={e => setSearchText(e.currentTarget.value)}
            onKeyDown={onFilterKeyDown}
          />
          <span className="notranslate rz-dropdown-filter-icon rzi rzi-search" />
        </div>
      )}
      <div className="rz-dropdown-items-wrapper" style={parseStyle(popupStyle)}>
        {items.length > 0 && (
          <ul ref={listRef} className="rz-dropdown-items rz-dropdown-list" role="listbox">
            {items.map((item, i) => (
              <li
                key={i}
                role="option"
                className={cls('rz-dropdown-item', (state.open && !state.closing ? i === focusedIndex : i === selectedIndex) && 'rz-state-highlight') + ' '}
                aria-label={textOf(item)}
                onMouseDown={e => e.preventDefault()}
                onClick={e => {
                  e.preventDefault()
                  e.stopPropagation() // de popup staat in <body>, maar React laat klikken toch doorborrelen naar het veld
                  select(item)
                  close()
                  element.current?.focus()
                }}
              >
                <span>{template ? template(item) : textOf(item)}</span>
              </li>
            ))}
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
        <input
          disabled={disabled || undefined}
          aria-haspopup="listbox"
          readOnly
          type="text"
          tabIndex={-1}
          name={name}
          value={value !== null && value !== undefined ? String(value) : ''}
          id={name}
          // Zoals Blazor bij een bool-waarde: true = leeg attribuut, false = geen attribuut
          aria-label={value === true ? '' : value === false ? undefined : value !== null && value !== undefined ? String(value) : 'Empty'}
        />
      </div>
      {label}
      <div className="rz-dropdown-trigger rz-corner-right">
        <span className="notranslate rz-dropdown-trigger-icon rzi rzi-chevron-down" />
      </div>
      {panel && createPortal(panel, document.body)}
      {allowClear && hasValue && (
        <i
          className="notranslate rz-dropdown-clear-icon rzi rzi-times"
          onClick={e => {
            e.stopPropagation()
            clearAll()
          }}
        />
      )}
    </div>
  )
}
