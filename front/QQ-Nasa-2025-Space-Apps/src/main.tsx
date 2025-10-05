import { StrictMode } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App.tsx'
import SearchPage from './components/SearchPage.tsx'
import SearchReturnPage from './components/SearchReturnPage.tsx'


const router = createBrowserRouter([
  { path: '/', element: <SearchPage /> },
  { path: '/location-data', element: <SearchReturnPage /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
