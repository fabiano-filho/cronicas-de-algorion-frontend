// Modal Elements
const modal = document.getElementById('cardModal')
const modalClose = document.getElementById('modalClose')
const modalCardContainer = document.getElementById('modalCardContainer')

// Hero ability UI
const btnUsarHabilidade = document.getElementById('btnUsarHabilidade')
const heroAbilityStatus = document.getElementById('heroAbilityStatus')

// Final riddle UI
const btnResponderEnigmaFinal = document.getElementById(
    'btnResponderEnigmaFinal'
)
const btnPedirDicaEnigmaFinal = document.getElementById(
    'btnPedirDicaEnigmaFinal'
)
const btnAbrirEnigmaOverlay = document.getElementById('btnAbrirEnigmaOverlay')
const btnSairSessao = document.getElementById('btnSairSessao')
const riddleOverlay = document.getElementById('riddleOverlay')
const btnFecharEnigmaOverlay = document.getElementById('btnFecharEnigmaOverlay')
const riddleOverlayText = document.getElementById('riddleOverlayText')

// Event announcement UI (Street Fighter style)
const eventAnnouncementOverlay = document.getElementById(
    'eventAnnouncementOverlay'
)
const eventAnnouncementName = document.getElementById('eventAnnouncementName')
const eventAnnouncementDesc = document.getElementById('eventAnnouncementDesc')
const eventSparksContainer = document.getElementById('eventSparks')

let lastHeroTipo = null
let lastAbilityUsed = null
let lastEventoAtivoNome = null // Track last event to detect changes
let isEventAnnouncementActive = false // Block actions during announcement
let pendingMermaidAbilityTarget = false
let modalTiltMoveHandler = null
let modalTiltLeaveHandler = null
let activeTiltCard = null

// House actions UI
const actionModal = document.getElementById('actionModal')
const actionModalClose = document.getElementById('actionModalClose')
const actionTitle = document.getElementById('actionTitle')
const actionBody = document.getElementById('actionBody')

let lastSession = null
let c5WaitToastShown = false
let activeHouseContext = null
let lastC5Revealed = null
let c5MandatoryResponseRequired = false
let lastRiddleScriptValue = ''
let seenHintCount = 0
let riddleReadStateInitialized = false

const ui = window.AlgorionUI || null
const showToast = (message, variant = 'info', options = {}) => {
    ui?.toast?.(message, { variant, ...options })
}
const showAlertModal = options =>
    ui?.modal?.alert?.(options) ?? Promise.resolve()
const showConfirmModal = options =>
    ui?.modal?.confirm?.(options) ?? Promise.resolve(false)
const redirectWithModal = async ({
    title,
    message,
    to,
    clearSession = true
}) => {
    await showAlertModal({
        title,
        message,
        confirmText: 'Voltar'
    })
    if (clearSession) {
        localStorage.removeItem('algorion_session')
    }
    window.location.href = to
}

function areFinalSlotsFilled(session) {
    const slotsServer = Array.isArray(session?.slotsEnigmaFinal)
        ? session.slotsEnigmaFinal
        : null

    if (slotsServer) {
        return slotsServer.length > 0 && slotsServer.every(s => !!s?.cardId)
    }

    return slotsState.every(id => id !== null)
}

function hasRequestedFinalHint(session) {
    const jogadorId = sessionData?.jogadorId
    if (!jogadorId) return false
    return !!session?.pedidosDicaEnigmaFinalPorJogador?.[jogadorId]
}

function updateFinalRiddleButton(session) {
    if (!btnResponderEnigmaFinal && !btnPedirDicaEnigmaFinal) return
    if (sessionData.isSpectator) {
        if (btnResponderEnigmaFinal) {
            btnResponderEnigmaFinal.style.display = 'none'
            btnResponderEnigmaFinal.disabled = true
        }
        if (btnPedirDicaEnigmaFinal) {
            btnPedirDicaEnigmaFinal.style.display = 'none'
            btnPedirDicaEnigmaFinal.disabled = true
        }
        return
    }

    const filled = areFinalSlotsFilled(session)
    const phZerado = typeof session?.ph === 'number' && session.ph <= 0
    const myTurn = isMyTurn(session)
    const shouldShow = filled || phZerado
    const canClick =
        shouldShow &&
        myTurn &&
        !!socket &&
        socket.connected &&
        !!sessionData?.sessionId &&
        !!sessionData?.jogadorId
    const alreadyRequested = hasRequestedFinalHint(session)

    if (btnResponderEnigmaFinal) {
        btnResponderEnigmaFinal.style.display = shouldShow ? 'inline-block' : 'none'
        btnResponderEnigmaFinal.disabled = !canClick
    }

    if (btnPedirDicaEnigmaFinal) {
        btnPedirDicaEnigmaFinal.style.display = shouldShow ? 'inline-block' : 'none'
        btnPedirDicaEnigmaFinal.disabled = !canClick || alreadyRequested
        btnPedirDicaEnigmaFinal.textContent = alreadyRequested
            ? 'Dica já pedida'
            : 'Pedir dica ao Mestre'
    }
}

function getReadableHintCount() {
    return hintCardsData.filter(
        card => typeof card?.texto === 'string' && card.texto.trim().length > 0
    ).length
}

function syncUnreadRiddleHints({ initialize = false } = {}) {
    if (!btnAbrirEnigmaOverlay) return

    const readableHintCount = getReadableHintCount()
    if (initialize || !riddleReadStateInitialized) {
        seenHintCount = readableHintCount
        riddleReadStateInitialized = true
    }

    const hasUnread = readableHintCount > seenHintCount
    btnAbrirEnigmaOverlay.classList.toggle('has-unread', hasUnread)
}

function markRiddleHintsAsSeen() {
    seenHintCount = getReadableHintCount()
    syncUnreadRiddleHints()
}

function buildFinalRiddleOverlayTokens() {
    return slotsState.map((cardId, slotIndex) => {
        if (!cardId) {
            return {
                text: '____',
                missing: true
            }
        }

        const baseCard = hintCardsData.find(c => c.id === cardId)
        const card =
            getActiveHintVariantForSlot(slotIndex, baseCard) ||
            normalizeHintVariant(baseCard) ||
            baseCard
        const cardText =
            typeof card?.texto === 'string' ? card.texto.trim() : ''

        if (!cardText) {
            return {
                text: '____',
                missing: true
            }
        }

        return {
            text: cardText,
            missing: false
        }
    })
}

function updateFinalRiddleScript(session, { forceBurn = false } = {}) {
    if (!riddleOverlayText) return

    const tokens = buildFinalRiddleOverlayTokens()
    const sessionRef = session || lastSession
    const isComplete = areFinalSlotsFilled(sessionRef)
    const signature = tokens
        .map(token => (token.missing ? '_' : token.text))
        .join('|')
    const changed = signature !== lastRiddleScriptValue
    const shouldBurn = !isComplete && (changed || forceBurn)

    riddleOverlayText.innerHTML = ''
    riddleOverlayText.classList.toggle('is-complete', isComplete)

    const fragment = document.createDocumentFragment()
    let litCharIndex = 0
    tokens.forEach(token => {
        const tokenEl = document.createElement('span')
        tokenEl.className = 'riddle-token'

        if (token.missing) {
            tokenEl.classList.add('is-missing')
            tokenEl.textContent = '____'
        } else {
            tokenEl.classList.add('is-lit')
            Array.from(token.text).forEach(character => {
                const charEl = document.createElement('span')
                charEl.className = 'riddle-char'
                if (character === ' ') {
                    charEl.classList.add('is-space')
                    charEl.textContent = '\u00a0'
                } else {
                    charEl.textContent = character
                    charEl.style.setProperty(
                        '--riddle-char-delay',
                        `${litCharIndex * 42}ms`
                    )
                    litCharIndex += 1
                }
                tokenEl.appendChild(charEl)
            })
            if (shouldBurn) {
                tokenEl.classList.add('is-burn')
            }
        }

        fragment.appendChild(tokenEl)
    })

    if (tokens.length === 0) {
        const fallback = document.createElement('span')
        fallback.className = 'riddle-token is-missing'
        fallback.textContent = '____'
        fragment.appendChild(fallback)
    }

    riddleOverlayText.appendChild(fragment)

    if (shouldBurn) {
        riddleOverlayText.classList.remove('is-burning')
        void riddleOverlayText.offsetWidth
        riddleOverlayText.classList.add('is-burning')
    } else {
        riddleOverlayText.classList.remove('is-burning')
    }

    lastRiddleScriptValue = signature
}

function openRiddleOverlay() {
    if (!riddleOverlay) return
    updateFinalRiddleScript(lastSession, { forceBurn: true })
    markRiddleHintsAsSeen()
    riddleOverlay.classList.add('active')
}

function closeRiddleOverlay() {
    if (!riddleOverlay) return
    riddleOverlay.classList.remove('active')
}

const HERO_COLORS = {
    Anao: '#7D7940',
    Humano: '#B68B71',
    Sereia: '#DA7C7C',
    Bruxa: '#62769E'
}

const HERO_INITIALS = {
    Anao: 'A',
    Humano: 'H',
    Sereia: 'S',
    Bruxa: 'B'
}

// Hero Card Inspection
const heroCard = document.getElementById('heroCard')
if (heroCard) {
    heroCard.addEventListener('click', function () {
        // Get current hero images from the card
        const frontImg = this.querySelector('.hero-card-front img')
        const backImg = this.querySelector('.hero-card-back img')

        const frontSrc = frontImg
            ? frontImg.src
            : '../assets/cards/characteres/front-human-character.png'
        const backSrc = backImg
            ? backImg.src
            : '../assets/cards/characteres/back-human-character.png'

        // Open modal showing the back (ability/content side) first
        openCardModal(frontSrc, backSrc, true)
    })
}

// Event Card Inspection (Optional - keeping flip for now or upgrade? Request said "Hero Card". Stick to Hero for now.)
const eventCard = document.getElementById('eventCard')
if (eventCard) {
    eventCard.addEventListener('click', function () {
        const frontImg = this.querySelector('.event-card-front img')
        const backImg = this.querySelector('.event-card-back img')
        const frontSrc = frontImg
            ? frontImg.src
            : '../assets/cards/events/front-event.png'
        const backSrc = backImg ? backImg.src : frontSrc
        const showBackFirst = this.classList.contains('flipped')
        openCardModal(frontSrc, backSrc, showBackFirst)
    })
}

