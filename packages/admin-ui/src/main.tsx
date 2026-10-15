import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
// Layout only until Task 5, which imports the design system's stylesheets here
// (docs/superpowers/design/, by CSS @import — Decision 5).
import './styles.css'

const root = document.getElementById('root')
if (root === null) throw new Error('index.html has no #root')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
