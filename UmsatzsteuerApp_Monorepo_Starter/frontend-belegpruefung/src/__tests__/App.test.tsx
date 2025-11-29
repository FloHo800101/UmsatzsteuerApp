import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import App from '../App'

test('zeigt BelegprüfungsApp Titel', () => {
  render(<App />)
  // prefer to search by role for robustness
  expect(screen.getByRole('heading', { name: /BelegprüfungsApp/i })).toBeInTheDocument()
})