// Modal Functions
function clearModalTiltHandlers() {
    if (modal && modalTiltMoveHandler) {
        modal.removeEventListener('mousemove', modalTiltMoveHandler)
        modalTiltMoveHandler = null
    }
    if (modal && modalTiltLeaveHandler) {
        modal.removeEventListener('mouseleave', modalTiltLeaveHandler)
        modalTiltLeaveHandler = null
    }
    if (activeTiltCard) {
        activeTiltCard.style.setProperty('--tilt-x', '0deg')
        activeTiltCard.style.setProperty('--tilt-y', '0deg')
        activeTiltCard = null
    }
}

function openCardModal(frontSrc, backSrc, showBackFirst = false, options = {}) {
    clearModalTiltHandlers()
    modalCardContainer.innerHTML = ''

    // Create wrapper for expanded card
    const cardWrapper = document.createElement('div')
    cardWrapper.className = 'card-wrapper'

    const zoomedCard = document.createElement('div')
    zoomedCard.className = 'zoomed-card'

    // Front Face (what's visible initially)
    const faceFront = document.createElement('div')
    faceFront.className = 'card-face card-front'
    const imgFront = document.createElement('img')
    imgFront.src = frontSrc
    imgFront.alt = 'Frente da carta'
    faceFront.appendChild(imgFront)

    // Back Face (what's visible after flip)
    const faceBack = document.createElement('div')
    faceBack.className = 'card-face card-back'
    const imgBack = document.createElement('img')
    imgBack.src = backSrc
    imgBack.alt = 'Verso da carta'
    faceBack.appendChild(imgBack)

    zoomedCard.appendChild(faceFront)
    zoomedCard.appendChild(faceBack)

    // Legacy flip control (hidden in CSS and not appended)
    const flipButton = document.createElement('button')
    flipButton.className = 'flip-card-button'
    const initialButtonText = showBackFirst ? 'Ver Frente' : 'Ver Verso'
    flipButton.innerHTML = `<span class="flip-icon">🔄</span><span class="flip-text">${initialButtonText}</span>`
    flipButton.setAttribute('aria-label', 'Virar carta')

    // Track state (CSS controls visibility: .flipped shows the back face)
    let isFlipped = !!showBackFirst
    if (isFlipped) {
        zoomedCard.classList.add('flipped')
    }

    const hintVariants = Array.isArray(options?.hintVariants)
        ? options.hintVariants
        : []
    let activeHintIndex = 0
    if (hintVariants.length > 0 && options?.initialHintVariantId) {
        const foundIndex = hintVariants.findIndex(
            variant => variant?.variantId === options.initialHintVariantId
        )
        if (foundIndex >= 0) activeHintIndex = foundIndex
    }

    const applyHintVariantToCard = variant => {
        if (!variant) return
        if (variant.frontSrc) imgFront.src = variant.frontSrc
        if (variant.backSrc) imgBack.src = variant.backSrc
        if (variant.frontAlt) imgFront.alt = variant.frontAlt
        if (variant.backAlt) imgBack.alt = variant.backAlt
    }

    if (hintVariants.length > 0) {
        applyHintVariantToCard(hintVariants[activeHintIndex])
    }

    // Flip function
    const flipCard = () => {
        isFlipped = !isFlipped
        zoomedCard.classList.toggle('flipped', isFlipped)
        // Update button text based on what's currently showing
        flipButton.querySelector('.flip-text').textContent = isFlipped
            ? 'Ver Frente'
            : 'Ver Verso'
    }

    // Flip on click on card
    zoomedCard.addEventListener('click', function (e) {
        e.stopPropagation()
        flipCard()
    })

    // Keeps compatibility if re-enabled in the future
    flipButton.addEventListener('click', function (e) {
        e.stopPropagation()
        flipCard()
    })

    // Subtle tilt/parallax should react across the whole overlay area
    if (modal) {
        const maxTilt = 7
        const updateTilt = (clientX, clientY) => {
            const rect = zoomedCard.getBoundingClientRect()
            const centerX = rect.left + rect.width / 2
            const centerY = rect.top + rect.height / 2
            const normX = Math.max(
                -1,
                Math.min(1, (clientX - centerX) / (window.innerWidth * 0.5))
            )
            const normY = Math.max(
                -1,
                Math.min(1, (clientY - centerY) / (window.innerHeight * 0.5))
            )
            zoomedCard.style.setProperty(
                '--tilt-x',
                `${(-normY * maxTilt).toFixed(2)}deg`
            )
            zoomedCard.style.setProperty(
                '--tilt-y',
                `${(normX * maxTilt).toFixed(2)}deg`
            )
        }

        modalTiltMoveHandler = e => {
            if (!modal.classList.contains('active')) return
            updateTilt(e.clientX, e.clientY)
        }
        modalTiltLeaveHandler = () => {
            zoomedCard.style.setProperty('--tilt-x', '0deg')
            zoomedCard.style.setProperty('--tilt-y', '0deg')
        }
        activeTiltCard = zoomedCard
        modal.addEventListener('mousemove', modalTiltMoveHandler)
        modal.addEventListener('mouseleave', modalTiltLeaveHandler)
    }

    if (hintVariants.length > 0) {
        cardWrapper.classList.add('has-hint-selector')
        const cardRow = document.createElement('div')
        cardRow.className = 'modal-hint-card-row'

        const selectorFooter = document.createElement('div')
        selectorFooter.className = 'modal-hint-selector-center'

        const navPrev = document.createElement('button')
        navPrev.type = 'button'
        navPrev.className = 'modal-hint-nav modal-hint-nav-prev'
        navPrev.textContent = '<'
        navPrev.setAttribute('aria-label', 'Pista anterior')

        const hintMeta = document.createElement('div')
        hintMeta.className = 'modal-hint-meta'

        const equipButton = document.createElement('button')
        equipButton.type = 'button'
        equipButton.className = 'modal-hint-equip'

        const navNext = document.createElement('button')
        navNext.type = 'button'
        navNext.className = 'modal-hint-nav modal-hint-nav-next'
        navNext.textContent = '>'
        navNext.setAttribute('aria-label', 'Próxima pista')

        const updateSelectorState = () => {
            const current = hintVariants[activeHintIndex]
            applyHintVariantToCard(current)

            const hasMultiple = hintVariants.length > 1
            navPrev.disabled = !hasMultiple
            navNext.disabled = !hasMultiple
            navPrev.classList.toggle('is-hidden', !hasMultiple)
            navNext.classList.toggle('is-hidden', !hasMultiple)

            const equipped =
                options?.isHintVariantEquipped?.(current) ??
                hintVariants.length <= 1
            const canEquip =
                options?.canEquipHintVariant !== false &&
                typeof options?.onEquipHintVariant === 'function'

            hintMeta.textContent =
                hintVariants.length > 1
                    ? `Pista ${activeHintIndex + 1}/${hintVariants.length}`
                    : current?.label || 'Pista'
            if (equipped) {
                equipButton.textContent = 'Pista Ativa'
                equipButton.disabled = true
                equipButton.classList.add('is-active')
            } else if (!canEquip) {
                equipButton.textContent = 'Somente leitura'
                equipButton.disabled = true
                equipButton.classList.remove('is-active')
            } else {
                equipButton.textContent = 'Usar esta Pista'
                equipButton.disabled = false
                equipButton.classList.remove('is-active')
            }
        }

        navPrev.addEventListener('click', event => {
            event.stopPropagation()
            if (hintVariants.length <= 1) return
            activeHintIndex =
                (activeHintIndex - 1 + hintVariants.length) % hintVariants.length
            updateSelectorState()
        })

        navNext.addEventListener('click', event => {
            event.stopPropagation()
            if (hintVariants.length <= 1) return
            activeHintIndex = (activeHintIndex + 1) % hintVariants.length
            updateSelectorState()
        })

        equipButton.addEventListener('click', event => {
            event.stopPropagation()
            if (equipButton.disabled) return
            const current = hintVariants[activeHintIndex]
            options?.onEquipHintVariant?.(current)
            updateSelectorState()
        })

        cardRow.appendChild(navPrev)
        cardRow.appendChild(zoomedCard)
        cardRow.appendChild(navNext)
        selectorFooter.appendChild(hintMeta)
        selectorFooter.appendChild(equipButton)
        cardWrapper.appendChild(cardRow)
        cardWrapper.appendChild(selectorFooter)

        updateSelectorState()
    } else {
        cardWrapper.appendChild(zoomedCard)
    }
    modalCardContainer.appendChild(cardWrapper)
    modal.classList.add('active')
}

// Close Modal Logic
function closeModal() {
    clearModalTiltHandlers()
    modal.classList.remove('active')
    setTimeout(() => {
        modalCardContainer.innerHTML = ''
    }, 300)
}

if (modalClose) {
    modalClose.addEventListener('click', closeModal)
}

if (modal) {
    modal.addEventListener('click', e => {
        const clickedInsideWrapper = !!e.target.closest('.card-wrapper')
        const clickedCloseButton = !!e.target.closest('#modalClose')
        if (!clickedInsideWrapper && !clickedCloseButton) {
            closeModal()
        }
    })

    // Close on Escape key
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal()
        }
    })
}

// Hint cards carousel functionality + Drag-and-Drop
const TOTAL_SLOTS = 8

// =====================================================
// INTEGRAÇÃO COM BACKEND (Socket.IO)
// =====================================================

const SERVER_URL = window.getAlgorionBackendUrl?.() || 'http://localhost:3001'
let socket = null

let sessionData = {
    sessionId: null,
    mestreId: null,
    jogadorId: null,
    nome: null,
    isMestre: false,
    isSpectator: false
}

function carregarSessaoLocal() {
    try {
        const saved = localStorage.getItem('algorion_session')
        if (saved) {
            sessionData = JSON.parse(saved)
            if (typeof sessionData.isSpectator !== 'boolean') {
                sessionData.isSpectator = false
            }
            return !!sessionData.sessionId
        }
    } catch (e) {
        console.error('Erro ao carregar sessão:', e)
    }
    return false
}

function salvarSessaoLocal() {
    localStorage.setItem('algorion_session', JSON.stringify(sessionData))
}

function resolveAssetUrl(source) {
    if (!source) return source
    if (source.startsWith('http://') || source.startsWith('https://'))
        return source
    if (source.startsWith('../') || source.startsWith('./')) return source
    if (source.startsWith('assets/')) return `../${source}`
    return source
}

