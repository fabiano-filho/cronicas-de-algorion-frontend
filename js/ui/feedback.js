;(function () {
    if (window.AlgorionUI && window.AlgorionUI.__ready) return

    const existing = window.AlgorionUI || {}
    const toastTimeouts = new Map()
    let modalElements = null
    let modalResolve = null
    let modalOpen = false
    let modalAllowClose = true
    let modalCloseValue = undefined
    let lastFocusedElement = null

    function ensureToastStack() {
        let stack = document.getElementById('algorion-toast-stack')
        if (!stack) {
            stack = document.createElement('div')
            stack.id = 'algorion-toast-stack'
            stack.className = 'alg-ui-toast-stack'
            stack.setAttribute('aria-live', 'polite')
            stack.setAttribute('aria-atomic', 'true')
            document.body.appendChild(stack)
        }
        return stack
    }

    function removeToast(toast) {
        const key = toast?.dataset?.dedupe
        if (key && toastTimeouts.has(key)) {
            clearTimeout(toastTimeouts.get(key))
            toastTimeouts.delete(key)
        }
        toast?.remove()
    }

    function toast(message, options = {}) {
        if (!message) return
        const {
            variant = 'info',
            durationMs = 3500,
            dedupeKey = null
        } = options

        const stack = ensureToastStack()
        let toastEl = null
        if (dedupeKey) {
            toastEl = stack.querySelector(`[data-dedupe="${dedupeKey}"]`)
        }

        if (!toastEl) {
            toastEl = document.createElement('div')
            toastEl.className = 'alg-ui-toast'
            toastEl.setAttribute('role', 'status')
            if (dedupeKey) toastEl.dataset.dedupe = dedupeKey

            const textEl = document.createElement('div')
            textEl.className = 'alg-ui-toast-text'

            const closeBtn = document.createElement('button')
            closeBtn.type = 'button'
            closeBtn.className = 'alg-ui-toast-close'
            closeBtn.setAttribute('aria-label', 'Fechar')
            closeBtn.textContent = '×'
            closeBtn.addEventListener('click', () => removeToast(toastEl))

            toastEl.appendChild(textEl)
            toastEl.appendChild(closeBtn)
            stack.appendChild(toastEl)
        }

        toastEl.classList.remove('is-info', 'is-success', 'is-warning', 'is-error')
        toastEl.classList.add(`is-${variant}`)

        const textEl = toastEl.querySelector('.alg-ui-toast-text')
        if (textEl) textEl.textContent = String(message)

        if (dedupeKey && toastTimeouts.has(dedupeKey)) {
            clearTimeout(toastTimeouts.get(dedupeKey))
        }

        const timeoutId = window.setTimeout(() => {
            removeToast(toastEl)
        }, durationMs)

        if (dedupeKey) {
            toastTimeouts.set(dedupeKey, timeoutId)
        }
    }

    function ensureModal() {
        if (modalElements) return modalElements

        const overlay = document.createElement('div')
        overlay.id = 'algorion-modal'
        overlay.className = 'alg-ui-modal-overlay'
        overlay.setAttribute('role', 'dialog')
        overlay.setAttribute('aria-modal', 'true')
        overlay.setAttribute('aria-hidden', 'true')

        const modal = document.createElement('div')
        modal.className = 'alg-ui-modal'

        const closeBtn = document.createElement('button')
        closeBtn.type = 'button'
        closeBtn.className = 'alg-ui-modal-close'
        closeBtn.setAttribute('aria-label', 'Fechar')
        closeBtn.textContent = '×'

        const header = document.createElement('div')
        header.className = 'alg-ui-modal-header'
        const titleEl = document.createElement('h3')
        titleEl.className = 'alg-ui-modal-title'
        header.appendChild(titleEl)

        const body = document.createElement('div')
        body.className = 'alg-ui-modal-body'

        const actions = document.createElement('div')
        actions.className = 'alg-ui-modal-actions'

        modal.appendChild(closeBtn)
        modal.appendChild(header)
        modal.appendChild(body)
        modal.appendChild(actions)
        overlay.appendChild(modal)
        document.body.appendChild(overlay)

        const closeIfAllowed = () => {
            if (!modalAllowClose) return
            closeModal(modalCloseValue)
        }

        closeBtn.addEventListener('click', closeIfAllowed)
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeIfAllowed()
        })

        document.addEventListener('keydown', e => {
            if (!modalOpen) return
            if (e.key === 'Escape') closeIfAllowed()
        })

        modalElements = { overlay, modal, titleEl, body, actions }
        return modalElements
    }

    function setModalVariant(modalEl, variant) {
        modalEl.classList.remove(
            'is-info',
            'is-success',
            'is-warning',
            'is-error',
            'is-danger'
        )
        if (variant) modalEl.classList.add(`is-${variant}`)
    }

    function setModalBody(bodyEl, { message, items, pre }) {
        bodyEl.innerHTML = ''

        if (message) {
            if (pre) {
                const preEl = document.createElement('pre')
                preEl.className = 'alg-ui-modal-pre'
                preEl.textContent = String(message)
                bodyEl.appendChild(preEl)
            } else {
                const p = document.createElement('p')
                p.textContent = String(message)
                bodyEl.appendChild(p)
            }
        }

        if (Array.isArray(items) && items.length) {
            const list = document.createElement('ul')
            list.className = 'alg-ui-modal-list'
            items.forEach(item => {
                const li = document.createElement('li')
                li.textContent = String(item)
                list.appendChild(li)
            })
            bodyEl.appendChild(list)
        }
    }

    function openModal(options = {}) {
        const { overlay, modal, titleEl, body, actions } = ensureModal()
        const {
            title = '',
            message = '',
            items = null,
            pre = false,
            variant = 'info',
            actions: actionList = [],
            allowClose = true,
            closeValue = undefined
        } = options

        setModalVariant(modal, variant)
        titleEl.textContent = title
        setModalBody(body, { message, items, pre })

        actions.innerHTML = ''
        actionList.forEach(action => {
            const btn = document.createElement('button')
            btn.type = 'button'
            btn.className = `alg-ui-btn ${action.variant ? `is-${action.variant}` : ''}`.trim()
            btn.textContent = action.label
            btn.addEventListener('click', () => closeModal(action.value))
            actions.appendChild(btn)
        })

        modalAllowClose = allowClose
        modalCloseValue = closeValue
        modalOpen = true
        lastFocusedElement = document.activeElement

        overlay.classList.add('active')
        overlay.setAttribute('aria-hidden', 'false')

        const firstAction = actions.querySelector('button')
        if (firstAction) firstAction.focus()

        return new Promise(resolve => {
            modalResolve = resolve
        })
    }

    function closeModal(result) {
        if (!modalOpen) return
        const { overlay } = ensureModal()
        overlay.classList.remove('active')
        overlay.setAttribute('aria-hidden', 'true')
        modalOpen = false
        const resolve = modalResolve
        modalResolve = null
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            lastFocusedElement.focus()
        }
        if (resolve) resolve(result)
    }

    const modal = {
        show: options => openModal(options),
        alert: options =>
            openModal({
                ...options,
                actions: [
                    {
                        label: options?.confirmText || 'Ok',
                        value: true,
                        variant: 'primary'
                    }
                ],
                closeValue: true
            }).then(() => undefined),
        confirm: options =>
            openModal({
                ...options,
                actions: [
                    {
                        label: options?.cancelText || 'Cancelar',
                        value: false,
                        variant: 'secondary'
                    },
                    {
                        label: options?.confirmText || 'Confirmar',
                        value: true,
                        variant: options?.variant === 'danger' ? 'danger' : 'primary'
                    }
                ],
                closeValue: false
            }).then(result => !!result)
    }

    window.AlgorionUI = {
        ...existing,
        toast,
        modal,
        __ready: true
    }
})()
