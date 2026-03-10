import axios from 'axios'

// Bulletproof URL resolution with fallback logic
function getApiUrl(): string {
  // First, try to use process.env.NEXT_PUBLIC_API_URL
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }
  
  // If missing, check if process.env.NODE_ENV === 'production'
  if (process.env.NODE_ENV === 'production') {
    return 'https://api.kc.gauravsoftwares.tech'
  }
  
  // Otherwise, default to localhost for local development
  return 'http://localhost:4000'
}

const API_URL = getApiUrl()
axios.defaults.baseURL = API_URL
axios.defaults.withCredentials = true

export default axios 