function getHeroAssetsByTipo(tipo) {
    switch (tipo) {
        case 'Anao':
            return {
                front: '../assets/cards/characteres/front-dwarf-character.png',
                back: '../assets/cards/characteres/back-dwarf-character.png'
            }
        case 'Humano':
            return {
                front: '../assets/cards/characteres/front-human-character.png',
                back: '../assets/cards/characteres/back-human-character.png'
            }
        case 'Sereia':
            return {
                front: '../assets/cards/characteres/front-mermaid-character.png',
                back: '../assets/cards/characteres/back-mermaid-character.png'
            }
        case 'Bruxa':
            return {
                front: '../assets/cards/characteres/front-witch-character.png',
                back: '../assets/cards/characteres/back-witch-character.png'
            }
        default:
            return {
                front: '../assets/cards/characteres/front-human-character.png',
                back: '../assets/cards/characteres/back-human-character.png'
            }
    }
}

function setHeroCardTipo(tipo) {
    if (!tipo) return
    if (lastHeroTipo === tipo) return
    lastHeroTipo = tipo

    const heroEl = document.getElementById('heroCard')
    if (!heroEl) return
    const frontImg = heroEl.querySelector('.hero-card-front img')
    const backImg = heroEl.querySelector('.hero-card-back img')
    const assets = getHeroAssetsByTipo(tipo)
    if (frontImg) {
        frontImg.src = assets.front
        frontImg.alt = `Frente - ${tipo}`
    }
    if (backImg) {
        backImg.src = assets.back
        backImg.alt = `Verso - ${tipo}`
    }
}

function setAbilityStatus(text) {
    if (!heroAbilityStatus) return
    heroAbilityStatus.textContent = text || ''
}

function startMermaidAbilitySelection() {
    if (pendingMermaidAbilityTarget) return
    pendingMermaidAbilityTarget = true
    setAbilityStatus(
        'Sereia: clique em um desafio revelado para enviar o sinal de dica sutil.'
    )
    showToast(
        'Selecione uma casa com enigma exibido para usar a habilidade da Sereia.',
        'info',
        { dedupeKey: 'sereia-ability' }
    )
}

function clearMermaidAbilitySelection() {
    pendingMermaidAbilityTarget = false
}

function requestMermaidHint(casaId, houseName) {
    if (!lastSession?.sereiaAbilityActive) return
    if (!sessionData?.sessionId) {
        showToast('Sessão inválida.', 'error')
        return
    }
    if (!socket || !socket.connected) {
        showToast('Sem conexão com o servidor.', 'error')
        return
    }

    socket.emit('selecionar_casa_sereia', {
        sessionId: sessionData.sessionId,
        casaId
    })
    const label = houseName || casaId
    setAbilityStatus(`Sereia: sinal de dica sutil solicitado para ${label}.`)
    showToast(`Sereia: sinal de dica solicitado para ${label}.`, 'info', {
        dedupeKey: 'sereia-ability'
    })
}

function closeActionModal() {
    if (!actionModal) return
    actionModal.classList.remove('active')
    if (actionTitle) actionTitle.textContent = ''
    if (actionBody) actionBody.innerHTML = ''
    document.querySelectorAll('.house-card.selected').forEach(el => {
        el.classList.remove('selected')
    })
}

function createActionPreviewCard(card) {
    const preview = document.createElement('div')
    preview.className = 'action-card-preview'

    if (card?.title && card?.showTitle) {
        const titleEl = document.createElement('div')
        titleEl.className = 'action-card-title'
        titleEl.textContent = card.title
        preview.appendChild(titleEl)
    }

    const stack = document.createElement('div')
    stack.className = 'action-card-stack'

    const mainCardBtn = document.createElement('button')
    mainCardBtn.type = 'button'
    mainCardBtn.className = 'action-preview-card action-preview-card-main'
    const mainImg = document.createElement('img')
    mainImg.src = card?.src || ''
    mainImg.alt = card?.alt || 'Carta do local'
    mainCardBtn.appendChild(mainImg)
    stack.appendChild(mainCardBtn)

    const clueSrc = card?.clue?.src
    if (clueSrc) {
        preview.classList.add('has-clue')

        const clueCardBtn = document.createElement('button')
        clueCardBtn.type = 'button'
        clueCardBtn.className = 'action-preview-card action-preview-card-clue'
        const clueImg = document.createElement('img')
        clueImg.src = clueSrc
        clueImg.alt = card?.clue?.alt || 'Carta de pista'
        clueCardBtn.appendChild(clueImg)
        stack.appendChild(clueCardBtn)

        const setFrontCard = frontCard => {
            preview.classList.toggle('is-clue-active', frontCard === 'clue')
        }

        clueCardBtn.addEventListener('click', () => {
            setFrontCard('clue')
        })
        mainCardBtn.addEventListener('click', () => {
            setFrontCard('main')
        })
    }

    preview.appendChild(stack)
    return preview
}

function openActionModal({ title, actions, hint, card }) {
    if (!actionModal || !actionBody) return
    if (actionTitle) actionTitle.textContent = title || ''
    actionBody.innerHTML = ''

    const controls = document.createElement('div')
    controls.className = 'action-controls'

    if (hint) {
        const p = document.createElement('div')
        p.className = 'action-hint'
        p.textContent = hint
        controls.appendChild(p)
    }

    actions.forEach(a => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'action-btn'
        btn.textContent = a.label
        if (a.disabled) btn.disabled = true
        btn.addEventListener('click', () => {
            if (btn.disabled) return
            a.onClick?.()
        })
        controls.appendChild(btn)
    })

    if (card?.src) {
        const layout = document.createElement('div')
        layout.className = 'action-layout'

        const preview = createActionPreviewCard(card)

        layout.appendChild(preview)
        layout.appendChild(controls)
        actionBody.appendChild(layout)
    } else {
        actionBody.appendChild(controls)
    }

    actionModal.classList.add('active')
}

function getMyPlayer(session) {
    return session?.listaJogadores?.find(p => p?.id === sessionData.jogadorId)
}

function getCurrentPlayer(session) {
    return session?.listaJogadores?.[session?.jogadorAtualIndex] || null
}

function isMyTurn(session) {
    const cur = getCurrentPlayer(session)
    return !!cur && cur.id === sessionData.jogadorId
}

function getHouseIdFromNumber(n) {
    return `C${n}`
}

function getHouseNumberFromId(casaId) {
    const n = parseInt(String(casaId || '').replace('C', ''), 10)
    return Number.isFinite(n) ? n : null
}

function getCardById(session, casaId) {
    const flat = session?.estadoTabuleiro?.flat?.() || []
    return flat.find(c => c && c.id === casaId) || null
}

function isCarta5Revelada(session) {
    return !!getCardById(session, 'C5')?.revelada
}

function getSessionGameConfig(session) {
    return session?.catalogo?.gameConfig || null
}

function getConfiguredActionCost(session, actionKey, fallback) {
    const cost = Number(getSessionGameConfig(session)?.actionCosts?.[actionKey])
    return Number.isFinite(cost) ? cost : fallback
}

function getGridColumns(session) {
    const grid = String(getSessionGameConfig(session)?.gridSize || '3x3')
    const match = grid.match(/^(\d+)x(\d+)$/i)
    if (!match) return 3
    const cols = Number(match[2])
    return Number.isFinite(cols) && cols > 0 ? cols : 3
}

function areHousesAdjacent(session, origemId, destinoId) {
    const from = getHouseNumberFromId(origemId)
    const to = getHouseNumberFromId(destinoId)
    if (!from || !to) return false

    const cols = getGridColumns(session)
    const fromRow = Math.floor((from - 1) / cols)
    const fromCol = (from - 1) % cols
    const toRow = Math.floor((to - 1) / cols)
    const toCol = (to - 1) % cols
    const rowDiff = Math.abs(fromRow - toRow)
    const colDiff = Math.abs(fromCol - toCol)
    return rowDiff + colDiff === 1
}

function renderEventCard(session) {
    const eventEl = document.getElementById('eventCard')
    if (!eventEl) return
    const frontImg = eventEl.querySelector('.event-card-front img')
    const backImg = eventEl.querySelector('.event-card-back img')
    const frontSrc = '../assets/cards/events/front-event.png'
    const eventName = session?.eventoAtivo?.nome || ''
    const backSrc = session?.eventoAtivo?.backSource || frontSrc
    if (frontImg) {
        frontImg.src = resolveAssetUrl(frontSrc)
        frontImg.alt = 'Carta de Evento'
    }
    if (backImg) {
        backImg.src = resolveAssetUrl(backSrc)
        backImg.alt = eventName ? `Evento: ${eventName}` : 'Verso do evento'
    }
    const reveal = isCarta5Revelada(session)
    eventEl.classList.toggle('flipped', !!(reveal && eventName))
}

// =====================================================
// EVENT ANNOUNCEMENT - Street Fighter Style Animation
// =====================================================

function createEventSparks() {
    if (!eventSparksContainer) return
    eventSparksContainer.innerHTML = ''

    const sparkCount = 12
    for (let i = 0; i < sparkCount; i++) {
        const spark = document.createElement('div')
        spark.className = 'event-spark'

        // Random position around center
        const angle = (Math.PI * 2 * i) / sparkCount + Math.random() * 0.5
        const distance = 150 + Math.random() * 200
        const x = Math.cos(angle) * distance
        const y = Math.sin(angle) * distance

        spark.style.setProperty('--spark-x', `${x}px`)
        spark.style.setProperty('--spark-y', `${y}px`)
        spark.style.left = '50%'
        spark.style.top = '50%'
        spark.style.animationDelay = `${0.4 + Math.random() * 0.3}s`

        eventSparksContainer.appendChild(spark)
    }
}

function showEventAnnouncement(evento) {
    if (!eventAnnouncementOverlay || !evento?.nome) return

    isEventAnnouncementActive = true
    document.body.classList.add('event-announcement-blocking')

    // Set content
    if (eventAnnouncementName) {
        eventAnnouncementName.textContent = evento.nome
    }
    if (eventAnnouncementDesc) {
        eventAnnouncementDesc.textContent = evento.descricao || ''
    }

    // Reset animations by removing and re-adding classes
    eventAnnouncementOverlay.classList.remove('active', 'exit')

    // Force reflow to restart animations
    void eventAnnouncementOverlay.offsetWidth

    // Create sparks
    createEventSparks()

    // Show overlay
    eventAnnouncementOverlay.classList.add('active')

    // Auto-hide after animation completes
    const displayDuration = 3500 // 3.5 seconds total display
    setTimeout(() => {
        hideEventAnnouncement()
    }, displayDuration)
}

