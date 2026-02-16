/**
 * Crônicas de Algorion - Mestre Page
 * Painel de controle do Mestre do Jogo
 */

// Configuração do servidor
const SERVER_URL = window.getAlgorionBackendUrl?.() || 'http://localhost:3001'

// Estado da aplicação
let socket = null
let sessionData = {
    sessionId: null,
    mestreId: null,
    jogadorId: null,
    nome: null,
    isMestre: false,
    isSpectator: false
}

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

// Estado do jogo
let gameState = {
    rodada: 1,
    turno: 1,
    jogadorDaVez: null,
    jogadores: [],
    eventoAtual: null,
    charadaAtual: null,
    desafioFinalAtual: null,
    eventosRestantes: null,
    ph: null
}

let lastSession = null

// Cores usadas no tabuleiro (mesmo mapeamento do jogo)
const HERO_COLORS = {
    Anao: '#7D7940',
    Humano: '#B68B71',
    Sereia: '#DA7C7C',
    Bruxa: '#62769E'
}

// Estado do cronômetro
let timerState = {
    seconds: 60,
    totalSeconds: 60,
    intervalId: null,
    isRunning: false
}

// =====================================================
// INICIALIZAÇÃO
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Verificar se é mestre
    if (!carregarSessaoLocal()) {
        await redirectWithModal({
            title: 'Sessão não encontrada',
            message: 'Sessão não encontrada. Redirecionando...',
            to: 'home.html'
        })
        return
    }

    if (!sessionData.isMestre) {
        await redirectWithModal({
            title: 'Acesso negado',
            message: 'Apenas o Mestre pode acessar esta página.',
            to: 'jogo.html',
            clearSession: false
        })
        return
    }

    initUI()
    conectarServidor()
    initEventListeners()
    setupPhEdit()
})

// =====================================================
// SESSÃO LOCAL
// =====================================================

function carregarSessaoLocal() {
    try {
        const saved = localStorage.getItem('algorion_session')
        if (saved) {
            sessionData = JSON.parse(saved)
            if (typeof sessionData.isSpectator !== 'boolean') {
                sessionData.isSpectator = false
            }
            if (
                sessionData.isMestre &&
                !sessionData.mestreId &&
                sessionData.jogadorId
            ) {
                sessionData.mestreId = sessionData.jogadorId
                salvarSessaoLocal()
            }
            return sessionData.sessionId !== null
        }
    } catch (e) {
        console.error('Erro ao carregar sessão:', e)
    }
    return false
}

function salvarSessaoLocal() {
    localStorage.setItem('algorion_session', JSON.stringify(sessionData))
}

function getEffectiveMestreId() {
    return sessionData.mestreId || sessionData.jogadorId || null
}

// =====================================================
// UI INITIALIZATION
// =====================================================

function initUI() {
    document.getElementById('sessionCode').textContent =
        sessionData.sessionId || '------'
    updateStatus('Conectando...', 'info')
    setControlsEnabled(false)
    const btnExibir = document.getElementById('btnExibirEnigma')
    if (btnExibir) btnExibir.disabled = true
}

function initEventListeners() {
    // Riddle validation
    document
        .getElementById('btnAcertou')
        .addEventListener('click', () => validarResposta(true))
    document
        .getElementById('btnErrou')
        .addEventListener('click', () => validarResposta(false))

    // Final challenge validation
    document
        .getElementById('btnFinalAcertou')
        .addEventListener('click', () => validarDesafioFinal(true))
    document
        .getElementById('btnFinalErrou')
        .addEventListener('click', () => validarDesafioFinal(false))

    // Game controls
    document
        .getElementById('btnProximoTurno')
        .addEventListener('click', avancarTurno)

    // Quick actions
    document.getElementById('btnVerCartas').addEventListener('click', () => {
        document.getElementById('modalCartas').classList.add('active')
        carregarCartasDica()
    })
    const btnVirarC5 = document.getElementById('btnVirarC5')
    if (btnVirarC5) {
        btnVirarC5.addEventListener('click', virarCarta5)
    }
    const btnReiniciarSessao = document.getElementById('btnReiniciarSessao')
    if (btnReiniciarSessao) {
        btnReiniciarSessao.addEventListener('click', reiniciarSessao)
    }
    const btnExibirEnigma = document.getElementById('btnExibirEnigma')
    if (btnExibirEnigma) {
        btnExibirEnigma.addEventListener('click', exibirEnigma)
    }
    const btnSairSessao = document.getElementById('btnSairSessao')
    if (btnSairSessao) {
        btnSairSessao.addEventListener('click', sairSessao)
    }

    // Modal: Cartas
    document
        .getElementById('btnCloseCartasModal')
        .addEventListener('click', () => {
            document.getElementById('modalCartas').classList.remove('active')
        })
    document.getElementById('btnFecharCartas').addEventListener('click', () => {
        document.getElementById('modalCartas').classList.remove('active')
    })

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) {
                overlay.classList.remove('active')
            }
        })
    })

    // Timer controls
    document
        .getElementById('btnIniciarTimer')
        .addEventListener('click', iniciarTimer)
    document
        .getElementById('btnPausarTimer')
        .addEventListener('click', pararTimer)
    document
        .getElementById('btnResetTimer')
        .addEventListener('click', resetTimer)

    // Timer presets
    document.querySelectorAll('.btn-timer-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            setTimerPreset(parseInt(btn.dataset.time))
        })
    })

    // Debug panel: somente quando ?debug=1
    const debugEnabled =
        new URLSearchParams(window.location.search).get('debug') === '1'
    const debugPanel = document.getElementById('debugPanel')
    const casaSelect = document.getElementById('mestreCasaSelect')
    if (casaSelect) {
        casaSelect.disabled = !debugEnabled
        casaSelect.addEventListener('change', updateExibirEnigmaState)
    }
    if (debugPanel) {
        debugPanel.style.display = debugEnabled ? 'block' : 'none'
    }
    if (debugEnabled) {
        const btnSimular = document.getElementById('btnSimularEnigma')
        if (btnSimular) {
            btnSimular.addEventListener('click', simularEnigma)
        }
    }
}

