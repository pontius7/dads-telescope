import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { loadLang } from './i18n'
import { watchForUpdates } from './updates'
import './styles.css'

loadLang()
// Without this a phone keeps serving the build it cached the first time it
// opened the app, and every later deploy is invisible on the device.
watchForUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
