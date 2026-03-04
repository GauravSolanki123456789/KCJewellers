import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
axios.defaults.baseURL = API_URL
axios.defaults.withCredentials = true

export default axios
