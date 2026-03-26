import axios from 'axios'

// Resolve API base URL (no trailing slash). Production builds must set NEXT_PUBLIC_API_URL.
function getApiUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (process.env.NODE_ENV === 'production') {
    console.warn('[KC] NEXT_PUBLIC_API_URL is not set; configure it for the API host (e.g. https://api.kcjewellers.co.in).')
  }
  return 'http://localhost:4000'
}

const API_URL = getApiUrl()
axios.defaults.baseURL = API_URL
axios.defaults.withCredentials = true

export default axios 
