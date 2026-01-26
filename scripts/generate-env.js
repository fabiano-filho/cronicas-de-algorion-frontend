/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')

function parseDotEnv(contents) {
    const out = {}
    const lines = contents.split(/\r?\n/)
    for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue
        const eq = line.indexOf('=')
        if (eq === -1) continue
        const key = line.slice(0, eq).trim()
        let value = line.slice(eq + 1).trim()
        value = value.replace(/^"|"$/g, '').replace(/^'|'$/g, '')
        out[key] = value
    }
    return out
}

function main() {
    const frontendDir = path.resolve(__dirname, '..')
    const envPath = path.join(frontendDir, '.env')

    let fileEnv = {}
    if (fs.existsSync(envPath)) {
        fileEnv = parseDotEnv(fs.readFileSync(envPath, 'utf8'))
    }

    // Prioridade: env vars do processo (Render) > frontend/.env (local)
    const backendUrl =
        process.env.FRONTEND_BACKEND_URL || fileEnv.FRONTEND_BACKEND_URL || ''

    const output = `// Gerado por frontend/scripts/generate-env.js\nwindow.__ALG_ENV = window.__ALG_ENV || {};\nwindow.__ALG_ENV.BACKEND_URL = ${JSON.stringify(
        backendUrl
    )};\n`

    const outPath = path.join(frontendDir, 'js', 'env.js')
    fs.writeFileSync(outPath, output, 'utf8')

    console.log('[generate-env] OK:', {
        outPath,
        BACKEND_URL: backendUrl || '(vazio)'
    })
}

main()
