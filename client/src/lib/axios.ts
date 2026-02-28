import axios from 'axios'

// Ensure auth cookies are sent with cross-origin requests
axios.defaults.withCredentials = true

export default axios
