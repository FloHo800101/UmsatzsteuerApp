import request from 'supertest'
import app from '../src/app'

it('GET /health -> 200', async () => {
  const res = await request(app).get('/health')
  expect(res.status).toBe(200)
  expect(res.body).toEqual({ ok: true })
})
