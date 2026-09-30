import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Body, Header, Layout, Sidebar, SidebarToggle, Stack } from '../radzen/Layout'
import { Button } from '../radzen/Button'
import { Notification } from '../radzen/Notification'
import { dialogService } from '../radzen/Dialog'
import { AuthTokenKey, getItem } from '../auth/tokens'
import { mustChangePassword } from '../auth/jwt'
import { getActiveDemo, stopDemo, type DemoInfo } from '../services/demo'
import { NavMenu } from './NavMenu'
import { InstallBanner } from './InstallBanner'
import { DemoDialog } from './DemoDialog'

// Zelfde als VerlofBWZC/Layout/MainLayout.razor. Elementen met b-mainlayout krijgen de CSS van MainLayout.razor.css.
const s = { 'b-mainlayout': '' }

// Gsm/tablet (<= 768px): menu als schuiflade over de pagina, standaard dicht
const mobileQuery = '(max-width: 768px)'
const isMobileNow = () => window.matchMedia(mobileQuery).matches

export function MainLayout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [demo, setDemo] = useState<DemoInfo | null>(null)
  const wasLoggedIn = useRef(false)
  const isMobile = useRef(false)
  const firstLocation = useRef(true)

  // Bij het opstarten en na elke navigatie (Blazor: OnInitialized + LocationChanged)
  useEffect(() => {
    // Gsm/tablet: menu sluiten zodra een pagina gekozen is
    if (!firstLocation.current && isMobile.current) setSidebarExpanded(false)
    firstLocation.current = false

    const token = getItem(AuthTokenKey)
    const loggedIn = !!token
    setIsLoggedIn(loggedIn)

    // Tijdelijk of zwak wachtwoord: niets anders gebruiken tot er een nieuw wachtwoord gekozen is
    const uri = window.location.href.toLowerCase()
    if (mustChangePassword(token) && !uri.includes('/wachtwoord-wijzigen') && !uri.includes('/login')) {
      navigate('/wachtwoord-wijzigen')
      return
    }
    setDemo(loggedIn ? getActiveDemo() : null)
    if (!loggedIn) setSidebarExpanded(false)
    else if (!wasLoggedIn.current) setSidebarExpanded(!isMobile.current) // na inloggen: menu open op desktop, dicht op gsm
    wasLoggedIn.current = loggedIn
  }, [location, navigate])

  // Eerste weergave: op gsm het menu dicht (Blazor: OnAfterRenderAsync + bwzcIsMobile)
  useEffect(() => {
    isMobile.current = isMobileNow()
    if (isMobile.current) setSidebarExpanded(false)
  }, [])

  // RadzenSidebar (Responsive): bij het tonen en als het scherm de grens van 768px overschrijdt: open op desktop, dicht op gsm
  useEffect(() => {
    if (!isLoggedIn) return
    const mq = window.matchMedia(mobileQuery)
    setSidebarExpanded(!mq.matches)
    const onChange = (e: MediaQueryListEvent) => setSidebarExpanded(!e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [isLoggedIn])

  // Lopende demo aanpassen (bv. andere beheerde ploegen) zonder eerst te stoppen
  const editDemo = () => dialogService.open('Demo aanpassen', <DemoDialog initial={demo!} />, { width: '460px' })

  return (
    <>
      <Layout>
        <Header>
          <Stack orientation="Horizontal" alignItems="Center" gap="0" style="width:100%; padding:0 .75rem;">
            {isLoggedIn && <SidebarToggle className="toggle-desktop" onClick={() => setSidebarExpanded(e => !e)} />}
            <img src="LogoBWZC.png" alt="BWZC" className="navbar-logo" {...s} />
          </Stack>
        </Header>

        {isLoggedIn && (
          <>
            <Sidebar expanded={sidebarExpanded}>
              <div className="rz-p-3">
                <NavMenu />
              </div>
            </Sidebar>

            {/* Gsm/tablet: donkere achtergrond achter het menu; tikken sluit het menu (enkel zichtbaar via CSS op kleine schermen) */}
            {sidebarExpanded && <div className="mobile-menu-backdrop" {...s} onClick={() => setSidebarExpanded(false)} />}
          </>
        )}

        <Body>
          <article className="content px-4" {...s}>
            <Notification />
            <InstallBanner />
            {demo && (
              <div className="demo-banner" role="status" {...s}>
                <i className="bi bi-eye" aria-hidden="true" {...s} />
                <span {...s}>
                  <strong {...s}>Demo modus</strong> · {demo.role} · {demo.team} · {demo.speciality}
                  {demo.extra.length > 0 ? ` (+ ${demo.extra.join(', ')})` : ''} · alleen bekijken, opslaan is niet mogelijk
                </span>
                <Button text="Aanpassen" icon="tune" size="Small" buttonStyle="Light" onClick={editDemo} title="Rol, ploeg, specialiteit of beheerde ploegen van de demo aanpassen" />
                <Button text="Stoppen" icon="close" size="Small" buttonStyle="Light" onClick={stopDemo} />
              </div>
            )}
            {children}
          </article>
        </Body>
      </Layout>
    </>
  )
}
