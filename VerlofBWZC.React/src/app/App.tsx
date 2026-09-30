import { useEffect, type ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import { MainLayout } from '../layout/MainLayout'
import { Dialog } from '../radzen/Dialog'
import { useAuth } from '../auth/AuthState'
import { FocusOnNavigate, usePageTitle } from './navigation'
import { Home } from '../pages/Home'
import { Login } from '../pages/Login'
import { Register } from '../pages/Register'
import { ChangePassword } from '../pages/ChangePassword'
import { QuarterLimits } from '../pages/QuarterLimits'
import { WorkCalendar } from '../pages/WorkCalendar'
import { TeamCalendar } from '../pages/TeamCalendar'
import { QuarterlyLeave } from '../pages/QuarterlyLeave'
import { RandomNamePicker } from '../pages/RandomNamePicker'
import { LeaveRules } from '../pages/LeaveRules'
import { ShiftQuotas } from '../pages/ShiftQuotas'
import { ManagerPanel } from '../pages/ManagerPanel'
import { PersonCRUD } from '../pages/PersonCRUD'

// Zelfde als VerlofBWZC/App.razor: router met <AuthorizeRouteView> en MainLayout.
// Pagina's met [Authorize]: tijdens het nakijken "Authorizing...", niet aangemeld = naar /login (volledig herladen).

function RedirectToLogin() {
  useEffect(() => {
    window.location.assign('/login')
  }, [])
  return null
}

// roles: zoals [Authorize(Roles = "Admin,Manager")] (een van de rollen, hoofdlettergevoelig zoals ClaimsPrincipal.IsInRole)
function Authorize({ roles, children }: { roles?: string[]; children: ReactNode }) {
  const auth = useAuth()
  if (auth.state === 'authorizing') return <p>Authorizing...</p>
  if (auth.state === 'anonymous') return <RedirectToLogin />
  if (roles && !roles.some(r => auth.user.roles.includes(r))) return <RedirectToLogin />
  return <>{children}</>
}

function NotFound() {
  usePageTitle('Not found')
  return <p role="alert">Sorry, there's nothing at this address.</p>
}

export function App() {
  return (
    <>
      <MainLayout>
        <Routes>
          <Route
            path="/"
            element={
              <Authorize>
                <Home />
              </Authorize>
            }
          />
          <Route path="/login" element={<Login />} />
          <Route path="/registreren" element={<Register />} />
          <Route
            path="/wachtwoord-wijzigen"
            element={
              <Authorize>
                <ChangePassword />
              </Authorize>
            }
          />
          <Route
            path="/kwartaalmaxima"
            element={
              <Authorize roles={['Admin', 'Manager']}>
                <QuarterLimits />
              </Authorize>
            }
          />
          <Route
            path="/workcalendar"
            element={
              <Authorize>
                <WorkCalendar />
              </Authorize>
            }
          />
          <Route
            path="/teamcalendar"
            element={
              <Authorize>
                <TeamCalendar />
              </Authorize>
            }
          />
          <Route
            path="/Quarterlyleave"
            element={
              <Authorize>
                <QuarterlyLeave />
              </Authorize>
            }
          />
          <Route
            path="/Random-picker"
            element={
              <Authorize>
                <RandomNamePicker />
              </Authorize>
            }
          />
          <Route
            path="/verlofregels"
            element={
              <Authorize roles={['Admin', 'Manager']}>
                <LeaveRules />
              </Authorize>
            }
          />
          <Route
            path="/max-per-shift"
            element={
              <Authorize roles={['Admin', 'Manager']}>
                <ShiftQuotas />
              </Authorize>
            }
          />
          <Route
            path="/ManagerPanel"
            element={
              <Authorize roles={['Admin', 'Manager']}>
                <ManagerPanel />
              </Authorize>
            }
          />
          <Route
            path="/person-crud"
            element={
              <Authorize roles={['Admin', 'Manager']}>
                <PersonCRUD />
              </Authorize>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MainLayout>
      <FocusOnNavigate selector="h1" />
      <Dialog />
    </>
  )
}
