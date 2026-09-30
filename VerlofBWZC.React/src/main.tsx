import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './services/install' // vroeg laden: de installatievraag van de browser (beforeinstallprompt) niet missen
import { AuthProvider } from './auth/AuthState'
import { App } from './app/App'

// Onverwachte fout: dezelfde gele balk onderaan als de Blazor-website (#blazor-error-ui in index.html)
const errorUi = document.getElementById('blazor-error-ui')
const showError = () => {
  if (errorUi) errorUi.style.display = 'block'
}
window.addEventListener('error', showError)
window.addEventListener('unhandledrejection', showError)
errorUi?.querySelector('.dismiss')?.addEventListener('click', () => {
  errorUi.style.display = 'none'
})

createRoot(document.getElementById('app')!).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>,
)

// Zelfde service worker als de Blazor-website (enkel nodig om als app te installeren)
navigator.serviceWorker?.register('service-worker.js')
