import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import Home from '../pages/Home'

test('zeigt BelegprüfungsApp Titel auf Home', () => {
  render(<Home />)
  expect(screen.getByRole('heading', { name: /BelegprüfungsApp/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Upload/i })).toBeInTheDocument()
})