// =====================================================
// SOCKET CONNECTION
// =====================================================

function conectarServidor() {
    socket = io(SERVER_URL)

    socket.on('connect', () => {
        console.log('Conectado ao servidor')
        updateStatus('Conectado', 'success')
        addLog('Conectado ao servidor', 'success')
        setControlsEnabled(true)

        // Entrar na sessão (backend atual usa entrar_lobby para sincronização)
        socket.emit('entrar_lobby', {
            sessionId: sessionData.sessionId,
            jogadorId:
                sessionData.mestreId || sessionData.jogadorId || 'mestre',
            nome: sessionData.nome || 'Mestre',
            isMestre: true
        })
    })

    socket.on('disconnect', () => {
        console.log('Desconectado do servidor')
        updateStatus('Desconectado', 'error')
        addLog('Conexão perdida com o servidor', 'error')
        setControlsEnabled(false)
    })

    socket.on('connect_error', error => {
        console.error('Erro de conexão:', error)
        updateStatus('Erro de conexão', 'error')
        addLog('Erro ao conectar: ' + error.message, 'error')
        setControlsEnabled(false)
    })

    // =====================================================
    // GAME EVENTS
    // =====================================================

    socket.on('sessao_nao_encontrada', async () => {
        addLog('Sessão não encontrada no servidor', 'error')
        await redirectWithModal({
            title: 'Sessão não encontrada',
            message: 'Sessão não encontrada. Volte ao lobby.',
            to: 'lobby.html'
        })
    })

    socket.on('acao_negada', data => {
        addLog(`Ação negada: ${data?.motivo || 'sem detalhes'}`, 'warning')
        showToast(data?.motivo || 'Ação negada', 'warning')
    })

    socket.on('lobby_atualizado', payload => {
        if (Array.isArray(payload?.jogadores)) {
            gameState.jogadores = payload.jogadores
            atualizarUI()
        }
    })

    socket.on('estado_atualizado', data => {
        console.log('Estado atualizado:', data)
        atualizarEstadoJogo(data)
    })

    socket.on('sessao_reiniciada', () => {
        addLog('Sessão reiniciada pelo Mestre.', 'warning')
        showToast('Sessão reiniciada. O jogo foi resetado.', 'info')
    })

    socket.on('sessao_sem_jogadores', async () => {
        addLog('Todos os jogadores saíram. Retornando ao lobby.', 'warning')
        await redirectWithModal({
            title: 'Sem jogadores',
            message:
                'Todos os jogadores saíram da partida. Voltando ao lobby para aguardar novos jogadores.',
            to: `lobby.html?sessao=${encodeURIComponent(sessionData.sessionId || '')}`,
            clearSession: false
        })
    })

    socket.on('sessao_encerrada', async () => {
        addLog('Sessão encerrada (mestre saiu).', 'error')
        await redirectWithModal({
            title: 'Sessão encerrada',
            message:
                'O Mestre saiu da sessão. Você foi redirecionado para a tela inicial.',
            to: 'home.html'
        })
    })

    socket.on('evento_ativo', evento => {
        gameState.eventoAtual = evento
        atualizarEventoUI()
    })

    socket.on('turno_atualizado', data => {
        console.log('Turno atualizado:', data)
        gameState.rodada = data.rodadaAtual ?? gameState.rodada
        gameState.turno = data.rodadaAtual ?? gameState.turno

        if (
            lastSession?.listaJogadores &&
            typeof data.jogadorAtualIndex === 'number'
        ) {
            gameState.jogadorDaVez =
                lastSession.listaJogadores[data.jogadorAtualIndex] || null
        } else {
            gameState.jogadorDaVez =
                lastSession?.listaJogadores?.find(
                    p => p.id === data.jogadorAtualId
                ) || null
        }
        syncMestreCasaSelect(
            data.jogadorAtualCasaId || gameState.jogadorDaVez?.posicao
        )
        atualizarUI()
        const nomeVez = data.jogadorAtualNome || gameState.jogadorDaVez?.nome || 'Ninguém'
        addLog(`Turno - Vez de ${nomeVez}`, 'info')
        showToast(`Vez de ${nomeVez}`, 'info')
    })

    socket.on('desafio_carta5_obrigatorio', data => {
        const jogadorNome = data?.jogadorNome || 'jogador da vez'
        addLog(
            `Carta C5 revelada: aguardando resposta obrigatória de ${jogadorNome}.`,
            'warning'
        )
        showToast(
            `Aguardando ${jogadorNome} responder o desafio da C5.`,
            'warning'
        )
    })

    socket.on('charada_iniciada', data => {
        console.log('Charada iniciada:', data)
        gameState.charadaAtual = data
        atualizarCharadaUI()
        updateExibirEnigmaState()
        const jogadorEnigma = data.jogador?.nome || 'jogador'
        addLog(`Enigma submetido (${data.casaId}) por ${jogadorEnigma}`, 'info')
        showToast(`${jogadorEnigma} submeteu resposta (${data.casaId}). Valide com ✅/❌`, 'warning')
    })

    socket.on('enigma_exibido', data => {
        const casaLabel = data?.casaId || '?'
        if (data?.autoExibido) {
            addLog(`Desafio de ${casaLabel} exibido automaticamente para os jogadores.`, 'info')
            showToast(`Desafio ${casaLabel} exibido automaticamente aos jogadores.`, 'info')
        } else {
            addLog(`Desafio de ${casaLabel} exibido para os jogadores.`, 'info')
            showToast(`Desafio ${casaLabel} exibido para os jogadores.`, 'info')
        }
    })

    socket.on('resposta_validada', data => {
        console.log('Resposta validada:', data)
        gameState.charadaAtual = null
        atualizarCharadaUI()
        updateExibirEnigmaState()

        if (data.acertou) {
            addLog(`${data.jogador?.nome} acertou a charada!`, 'success')
            showToast(`${data.jogador?.nome} acertou a charada!`, 'success')
        } else {
            addLog(`${data.jogador?.nome} errou a charada`, 'warning')
            showToast(`${data.jogador?.nome} errou a charada`, 'warning')
        }
    })

    // Desafio final iniciado (jogador clicou / fluxo em chamada)
    socket.on('desafio_final_iniciado', data => {
        gameState.desafioFinalAtual = data
        atualizarDesafioFinalUI()
        const jogadorFinal = data?.jogador?.nome || 'jogador'
        addLog(`Desafio final iniciado por ${jogadorFinal} (valide como ✅/❌)`, 'warning')
        showToast(`Desafio final iniciado por ${jogadorFinal}. Valide com ✅/❌`, 'warning')
    })

    // Desafio final forçado (PH esgotado)
    socket.on('forcar_desafio_final', data => {
        gameState.desafioFinalAtual = {
            motivo: 'ph_esgotado',
            jogador: null,
            textoEnigmaFinalMontado: data?.textoEnigmaFinalMontado || '',
            slotsPreenchidos: false,
            ph: 0
        }
        atualizarDesafioFinalUI()
        addLog('PH esgotado: Desafio final deve ser respondido!', 'error')
        showToast('PH esgotado! Desafio final deve ser respondido!', 'error')
    })

    socket.on('pedido_dica_enigma_final', data => {
        const jogadorNome = data?.jogador?.nome || 'Jogador'
        addLog(
            `Pedido de dica do enigma final recebido de ${jogadorNome}.`,
            'warning'
        )
        showToast(`Pedido de dica do enigma final: ${jogadorNome}.`, 'warning')
    })

    socket.on('jogo_finalizado', data => {
        gameState.desafioFinalAtual = null
        atualizarDesafioFinalUI()
        const msgFinal = data?.mensagem || 'Jogo finalizado'
        const variantFinal = data?.resultado === 'vitoria' ? 'success' : 'error'
        addLog(msgFinal, variantFinal)
        showToast(msgFinal, variantFinal)
    })

    // Habilidades em tempo real
    socket.on('habilidade_usada', data => {
        const jogadorNome = data?.jogador?.nome || 'Jogador'
        const heroi = data?.heroi || 'Herói'

        if (heroi === 'Bruxa' && Array.isArray(data?.detalhes?.cartas)) {
            const cartas = data.detalhes.cartas
                .map(c => `${c.id} (${c.custoExploracao} PH)`)
                .join(', ')
            addLog(
                `Habilidade usada: ${jogadorNome} (Bruxa) revelou custos: ${cartas}`,
                'info'
            )
            showToast(`${jogadorNome} (Bruxa) revelou custos de cartas`, 'info')
            return
        }

        addLog(`Habilidade usada: ${jogadorNome} (${heroi})`, 'info')
        showToast(`Habilidade usada: ${jogadorNome} (${heroi})`, 'info')
    })
}

