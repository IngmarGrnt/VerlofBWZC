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

// Zelfde als VerlofBWZC/App.razor: router met <AuthorizeRouteView> en MainLayout.
// Pagina's met [Authorize]: tijdens het nakijken "Authorizing...", niet aangemeld = naar /login (volledig herladen).

function RedirectToLogin() {
  useEffect(() => {
    window.location.assign('/login')
  }, [])
  return null
}

function Authorize({ children }: { children: ReactNode }) {
  const auth = useAuth()
  if (auth.state === 'authorizing') return <p>Authorizing...</p>
  if (auth.state === 'anonymous') return <RedirectToLogin />
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MainLayout>
      <FocusOnNavigate selector="h1" />
      <Dialog />
    </>
  )
}
