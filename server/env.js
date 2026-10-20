import dotenv from 'dotenv'

// Muat .env.local terlebih dahulu (prioritas tertinggi), lalu .env
dotenv.config({ path: '.env.local' })
dotenv.config()
