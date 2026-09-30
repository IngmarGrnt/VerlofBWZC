import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { useBlocker, useLocation, useNavigate } from 'react-router-dom'

// Hulp voor Blazor-gedrag: NavigationManager.NavigateTo, <NavLink>, <PageTitle> en <FocusOnNavigate>.

export const DefaultTitle = 'Verlofplanner BWZC'

// <PageTitle>: titel zolang de pagina open is, daarna weer die van index.html
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title
    return () => {
      document.title = DefaultTitle
    }
  }, [title])
}

// NavigationManager.NavigateTo(url, forceLoad)
export function useNavigateTo() {
  const navigate = useNavigate()
  return (url: string, forceLoad = false) => {
    if (forceLoad) window.location.assign(url)
    else navigate(url.startsWith('/') ? url : `/${url}`)
  }
}

// <NavLink class="nav-link" href="..." Match="...">: klasse "active" als de pagina overeenkomt
// (Prefix: het pad begint ermee, hoofdletterongevoelig; All: exact)
export function NavLink({ href, match = 'Prefix', className, children }: { href: string; match?: 'Prefix' | 'All'; className?: string; children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const target = `/${href}`.toLowerCase()
  const path = location.pathname.toLowerCase()
  const active =
    match === 'All' ? path === target || (target === '/' && path === '') : path === target || path.startsWith(target.endsWith('/') ? target : `${target}/`)
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(`/${href}`)
  }
  return (
    <a href={href} aria-current={active ? 'page' : undefined} className={[className, active && 'active'].filter(Boolean).join(' ')} onClick={onClick}>
      {children}
    </a>
  )
}

// Gewone <a href="/..."> in een Blazor-pagina: de router vangt de klik op (geen volledige herlading)
export function RouterLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const navigate = useNavigate()
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(href)
  }
  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  )
}

// <FocusOnNavigate Selector="h1">: na elke navigatie de eerste h1 focussen
export function FocusOnNavigate({ selector }: { selector: string }) {
  const location = useLocation()
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(selector)
      if (!el) return
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
      el.focus({ preventScroll: true })
    })
    return () => window.clearTimeout(timer)
  }, [location.pathname, selector])
  return null
}

// <NavigationLock ConfirmExternalNavigation="..." OnBeforeInternalNavigation="...">:
// - interne navigatie (menu, links, navigate): eerst onBeforeInternalNavigation; geeft die false, dan blijft de pagina staan
// - externe navigatie of herladen (confirmExternalNavigation): de vraag van de browser ("Wijzigingen verlaten?")
export function NavigationLock({
  confirmExternalNavigation,
  onBeforeInternalNavigation,
  active,
}: {
  confirmExternalNavigation: boolean
  onBeforeInternalNavigation: () => Promise<boolean>
  // Enkel tegenhouden als er iets te vragen valt (bv. niet-opgeslagen wijzigingen)
  active: boolean
}) {
  const handler = useRef(onBeforeInternalNavigation)
  handler.current = onBeforeInternalNavigation
  const blocker = useBlocker(({ currentLocation, nextLocation }) => active && currentLocation.pathname + currentLocation.search !== nextLocation.pathname + nextLocation.search)
  const busy = useRef(false)

  useEffect(() => {
    if (blocker.state !== 'blocked' || busy.current) return
    busy.current = true
    void handler
      .current()
      .then(ok => (ok ? blocker.proceed() : blocker.reset()))
      .finally(() => {
        busy.current = false
      })
  }, [blocker])

  useEffect(() => {
    if (!confirmExternalNavigation) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [confirmExternalNavigation])

  return null
}
