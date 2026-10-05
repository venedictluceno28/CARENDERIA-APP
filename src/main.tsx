import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { App } from './app/App'
import { FontPreferenceProvider } from './components/layout/FontPreferenceProvider'
import { AppErrorBoundary } from './components/ui/AppErrorBoundary'
import './styles/index.css'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <FontPreferenceProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </FontPreferenceProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
