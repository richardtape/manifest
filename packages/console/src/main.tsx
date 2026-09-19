import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
// §22's quality bar, in one file: system fonts, one column, ~80 lines of plain CSS. NOT a
// design system and not branding — "coherent enough to walk a pilot faculty member through,
// obviously not polished enough that anyone mistakes its choices for product decisions".
// Task 4 writes it in full; Task 2 creates it because `vite build` fails to resolve an
// import of a file that does not exist, and this task's Step 10 builds. The boundary test
// DOES read this import — it is a module specifier like any other — and allows it because
// `./styles.css` resolves inside src/. Prettier owns the file itself, because it lives
// under packages/.
import './styles.css'

const root = document.getElementById('root')
if (root === null) throw new Error('index.html has no #root')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
