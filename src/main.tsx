import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { insertCoin } from 'playroomkit'
import './index.css'
import App from './App.tsx'

insertCoin({
  skipLobby: import.meta.env.MODE === 'development',
  gameId: 'QuizGoodLine',
  discord: true
}).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
