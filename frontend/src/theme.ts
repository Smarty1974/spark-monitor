import { defaultTheme } from 'react-admin'
import { createTheme } from '@mui/material'

export const theme = createTheme({
  ...defaultTheme,
  palette: {
    primary:    { main: '#E25822' },   // Spark orange
    secondary:  { main: '#1565c0' },
    background: { default: '#f4f6f8' },
    success:    { main: '#2e7d32' },
    warning:    { main: '#f57c00' },
    error:      { main: '#c62828' },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", sans-serif',
    h6: { fontWeight: 600 },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 10, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 8, textTransform: 'none', fontWeight: 600 }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 700, backgroundColor: '#f4f6f8' }
      }
    }
  }
})
