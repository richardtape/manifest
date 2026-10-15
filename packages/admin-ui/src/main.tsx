import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
// The drawing's three stylesheets (docs/superpowers/design/, by CSS @import — Decision 5) and the page.
import './styles.css'

const root = document.getElementById('root')
if (root === null) throw new Error('index.html has no #root')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
