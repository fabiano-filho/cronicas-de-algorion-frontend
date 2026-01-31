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

let lastHeroTipo = null
let lastAbilityUsed = null

// House actions UI
const actionModal = document.getElementById('actionModal')
const actionModalClose = document.getElementById('actionModalClose')
const actionTitle = document.getElementById('actionTitle')
const actionBody = document.getElementById('actionBody')

let lastSession = null
let pendingAnswerAfterExplore = null

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

    const filled = areFinalSlotsFilled(session)
    const myTurn = isMyTurn(session)
    const canClick =
        filled &&
        myTurn &&
        !!socket &&
        socket.connected &&
        !!sessionData?.sessionId &&
        !!sessionData?.jogadorId

    btnResponderEnigmaFinal.style.display = filled ? 'inline-block' : 'none'
    btnResponderEnigmaFinal.disabled = !canClick
}

const HERO_COLORS = {
    Anao: '#7D7940',
    Humano: '#B68B71',
    Sereia: '#DA7C7C',
    Bruxa: '#62769E'
}

// Mapa de adjacências do tabuleiro 3x3 (mesmo do backend)
const ADJACENCIAS = {
    C1: ['C2', 'C4'],
    C2: ['C1', 'C3', 'C5'],
    C3: ['C2', 'C6'],
    C4: ['C1', 'C5', 'C7'],
    C5: ['C2', 'C4', 'C6', 'C8'],
    C6: ['C3', 'C5', 'C9'],
    C7: ['C4', 'C8'],
    C8: ['C5', 'C7', 'C9'],
    C9: ['C6', 'C8']
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

function closeActionModal() {
    if (!actionModal) return
    actionModal.classList.remove('active')
    if (actionTitle) actionTitle.textContent = ''
    if (actionBody) actionBody.innerHTML = ''
    document.querySelectorAll('.house-card.selected').forEach(el => {
        el.classList.remove('selected')
    })
}

function openActionModal({ title, actions, hint }) {
    if (!actionModal || !actionBody) return
    if (actionTitle) actionTitle.textContent = title || ''
    actionBody.innerHTML = ''

    if (hint) {
        const p = document.createElement('div')
        p.className = 'action-hint'
        p.textContent = hint
        actionBody.appendChild(p)
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
        actionBody.appendChild(btn)
    })

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
            if (current?.id && p.id === current.id) {
                pawn.classList.add('is-current')
            }
            container.appendChild(pawn)
        })

        el.appendChild(container)
    }
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

            document
                .querySelectorAll('.house-card.selected')
                .forEach(el => el.classList.remove('selected'))
            cardEl.classList.add('selected')

            const myPlayer = getMyPlayer(lastSession)
            const myPos = myPlayer?.posicao
            const myTurn = isMyTurn(lastSession)
            const revealed = !!getCardById(lastSession, casaId)?.revelada
            const alreadyAnswered = !!lastSession?.registrosEnigmas?.[casaId]
            const onThisHouse = myPos === casaId
            const adjacent =
                !!myPos &&
                Array.isArray(ADJACENCIAS[myPos]) &&
                ADJACENCIAS[myPos].includes(casaId)

            const hint = !myTurn
                ? 'Ações de casa só podem ser feitas na sua vez.'
                : onThisHouse
                  ? revealed
                      ? 'Você está aqui. Carta já revelada.'
                      : 'Você está aqui. Carta ainda não revelada.'
                  : `Você está em ${myPos || '?'}.`

            const actions = []

            if (!onThisHouse) {
                actions.push({
                    label: 'Mover para essa casa (1 PH)',
                    disabled: !myTurn || !adjacent,
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
                    label: 'Salto Livre para essa casa (2 PH)',
                    disabled: !myTurn || adjacent,
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
                    label: 'Explorar / Revelar carta (1 PH)',
                    disabled: !myTurn || revealed,
                    onClick: () => {
                        socket.emit('explorar_carta', {
                            sessionId: sessionData.sessionId,
                            jogadorId: sessionData.jogadorId,
                            custoExploracao: 1
                        })
                        pendingAnswerAfterExplore = null
                        closeActionModal()
                    }
                })

                actions.push({
                    label: 'Revelar carta e responder',
                    disabled: !myTurn || revealed,
                    onClick: () => {
                        pendingAnswerAfterExplore = casaId
                        socket.emit('explorar_carta', {
                            sessionId: sessionData.sessionId,
                            jogadorId: sessionData.jogadorId,
                            custoExploracao: 1
                        })
                        closeActionModal()
                    }
                })

                actions.push({
                    label: `Responder casa (${getEnigmaCostForPlayer(lastSession, casaId, sessionData.jogadorId)} PH)`,
                    disabled: !myTurn || !revealed,
                    onClick: () => {
                        socket.emit('responder_enigma', {
                            sessionId: sessionData.sessionId,
                            jogadorId: sessionData.jogadorId,
                            casaId,
                            // O jogo é em chamada: o jogador verbaliza a resposta ao Mestre.
                            // Enviamos apenas o evento para liberar a validação no painel do Mestre.
                            texto: ''
                        })
                        closeActionModal()
                    }
                })

                actions.push({
                    label: 'Responder novamente (2 PH)',
                    disabled: !myTurn || !revealed || !alreadyAnswered,
                    onClick: () => {
                        socket.emit('explorar_novamente', {
                            sessionId: sessionData.sessionId,
                            jogadorId: sessionData.jogadorId,
                            // Resposta verbal na chamada (sem input)
                            texto: ''
                        })
                        closeActionModal()
                    }
                })
            }

            openActionModal({
                title: `${houseName} (${casaId})`,
                hint,
                actions
            })
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

