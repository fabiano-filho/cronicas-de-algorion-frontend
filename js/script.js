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
const btnSairSessao = document.getElementById('btnSairSessao')

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

function updateFinalRiddleButton(session) {
    if (!btnResponderEnigmaFinal) return
    if (sessionData.isSpectator) {
        btnResponderEnigmaFinal.style.display = 'none'
        btnResponderEnigmaFinal.disabled = true
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

    btnResponderEnigmaFinal.style.display = shouldShow ? 'inline-block' : 'none'
    btnResponderEnigmaFinal.disabled = !canClick
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
function openCardModal(frontSrc, backSrc, showBackFirst = false) {
    modalCardContainer.innerHTML = ''

    // Create wrapper for card and flip button
    const cardWrapper = document.createElement('div')
    cardWrapper.className = 'card-wrapper'

    const zoomedCard = document.createElement('div')
    zoomedCard.className = 'zoomed-card'

    // Front Face (what's visible initially)
    const faceFront = document.createElement('div')
    faceFront.className = 'card-face card-front'
    const imgFront = document.createElement('img')
    imgFront.src = frontSrc
    faceFront.appendChild(imgFront)

    // Back Face (what's visible after flip)
    const faceBack = document.createElement('div')
    faceBack.className = 'card-face card-back'
    const imgBack = document.createElement('img')
    imgBack.src = backSrc
    faceBack.appendChild(imgBack)

    zoomedCard.appendChild(faceFront)
    zoomedCard.appendChild(faceBack)

    // Flip Button - adjust text based on what's showing
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

    // Flip on button click
    flipButton.addEventListener('click', function (e) {
        e.stopPropagation()
        flipCard()
    })

    cardWrapper.appendChild(zoomedCard)
    cardWrapper.appendChild(flipButton)
    modalCardContainer.appendChild(cardWrapper)
    modal.classList.add('active')
}

// Close Modal Logic
function closeModal() {
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
        if (
            e.target === modal ||
            e.target.classList.contains('modal-content')
        ) {
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
const TOTAL_CARDS = 8
const VISIBLE_CARDS = 3

// Track current starting index
let currentIndex = 0

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
    if (!pendingMermaidAbilityTarget) return
    if (!sessionData?.sessionId || !sessionData?.jogadorId) {
        showToast('Sessão inválida.', 'error')
        clearMermaidAbilitySelection()
        return
    }
    if (!socket || !socket.connected) {
        showToast('Sem conexão com o servidor.', 'error')
        clearMermaidAbilitySelection()
        return
    }

    socket.emit('usar_habilidade_heroi', {
        sessionId: sessionData.sessionId,
        jogadorId: sessionData.jogadorId,
        casaId
    })
    const label = houseName || casaId
    setAbilityStatus(`Sereia: sinal de dica sutil solicitado para ${label}.`)
    showToast(`Sereia: sinal de dica solicitado para ${label}.`, 'info', {
        dedupeKey: 'sereia-ability'
    })
    clearMermaidAbilitySelection()
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

        const preview = document.createElement('div')
        preview.className = 'action-card-preview'
        if (card?.title && card?.showTitle) {
            const titleEl = document.createElement('div')
            titleEl.className = 'action-card-title'
            titleEl.textContent = card.title
            preview.appendChild(titleEl)
        }
        const img = document.createElement('img')
        img.src = card.src
        img.alt = card.alt || 'Carta'
        preview.appendChild(img)

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
    if (
        pendingMermaidAbilityTarget &&
        heroTipo === 'Sereia' &&
        !heroAbilityUsed &&
        revealed
    ) {
        actions.push({
            label: 'Sereia: pedir dica sutil para este desafio',
            disabled: !socket || !socket.connected,
            onClick: () => {
                requestMermaidHint(casaId, resolvedHouseName)
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
        case 'Bruxa':
            return 'Revelando custos de cartas ocultas...'
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
    const mermaidSelectionActive =
        heroTipo === 'Sereia' && pendingMermaidAbilityTarget
    if (!mermaidSelectionActive) {
        setAbilityStatus('')
    }

    const used = !!session?.habilidadesUsadasPorJogador?.[sessionData.jogadorId]
    let ruleBlockedReason = ''
    if (heroTipo === 'Humano') {
        const custoMover = getMoveCostForPlayer(session, sessionData.jogadorId)
        if (custoMover <= 0) {
            ruleBlockedReason =
                'A habilidade do Humano só pode ser usada quando o custo de movimento for maior que 0.'
        }
    } else if (heroTipo === 'Anao') {
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
        ruleBlocked

    if (!heroTipo) {
        btnUsarHabilidade.textContent = 'Usar habilidade'
    } else {
        btnUsarHabilidade.textContent = `Usar habilidade (${heroTipo})`
    }

    if (used) {
        setAbilityStatus('Habilidade já usada na partida.')
    }
    if (!used && ruleBlocked) {
        setAbilityStatus(ruleBlockedReason)
    }
    if (mermaidSelectionActive) {
        setAbilityStatus(
            'Sereia: clique em um desafio já revelado para enviar o sinal de dica sutil.'
        )
    }
}

// All hint cards data (vem do backend)
let hintCardsData = []

// Track slots state (8 slots, each can hold a card ID or null)
const slotsState = new Array(8).fill(null)

// Track used cards (Set of card IDs currently in slots)
const usedCards = new Set()

// Drag state
let draggedCardId = null
let draggedFromSlot = null

// DOM elements
const scrollUpBtn = document.getElementById('scrollUp')
const scrollDownBtn = document.getElementById('scrollDown')
const cardsContainer = document.querySelector('.hint-cards-container')
const slots = document.querySelectorAll('.slot')

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
        const turnEl = document.querySelector('.turn-display strong')
        if (turnEl) {
            const isMyTurn =
                !!currentPlayer && currentPlayer.id === sessionData.jogadorId
            turnEl.textContent = isMyTurn
                ? 'Sua vez'
                : currentPlayer?.nome || '-'
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

    socket.on('custos_cartas_revelados', async data => {
        if (data?.jogadorId !== sessionData.jogadorId) return
        const cartas = Array.isArray(data?.cartas) ? data.cartas : []
        if (!cartas.length) {
            showToast('Bruxa: nenhuma carta oculta para revelar agora.', 'info')
            return
        }
        const items = cartas.map(
            c => `Carta ${c.id}: custo do enigma ${c.custoExploracao}`
        )
        await showAlertModal({
            title: 'Bruxa: custos revelados',
            message: 'Confira os custos das cartas ocultas:',
            items,
            confirmText: 'Fechar'
        })
        setAbilityStatus('Bruxa: custos revelados.')
    })

    // Bruxa: jogador escolhe quais cartas ocultas quer ver o custo
    socket.on('bruxa_escolher_cartas', data => {
        const opcoes = Array.isArray(data?.opcoes) ? data.opcoes : []
        if (!opcoes.length) {
            showToast('Bruxa: nenhuma carta oculta disponível agora.', 'info')
            return
        }

        const ids = opcoes
            .map(o => String(o?.id || ''))
            .filter(Boolean)
            .sort()

        const escolhas = []

        const abrirSelecao = () => {
            const restantes = ids.filter(id => !escolhas.includes(id))
            if (!restantes.length) {
                return
            }

            openActionModal({
                title:
                    escolhas.length === 0
                        ? 'Bruxa: escolha a 1ª carta'
                        : 'Bruxa: escolha a 2ª carta (opcional)',
                hint:
                    escolhas.length === 0
                        ? 'Selecione uma casa oculta para ver o custo do enigma.'
                        : 'Selecione uma segunda casa (ou finalize).',
                actions: [
                    ...restantes.map(id => ({
                        label: `Ver custo de ${id}`,
                        disabled: false,
                        onClick: () => {
                            escolhas.push(id)
                            closeActionModal()
                            if (escolhas.length >= 2) {
                                socket.emit('bruxa_revelar_custos', {
                                    sessionId: sessionData.sessionId,
                                    jogadorId: sessionData.jogadorId,
                                    casaIds: escolhas
                                })
                                return
                            }
                            abrirSelecao()
                        }
                    })),
                    {
                        label:
                            escolhas.length === 0
                                ? 'Cancelar'
                                : 'Finalizar com 1 carta',
                        disabled: false,
                        onClick: () => {
                            closeActionModal()
                            if (escolhas.length === 0) {
                                socket.emit('bruxa_cancelar', {
                                    sessionId: sessionData.sessionId,
                                    jogadorId: sessionData.jogadorId
                                })
                                return
                            }
                            socket.emit('bruxa_revelar_custos', {
                                sessionId: sessionData.sessionId,
                                jogadorId: sessionData.jogadorId,
                                casaIds: escolhas
                            })
                        }
                    }
                ]
            })
        }

        abrirSelecao()
    })

    socket.on('carta_pista_adicionada', ({ carta }) => {
        upsertHintCard(carta)
        updateDisplay()
        updateButtons()
    })

    socket.on('carta_pista_atualizada', ({ carta }) => {
        upsertHintCard(carta)
        updateDisplay()
        updateButtons()
    })

    socket.on('slot_atualizado', data => {
        if (data?.slotsEnigmaFinal) {
            applySlotsFromServer(data.slotsEnigmaFinal)
            updateDisplay()
            updateButtons()
            updateFinalRiddleButton(lastSession)
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
            if (pendingMermaidAbilityTarget) {
                clearMermaidAbilitySelection()
                setAbilityStatus('')
                showToast('Seleção da habilidade da Sereia cancelada.', 'info')
                return
            }
            startMermaidAbilitySelection()
            return
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
        if (!areFinalSlotsFilled(lastSession)) {
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
    usedCards.clear()
    slotsState.fill(null)

    if (!Array.isArray(slotsEnigmaFinal)) return
    slotsEnigmaFinal.forEach(slot => {
        if (
            typeof slot?.slotIndex === 'number' &&
            slot.slotIndex >= 0 &&
            slot.slotIndex < slotsState.length
        ) {
            slotsState[slot.slotIndex] = slot.cardId ?? null
            if (slot.cardId) usedCards.add(slot.cardId)
        }
    })
}

function applySessionToHints(session) {
    hintCardsData = Array.isArray(session.deckPistas) ? session.deckPistas : []
    applySlotsFromServer(session.slotsEnigmaFinal)
    currentIndex = 0
    updateDisplay()
    updateButtons()
}

function upsertHintCard(carta) {
    if (!carta?.id) return
    const idx = hintCardsData.findIndex(c => c.id === carta.id)
    if (idx >= 0) hintCardsData[idx] = carta
    else hintCardsData.push(carta)
}

// Initialize the display
function init() {
    updateDisplay()
    updateButtons()
    setupDragAndDrop()
}

// Update the visible cards
function updateDisplay() {
    // Filter out used cards
    const availableCards = hintCardsData.filter(card => !usedCards.has(card.id))

    const visibleData = availableCards.slice(
        currentIndex,
        currentIndex + VISIBLE_CARDS
    )

    // Clear existing cards in container
    cardsContainer.innerHTML = ''

    // Create card elements for visible cards
    visibleData.forEach(data => {
        const cardEl = createCardElement(data)
        cardsContainer.appendChild(cardEl)
    })

    // Add placeholders if less than 3 visible
    const placeholdersNeeded = VISIBLE_CARDS - visibleData.length
    for (let i = 0; i < placeholdersNeeded; i++) {
        const placeholder = document.createElement('div')
        placeholder.className = 'hint-card is-placeholder'
        placeholder.style.opacity = '0.3'
        placeholder.style.transform = 'scale(0.9)'
        placeholder.setAttribute('aria-hidden', 'true')
        cardsContainer.appendChild(placeholder)
    }

    // Update slots display
    updateSlotsDisplay()
}

// Create a card element
function createCardElement(data, inSlot = false) {
    const cardEl = document.createElement('div')
    cardEl.className = 'hint-card'
    cardEl.draggable = !sessionData.isSpectator
    cardEl.dataset.cardId = data.id

    const img = document.createElement('img')
    img.className = 'hint-card-img'
    img.alt = 'Carta de pista'
    img.src = resolveAssetUrl(data.source)
    cardEl.appendChild(img)

    cardEl.addEventListener('click', e => {
        if (draggedCardId) return
        e.stopPropagation()
        openCardModal(
            resolveAssetUrl(data.frontSource),
            resolveAssetUrl(data.source),
            true
        )
    })

    // Add remove button if in slot
    if (inSlot && !sessionData.isSpectator) {
        const removeBtn = document.createElement('button')
        removeBtn.type = 'button'
        removeBtn.className = 'remove-btn'
        removeBtn.setAttribute('aria-label', 'Remover carta do slot')
        removeBtn.textContent = '\u00D7'
        removeBtn.addEventListener('click', e => {
            e.stopPropagation()
            removeCardFromSlot(data.id)
        })
        cardEl.appendChild(removeBtn)
    }

    // Add drag event listeners
    if (!sessionData.isSpectator) {
        cardEl.addEventListener('dragstart', handleDragStart)
        cardEl.addEventListener('dragend', handleDragEnd)
    }

    return cardEl
}

// Update slots display
function updateSlotsDisplay() {
    slots.forEach((slot, index) => {
        const cardId = slotsState[index]

        // Clear slot
        slot.innerHTML = ''
        slot.classList.remove('filled')

        if (cardId !== null) {
            // Slot is filled
            slot.classList.add('filled')
            const cardData = hintCardsData.find(c => c.id === cardId)
            if (cardData) {
                const cardEl = createCardElement(cardData, true)
                slot.appendChild(cardEl)
            }
        }
    })
}

// Update button states
function updateButtons() {
    const availableCards = hintCardsData.filter(card => !usedCards.has(card.id))

    // Disable up button if at the start
    scrollUpBtn.disabled = currentIndex === 0

    // Disable down button if at the end or no more cards
    scrollDownBtn.disabled =
        currentIndex >= availableCards.length - VISIBLE_CARDS
}

// Scroll up (show previous cards)
function scrollUp() {
    if (currentIndex > 0) {
        currentIndex--
        updateDisplay()
        updateButtons()
    }
}

// Scroll down (show next cards)
function scrollDown() {
    const availableCards = hintCardsData.filter(card => !usedCards.has(card.id))
    if (currentIndex < availableCards.length - VISIBLE_CARDS) {
        currentIndex++
        updateDisplay()
        updateButtons()
    }
}

// Setup drag and drop
function setupDragAndDrop() {
    if (sessionData.isSpectator) return
    // Make slots droppable
    slots.forEach(slot => {
        slot.addEventListener('dragover', handleDragOver)
        slot.addEventListener('drop', handleDrop)
        slot.addEventListener('dragleave', handleDragLeave)
    })

    // Make hint column droppable (for removing cards from slots)
    cardsContainer.addEventListener('dragover', handleDragOver)
    cardsContainer.addEventListener('drop', handleDropToColumn)
}

// Drag start handler
function handleDragStart(e) {
    // Block during event announcement
    if (isActionBlocked()) {
        e.preventDefault()
        return
    }

    const cardEl = e.target.closest('.hint-card')
    if (!cardEl) return

    draggedCardId = cardEl.dataset.cardId

    // Check if dragging from slot
    const parentSlot = cardEl.closest('.slot')
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

    // Clear drag state
    draggedCardId = null
    draggedFromSlot = null

    // Remove all drag-over classes
    slots.forEach(slot => slot.classList.remove('drag-over'))
}

// Drag over handler
function handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    const slot = e.target.closest('.slot')
    if (slot) {
        slot.classList.add('drag-over')
    }
}

// Drag leave handler
function handleDragLeave(e) {
    const slot = e.target.closest('.slot')
    if (slot && !slot.contains(e.relatedTarget)) {
        slot.classList.remove('drag-over')
    }
}

// Drop handler for slots
function handleDrop(e) {
    if (sessionData.isSpectator) return
    if (isActionBlocked()) return // Block during event announcement
    e.preventDefault()
    e.stopPropagation()

    const slot = e.target.closest('.slot')
    if (!slot) return

    slot.classList.remove('drag-over')

    const targetSlotIndex = parseInt(slot.dataset.slotIndex)

    if (!socket || !sessionData.sessionId) return
    socket.emit('posicionar_pista_slot', {
        sessionId: sessionData.sessionId,
        jogadorId: sessionData.jogadorId,
        cardId: draggedCardId,
        slotIndex: targetSlotIndex
    })
}

// Drop handler for column (remove from slot)
function handleDropToColumn(e) {
    if (sessionData.isSpectator) return
    if (isActionBlocked()) return // Block during event announcement
    e.preventDefault()
    e.stopPropagation()

    // Only process if dragging from a slot
    if (draggedFromSlot !== null && draggedCardId !== null) {
        removeCardFromSlot(draggedCardId)
    }
}

// Remove card from slot
function removeCardFromSlot(cardId) {
    // Find slot index
    const slotIndex = slotsState.findIndex(id => id === cardId)
    if (slotIndex === -1) return

    if (!socket || !sessionData.sessionId) return
    socket.emit('remover_pista_slot', {
        sessionId: sessionData.sessionId,
        jogadorId: sessionData.jogadorId,
        cardId,
        slotIndex
    })
}

// Event listeners
scrollUpBtn.addEventListener('click', scrollUp)
scrollDownBtn.addEventListener('click', scrollDown)

// Initialize on page load
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
