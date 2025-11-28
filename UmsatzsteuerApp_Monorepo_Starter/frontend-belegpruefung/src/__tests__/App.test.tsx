import { render, screen } from '@testing-library/react'
import App from '../App'

test('zeigt BelegprüfungsApp Titel', () => {
  render(<App />)
  expect(screen.getByText(/BelegprüfungsApp/i)).toBeInTheDocument()
})
