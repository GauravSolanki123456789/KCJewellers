'use client'
import { useEffect, useState } from 'react'
import { subscribeLiveRates } from '@/lib/socket'

type Rate = { metal_type: string, display_rate?: number, sell_rate?: number }
export default function RateTicker() {
  const [rates, setRates] = useState<Rate[]>([])
  const [isOffline, setIsOffline] = useState(false)
  
  // STEP 2: HTTP Fallback - Fetch rates from API if socket fails
  const fetchRatesFromAPI = async () => {
    try {
      const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
      const response = await fetch(`${url}/api/rates/live`)
      const data = await response.json()
      console.log('API Response:', data)
      
      if (data.success && data.rates) {
        setIsOffline(false)
        // Convert API response format to component format
        const gold24 = data.rates.gold24 || 0
        const gold22 = data.rates.gold22 || 0
        const silver = data.rates.silver || 0
        
        const apiRates: Rate[] = []
        if (gold24) apiRates.push({ metal_type: 'gold', display_rate: gold24 })
        if (gold22) apiRates.push({ metal_type: 'gold_22k', display_rate: gold22 })
        if (silver) apiRates.push({ metal_type: 'silver', display_rate: silver })
        
        if (apiRates.length > 0) {
          setRates(apiRates)
        }
      }
    } catch (error) {
      console.error('Failed to fetch rates from API:', error)
      setIsOffline(true)
    }
  }
  
  useEffect(() => {
    // Try socket first
    let socketConnected = false
    const off = subscribeLiveRates((p) => {
      socketConnected = true
      setIsOffline(false)
      const arr = Array.isArray(p?.rates) ? p.rates : []
      const safe = arr.filter((r) => r && typeof r.metal_type === 'string').map((r) => ({
        metal_type: String(r.metal_type),
        display_rate: Number(typeof r.display_rate === 'number' ? r.display_rate : (typeof r.sell_rate === 'number' ? r.sell_rate : 0)),
        sell_rate: Number(typeof r.sell_rate === 'number' ? r.sell_rate : 0)
      }))
      setRates(safe)
    })
    
    // Fallback to HTTP if socket doesn't connect within 2 seconds
    const timeout = setTimeout(() => {
      if (!socketConnected && rates.length === 0) {
        fetchRatesFromAPI()
      }
    }, 2000)
    
    // Also fetch immediately as backup
    fetchRatesFromAPI()
    
    return () => {
      clearTimeout(timeout)
      off()
    }
  }, [])
  
  return (
    <div className="glass-card p-4">
      <div className="text-2xl font-semibold gold-text">Live Rates</div>
      {isOffline && rates.length === 0 ? (
        <div className="mt-4 text-center">
          <div className="text-lg font-semibold text-gray-500">Offline Mode</div>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-4">
          {rates.map((r) => (
            <div key={r.metal_type} className="text-center">
              <div className="uppercase text-sm opacity-80">{r.metal_type}</div>
              <div className="text-4xl font-bold">₹{Math.round(Number(r.display_rate || r.sell_rate || 0))}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