function hideEventAnnouncement() {
    if (!eventAnnouncementOverlay) return

    // Add exit animation class
    eventAnnouncementOverlay.classList.add('exit')

    // Remove after exit animation
    setTimeout(() => {
        eventAnnouncementOverlay.classList.remove('active', 'exit')
        document.body.classList.remove('event-announcement-blocking')
        isEventAnnouncementActive = false
    }, 500) // Exit animation duration
}

function handleEventoAtivo(evento) {
    const newEventName = evento?.nome || null

    // Only show announcement if event actually changed AND C5 is revealed
    const c5Revealed = lastSession ? isCarta5Revelada(lastSession) : false

    if (newEventName && newEventName !== lastEventoAtivoNome && c5Revealed) {
        lastEventoAtivoNome = newEventName
        showEventAnnouncement(evento)
    } else if (
        newEventName &&
        newEventName !== lastEventoAtivoNome &&
        !c5Revealed
    ) {
        // Store the event name but don't show animation yet
        lastEventoAtivoNome = newEventName
    } else if (!newEventName) {
        lastEventoAtivoNome = null
    }
}

// Check if actions are blocked due to event announcement
function isActionBlocked() {
    return isEventAnnouncementActive
}

function renderPlayerPositions(session) {
    // remove previous markers
    document.querySelectorAll('.house-occupants').forEach(el => el.remove())
    document
        .querySelectorAll('.house-card.is-my-position')
        .forEach(el => el.classList.remove('is-my-position'))
    document
        .querySelectorAll('.house-card')
        .forEach(el => el.style.removeProperty('--my-hero-color'))

    const players = Array.isArray(session?.listaJogadores)
        ? session.listaJogadores
        : []

    const current = getCurrentPlayer(session)
    const myPlayer = getMyPlayer(session)

    const groups = new Map()
    for (const p of players) {
        if (!p?.posicao) continue
        const key = p.posicao
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(p)
    }

    for (const [casaId, group] of groups.entries()) {
        const n = getHouseNumberFromId(casaId)
        if (!n) continue
        const el = document.querySelector(`.house-card[data-house-id='${n}']`)
        if (!el) continue

        if (myPlayer?.posicao === casaId) {
            el.classList.add('is-my-position')
            const myTipo = myPlayer?.hero?.tipo
            const color = HERO_COLORS[myTipo] || 'rgba(240, 212, 138, 0.85)'
            el.style.setProperty('--my-hero-color', color)
        }

        const container = document.createElement('div')
        container.className = 'house-occupants'

        // Mostra até 4 marcadores (se tiver mais, o restante fica implícito)
        const toShow = group.slice(0, 4)
        toShow.forEach(p => {
            const pawn = document.createElement('span')
            pawn.className = 'pawn'
            const tipo = p?.hero?.tipo
            pawn.style.background = HERO_COLORS[tipo] || 'rgba(245,230,200,0.8)'
            pawn.textContent = HERO_INITIALS[tipo] || '?'
            pawn.title = `${p.nome || 'Jogador'} (${tipo || 'Sem herói'})`
            if (current?.id && p.id === current.id) {
                pawn.classList.add('is-current')
            }
            if (myPlayer?.id && p.id === myPlayer.id) {
                pawn.classList.add('is-me')
            }
            container.appendChild(pawn)
        })

        el.appendChild(container)
    }

    renderPlayerPositionsList(session)
}

function getHouseNameByNumber(n) {
    const names = {
        1: 'Biblioteca',
        2: 'Masmorra',
        3: 'Jardim',
        4: 'Mercado',
        5: 'Bosque',
        6: 'Arena',
        7: 'Deserto',
        8: 'Castelo',
        9: 'Montanha'
    }
    return names[n] || `Casa ${n}`
}

function renderPlayerPositionsList(session) {
    const container = document.getElementById('playerPositions')
    if (!container) return

    const players = Array.isArray(session?.listaJogadores)
        ? session.listaJogadores
        : []
    const myPlayer = getMyPlayer(session)

    if (players.length === 0) {
        container.innerHTML = ''
        return
    }

    container.innerHTML = players
        .map(p => {
            const tipo = p?.hero?.tipo || ''
            const color = HERO_COLORS[tipo] || '#b8a894'
            const initial = HERO_INITIALS[tipo] || '?'
            const posNum = getHouseNumberFromId(p.posicao)
            const posName = posNum ? getHouseNameByNumber(posNum) : '-'
            const isMe = myPlayer?.id && p.id === myPlayer.id
            const label = isMe
                ? `${p.nome || 'Jogador'} (você)`
                : p.nome || 'Jogador'

            return (
                `<span class="pos-entry${isMe ? ' is-me' : ''}" title="${label} — ${tipo || 'Sem herói'}">` +
                `<span class="pos-dot" style="background:${color}">${initial}</span>` +
                `${posName}` +
                `</span>`
            )
        })
        .join('')
}

function renderBoardRevelations(session) {
    document.querySelectorAll('.house-card').forEach(cardEl => {
        const houseNum = parseInt(cardEl.dataset.houseId || '0', 10)
        if (!houseNum) return
        const casaId = getHouseIdFromNumber(houseNum)
        const revealed = !!getCardById(session, casaId)?.revelada
        cardEl.classList.toggle('flipped', revealed)
    })
}

function openHouseActionModalForHouse({ casaId, houseNum, houseName }) {
    if (!lastSession) return
    if (!sessionData?.sessionId || !sessionData?.jogadorId) return
    if (!actionModal) return

    // Block opening modal during event announcement
    if (isActionBlocked()) {
        showToast('Aguarde o anúncio do evento terminar.', 'warning')
        return
    }

    const cardEl = document.querySelector(
        `.house-card[data-house-id='${houseNum}']`
    )
    if (cardEl) {
        document
            .querySelectorAll('.house-card.selected')
            .forEach(el => el.classList.remove('selected'))
        cardEl.classList.add('selected')
    }

    const resolvedHouseName = houseName || cardEl?.dataset.houseName || casaId

    const myPlayer = getMyPlayer(lastSession)
    const myPos = myPlayer?.posicao
    const myTurn = isMyTurn(lastSession)
    const revealed = !!getCardById(lastSession, casaId)?.revelada
    const heroTipo = myPlayer?.hero?.tipo || null
    const heroAbilityUsed =
        !!lastSession?.habilidadesUsadasPorJogador?.[sessionData.jogadorId]
    const alreadyAnswered = !!lastSession?.registrosEnigmas?.[casaId]
    const c5Revealed = isCarta5Revelada(lastSession)
    const myPendingAnswer =
        lastSession?.riddlePendente?.jogadorId === sessionData.jogadorId
    const onThisHouse = myPos === casaId
    const adjacent = !!myPos && areHousesAdjacent(lastSession, myPos, casaId)

    const blockedByC5 = !c5Revealed
    const forceRespostaCarta5 = c5MandatoryResponseRequired && myTurn
    const hint = blockedByC5
        ? 'Aguardando o Mestre virar a carta C5 para iniciar o jogo.'
        : forceRespostaCarta5
            ? 'Carta C5 revelada: responda primeiro o desafio da casa C5 para liberar movimentos.'
            : !myTurn
                ? 'Ações de casa só podem ser feitas na sua vez.'
                : onThisHouse
                    ? revealed
                        ? 'Você está aqui. Carta já revelada.'
                        : 'Você está aqui. Carta ainda não revelada.'
                    : `Você está em ${myPos || '?'}.`

    const actions = []
    // Sereia: opção de dica sutil visível para TODOS os jogadores quando a habilidade está ativa
    if (lastSession?.sereiaAbilityActive && revealed) {
        actions.push({
            label: 'Sereia: pedir dica sutil para este desafio',
            disabled: !socket || !socket.connected,
            onClick: () => {
                requestMermaidHint(casaId, resolvedHouseName)
                closeActionModal()
            }
        })
    }
    // Bruxa: opção de ver custo visível APENAS para o jogador Bruxa quando a habilidade está ativa
    if (
        lastSession?.bruxaAbilityActive === sessionData.jogadorId &&
        (lastSession?.bruxaUsosRestantes ?? 0) > 0 &&
        !revealed &&
        casaId !== 'C5'
    ) {
        actions.push({
            label: `Bruxa: ver custo desta casa (${lastSession.bruxaUsosRestantes} restante${lastSession.bruxaUsosRestantes !== 1 ? 's' : ''})`,
            disabled: !socket || !socket.connected,
            onClick: () => {
                socket.emit('bruxa_revelar_custo_casa', {
                    sessionId: sessionData.sessionId,
                    jogadorId: sessionData.jogadorId,
                    casaId
                })
                closeActionModal()
            }
        })
    }
    const displayTitle = revealed ? `${resolvedHouseName} (${casaId})` : ''
    const explorarCost = getConfiguredActionCost(lastSession, 'explorar', 1)
    const explorarNovamenteCost = getConfiguredActionCost(
        lastSession,
        'explorarNovamente',
        2
    )
    const card = {
        src: `../assets/cards/houses/${houseNum}-${revealed ? 'back' : 'front'}.png`,
        alt: revealed ? displayTitle : 'Carta oculta',
        title: displayTitle,
        showTitle: revealed
    }
    const activeClueCard = getActiveHintVariantForHouse(casaId)
    if (activeClueCard?.source) {
        card.clue = {
            src: resolveAssetUrl(activeClueCard.source),
            alt: `Carta de pista de ${resolvedHouseName}`
        }
    }

    if (sessionData.isSpectator) {
        openActionModal({
            title: '',
            hint: 'Modo espectador: você pode apenas acompanhar a partida.',
            actions,
            card
        })
        return
    }

    const moverCusto = getMoveCostForPlayer(lastSession, sessionData.jogadorId)
    const saltoLivreCusto = getSaltoLivreCost(
        lastSession,
        sessionData.jogadorId
    )

    if (!onThisHouse) {
        actions.push({
            label: `Mover para essa casa (${moverCusto} PH)`,
            disabled:
                !myTurn || !adjacent || !c5Revealed || forceRespostaCarta5,
            onClick: () => {
                socket.emit('mover_peao', {
                    sessionId: sessionData.sessionId,
                    jogadorId: sessionData.jogadorId,
                    destinoId: casaId
                })
                closeActionModal()
            }
        })

        actions.push({
            label: `Salto Livre para essa casa (${saltoLivreCusto} PH)`,
            disabled: !myTurn || adjacent || !c5Revealed || forceRespostaCarta5,
            onClick: () => {
                socket.emit('salto_livre', {
                    sessionId: sessionData.sessionId,
                    jogadorId: sessionData.jogadorId,
                    destinoId: casaId
                })
                closeActionModal()
            }
        })
    } else {
        actions.push({
            label: `Revelar carta (${explorarCost} PH)`,
            disabled: !myTurn || revealed || blockedByC5,
            onClick: () => {
                socket.emit('explorar_carta', {
                    sessionId: sessionData.sessionId,
                    jogadorId: sessionData.jogadorId
                })
                closeActionModal()
            }
        })

        if (revealed) {
            const responderCusto = alreadyAnswered
                ? explorarNovamenteCost
                : getEnigmaCostForPlayer(
                    lastSession,
                    casaId,
                    sessionData.jogadorId
                )
            actions.push({
                label: `Responder enigma (${responderCusto} PH)`,
                disabled: !myTurn || myPendingAnswer,
                onClick: () => {
                    if (alreadyAnswered) {
                        socket.emit('explorar_novamente', {
                            sessionId: sessionData.sessionId,
                            jogadorId: sessionData.jogadorId,
                            // Resposta verbal na chamada (sem input)
                            texto: ''
                        })
                    } else {
                        socket.emit('responder_enigma', {
                            sessionId: sessionData.sessionId,
                            jogadorId: sessionData.jogadorId,
                            casaId,
                            // O jogo é em chamada: o jogador verbaliza a resposta ao Mestre.
                            // Enviamos apenas o evento para liberar a validação no painel do Mestre.
                            texto: ''
                        })
                    }
                    closeActionModal()
                }
            })
        }
    }

    // Botão para consultar o desafio (disponível para todos, sem gastar PH)
    const enigmaJaExibido = !!lastSession?.enigmasExibidos?.[casaId]
    if (revealed && enigmaJaExibido) {
        actions.push({
            label: 'Ver desafio da casa',
            disabled: false,
            onClick: () => {
                socket.emit('consultar_historia', {
                    sessionId: sessionData.sessionId,
                    jogadorId: sessionData.jogadorId,
                    casaId
                })
                closeActionModal()
            }
        })
    }

    openActionModal({
        title: '',
        hint,
        actions,
        card
    })
}

