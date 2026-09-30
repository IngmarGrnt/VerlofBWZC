import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button } from '../radzen/Button'
import { Stack } from '../radzen/Layout'
import { dialogService } from '../radzen/Dialog'
import { NavLink } from '../app/navigation'
import { AuthTokenKey, getItem } from '../auth/tokens'
import { getUserRole } from '../auth/jwt'
import { markLoggedOut } from '../auth/AuthState'
import { send } from '../api/http'
import { canStartDemo as canStartDemoNow } from '../services/demo'
import { installState, onInstallChanged, promptInstall, type InstallState } from '../services/install'
import { DemoDialog } from './DemoDialog'
import { showInstallHelp } from './InstallHelpDialog'

// Zelfde als VerlofBWZC/Layout/NavMenu.razor. Elementen met b-navmenu krijgen de CSS van NavMenu.razor.css.
const s = { 'b-navmenu': '' }

function Item({ desktopOnly, children }: { desktopOnly?: boolean; children: React.ReactNode }) {
  return (
    <div className={desktopOnly ? 'nav-item px-3 nav-desktop-only' : 'nav-item px-3'} {...s}>
      {children}
    </div>
  )
}

function Link({ href, icon, text, match }: { href: string; icon: string; text: string; match?: 'All' }) {
  return (
    <NavLink className="nav-link" href={href} match={match}>
      <i className={`bi ${icon}`} aria-hidden="true" {...s} />
      <span className="menu-text" {...s}>
        {text}
      </span>
    </NavLink>
  )
}

export function NavMenu() {
  const location = useLocation()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [canSeeTeamCalendar, setCanSeeTeamCalendar] = useState(false) // permissie-flag uit ManagerPanel regels
  const [canStartDemo, setCanStartDemo] = useState(false)

  // Bij het opstarten en na elke navigatie
  useEffect(() => {
    let cancelled = false
    const token = getItem(AuthTokenKey)
    const loggedIn = !!token
    setIsLoggedIn(loggedIn)
    setUserRole(getUserRole(token))
    setCanStartDemo(loggedIn && canStartDemoNow())

    if (loggedIn) {
      // CanSeeTeamCalendar laden, zelfde "open jaar" als in de kalenders
      const year = new Date().getFullYear() + 1
      void (async () => {
        try {
          const resp = await send(`api/access/calendar-permissions?year=${year}`, { token })
          const perms = resp.ok ? ((await resp.json()) as { canSeeTeamCalendar?: boolean } | null) : null
          if (!cancelled) setCanSeeTeamCalendar(perms?.canSeeTeamCalendar ?? false)
        } catch {
          if (!cancelled) setCanSeeTeamCalendar(false)
        }
      })()
    } else {
      setCanSeeTeamCalendar(false)
    }
    return () => {
      cancelled = true
    }
  }, [location])

  // --- App installeren ---
  const [install, setInstall] = useState<InstallState | null>(null)
  useEffect(() => {
    setInstall(installState())
    return onInstallChanged(() => setInstall(installState()))
  }, [])

  const installApp = async () => {
    // Android/Chrome/Edge: meteen de installatievraag; anders (iPhone, andere browsers) uitleg
    if (install?.canPrompt) await promptInstall()
    else if (install) await showInstallHelp(install)
  }

  // Demo modus: enkel voor een echte admin (niet vanuit een demo-sessie)
  const openDemo = () => dialogService.open('Demo modus', <DemoDialog />, { width: '460px' })

  const logout = async () => {
    await markLoggedOut()
    setIsLoggedIn(false)
    setCanSeeTeamCalendar(false)
    window.location.assign('/login')
  }

  if (!isLoggedIn) return null

  const managerOrAdmin = userRole === 'Admin' || userRole === 'Manager'

  return (
    <div className="nav-scrollable" {...s}>
      <nav className="nav flex-column" {...s}>
        <Item>
          <Link href="" match="All" icon="bi-house-door-fill" text="Home" />
        </Item>
        <Item>
          <Link href="WorkCalendar" icon="bi-calendar-event" text="Werkkalender" />
        </Item>

        {/* Toon Teamkalender als Admin/Manager of als permissie CanSeeTeamCalendar = true */}
        {(managerOrAdmin || canSeeTeamCalendar) && (
          <>
            <Item>
              <Link href="TeamCalendar" icon="bi-people-fill" text="Teamkalender" />
            </Item>
            <Item>
              <Link href="Quarterlyleave" icon="bi-layers-half" text="Kwartaalverlof" />
            </Item>
          </>
        )}

        {managerOrAdmin && (
          <>
            <Item desktopOnly>
              <Link href="Random-picker" icon="bi-dice-5-fill" text="Loterij" />
            </Item>

            {/* Verlofregels en beheer: Admin voor alle ploegen, Manager voor de ploegen en specialiteiten die hij beheert. Loterij en Verlofregels niet op gsm (nav-desktop-only) */}
            <div className="nav-section nav-desktop-only" {...s}>
              Verlofregels
            </div>
            <Item desktopOnly>
              <Link href="verlofregels" icon="bi-list-check" text="Verlofcategorieën" />
            </Item>
            <Item desktopOnly>
              <Link href="kwartaalmaxima" icon="bi-bar-chart-steps" text="Kwartaalmaxima" />
            </Item>
            <Item desktopOnly>
              <Link href="max-per-shift" icon="bi-people" text="Max per shift" />
            </Item>

            <div className="nav-section" {...s}>
              Beheer
            </div>
            <Item>
              <Link href="ManagerPanel" icon="bi-shield-lock" text="Manager Paneel" />
            </Item>
            <Item>
              <Link href="person-crud" icon="bi-person-lines-fill" text="Personen" />
            </Item>
          </>
        )}
        {canStartDemo && (
          <Item>
            <button type="button" className="nav-link nav-demo" onClick={openDemo} {...s}>
              <i className="bi bi-eye" aria-hidden="true" {...s} />
              <span className="menu-text" {...s}>
                Demo modus
              </span>
            </button>
          </Item>
        )}
        {install && !install.standalone && (
          // Als app op het beginscherm zetten (niet getoond als ze al als app open is)
          <Item>
            <button type="button" className="nav-link nav-demo" onClick={installApp} {...s}>
              <i className="bi bi-phone" aria-hidden="true" {...s} />
              <span className="menu-text" {...s}>
                App installeren
              </span>
            </button>
          </Item>
        )}
        <Item>
          <Stack orientation="Horizontal" alignItems="Center" gap="20rem" wrap="Wrap">
            <Button buttonStyle="Danger" variant="Outlined" buttonType="button" text="Uitloggen" icon="logout" onClick={logout} className="logout-nav" />
          </Stack>
        </Item>
      </nav>
    </div>
  )
}
