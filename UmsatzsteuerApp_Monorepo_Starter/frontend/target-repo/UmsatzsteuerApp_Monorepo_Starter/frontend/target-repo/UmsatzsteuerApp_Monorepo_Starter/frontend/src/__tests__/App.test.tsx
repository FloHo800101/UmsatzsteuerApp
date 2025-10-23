import { render, screen } from '@testing-library/react'
import App from '../App'

test('zeigt Topbar', () => {
  render(<App />)
  expect(screen.getByText(/UmsatzsteuerApp/i)).toBeInTheDocument()
})