function setupHouseInteractions() {
    document.querySelectorAll('.house-card').forEach(cardEl => {
        cardEl.addEventListener('click', e => {
            if (!lastSession) return
            if (!sessionData?.sessionId || !sessionData?.jogadorId) return
            if (!actionModal) return

            const houseNum = parseInt(cardEl.dataset.houseId || '0', 10)
            if (!houseNum) return
            const casaId = getHouseIdFromNumber(houseNum)
            const houseName = cardEl.dataset.houseName || casaId

            activeHouseContext = { casaId, houseNum, houseName }
            openHouseActionModalForHouse(activeHouseContext)
        })
    })
}

function getAbilityHint(tipo) {
    switch (tipo) {
        case 'Humano':
            return 'Próximo movimento grátis.'
        case 'Anao':
            return 'Próximo enigma: -1 PH.'
        case 'Sereia':
            return 'Sinal de dica sutil enviado.'
        case 'Bruxa': {
            const restantes = lastSession?.bruxaUsosRestantes ?? 0
            return `Revelando custos (${restantes} restante${restantes !== 1 ? 's' : ''}).`
        }
        default:
            return ''
    }
}

function getEnigmaCostForPlayer(session, casaId, jogadorId) {
    const base = Number(getCardById(session, casaId)?.custoExploracao ?? 1) || 0

    const descontoEvento =
        session?.eventoAtivo?.modificadores?.primeiroEnigmaDesconto &&
            !session?.primeiroEnigmaDescontoUsado
            ? Number(session.eventoAtivo.modificadores.primeiroEnigmaDesconto)
            : 0

    const ajusteHeroi = Number(
        session?.descontoEnigmaHeroiPorJogador?.[jogadorId] ?? 0
    )

    return Math.max(0, base + descontoEvento + ajusteHeroi)
}

function getEnigmaCostSemHeroi(session, casaId) {
    const base = Number(getCardById(session, casaId)?.custoExploracao ?? 1) || 0
    const descontoEvento =
        session?.eventoAtivo?.modificadores?.primeiroEnigmaDesconto &&
            !session?.primeiroEnigmaDescontoUsado
            ? Number(session.eventoAtivo.modificadores.primeiroEnigmaDesconto)
            : 0
    return Math.max(0, base + descontoEvento)
}

function isFirstMoveFreeForPlayer(session, jogadorId) {
    if (!jogadorId) return false
    const modifiers = session?.eventoAtivo?.modificadores || {}
    return (
        !!modifiers?.primeiroMovimentoGratisPorJogador &&
        !session?.primeiroMovimentoGratisUsadoPorJogador?.[jogadorId]
    )
}

function isHeroMoveFreeForPlayer(session, jogadorId) {
    if (!jogadorId) return false
    return !!session?.movimentoGratisHeroiPorJogador?.[jogadorId]
}

function getMoveCostForPlayer(session, jogadorId) {
    const modificadores = session?.eventoAtivo?.modificadores || {}
    const gratuitoEvento = isFirstMoveFreeForPlayer(session, jogadorId)
    const gratuitoHeroi = isHeroMoveFreeForPlayer(session, jogadorId)
    if (gratuitoEvento || gratuitoHeroi) return 0
    const delta = Number(modificadores?.moverDelta ?? 0) || 0
    const base = getConfiguredActionCost(session, 'mover', 1)
    return base + delta
}

function getSaltoLivreCost(session, jogadorId) {
    const modificadores = session?.eventoAtivo?.modificadores || {}
    if (isFirstMoveFreeForPlayer(session, jogadorId)) return 0
    if (isHeroMoveFreeForPlayer(session, jogadorId)) return 0
    const base = getConfiguredActionCost(session, 'saltoLivre', 2)
    const custo = Number(modificadores?.saltoLivreCusto ?? base)
    return Number.isFinite(custo) ? custo : base
}

function updateAbilityButtonFromSession(session) {
    if (!btnUsarHabilidade) return
    if (sessionData.isSpectator) {
        btnUsarHabilidade.disabled = true
        btnUsarHabilidade.textContent = 'Habilidade indisponível'
        setAbilityStatus('Modo espectador: ações desabilitadas.')
        return
    }
    if (!isCarta5Revelada(session)) {
        btnUsarHabilidade.disabled = true
        btnUsarHabilidade.textContent = 'Aguardando o Mestre'
        setAbilityStatus('Aguardando o Mestre virar a carta C5.')
        return
    }

    const myPlayer = session?.listaJogadores?.find(
        p => p?.id === sessionData.jogadorId
    )
    const heroTipo = myPlayer?.hero?.tipo || null
    setHeroCardTipo(heroTipo)
    setAbilityStatus('')

    const used = !!session?.habilidadesUsadasPorJogador?.[sessionData.jogadorId]

    // Detectar estado "ativo mas ainda não consumido"
    const anaoActive =
        heroTipo === 'Anao' &&
        !used &&
        (session?.descontoEnigmaHeroiPorJogador?.[sessionData.jogadorId] ?? 0) !== 0
    const humanoActive =
        heroTipo === 'Humano' &&
        !used &&
        !!session?.movimentoGratisHeroiPorJogador?.[sessionData.jogadorId]
    const sereiaActive =
        heroTipo === 'Sereia' &&
        !used &&
        session?.sereiaAbilityActive === sessionData.jogadorId
    const bruxaActive =
        heroTipo === 'Bruxa' &&
        !used &&
        session?.bruxaAbilityActive === sessionData.jogadorId
    const abilityActive = anaoActive || humanoActive || sereiaActive || bruxaActive

    let ruleBlockedReason = ''
    if (heroTipo === 'Humano' && !humanoActive) {
        const custoMover = getMoveCostForPlayer(session, sessionData.jogadorId)
        if (custoMover <= 0) {
            ruleBlockedReason =
                'A habilidade do Humano só pode ser usada quando o custo de movimento for maior que 0.'
        }
    } else if (heroTipo === 'Anao' && !anaoActive) {
        const casaId = myPlayer?.posicao
        if (casaId) {
            const custoEnigma = getEnigmaCostSemHeroi(session, casaId)
            if (custoEnigma <= 0) {
                ruleBlockedReason =
                    'A habilidade do Anão só pode ser usada quando o custo do enigma for maior que 0.'
            }
        }
    }
    const ruleBlocked = !!ruleBlockedReason

    // Se acabou de marcar como usada, mostrar um feedback imediato
    if (used && lastAbilityUsed === false) {
        setAbilityStatus(getAbilityHint(heroTipo) || 'Habilidade usada.')
    }
    lastAbilityUsed = used

    btnUsarHabilidade.disabled =
        !socket ||
        !socket.connected ||
        !sessionData?.sessionId ||
        !sessionData?.jogadorId ||
        sessionData?.isMestre ||
        used ||
        abilityActive ||
        ruleBlocked

    if (!heroTipo) {
        btnUsarHabilidade.textContent = 'Usar habilidade'
    } else {
        btnUsarHabilidade.textContent = `Usar habilidade (${heroTipo})`
    }

    if (abilityActive) {
        const hint = getAbilityHint(heroTipo)
        setAbilityStatus(`Ativo — ${hint}`)
    } else if (used) {
        setAbilityStatus('Inativa — Já utilizada na partida.')
    }
    if (!used && !abilityActive && ruleBlocked) {
        setAbilityStatus(ruleBlockedReason)
    }
}

// All hint cards data (vem do backend)
let hintCardsData = []

// Track slots state (8 slots, each can hold a card ID or null)
const slotsState = new Array(8).fill(null)

// Track multiple variants (easy/hard) per house and active variant per slot
const hintVariantsByHouse = new Map()
const activeHintVariantBySlot = new Map()

// Drag state
let draggedCardId = null
let draggedFromSlot = null

