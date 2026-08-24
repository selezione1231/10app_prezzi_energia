import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './components/Auth/Login'
import Navbar from './components/Layout/Navbar'
import SolarValuationView from './components/SolarValuation/SolarValuationView'
import MarketExplorerView from './components/MarketExplorer/MarketExplorerView'
import SavedSimulationsView from './components/Simulations/SavedSimulationsView'
import { Loader2 } from 'lucide-react'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('solar') // 'solar' | 'market' | 'simulations'

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    setSession(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
        <span className="text-sm font-medium text-slate-300">Caricamento 10app_prezzi_energia...</span>
      </div>
    )
  }

  if (!session) {
    return <Login onLoginSuccess={(sess) => setSession(sess)} />
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={session.user}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'solar' && <SolarValuationView user={session.user} />}
        {activeTab === 'market' && <MarketExplorerView />}
        {activeTab === 'simulations' && <SavedSimulationsView user={session.user} />}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        <p>10app_prezzi_energia • Modulo di Previsione e Valutazione Economica FTV • Hub_FTV Tools</p>
      </footer>
    </div>
  )
}
