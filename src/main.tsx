import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { loadLang } from './i18n'
import './styles.css'

loadLang()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