// DOM elements
const hintGrid = document.getElementById('hintGrid')
const hintSlots = document.querySelectorAll('.hint-slot')

function conectarServidor() {
    if (typeof io === 'undefined') {
        console.error('Socket.IO client não carregado')
        return
    }

    socket = io(SERVER_URL)

    socket.on('connect', () => {
        socket.emit('entrar_lobby', {
            sessionId: sessionData.sessionId,
            jogadorId: sessionData.jogadorId,
            nome: sessionData.nome,
            isMestre: false
        })
    })

    socket.on('estado_atualizado', session => {
        lastSession = session
        if (c5MandatoryResponseRequired) {
            const minhaRespostaPendente =
                session?.riddlePendente?.jogadorId === sessionData.jogadorId
            if (
                minhaRespostaPendente ||
                !isMyTurn(session) ||
                !isCarta5Revelada(session)
            ) {
                c5MandatoryResponseRequired = false
            }
        }
        const phEl = document.getElementById('storyPointsValue')
        if (phEl && typeof session.ph === 'number') {
            phEl.textContent = String(session.ph)
        }

        const roundEl = document.querySelector('.round-display strong')
        if (roundEl && typeof session.rodadaAtual === 'number') {
            roundEl.textContent = String(session.rodadaAtual)
        }

        const currentPlayer =
            session.listaJogadores?.[session.jogadorAtualIndex] || null
        const turnEl = document.querySelector('.turn-display')
        if (turnEl) {
            const isMyTurn =
                !!currentPlayer && currentPlayer.id === sessionData.jogadorId
            if (isMyTurn) {
                turnEl.innerHTML = '<strong>SUA VEZ</strong>'
            } else {
                turnEl.textContent = 'Vez de '
                const strong = document.createElement('strong')
                strong.textContent = currentPlayer?.nome || '-'
                turnEl.appendChild(strong)
            }
        }

        applySessionToHints(session)
        updateAbilityButtonFromSession(session)
        updateFinalRiddleButton(session)
        renderPlayerPositions(session)
        renderBoardRevelations(session)
        renderEventCard(session)

        const c5Revealed = isCarta5Revelada(session)
        const c5Changed = lastC5Revealed !== c5Revealed
        lastC5Revealed = c5Revealed

        // When C5 is first revealed, show the current event announcement
        if (c5Changed && c5Revealed && session?.eventoAtivo?.nome) {
            showEventAnnouncement(session.eventoAtivo)
        }

        if (actionModal?.classList.contains('active') && activeHouseContext) {
            openHouseActionModalForHouse(activeHouseContext)
        }
        if (c5Revealed) {
            c5WaitToastShown = false
        } else if (!c5WaitToastShown && !sessionData.isSpectator) {
            showToast(
                'Aguardando o Mestre virar a carta C5 para iniciar o jogo.',
                'info',
                { dedupeKey: 'c5_wait', durationMs: 5000 }
            )
            c5WaitToastShown = true
        }

        // Restaurar tela de fim de jogo após refresh
        if (session.jogoFinalizado && session.resultadoFinal) {
            const overlay = document.getElementById('gameOverOverlay')
            if (overlay && !overlay.classList.contains('active')) {
                showGameOverOverlay(
                    session.resultadoFinal,
                    '',
                    'Herança Diamante'
                )
            }
        }
    })

    socket.on('desafio_carta5_obrigatorio', async data => {
        if (data?.jogadorId !== sessionData.jogadorId) return
        c5MandatoryResponseRequired = true
        showToast(
            'Carta C5 revelada: responda o desafio obrigatório da casa C5 para liberar movimentos.',
            'warning',
            { dedupeKey: 'c5_mandatory' }
        )

        await showAlertModal({
            title: 'Desafio obrigatório em C5',
            message:
                'Você é o jogador da vez. Responda o desafio da casa C5 antes de mover ou passar o turno.',
            confirmText: 'Responder agora'
        })

        if (lastSession && isMyTurn(lastSession)) {
            openHouseActionModalForHouse({
                casaId: 'C5',
                houseNum: 5,
                houseName: 'Bosque'
            })
        }
    })

    // Listen for event changes (new round = new event)
    socket.on('evento_ativo', evento => {
        handleEventoAtivo(evento)
    })

    socket.on('sessao_reiniciada', () => {
        closeActionModal()
        c5WaitToastShown = false
        c5MandatoryResponseRequired = false
        lastEventoAtivoNome = null // Reset event tracking
        showToast('Sessão reiniciada pelo Mestre. O jogo foi resetado.', 'info')
    })

    socket.on('sessao_sem_jogadores', async () => {
        // Partida em andamento, mas não restou nenhum jogador.
        closeActionModal()
        c5WaitToastShown = false
        c5MandatoryResponseRequired = false
        await showAlertModal({
            title: 'Partida pausada',
            message:
                'Todos os jogadores saíram da partida. Voltando ao lobby para aguardar novos jogadores.',
            confirmText: 'Ok'
        })
        window.location.href = `lobby.html?sessao=${encodeURIComponent(sessionData.sessionId || '')}`
    })

    socket.on('sessao_encerrada', () => {
        // Sem mestre, a sessão não existe.
        closeActionModal()
        c5WaitToastShown = false
        c5MandatoryResponseRequired = false
        showAlertModal({
            title: 'Sessão encerrada',
            message:
                'O Mestre saiu da sessão. Clique em Ok para voltar à tela inicial.',
            confirmText: 'Ok',
            allowClose: false
        }).then(() => {
            localStorage.removeItem('algorion_session')
            window.location.href = 'home.html'
        })
    })

    socket.on('sinal_dica_sutil', data => {
        if (data?.jogadorId !== sessionData.jogadorId) return
        clearMermaidAbilitySelection()
        const casaLabel = data?.casaId ? ` para ${data.casaId}` : ''
        setAbilityStatus(
            `Sereia: sinal de dica sutil enviado ao Mestre${casaLabel}.`
        )
    })

    socket.on('pedido_dica_enigma_final_confirmado', data => {
        if (data?.jogadorId !== sessionData.jogadorId) return
        showToast('Pedido de dica enviado ao Mestre.', 'info')
    })

    socket.on('enigma_exibido', async data => {
        if (!data?.texto) return
        const casaId = data?.casaId ? ` ${data.casaId}` : ''
        await showAlertModal({
            title: `Desafio${casaId}`,
            message: data.texto,
            pre: true,
            confirmText: 'Fechar'
        })
    })

    socket.on('historia_consultada', async data => {
        if (!data?.texto) return
        const casaId = data?.casaId ? ` ${data.casaId}` : ''
        await showAlertModal({
            title: `História${casaId}`,
            message: data.texto,
            pre: true,
            confirmText: 'Fechar'
        })
    })

    socket.on('custo_casa_revelado', data => {
        const casaId = data?.casaId || '?'
        const custo = data?.custoExploracao ?? '?'
        const jogadorNome = data?.jogadorNome || 'Bruxa'
        showToast(
            `${jogadorNome} (Bruxa) revelou: casa ${casaId} custa ${custo} PH para explorar.`,
            'info'
        )
    })

    // Game Over overlay
    socket.on('jogo_finalizado', data => {
        const resultado = data?.resultado || 'derrota'
        const mensagem = data?.mensagem || ''
        const respostaCorreta = data?.respostaCorreta || ''
        showGameOverOverlay(resultado, mensagem, respostaCorreta)
    })

    // PH esgotou: abrir enigma final automaticamente para todos
    socket.on('forcar_desafio_final', data => {
        showToast(
            'PH esgotado! O enigma final está disponível.',
            'warning',
            { dedupeKey: 'forcar_final', durationMs: 6000 }
        )
        openRiddleOverlay()
    })

    socket.on('carta_pista_adicionada', ({ carta }) => {
        upsertHintCard(carta)
        backfillSlotsFromDeck(hintCardsData)
        renderHintGrid()
        syncUnreadRiddleHints()
        updateFinalRiddleScript(lastSession, { forceBurn: true })
    })

    socket.on('carta_pista_atualizada', ({ carta }) => {
        upsertHintCard(carta)
        renderHintGrid()
        syncUnreadRiddleHints()
        updateFinalRiddleScript(lastSession)
    })

    socket.on('slot_atualizado', data => {
        if (data?.slotsEnigmaFinal) {
            applySlotsFromServer(data.slotsEnigmaFinal)
            if (lastSession) {
                lastSession.slotsEnigmaFinal = data.slotsEnigmaFinal
                if (typeof data?.textoEnigmaFinalMontado === 'string') {
                    lastSession.textoEnigmaFinalMontado =
                        data.textoEnigmaFinalMontado
                }
            }
            renderHintGrid()
            updateFinalRiddleButton(lastSession)
            updateFinalRiddleScript(lastSession, { forceBurn: true })
        }
    })

    socket.on('acao_negada', data => {
        showToast(data?.motivo || 'Ação negada', 'warning')
    })

    socket.on('sessao_nao_encontrada', () => {
        redirectWithModal({
            title: 'Sessão não encontrada',
            message: 'Sessão não encontrada ou expirada.',
            to: 'home.html'
        })
    })

    socket.on('voce_foi_removido', data => {
        console.warn('Você foi removido da sessão:', data)
        redirectWithModal({
            title: 'Removido da sessão',
            message: 'Você foi removido da sessão pelo Mestre.',
            to: 'home.html'
        })
    })
}

if (actionModalClose) {
    actionModalClose.addEventListener('click', closeActionModal)
}

if (actionModal) {
    actionModal.addEventListener('click', e => {
        if (
            e.target === actionModal ||
            e.target.classList.contains('modal-content')
        ) {
            closeActionModal()
        }
    })
}

if (btnAbrirEnigmaOverlay) {
    btnAbrirEnigmaOverlay.addEventListener('click', () => {
        openRiddleOverlay()
    })
}

if (btnFecharEnigmaOverlay) {
    btnFecharEnigmaOverlay.addEventListener('click', () => {
        closeRiddleOverlay()
    })
}

if (riddleOverlay) {
    riddleOverlay.addEventListener('click', e => {
        if (e.target === riddleOverlay) {
            closeRiddleOverlay()
        }
    })
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && riddleOverlay?.classList.contains('active')) {
        closeRiddleOverlay()
    }
})

