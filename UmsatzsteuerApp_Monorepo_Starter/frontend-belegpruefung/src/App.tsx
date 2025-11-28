import React from 'react'
import Home from './pages/Home'
import Header from './components/Header'

export default function App() {
  return (
    <div className="container">
      <Header />
      <main>
        <Home />
      </main>
    </div>
  )
}
