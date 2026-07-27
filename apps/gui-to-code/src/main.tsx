import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './style.css'

const root = document.getElementById('likec4-root')

if (root == null) {
  throw new Error('Missing #likec4-root')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