if (btnUsarHabilidade) {
    btnUsarHabilidade.addEventListener('click', () => {
        // Block during event announcement
        if (isActionBlocked()) {
            showToast('Aguarde o anúncio do evento terminar.', 'warning')
            return
        }
        if (!socket || !socket.connected) {
            showToast('Sem conexão com o servidor.', 'error')
            return
        }
        if (!sessionData?.sessionId || !sessionData?.jogadorId) {
            showToast('Sessão inválida.', 'error')
            return
        }
        const myPlayer = lastSession ? getMyPlayer(lastSession) : null
        const heroTipo = myPlayer?.hero?.tipo || null
        const abilityUsed =
            !!lastSession?.habilidadesUsadasPorJogador?.[sessionData.jogadorId]
        if (heroTipo === 'Sereia') {
            if (abilityUsed) {
                showToast(
                    'Você já usou a habilidade da Sereia nesta partida.',
                    'info'
                )
                return
            }
        }
        if (heroTipo === 'Humano' && lastSession) {
            const custoMover = getMoveCostForPlayer(
                lastSession,
                sessionData.jogadorId
            )
            if (custoMover <= 0) {
                showToast(
                    'A habilidade do Humano só pode ser usada quando o custo de movimento for maior que 0.',
                    'warning'
                )
                return
            }
        }
        if (heroTipo === 'Anao' && lastSession) {
            const casaId = myPlayer?.posicao
            if (casaId && getEnigmaCostSemHeroi(lastSession, casaId) <= 0) {
                showToast(
                    'A habilidade do Anão só pode ser usada quando o custo do enigma for maior que 0.',
                    'warning'
                )
                return
            }
        }
        socket.emit('usar_habilidade_heroi', {
            sessionId: sessionData.sessionId,
            jogadorId: sessionData.jogadorId
        })
        setAbilityStatus('Habilidade acionada...')
    })
}

if (btnResponderEnigmaFinal) {
    btnResponderEnigmaFinal.addEventListener('click', async () => {
        // Block during event announcement
        if (isActionBlocked()) {
            showToast('Aguarde o anúncio do evento terminar.', 'warning')
            return
        }
        if (!lastSession) return
        if (!isMyTurn(lastSession)) {
            showToast(
                'Aguarde sua vez para responder o enigma final.',
                'warning'
            )
            return
        }
        const phZerado = typeof lastSession.ph === 'number' && lastSession.ph <= 0
        if (!areFinalSlotsFilled(lastSession) && !phZerado) {
            showToast(
                'Preencha todos os slots de dica antes de responder.',
                'warning'
            )
            return
        }
        if (!socket || !socket.connected) {
            showToast('Sem conexão com o servidor.', 'error')
            return
        }

        // Jogo em chamada: o jogador verbaliza a resposta ao Mestre.
        // Aqui apenas avisamos o Mestre para liberar a validação.
        socket.emit('iniciar_desafio_final', {
            sessionId: sessionData.sessionId,
            jogadorId: sessionData.jogadorId
        })
        await showAlertModal({
            title: 'Desafio final iniciado',
            message: 'Verbalize a resposta ao Mestre para validação.',
            confirmText: 'Entendido'
        })
    })
}

if (btnSairSessao) {
    btnSairSessao.addEventListener('click', async () => {
        const ok = await showConfirmModal({
            title: 'Sair da sessão?',
            message: 'Tem certeza que deseja sair da sessão?',
            variant: 'warning',
            confirmText: 'Sair'
        })
        if (ok) {
            if (
                socket?.connected &&
                sessionData?.sessionId &&
                sessionData?.jogadorId
            ) {
                socket.emit('sair_sessao', {
                    sessionId: sessionData.sessionId,
                    jogadorId: sessionData.jogadorId
                })
            }
            localStorage.removeItem('algorion_session')
            window.location.href = 'home.html'
        }
    })
}

function applySlotsFromServer(slotsEnigmaFinal) {
    slotsState.fill(null)

    if (!Array.isArray(slotsEnigmaFinal)) return
    slotsEnigmaFinal.forEach(slot => {
        if (
            typeof slot?.slotIndex === 'number' &&
            slot.slotIndex >= 0 &&
            slot.slotIndex < slotsState.length
        ) {
            slotsState[slot.slotIndex] = slot.cardId ?? null
        }
    })
}

function backfillSlotsFromDeck(deckPistas) {
    if (!Array.isArray(deckPistas) || deckPistas.length === 0) return

    const knownIds = new Set(
        deckPistas
            .map(card => card?.id)
            .filter(cardId => typeof cardId === 'string')
    )

    // Limpar IDs órfãos de slots legados para liberar espaço visual.
    for (let index = 0; index < slotsState.length; index++) {
        const slotCardId = slotsState[index]
        if (slotCardId !== null && !knownIds.has(slotCardId)) {
            slotsState[index] = null
        }
    }

    const alreadyPlaced = new Set(slotsState.filter(cardId => cardId !== null))

    deckPistas.forEach(card => {
        if (!card?.id || alreadyPlaced.has(card.id)) return
        const emptySlotIndex = slotsState.indexOf(null)
        if (emptySlotIndex === -1) return
        slotsState[emptySlotIndex] = card.id
        alreadyPlaced.add(card.id)
    })
}

function getHintVariantId(card) {
    return `${card?.id || ''}::${card?.tipo || ''}::${card?.source || ''}`
}

function normalizeHintVariant(card) {
    if (!card) return null
    return {
        ...card,
        variantId: getHintVariantId(card)
    }
}

function registerHintVariant(card) {
    if (!card?.casaId) return
    const normalized = normalizeHintVariant(card)
    if (!normalized) return

    const variants = hintVariantsByHouse.get(card.casaId) || []
    const idx = variants.findIndex(v => v.variantId === normalized.variantId)
    if (idx >= 0) variants[idx] = normalized
    else variants.push(normalized)
    hintVariantsByHouse.set(card.casaId, variants)
}

function registerHintVariantsFromDeck(deckPistas) {
    if (!Array.isArray(deckPistas)) return
    deckPistas.forEach(card => registerHintVariant(card))
}

function registerHintVariantsFromSession(session) {
    const persisted = session?.hintVariantsByHouse
    if (!persisted || typeof persisted !== 'object') return

    Object.values(persisted).forEach(variants => {
        if (!Array.isArray(variants)) return
        variants.forEach(card => registerHintVariant(card))
    })
}

if (btnPedirDicaEnigmaFinal) {
    btnPedirDicaEnigmaFinal.addEventListener('click', () => {
        if (isActionBlocked()) {
            showToast('Aguarde o anúncio do evento terminar.', 'warning')
            return
        }
        if (!lastSession) return
        if (!isMyTurn(lastSession)) {
            showToast('Aguarde sua vez para pedir dica do enigma final.', 'warning')
            return
        }
        if (!areFinalSlotsFilled(lastSession) && lastSession?.ph > 0) {
            showToast(
                'O enigma final ainda não está liberado para pedir dica.',
                'warning'
            )
            return
        }
        if (hasRequestedFinalHint(lastSession)) {
            showToast('Você já pediu uma dica do enigma final.', 'info')
            return
        }
        if (!socket || !socket.connected) {
            showToast('Sem conexão com o servidor.', 'error')
            return
        }

        socket.emit('pedir_dica_enigma_final', {
            sessionId: sessionData.sessionId,
            jogadorId: sessionData.jogadorId
        })
    })
}

function hydrateActiveHintVariantsFromSession(session) {
    activeHintVariantBySlot.clear()
    const persisted = session?.activeHintVariantBySlot
    if (!persisted || typeof persisted !== 'object') return

    Object.entries(persisted).forEach(([slotKey, variantId]) => {
        const slotIndex = Number(slotKey)
        if (
            Number.isInteger(slotIndex) &&
            typeof variantId === 'string' &&
            variantId.trim()
        ) {
            activeHintVariantBySlot.set(slotIndex, variantId)
        }
    })
}

function getHintVariantsForHouse(casaId) {
    return hintVariantsByHouse.get(casaId) || []
}

function getHintCardByHouse(casaId) {
    return hintCardsData.find(c => c?.casaId === casaId) || null
}

function getSlotIndexForHouse(casaId) {
    return slotsState.findIndex(cardId => {
        if (!cardId) return false
        const cardData = hintCardsData.find(c => c.id === cardId)
        return cardData?.casaId === casaId
    })
}

function getActiveHintVariantForHouse(casaId) {
    if (!casaId) return null

    const cardData = getHintCardByHouse(casaId)
    if (!cardData) return null

    const slotIndex = getSlotIndexForHouse(casaId)
    if (slotIndex >= 0) {
        return (
            getActiveHintVariantForSlot(slotIndex, cardData) ||
            normalizeHintVariant(cardData) ||
            cardData
        )
    }

    const variants = getHintVariantsForHouse(casaId)
    if (!variants.length) {
        return normalizeHintVariant(cardData) || cardData
    }

    const currentVariantId = getHintVariantId(cardData)
    const currentVariant = variants.find(v => v.variantId === currentVariantId)
    return currentVariant || variants[0]
}

function getHintVariantLabel(variant, index, total) {
    return total > 1 ? 'Pista ' + (index + 1) : 'Pista'
}

function getActiveHintVariantForSlot(slotIndex, cardData) {
    if (!cardData?.casaId) return cardData || null
    const variants = getHintVariantsForHouse(cardData.casaId)
    if (!variants.length) return normalizeHintVariant(cardData)

    const selectedVariantId = activeHintVariantBySlot.get(slotIndex)
    if (selectedVariantId) {
        const selected = variants.find(v => v.variantId === selectedVariantId)
        if (selected) return selected
    }

    const currentVariantId = getHintVariantId(cardData)
    const current = variants.find(v => v.variantId === currentVariantId)
    return current || variants[0]
}

function setActiveHintVariantForSlot(slotIndex, cardData, variantId) {
    if (!cardData?.casaId || typeof slotIndex !== 'number') return
    const variants = getHintVariantsForHouse(cardData.casaId)
    const exists = variants.some(v => v.variantId === variantId)
    if (!exists) return
    activeHintVariantBySlot.set(slotIndex, variantId)
}

function pruneActiveHintVariantSelections() {
    for (const [slotIndex, variantId] of activeHintVariantBySlot.entries()) {
        const cardId = slotsState[slotIndex]
        if (!cardId) {
            activeHintVariantBySlot.delete(slotIndex)
            continue
        }
        const cardData = hintCardsData.find(c => c.id === cardId)
        if (!cardData?.casaId) {
            activeHintVariantBySlot.delete(slotIndex)
            continue
        }
        const variants = getHintVariantsForHouse(cardData.casaId)
        const stillExists = variants.some(v => v.variantId === variantId)
        if (!stillExists) {
            activeHintVariantBySlot.delete(slotIndex)
        }
    }
}

