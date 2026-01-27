// Modal Elements
const modal = document.getElementById('cardModal')
const modalClose = document.getElementById('modalClose')
const modalCardContainer = document.getElementById('modalCardContainer')

// Hero ability UI
const btnUsarHabilidade = document.getElementById('btnUsarHabilidade')
const heroAbilityStatus = document.getElementById('heroAbilityStatus')

let lastHeroTipo = null
let lastAbilityUsed = null

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
        // Also using modal for Event Card for consistency if it fits the pattern "Event Cards follow same pattern"
        // Let's upgrade this too as it provides better UX and they are similar.
        openCardModal(
            '../assets/cards/events/front-event.png',
            '../assets/cards/events/front-event.png', // Placeholder back if none exists or same
            false
        )
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
    isMestre: false
}

function carregarSessaoLocal() {
    try {
        const saved = localStorage.getItem('algorion_session')
        if (saved) {
            sessionData = JSON.parse(saved)
            return !!sessionData.sessionId
        }
    } catch (e) {
        console.error('Erro ao carregar sessão:', e)
    }
    return false
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

function updateAbilityButtonFromSession(session) {
    if (!btnUsarHabilidade) return

    const myPlayer = session?.listaJogadores?.find(
        p => p?.id === sessionData.jogadorId
    )
    const heroTipo = myPlayer?.hero?.tipo || null
    setHeroCardTipo(heroTipo)

    const jogadorAtual =
        session?.listaJogadores?.[session?.jogadorAtualIndex] || null
    const isMyTurn = !!jogadorAtual && jogadorAtual.id === sessionData.jogadorId
    const used = !!session?.habilidadesUsadasPorJogador?.[sessionData.jogadorId]

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
        !isMyTurn ||
        used

    if (!heroTipo) {
        btnUsarHabilidade.textContent = 'Usar habilidade'
    } else {
        btnUsarHabilidade.textContent = `Usar habilidade (${heroTipo})`
    }

    if (!isMyTurn && !used) {
        setAbilityStatus('Aguarde sua vez para usar.')
    }
    if (used) {
        setAbilityStatus('Habilidade já usada na partida.')
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
            turnEl.textContent = currentPlayer?.nome || '-'
        }

        applySessionToHints(session)
        updateAbilityButtonFromSession(session)
    })

    socket.on('sinal_dica_sutil', data => {
        if (data?.jogadorId !== sessionData.jogadorId) return
        setAbilityStatus('Sereia: sinal de dica sutil enviado ao Mestre.')
    })

    socket.on('custos_cartas_revelados', data => {
        if (data?.jogadorId !== sessionData.jogadorId) return
        const cartas = Array.isArray(data?.cartas) ? data.cartas : []
        if (!cartas.length) {
            alert('Bruxa: nenhuma carta oculta para revelar agora.')
            return
        }
        const msg = cartas
            .map(c => `Carta ${c.id}: custo de exploração ${c.custoExploracao}`)
            .join('\n')
        alert(`Bruxa: custos revelados\n\n${msg}`)
        setAbilityStatus('Bruxa: custos revelados.')
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
        }
    })

    socket.on('acao_negada', data => {
        alert(data?.motivo || 'Ação negada')
    })
}

if (btnUsarHabilidade) {
    btnUsarHabilidade.addEventListener('click', () => {
        if (!socket || !socket.connected) {
            alert('Sem conexão com o servidor.')
            return
        }
        if (!sessionData?.sessionId || !sessionData?.jogadorId) {
            alert('Sessão inválida.')
            return
        }
        socket.emit('usar_habilidade_heroi', {
            sessionId: sessionData.sessionId,
            jogadorId: sessionData.jogadorId
        })
        setAbilityStatus('Habilidade acionada...')
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
        placeholder.className = 'hint-card'
        placeholder.style.opacity = '0.3'
        placeholder.style.transform = 'scale(0.9)'
        placeholder.innerHTML = '<span class="card-label">-</span>'
        cardsContainer.appendChild(placeholder)
    }

    // Update slots display
    updateSlotsDisplay()
}

// Create a card element
function createCardElement(data, inSlot = false) {
    const cardEl = document.createElement('div')
    cardEl.className = 'hint-card'
    cardEl.draggable = true
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

    const label = document.createElement('span')
    label.className = 'card-label'
    label.textContent = data.texto || 'Pista'
    cardEl.appendChild(label)

    // Add remove button if in slot
    if (inSlot) {
        const removeBtn = document.createElement('button')
        removeBtn.className = 'remove-btn'
        removeBtn.textContent = '×'
        removeBtn.addEventListener('click', e => {
            e.stopPropagation()
            removeCardFromSlot(data.id)
        })
        cardEl.appendChild(removeBtn)
    }

    // Add drag event listeners
    cardEl.addEventListener('dragstart', handleDragStart)
    cardEl.addEventListener('dragend', handleDragEnd)

    return cardEl
}

// Update slots display
function updateSlotsDisplay() {
    slots.forEach((slot, index) => {
        const cardId = slotsState[index]

        // Clear slot
        slot.innerHTML = '<span class="slot-label">SLOT</span>'
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

    init()
    conectarServidor()
})