// =====================================================
// GAME STATE MANAGEMENT
// =====================================================

function atualizarEstadoJogo(estado) {
    // backend envia o GameSession completo
    lastSession = estado
    applyHouseCatalog(estado)

    if (typeof estado?.rodadaAtual === 'number') {
        gameState.rodada = estado.rodadaAtual
        gameState.turno = estado.rodadaAtual
    }

    if (Array.isArray(estado?.listaJogadores)) {
        gameState.jogadores = estado.listaJogadores
        const idx =
            typeof estado.jogadorAtualIndex === 'number'
                ? estado.jogadorAtualIndex
                : 0
        gameState.jogadorDaVez = estado.listaJogadores[idx] || null
        const casaAtual = getCurrentPlayer(estado)?.posicao
        syncMestreCasaSelect(casaAtual)
    }

    if (estado?.eventoAtivo !== undefined) {
        gameState.eventoAtual = estado.eventoAtivo
    }

    if (Array.isArray(estado?.deckEventos)) {
        gameState.eventosRestantes = estado.deckEventos.length
    }

    if (typeof estado?.ph === 'number') {
        gameState.ph = estado.ph
    }

    if (typeof estado?.cronometro === 'number') {
        timerState.seconds = estado.cronometro
        timerState.totalSeconds = Math.max(
            timerState.totalSeconds,
            estado.cronometro
        )
        updateTimerDisplay()
    }

    // Restaurar charadaAtual a partir de riddlePendente (caso refresh)
    if (!gameState.charadaAtual && estado?.riddlePendente) {
        const rp = estado.riddlePendente
        const jogador = Array.isArray(estado.listaJogadores)
            ? estado.listaJogadores.find(j => j.id === rp.jogadorId)
            : null
        gameState.charadaAtual = {
            casaId: rp.casaId,
            texto: rp.texto || '',
            jogador: jogador
                ? { id: jogador.id, nome: jogador.nome }
                : { id: rp.jogadorId || '', nome: '' },
            custoPH: rp.custoPH
        }
    } else if (gameState.charadaAtual && !estado?.riddlePendente) {
        // riddlePendente foi limpo no servidor → limpar localmente
        gameState.charadaAtual = null
    }

    // Restaurar desafioFinalAtual a partir de desafioFinalJogadorId (caso refresh)
    if (!gameState.desafioFinalAtual && estado?.desafioFinalJogadorId) {
        const jogador = Array.isArray(estado.listaJogadores)
            ? estado.listaJogadores.find(j => j.id === estado.desafioFinalJogadorId)
            : null
        gameState.desafioFinalAtual = {
            motivo: 'jogador_iniciou',
            jogador: jogador
                ? { id: jogador.id, nome: jogador.nome }
                : { id: estado.desafioFinalJogadorId, nome: '' },
            textoEnigmaFinalMontado: estado.textoEnigmaFinalMontado || '',
            slotsPreenchidos: true,
            ph: estado.ph ?? 0
        }
    }

    atualizarUI()
}