function applySessionToHints(session) {
    hintCardsData = Array.isArray(session.deckPistas) ? session.deckPistas : []
    hintVariantsByHouse.clear()
    registerHintVariantsFromSession(session)
    registerHintVariantsFromDeck(hintCardsData)
    applySlotsFromServer(session.slotsEnigmaFinal)
    backfillSlotsFromDeck(hintCardsData)
    hydrateActiveHintVariantsFromSession(session)
    pruneActiveHintVariantSelections()
    renderHintGrid()
    syncUnreadRiddleHints({ initialize: !riddleReadStateInitialized })
    updateFinalRiddleScript(session)
}

function upsertHintCard(carta) {
    if (!carta?.id) return
    const idx = hintCardsData.findIndex(c => c.id === carta.id)
    if (idx >= 0) {
        registerHintVariant(hintCardsData[idx])
        hintCardsData[idx] = carta
    } else {
        hintCardsData.push(carta)
    }
    registerHintVariant(carta)
    pruneActiveHintVariantSelections()
}

// Initialize the display
function init() {
    renderHintGrid()
    setupDragAndDrop()
}

// Render the 4x2 hint grid
function renderHintGrid() {
    pruneActiveHintVariantSelections()
    hintSlots.forEach((slotEl, index) => {
        const cardId = slotsState[index]
        slotEl.innerHTML = ''
        slotEl.classList.remove('filled')

        if (cardId !== null) {
            const cardData = hintCardsData.find(c => c.id === cardId)
            if (cardData) {
                const displayData =
                    getActiveHintVariantForSlot(index, cardData) ||
                    normalizeHintVariant(cardData) ||
                    cardData
                slotEl.classList.add('filled')
                const cardEl = createHintCardElement(cardData, index, displayData)
                slotEl.appendChild(cardEl)
            }
        }
    })
}

// Create a hint card element for the grid
function createHintCardElement(data, slotIndex, displayData) {
    const cardEl = document.createElement('div')
    cardEl.className = 'hint-card'
    cardEl.draggable = !sessionData.isSpectator
    cardEl.dataset.cardId = data.id

    const img = document.createElement('img')
    img.className = 'hint-card-img'
    img.alt = 'Carta de pista'
    img.src = resolveAssetUrl(displayData?.source || data.source)
    cardEl.appendChild(img)

    cardEl.addEventListener('click', e => {
        if (draggedCardId) return
        e.stopPropagation()
        const variantsRaw = getHintVariantsForHouse(data.casaId)
        const fallbackVariant = normalizeHintVariant(data)
        const variants = (variantsRaw.length ? variantsRaw : [fallbackVariant]).map(
            (variant, index, all) => ({
                ...variant,
                frontSrc: resolveAssetUrl(variant.frontSource),
                backSrc: resolveAssetUrl(variant.source),
                label: getHintVariantLabel(variant, index, all.length)
            })
        )

        const activeVariant =
            getActiveHintVariantForSlot(slotIndex, data) || fallbackVariant

        openCardModal(
            resolveAssetUrl(activeVariant?.frontSource || data.frontSource),
            resolveAssetUrl(activeVariant?.source || data.source),
            true,
            {
                hintVariants: variants,
                initialHintVariantId: activeVariant?.variantId,
                canEquipHintVariant: !sessionData.isSpectator,
                isHintVariantEquipped: variant =>
                    getActiveHintVariantForSlot(slotIndex, data)?.variantId ===
                    variant?.variantId,
                onEquipHintVariant: variant => {
                    if (sessionData.isSpectator) return
                    setActiveHintVariantForSlot(
                        slotIndex,
                        data,
                        variant.variantId
                    )
                    if (socket && socket.connected && sessionData?.sessionId) {
                        socket.emit('equipar_pista_ativa_slot', {
                            sessionId: sessionData.sessionId,
                            jogadorId: sessionData.jogadorId,
                            slotIndex,
                            variantId: variant.variantId
                        })
                    }
                    renderHintGrid()
                    updateFinalRiddleScript(lastSession, { forceBurn: true })
                }
            }
        )
    })

    // Add drag event listeners
    if (!sessionData.isSpectator) {
        cardEl.addEventListener('dragstart', handleDragStart)
        cardEl.addEventListener('dragend', handleDragEnd)
    }

    return cardEl
}

// Setup drag and drop on hint grid slots
function setupDragAndDrop() {
    if (sessionData.isSpectator) return
    hintSlots.forEach(slotEl => {
        slotEl.addEventListener('dragover', handleDragOver)
        slotEl.addEventListener('drop', handleDrop)
        slotEl.addEventListener('dragleave', handleDragLeave)
    })
}

// Drag start handler
function handleDragStart(e) {
    if (isActionBlocked()) {
        e.preventDefault()
        return
    }

    const cardEl = e.target.closest('.hint-card')
    if (!cardEl) return

    draggedCardId = cardEl.dataset.cardId

    const parentSlot = cardEl.closest('.hint-slot')
    if (parentSlot) {
        draggedFromSlot = parseInt(parentSlot.dataset.slotIndex)
    } else {
        draggedFromSlot = null
    }

    cardEl.classList.add('dragging')
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', draggedCardId)
}

// Drag end handler
function handleDragEnd(e) {
    const cardEl = e.target.closest('.hint-card')
    if (cardEl) {
        cardEl.classList.remove('dragging')
    }

    draggedCardId = null
    draggedFromSlot = null

    hintSlots.forEach(s => s.classList.remove('drag-over'))
}

// Drag over handler
function handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    const slotEl = e.target.closest('.hint-slot')
    if (slotEl) {
        slotEl.classList.add('drag-over')
    }
}

// Drag leave handler
function handleDragLeave(e) {
    const slotEl = e.target.closest('.hint-slot')
    if (slotEl && !slotEl.contains(e.relatedTarget)) {
        slotEl.classList.remove('drag-over')
    }
}

// Drop handler — swap cards between slots
function handleDrop(e) {
    if (sessionData.isSpectator) return
    if (isActionBlocked()) return
    e.preventDefault()
    e.stopPropagation()

    const slotEl = e.target.closest('.hint-slot')
    if (!slotEl) return

    slotEl.classList.remove('drag-over')

    const targetSlotIndex = parseInt(slotEl.dataset.slotIndex)
    if (draggedFromSlot === targetSlotIndex) return // same slot, ignore

    if (!socket || !sessionData.sessionId || draggedCardId === null) return

    socket.emit('posicionar_pista_slot', {
        sessionId: sessionData.sessionId,
        jogadorId: sessionData.jogadorId,
        cardId: draggedCardId,
        slotIndex: targetSlotIndex,
        fromSlotIndex: draggedFromSlot
    })
}

// Initialize on page load
// =====================================================
// GAME OVER OVERLAY
// =====================================================
function showGameOverOverlay(resultado, mensagem, respostaCorreta) {
    const overlay = document.getElementById('gameOverOverlay')
    const iconEl = document.getElementById('gameOverIcon')
    const titleEl = document.getElementById('gameOverTitle')
    const narrativeEl = document.getElementById('gameOverNarrative')
    const answerEl = document.getElementById('gameOverAnswer')
    const btnVoltar = document.getElementById('btnVoltarInicio')
    const particlesEl = document.getElementById('gameOverParticles')
    if (!overlay) return

    const isVictory = resultado === 'vitoria'

    // Set variant class
    overlay.classList.remove('victory', 'defeat')
    overlay.classList.add(isVictory ? 'victory' : 'defeat')

    // Icon
    iconEl.textContent = isVictory ? '👑' : '💀'

    // Title
    titleEl.textContent = isVictory
        ? 'Vitória em Algorion!'
        : 'As Sombras Prevalecem...'

    // Narrative text with story flavor
    if (isVictory) {
        narrativeEl.textContent =
            'Os heróis desvendaram os segredos ocultos de Algorion! ' +
            'Com sabedoria e coragem, o grupo identificou o padrão ' +
            'que ameaçava o reino — a Herança Diamante foi revelada ' +
            'e o equilíbrio foi restaurado. As crônicas registrarão ' +
            'esta jornada para sempre.'
    } else {
        narrativeEl.textContent =
            'As sombras se adensam sobre Algorion... Os heróis ' +
            'não conseguiram desvendar o mistério a tempo. O padrão ' +
            'oculto permanece selado nas profundezas do reino, e a ' +
            'escuridão avança. Talvez uma nova jornada possa ' +
            'reescrever o destino destas terras.'
    }

    // Answer
    if (respostaCorreta) {
        answerEl.textContent = isVictory
            ? `A resposta era: ${respostaCorreta}`
            : `A resposta correta era: ${respostaCorreta}`
    } else {
        answerEl.textContent = ''
    }

    // Create floating particles
    particlesEl.innerHTML = ''
    const particleColor = isVictory
        ? 'rgba(255, 215, 0, 0.6)'
        : 'rgba(220, 60, 60, 0.5)'
    for (let i = 0; i < 20; i++) {
        const p = document.createElement('div')
        p.className = 'game-over-particle'
        const size = 4 + Math.random() * 8
        p.style.width = size + 'px'
        p.style.height = size + 'px'
        p.style.background = particleColor
        p.style.left = Math.random() * 100 + '%'
        p.style.bottom = '-10px'
        p.style.animationDelay = Math.random() * 4 + 's'
        p.style.animationDuration = 3 + Math.random() * 3 + 's'
        particlesEl.appendChild(p)
    }

    // Button action
    btnVoltar.onclick = () => {
        window.location.href = './home.html'
    }

    // Show overlay with animation
    overlay.classList.remove('hidden')
    requestAnimationFrame(() => {
        overlay.classList.add('active')
    })
}

document.addEventListener('DOMContentLoaded', () => {
    const ok = carregarSessaoLocal()
    if (!ok) {
        window.location.href = './lobby.html'
        return
    }
    const params = new URLSearchParams(window.location.search)
    if (params.get('spectator') === '1') {
        sessionData.isSpectator = true
        salvarSessaoLocal()
    }

    init()
    setupHouseInteractions()
    conectarServidor()
})
