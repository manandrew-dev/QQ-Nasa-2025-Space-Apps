// server.js (ESM) — mounts the hybrid router from Calculations.js
import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import { router as calcRouter } from './Calculations.js'

const app = express()
app.use(cors())
app.use(bodyParser.json())

// Mount the router that contains the AU+future -> ML, else -> NASA logic
app.use('/api', calcRouter)

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🌎 Server running at http://localhost:${PORT}`)
})