function getMoveCostForPlayer(session, jogadorId) {
    const modificadores = session?.eventoAtivo?.modificadores || {}
    const gratuitoEvento =
        !!modificadores?.primeiroMovimentoGratisPorJogador &&
        !session?.primeiroMovimentoGratisUsadoPorJogador?.[jogadorId]
    const gratuitoHeroi = !!session?.movimentoGratisHeroiPorJogador?.[jogadorId]
    if (gratuitoEvento || gratuitoHeroi) return 0
    const delta = Number(modificadores?.moverDelta ?? 0) || 0
    return 1 + delta
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
    let ruleBlockedReason = ''
    if (heroTipo === 'Sereia') {
        ruleBlockedReason =
            'A habilidade da Sereia é automática ao responder enigma.'
    } else if (heroTipo === 'Humano') {
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
        !isMyTurn ||
        used ||
        ruleBlocked

    if (!heroTipo) {
        btnUsarHabilidade.textContent = 'Usar habilidade'
    } else if (heroTipo === 'Sereia') {
        btnUsarHabilidade.textContent = 'Habilidade automática (Sereia)'
    } else {
        btnUsarHabilidade.textContent = `Usar habilidade (${heroTipo})`
    }

    if (!isMyTurn && !used) {
        setAbilityStatus('Aguarde sua vez para usar.')
    }
    if (used) {
        setAbilityStatus('Habilidade já usada na partida.')
    }
    if (!used && isMyTurn && ruleBlocked) {
        setAbilityStatus(ruleBlockedReason)
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

        // Se o usuário escolheu "Revelar e responder", aguarda a carta ficar revelada
        if (pendingAnswerAfterExplore) {
            const revealed = !!getCardById(session, pendingAnswerAfterExplore)
                ?.revelada
            const myPlayer = getMyPlayer(session)
            if (revealed && myPlayer?.posicao === pendingAnswerAfterExplore) {
                const casaId = pendingAnswerAfterExplore
                pendingAnswerAfterExplore = null
                socket.emit('responder_enigma', {
                    sessionId: sessionData.sessionId,
                    jogadorId: sessionData.jogadorId,
                    casaId,
                    texto: ''
                })
            }
        }
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
            .map(c => `Carta ${c.id}: custo do enigma ${c.custoExploracao}`)
            .join('\n')
        alert(`Bruxa: custos revelados\n\n${msg}`)
        setAbilityStatus('Bruxa: custos revelados.')
    })

    // Bruxa: jogador escolhe quais cartas ocultas quer ver o custo
    socket.on('bruxa_escolher_cartas', data => {
        const opcoes = Array.isArray(data?.opcoes) ? data.opcoes : []
        if (!opcoes.length) {
            alert('Bruxa: nenhuma carta oculta disponível agora.')
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
        alert(data?.motivo || 'Ação negada')
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
        if (!socket || !socket.connected) {
            alert('Sem conexão com o servidor.')
            return
        }
        if (!sessionData?.sessionId || !sessionData?.jogadorId) {
            alert('Sessão inválida.')
            return
        }
        const myPlayer = lastSession ? getMyPlayer(lastSession) : null
        const heroTipo = myPlayer?.hero?.tipo || null
        if (heroTipo === 'Sereia') {
            setAbilityStatus(
                'A habilidade da Sereia é automática ao responder enigma.'
            )
            return
        }
        if (heroTipo === 'Humano' && lastSession) {
            const custoMover = getMoveCostForPlayer(
                lastSession,
                sessionData.jogadorId
            )
            if (custoMover <= 0) {
                alert(
                    'A habilidade do Humano só pode ser usada quando o custo de movimento for maior que 0.'
                )
                return
            }
        }
        if (heroTipo === 'Anao' && lastSession) {
            const casaId = myPlayer?.posicao
            if (casaId && getEnigmaCostSemHeroi(lastSession, casaId) <= 0) {
                alert(
                    'A habilidade do Anão só pode ser usada quando o custo do enigma for maior que 0.'
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
    btnResponderEnigmaFinal.addEventListener('click', () => {
        if (!lastSession) return
        if (!isMyTurn(lastSession)) {
            alert('Aguarde sua vez para responder o enigma final.')
            return
        }
        if (!areFinalSlotsFilled(lastSession)) {
            alert('Preencha todos os slots de dica antes de responder.')
            return
        }
        if (!socket || !socket.connected) {
            alert('Sem conexão com o servidor.')
            return
        }

        // Jogo em chamada: o jogador verbaliza a resposta ao Mestre.
        // Aqui apenas avisamos o Mestre para liberar a validação.
        socket.emit('iniciar_desafio_final', {
            sessionId: sessionData.sessionId,
            jogadorId: sessionData.jogadorId
        })
        alert(
            'Desafio final iniciado. Verbalize a resposta ao Mestre para validação.'
        )
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
    setupHouseInteractions()
    conectarServidor()
})
