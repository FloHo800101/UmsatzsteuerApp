import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import Home from '../pages/Home'

test('zeigt Willkommens-Titel auf Home', () => {
  render(<Home />)
  expect(screen.getByRole('heading', { name: /BelegVollständigkeitsApp/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Beleg hochladen/i })).toBeInTheDocument()
})
