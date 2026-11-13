import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// Dev only: serve the Vercel functions in /api from the Vite dev server, so
// `npm run dev` shows real analytics. Production uses Vercel's own runtime.
function localApi() {
  return {
    name: 'local-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), '')
      for (const [k, v] of Object.entries(env)) if (!(k in process.env)) process.env[k] = v
      const keyFile = path.resolve('sa-key.json')
      if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY && fs.existsSync(keyFile)) {
        process.env.GOOGLE_SERVICE_ACCOUNT_KEY = fs.readFileSync(keyFile, 'utf8')
      }
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost')
        const m = url.pathname.match(/^\/api\/([\w-]+)$/)
        if (!m) return next()
        const file = path.resolve('api', m[1] + '.js')
        if (!fs.existsSync(file)) return next()
        try {
          const mod = await server.ssrLoadModule(file)
          req.query = Object.fromEntries(url.searchParams)
          res.status = (c) => { res.statusCode = c; return res }
          res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)) }
          await mod.default(req, res)
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: e.message }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), localApi()],
})