function atualizarUI() {
    // Update status bar
    document.getElementById('rodadaAtual').textContent = gameState.rodada
    document.getElementById('turnoAtual').textContent = gameState.turno
    document.getElementById('jogadorDaVez').textContent =
        gameState.jogadorDaVez?.nome || '-'
    document.getElementById('eventosRestantes').textContent =
        gameState.eventosRestantes ?? lastSession?.deckEventos?.length ?? '-'

    // Update PH global
    atualizarPhDisplay()

    // Update players list
    atualizarListaJogadores()

    // Update event display
    atualizarEventoUI()

    // Update riddle display
    atualizarCharadaUI()

    // Tabuleiro em tempo real (mesmo grid de jogo.html)
    renderTabuleiro(lastSession)
    updateExibirEnigmaState()
    updateVirarC5ButtonState()
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

function isCarta5JaVirada(session) {
    return (
        !!session?.carta5ViradaPeloMestre || !!getCardById(session, 'C5')?.revelada
    )
}

function updateVirarC5ButtonState() {
    const btn = document.getElementById('btnVirarC5')
    if (!btn) return

    const bloqueado = isCarta5JaVirada(lastSession)
    btn.disabled = bloqueado
    btn.title = bloqueado
        ? 'C5 já foi virada nesta sessão. Reinicie para liberar novamente.'
        : ''
}

function applyHouseCatalog(session) {
    const houses = Array.isArray(session?.catalogo?.houses)
        ? [...session.catalogo.houses]
        : []
    if (!houses.length) return

    houses.sort((a, b) => Number(a?.ordem || 0) - Number(b?.ordem || 0))

    const selectIds = ['mestreCasaSelect', 'debugCasaSelect']
    selectIds.forEach(selectId => {
        const select = document.getElementById(selectId)
        if (!select) return

        const previousValue = select.value
        select.innerHTML = ''

        houses.forEach(house => {
            const option = document.createElement('option')
            option.value = house.id
            const suffix = house.hasTip ? '' : ' - sem pista'
            option.textContent = `${house.id} (${house.nome}${suffix})`
            select.appendChild(option)
        })

        const hasPrevious = houses.some(house => house.id === previousValue)
        if (hasPrevious) {
            select.value = previousValue
        }
    })
}

function syncMestreCasaSelect(casaId) {
    const select = document.getElementById('mestreCasaSelect')
    if (!select || !casaId) return
    if (select.value !== casaId) {
        select.value = casaId
    }
    updateExibirEnigmaState()
}

function updateExibirEnigmaState() {
    const btn = document.getElementById('btnExibirEnigma')
    const select = document.getElementById('mestreCasaSelect')
    const hintEl = document.getElementById('mestreExibirHint')
    if (!btn || !select) return

    const casaId = select.value
    const isCasa5 = casaId === 'C5'
    const pendente = lastSession?.riddlePendente
    const cardRevealed = !!getCardById(lastSession, casaId)?.revelada
    const jaExibido = !!lastSession?.enigmasExibidos?.[casaId]
    const jogadorDaVez = getCurrentPlayer(lastSession)
    const jogadorNaCasa = jogadorDaVez?.posicao === casaId

    const canExibir =
        isCasa5 ||
        (!!pendente && pendente.casaId === casaId && cardRevealed) ||
        (jaExibido && jogadorNaCasa)

    btn.disabled = !canExibir

    if (!hintEl) return
    if (isCasa5) {
        hintEl.textContent = 'A casa C5 pode ser exibida a qualquer momento.'
        return
    }
    if (jaExibido && jogadorNaCasa) {
        hintEl.textContent = 'Desafio já exibido anteriormente. Pode re-exibir.'
        return
    }
    if (!pendente && !jaExibido) {
        hintEl.textContent =
            'Aguardando o jogador selecionar "Responder enigma".'
        return
    }
    if (!pendente && jaExibido && !jogadorNaCasa) {
        hintEl.textContent = `Desafio já exibido. Jogador da vez não está em ${casaId}.`
        return
    }
    if (pendente && pendente.casaId !== casaId) {
        hintEl.textContent = `Enigma pendente está em ${pendente.casaId}.`
        return
    }
    if (!cardRevealed) {
        hintEl.textContent = 'A carta ainda não foi revelada.'
        return
    }
    hintEl.textContent = 'Pronto para exibir o desafio.'
}

function getCurrentPlayer(session) {
    return session?.listaJogadores?.[session?.jogadorAtualIndex] || null
}

function renderTabuleiro(session) {
    if (!session) return

    renderBoardRevelations(session)
    renderBoardPlayerPositions(session)
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

function renderBoardPlayerPositions(session) {
    // Limpa marcadores antigos
    document.querySelectorAll('.house-occupants').forEach(el => el.remove())

    const players = Array.isArray(session?.listaJogadores)
        ? session.listaJogadores
        : []

    const current = getCurrentPlayer(session)

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

        const container = document.createElement('div')
        container.className = 'house-occupants'

        const toShow = group.slice(0, 6)
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

// =====================================================
// PH GLOBAL - EXIBIÇÃO E EDIÇÃO
// =====================================================

function atualizarPhDisplay() {
    const phValorEl = document.getElementById('phValor')
    if (!phValorEl) return
    const ph = gameState.ph
    phValorEl.textContent = typeof ph === 'number' ? ph : '-'
    phValorEl.classList.toggle('low', typeof ph === 'number' && ph <= 3)
    phValorEl.classList.toggle('critical', typeof ph === 'number' && ph <= 0)
}

function setupPhEdit() {
    const btnEdit = document.getElementById('btnEditPh')
    const editPanel = document.getElementById('phEditInline')
    const phDisplay = document.getElementById('phGlobal')
    const inputPh = document.getElementById('inputPhValue')
    const btnMinus = document.getElementById('btnPhMinus')
    const btnPlus = document.getElementById('btnPhPlus')
    const btnSave = document.getElementById('btnPhSave')
    const btnCancel = document.getElementById('btnPhCancel')
    if (!btnEdit || !editPanel || !inputPh) return

    function openEdit() {
        inputPh.value = gameState.ph ?? 0
        phDisplay.classList.add('hidden')
        editPanel.classList.remove('hidden')
        inputPh.focus()
        inputPh.select()
    }

    function closeEdit() {
        editPanel.classList.add('hidden')
        phDisplay.classList.remove('hidden')
    }

    function salvarPh() {
        const novo = parseInt(inputPh.value, 10)
        if (isNaN(novo) || novo < 0) {
            showToast('Valor de PH inválido', 'error')
            return
        }
        if (!socket || !socket.connected) {
            showToast('Sem conexão com o servidor', 'error')
            return
        }
        socket.emit('editar_ph', {
            sessionId: sessionData.sessionId,
            mestreId: getEffectiveMestreId(),
            novoPh: novo
        })
        closeEdit()
    }

    btnEdit.addEventListener('click', openEdit)
    btnCancel.addEventListener('click', closeEdit)
    btnSave.addEventListener('click', salvarPh)
    btnMinus.addEventListener('click', () => {
        const cur = parseInt(inputPh.value, 10) || 0
        inputPh.value = Math.max(0, cur - 1)
    })
    btnPlus.addEventListener('click', () => {
        const cur = parseInt(inputPh.value, 10) || 0
        inputPh.value = cur + 1
    })
    inputPh.addEventListener('keydown', e => {
        if (e.key === 'Enter') salvarPh()
        if (e.key === 'Escape') closeEdit()
    })
}

function atualizarListaJogadores() {
    const container = document.getElementById('playersList')
    if (!container) return

    if (!gameState.jogadores || gameState.jogadores.length === 0) {
        container.innerHTML = `
            <div class="player-card">
                <div class="player-header">
                    <span class="player-name">Nenhum jogador conectado</span>
                </div>
            </div>
        `
        return
    }

    container.innerHTML = gameState.jogadores
        .map(jogador => {
            const isCurrentTurn = gameState.jogadorDaVez?.id === jogador.id
            const ph = jogador.ph ?? '-'
            const phClass =
                typeof jogador.ph === 'number' && jogador.ph <= 1 ? 'low' : ''
            const heroTipo = jogador.hero?.tipo || jogador.heroi || 'Sem herói'
            const posicao = jogador.posicao ?? '-'
            const podeRemover = jogador.id !== getEffectiveMestreId()

            return `
            <div class="player-card ${isCurrentTurn ? 'active-turn' : ''}">
                <div class="player-header">
                    <span class="player-name">${jogador.nome || '-'}</span>
                    <span class="player-hero">${heroTipo}</span>
                </div>
                <div class="player-stats">
                    <div class="stat-item">
                        <span class="stat-icon">💧</span>
                        <span class="stat-value ${phClass}">${ph}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-icon">📍</span>
                        <span class="stat-value">${posicao}</span>
                    </div>
                </div>
                ${podeRemover
                    ? `<div class="player-actions">
                        <button class="btn-remove-player" data-player-id="${jogador.id}">
                            Remover
                        </button>
                    </div>`
                    : ''
                }
            </div>
        `
        })
        .join('')

    container.querySelectorAll('.btn-remove-player').forEach(btn => {
        btn.addEventListener('click', async () => {
            const playerId = btn.dataset.playerId
            if (!playerId) return
            if (!socket || !socket.connected) {
                addLog(
                    'Socket desconectado; não é possível remover jogador',
                    'error'
                )
                return
            }
            const ok = await showConfirmModal({
                title: 'Remover jogador?',
                message:
                    'Tem certeza que deseja remover este jogador da sessão?',
                variant: 'danger',
                confirmText: 'Remover'
            })
            if (ok) {
                socket.emit('remover_jogador', {
                    sessionId: sessionData.sessionId,
                    mestreId: getEffectiveMestreId(),
                    jogadorIdRemover: playerId
                })
            }
        })
    })
}

function atualizarEventoUI() {
    const container = document.getElementById('eventCardDisplay')

    if (!gameState.eventoAtual) {
        container.innerHTML =
            '<span class="no-event">Nenhum evento ativo</span>'
        return
    }

    const evento = gameState.eventoAtual

    container.innerHTML = `
        <div class="event-name">${evento.nome}</div>
        <div class="event-description">${evento.descricao || ''}</div>
    `
}

function atualizarCharadaUI() {
    const container = document.getElementById('riddleDisplay')
    const validationBtns = document.getElementById('validationButtons')

    if (!gameState.charadaAtual) {
        container.innerHTML =
            '<p class="no-riddle">Nenhuma charada em andamento</p>'
        validationBtns.style.display = 'none'
        return
    }

    const charada = gameState.charadaAtual
    const textoCharada = (charada?.texto || '').trim()

    container.innerHTML = `
        <div class="riddle-category">Casa ${charada.casaId || '-'}</div>
        <div class="riddle-text">${textoCharada || '(resposta verbal na chamada — valide como boa/ruim)'}</div>
        <div class="riddle-answer">
            <div class="riddle-answer-label">Jogador:</div>
            <div class="riddle-answer-text">${charada.jogador?.nome || '-'}</div>
        </div>
    `

    validationBtns.style.display = 'flex'
}

function atualizarDesafioFinalUI() {
    const container = document.getElementById('finalChallengeDisplay')
    const buttons = document.getElementById('finalChallengeButtons')

    if (!gameState.desafioFinalAtual) {
        container.innerHTML = '<p class="no-riddle">Ainda não iniciado</p>'
        buttons.style.display = 'none'
        return
    }

    const d = gameState.desafioFinalAtual
    const jogadorNome = d?.jogador?.nome || '(grupo)'
    container.innerHTML = `
        <div class="riddle-category">Resposta verbal na chamada</div>
        <div class="riddle-text">Jogador: ${jogadorNome}</div>
        <div class="riddle-answer">
            <div class="riddle-answer-label">Ação:</div>
            <div class="riddle-answer-text">Valide o desafio final como ✅/❌</div>
        </div>
    `
    buttons.style.display = 'flex'
}

function atualizarTokens() {
    const container = document.getElementById('tokensContainer')

    // O tabuleiro do mestre agora usa o grid (board-grid) e marcadores por casa.
    // Mantemos esta função por compatibilidade, mas sem container ela não faz nada.
    if (!container) return

    if (!gameState.jogadores || gameState.jogadores.length === 0) {
        container.innerHTML = ''
        return
    }

    // Representação simples (não mapeia casas do tabuleiro com precisão)
    container.innerHTML = gameState.jogadores
        .map((jogador, index) => {
            const posicao = jogador.posicao || '-'
            const heroClass = (jogador.hero?.tipo || jogador.heroi || '')
                .toLowerCase()
                .replace(/\s/g, '')

            const percentage = 10 + index * 10

            return `
            <div class="player-token ${heroClass}"
                 style="left: ${percentage}%; top: calc(50% + ${index * 15 - 15}px);"
                 title="${jogador.nome} - ${posicao}">
                ${jogador.nome.charAt(0).toUpperCase()}
            </div>
        `
        })
        .join('')
}

// =====================================================
// GAME ACTIONS
// =====================================================

function validarResposta(acertou) {
    if (!gameState.charadaAtual) {
        addLog('Nenhuma charada para validar', 'warning')
        return
    }

    const jogadorId =
        lastSession?.listaJogadores?.[lastSession?.jogadorAtualIndex || 0]?.id
    if (!jogadorId) {
        addLog('Não foi possível identificar o jogador da vez', 'error')
        return
    }

    socket.emit('confirm_answer', {
        sessionId: sessionData.sessionId,
        mestreId: getEffectiveMestreId(),
        jogadorId,
        quality: acertou ? 'otima' : 'ruim'
    })
}

function validarDesafioFinal(acertou) {
    if (!gameState.desafioFinalAtual) {
        addLog('Nenhum desafio final para validar', 'warning')
        return
    }

    const jogadorId =
        lastSession?.listaJogadores?.[lastSession?.jogadorAtualIndex || 0]?.id
    if (!jogadorId) {
        addLog('Não foi possível identificar o jogador da vez', 'error')
        return
    }

    socket.emit('confirmar_desafio_final', {
        sessionId: sessionData.sessionId,
        mestreId: getEffectiveMestreId(),
        jogadorId,
        correta: !!acertou
    })
}

function virarCarta5() {
    if (isCarta5JaVirada(lastSession)) {
        addLog(
            'C5 já foi virada nesta sessão. Reinicie a sessão para virar novamente.',
            'warning'
        )
        return
    }
    if (!socket || !socket.connected) {
        addLog('Socket desconectado; não é possível virar C5', 'error')
        return
    }
    socket.emit('virar_carta5', {
        sessionId: sessionData.sessionId,
        mestreId: getEffectiveMestreId()
    })
    addLog('Carta C5 revelada pelo Mestre.', 'info')
}

async function reiniciarSessao() {
    if (!socket || !socket.connected) {
        addLog(
            'Socket desconectado; não é possível reiniciar a sessão',
            'error'
        )
        return
    }
    const ok = await showConfirmModal({
        title: 'Reiniciar sessão?',
        message: 'Isso resetará o jogo atual.',
        variant: 'danger',
        confirmText: 'Reiniciar'
    })
    if (!ok) return
    socket.emit('reiniciar_sessao', {
        sessionId: sessionData.sessionId,
        mestreId: getEffectiveMestreId()
    })
    addLog('Sessão reiniciada pelo Mestre.', 'warning')
}

function exibirEnigma() {
    if (!socket || !socket.connected) {
        addLog('Socket desconectado; não é possível exibir enigma', 'error')
        return
    }
    const casaId = document.getElementById('mestreCasaSelect')?.value
    if (!casaId) {
        addLog('Selecione uma casa para exibir o enigma', 'warning')
        return
    }

    socket.emit('mestre_exibir_enigma', {
        sessionId: sessionData.sessionId,
        mestreId: getEffectiveMestreId(),
        casaId
    })
    addLog(`Desafio exibido para ${casaId}.`, 'info')
}

async function sairSessao() {
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
}

function avancarTurno() {
    socket.emit('passar_turno', {
        sessionId: sessionData.sessionId
    })

    addLog('Avançando para próximo turno...', 'info')
}

// =====================================================
// MODALS CONTENT
// =====================================================

function carregarCartasDica() {
    const container = document.getElementById('cartasLista')

    const cartas = lastSession?.deckPistas || []
    if (!cartas.length) {
        container.innerHTML =
            '<p class="no-riddle">Nenhuma carta de dica disponível</p>'
        return
    }

    container.innerHTML = cartas
        .map(
            (carta, index) => `
        <div class="log-entry info">
            <strong>Carta ${index + 1}:</strong> ${carta.texto}
        </div>
    `
        )
        .join('')
}

function simularEnigma() {
    if (!socket || !socket.connected) {
        addLog('Socket desconectado; não é possível simular enigma', 'error')
        return
    }

    const casaId = document.getElementById('debugCasaSelect')?.value
    const texto =
        document.getElementById('debugTexto')?.value?.trim() ||
        'Enigma de teste'

    const jogadorAtual =
        lastSession?.listaJogadores?.[
        typeof lastSession?.jogadorAtualIndex === 'number'
            ? lastSession.jogadorAtualIndex
            : 0
        ] || gameState.jogadorDaVez

    if (!jogadorAtual?.id) {
        addLog('Não foi possível identificar o jogador da vez', 'error')
        return
    }
    if (!casaId) {
        addLog('Selecione uma casa para simular', 'warning')
        return
    }

    socket.emit('responder_enigma', {
        sessionId: sessionData.sessionId,
        jogadorId: jogadorAtual.id,
        casaId,
        texto
    })

    addLog(
        `(DEBUG) Enigma enviado como ${jogadorAtual.nome || jogadorAtual.id}`,
        'info'
    )
}

function setControlsEnabled(enabled) {
    const ids = [
        'btnAcertou',
        'btnErrou',
        'btnProximoTurno',
        'btnIniciarTimer',
        'btnPausarTimer',
        'btnResetTimer',
        'btnVerCartas',
        'btnSimularEnigma'
    ]

    ids.forEach(id => {
        const el = document.getElementById(id)
        if (!el) return

        if (id === 'btnIniciarTimer') {
            el.disabled = !enabled || timerState.isRunning
            return
        }
        if (id === 'btnPausarTimer') {
            el.disabled = !enabled || !timerState.isRunning
            return
        }

        el.disabled = !enabled
    })
}

// =====================================================
// UTILITIES
// =====================================================

function updateStatus(message, type) {
    const statusEl = document.getElementById('sessionStatus')
    statusEl.textContent = message

    statusEl.style.color =
        type === 'success'
            ? '#4CAF50'
            : type === 'error'
                ? '#ff6b6b'
                : 'rgba(255, 255, 255, 0.8)'
}

function addLog(message, type = 'info') {
    const container = document.getElementById('logEntries')
    const time = new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    })

    const entry = document.createElement('div')
    entry.className = `log-entry ${type}`
    entry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-message">${message}</span>
    `

    container.insertBefore(entry, container.firstChild)

    // Keep only last 50 entries
    while (container.children.length > 50) {
        container.removeChild(container.lastChild)
    }
}

// =====================================================
// TIMER FUNCTIONS
// =====================================================

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function updateTimerDisplay() {
    const display = document.getElementById('timerDisplay')
    if (!display) return

    display.textContent = formatTime(timerState.seconds)

    // Alert classes
    display.classList.remove('warning', 'danger')
    if (timerState.seconds <= 10) {
        display.classList.add('danger')
    } else if (timerState.seconds <= 30) {
        display.classList.add('warning')
    }
}

function iniciarTimer() {
    if (timerState.isRunning) return

    timerState.isRunning = true
    addLog('⏱️ Cronômetro iniciado', 'info')

    // Envia apenas o estado inicial (evita spam a cada segundo)
    if (socket?.connected) {
        socket.emit('abrir_cronometro', {
            sessionId: sessionData.sessionId,
            mestreId: getEffectiveMestreId(),
            tempo: timerState.seconds
        })
    }

    timerState.intervalId = setInterval(() => {
        if (timerState.seconds > 0) {
            timerState.seconds--
            updateTimerDisplay()
        } else {
            pararTimer()
            addLog('⏰ Tempo esgotado!', 'warning')
        }
    }, 1000)

    document.getElementById('btnIniciarTimer').disabled = true
    document.getElementById('btnPausarTimer').disabled = false
}

function pararTimer() {
    timerState.isRunning = false
    if (timerState.intervalId) {
        clearInterval(timerState.intervalId)
        timerState.intervalId = null
    }

    // Persistir tempo atual no backend (1x ao pausar)
    if (socket?.connected) {
        socket.emit('abrir_cronometro', {
            sessionId: sessionData.sessionId,
            mestreId: getEffectiveMestreId(),
            tempo: timerState.seconds
        })
    }

    document.getElementById('btnIniciarTimer').disabled = false
    document.getElementById('btnPausarTimer').disabled = true

    if (timerState.seconds > 0) {
        addLog(
            '⏸️ Cronômetro pausado em ' + formatTime(timerState.seconds),
            'info'
        )
    }
}

function resetTimer() {
    pararTimer()
    timerState.seconds = timerState.totalSeconds
    updateTimerDisplay()

    // Persistir reset no backend (1x)
    if (socket?.connected) {
        socket.emit('abrir_cronometro', {
            sessionId: sessionData.sessionId,
            mestreId: getEffectiveMestreId(),
            tempo: timerState.seconds
        })
    }
    addLog(
        '🔄 Cronômetro resetado para ' + formatTime(timerState.totalSeconds),
        'info'
    )
}

function setTimerPreset(seconds) {
    pararTimer()
    timerState.totalSeconds = seconds
    timerState.seconds = seconds
    updateTimerDisplay()

    // Persistir preset no backend (1x)
    if (socket?.connected) {
        socket.emit('abrir_cronometro', {
            sessionId: sessionData.sessionId,
            mestreId: getEffectiveMestreId(),
            tempo: timerState.seconds
        })
    }

    // Update preset buttons UI
    document.querySelectorAll('.btn-timer-preset').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.time) === seconds)
    })

    addLog(`⏱️ Tempo ajustado para ${formatTime(seconds)}`, 'info')
}
