import { useEffect, useState } from 'react'
import { Alert } from '../radzen/Layout'
import { Button } from '../radzen/Button'
import { personApi, type PersonBaseDTO } from '../api/person'
import * as tokens from '../auth/tokens'
import { getAuthenticationState, onAuthStateChanged } from '../auth/AuthState'
import { HttpError } from '../api/http'
import { useNavigateTo, usePageTitle } from '../app/navigation'

// Zelfde als VerlofBWZC/Pages/Home.razor (@page "/", [Authorize])
export function Home() {
  usePageTitle('Home')
  const navigateTo = useNavigateTo()
  const [person, setPerson] = useState<PersonBaseDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        // Geldig token, zo nodig ongemerkt vernieuwd ("ingelogd blijven"); anders naar login
        const token = await tokens.getValidAccessToken()
        if (!token || !token.trim()) {
          window.location.assign('/login')
          return
        }

        const authState = await getAuthenticationState()
        if (authState.state !== 'authenticated') {
          window.location.assign('/login')
          return
        }

        const id = Number.parseInt(authState.user.id ?? '', 10)
        if (!Number.isInteger(id) || String(id) !== (authState.user.id ?? '').trim()) {
          if (!cancelled) setErrorMessage('UserId claim ontbreekt of is ongeldig.')
          return
        }

        const p = await personApi.getPersonById(id)
        if (cancelled) return
        setPerson(p)
        if (!p) setErrorMessage('Persoon niet gevonden.')
      } catch (ex) {
        if (cancelled) return
        if (ex instanceof HttpError || ex instanceof TypeError) setErrorMessage(`HTTP fout: ${ex.message}`)
        else setErrorMessage(ex instanceof Error ? ex.message : String(ex))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()

    const unsubscribe = onAuthStateChanged(() => {
      setLoading(true)
      setErrorMessage(null)
      setPerson(null)
      void load()
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return (
    <>
      <h1 className="mb-4">Persoonsgegevens</h1>

      {loading ? (
        <p>Loading...</p>
      ) : errorMessage ? (
        <Alert attributes={{ severity: 'Error' }} style="max-width:400px">
          <b>Fout:</b> {errorMessage}
        </Alert>
      ) : person === null ? (
        <p>Geen gegevens gevonden.</p>
      ) : (
        <div className="card shadow-sm" style={{ maxWidth: 400 }}>
          <div className="card-body">
            <div className="d-flex align-items-center mb-3">
              <div
                className="rounded-circle bg-primary text-white d-flex justify-content-center align-items-center"
                style={{ width: 64, height: 64, fontSize: '2rem' }}
              >
                {person.firstName.substring(0, 1)}
                {person.lastName.substring(0, 1)}
              </div>
              <div className="ms-3">
                <h4 className="card-title mb-0">
                  {person.firstName} {person.lastName}
                </h4>
                <small className="text-muted">{person.role}</small>
              </div>
            </div>
            <ul className="list-group list-group-flush">
              <li className="list-group-item">
                <b>Team:</b> {person.team}
              </li>
              <li className="list-group-item">
                <b>Specialiteit:</b> {person.speciality}
              </li>
              <li className="list-group-item">
                <b>Graad:</b> {person.grade}
              </li>
            </ul>
            <div className="mt-3">
              <Button icon="lock" text="Wachtwoord wijzigen" buttonStyle="Info" onClick={() => navigateTo('/wachtwoord-wijzigen')} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
