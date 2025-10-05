// server.js (ESM) — uses model/rand_forest.py
import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
app.use(cors())
app.use(bodyParser.json())

const PORT = process.env.PORT || 3000

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PYTHON = process.env.PYTHON_BIN || 'python3'
const PY_ML = path.join(__dirname, 'model', 'rand_forest.py') // <-- model path

function runPython(args, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const py = spawn(PYTHON, args, { env: process.env })
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      try { py.kill('SIGKILL') } catch {}
      reject(new Error(`Python timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    py.stdout.on('data', d => { stdout += d.toString() })
    py.stderr.on('data', d => { stderr += d.toString() })

    py.on('close', (code) => {
      clearTimeout(timer)
      console.log('[PY exit]', code)
      if (stderr) console.warn('[PY stderr]', stderr.slice(0, 1000))
      console.log('[PY stdout]', stdout.slice(0, 300))

      const lines = (stdout || '').trim().split(/\r?\n/)
      for (const line of lines) {
        try {
          const obj = JSON.parse(line)
          return resolve({ code, data: obj, stderr })
        } catch {}
      }
      reject(new Error(`No JSON found in Python output`))
    })

    py.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

app.post('/api/calculate_prob', async (req, res) => {
  try {
    const { coords, date, time, tzone, city } = req.body || {}
    console.log('REQ BODY:', req.body)

    if (!Array.isArray(coords) || coords.length !== 2 || !date || !time || typeof tzone === 'undefined') {
      return res.status(400).json({ error: 'Missing required fields: coords [lat,lng], date, time, tzone' })
    }

    const [lat, lng] = coords.map(Number)

    const args = [
      PY_ML,
      String(lat),
      String(lng),
      String(tzone),
      String(date),
      String(time),
      city ? String(city) : ''
    ]

    const { data } = await runPython(args)

    const json = {
      average_precipitation_mm_per_hr:
        typeof data.average_precipitation_mm_per_hr === 'number' ? data.average_precipitation_mm_per_hr : 0,
      rain_probability_percent:
        typeof data.rain_probability_percent === 'number' ? data.rain_probability_percent
          : (typeof data.confidence === 'number' ? Math.round(data.confidence * 100) : 0),
      rain_intensity_category: data.rain_intensity_category || data.prediction || 'Unknown',
      chart_image_base64: data.chart_image_base64 || null,
      debug: { location: data.location || city || null }
    }

    res.json(json)
  } catch (err) {
    console.error('[ERROR] /api/calculate_prob', err)
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.listen(PORT, () => {
  console.log(`🌎 Server running at http://localhost:${PORT}`)
})
