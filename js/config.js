/**
 * Crônicas de Algorion - Frontend config
 * Permite configurar a URL do backend (Render/produção) sem precisar recompilar.
 *
 * Prioridade:
 * 1) ?backend=https://... (querystring)
 * 2) window.__ALG_ENV.BACKEND_URL (env.js gerado)
 * 3) localStorage algorion_backend_url
 * 4) localhost (dev)
 */
;(function () {
    const DEFAULT_LOCAL = 'http://localhost:3001'

    function normalize(url) {
        if (!url) return url
        return String(url).trim().replace(/\/+$/, '')
    }

    function inferDefault() {
        const host = window.location.hostname
        const isLocal = host === 'localhost' || host === '127.0.0.1'
        return isLocal ? DEFAULT_LOCAL : DEFAULT_LOCAL
    }

    window.getAlgorionBackendUrl = function getAlgorionBackendUrl() {
        try {
            const qs = new URLSearchParams(window.location.search)
            const fromQuery = normalize(qs.get('backend'))
            if (fromQuery) return fromQuery

            const fromEnv = normalize(window.__ALG_ENV?.BACKEND_URL)
            if (fromEnv) return fromEnv

            const fromStorage = normalize(
                window.localStorage.getItem('algorion_backend_url')
            )
            if (fromStorage) return fromStorage
        } catch {
            // ignore
        }
        return inferDefault()
    }

    window.setAlgorionBackendUrl = function setAlgorionBackendUrl(url) {
        const value = normalize(url)
        if (!value) return
        window.localStorage.setItem('algorion_backend_url', value)
    }
})()
