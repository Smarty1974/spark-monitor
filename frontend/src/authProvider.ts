import { AuthProvider } from 'react-admin'

const BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8081/api'

const authProvider: AuthProvider = {

  login: async ({ username, password }) => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || 'Credenziali non valide')
    }
    const data = await res.json()
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify({
      username: data.username,
      role:     data.role,
    }))
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    return Promise.resolve()
  },

  checkAuth: () =>
    localStorage.getItem('token') ? Promise.resolve() : Promise.reject(),

  checkError: (error) => {
    const status = error?.status || error?.response?.status
    if (status === 401 || status === 403) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      return Promise.reject()
    }
    return Promise.resolve()
  },

  getPermissions: () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      return Promise.resolve(user.role || 'VIEWER')
    } catch {
      return Promise.resolve('VIEWER')
    }
  },

  getIdentity: () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      return Promise.resolve({
        id:       user.username || 'unknown',
        fullName: user.username || 'Utente',
        avatar:   undefined,
      })
    } catch {
      return Promise.resolve({ id: 'unknown', fullName: 'Utente' })
    }
  },
}

export default authProvider
