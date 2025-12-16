import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { insertCoin } from 'playroomkit'
import './index.css'
import App from './App.tsx'

insertCoin({
  skipLobby: false, // Show Playroom Lobby for name/color selection, helpful for dev
  gameId: 'QuizGoodLine', // Unique ID
  discord: true // Enable Discord Activity Support
}).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
