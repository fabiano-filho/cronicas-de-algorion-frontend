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
    isMestre: false
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
    eventosRestantes: 5
}

let lastSession = null

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

document.addEventListener('DOMContentLoaded', () => {
    // Verificar se é mestre
    if (!carregarSessaoLocal()) {
        alert('Sessão não encontrada. Redirecionando...')
        window.location.href = 'home.html'
        return
    }

    if (!sessionData.isMestre) {
        alert('Acesso negado. Apenas o Mestre pode acessar esta página.')
        window.location.href = 'jogo.html'
        return
    }

    initUI()
    conectarServidor()
    initEventListeners()
})

// =====================================================
// SESSÃO LOCAL
// =====================================================

function carregarSessaoLocal() {
    try {
        const saved = localStorage.getItem('algorion_session')
        if (saved) {
            sessionData = JSON.parse(saved)
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

// =====================================================
// UI INITIALIZATION
// =====================================================

function initUI() {
    document.getElementById('sessionCode').textContent =
        sessionData.sessionId || '------'
    updateStatus('Conectando...', 'info')
    setControlsEnabled(false)
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

    socket.on('sessao_nao_encontrada', () => {
        addLog('Sessão não encontrada no servidor', 'error')
        alert('Sessão não encontrada. Volte ao lobby.')
        window.location.href = 'lobby.html'
    })

    socket.on('acao_negada', data => {
        addLog(`Ação negada: ${data?.motivo || 'sem detalhes'}`, 'warning')
        alert(data?.motivo || 'Ação negada')
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
        atualizarUI()
        addLog(
            `Turno - Vez de ${data.jogadorAtualNome || gameState.jogadorDaVez?.nome || 'Ninguém'}`,
            'info'
        )
    })

    socket.on('charada_iniciada', data => {
        console.log('Charada iniciada:', data)
        gameState.charadaAtual = data
        atualizarCharadaUI()
        addLog(
            `Enigma submetido (${data.casaId}) por ${data.jogador?.nome || 'jogador'}`,
            'info'
        )
    })

    socket.on('resposta_validada', data => {
        console.log('Resposta validada:', data)
        gameState.charadaAtual = null
        atualizarCharadaUI()

        if (data.acertou) {
            addLog(`${data.jogador?.nome} acertou a charada!`, 'success')
        } else {
            addLog(`${data.jogador?.nome} errou a charada`, 'warning')
        }
    })

    // Desafio final iniciado (jogador clicou / fluxo em chamada)
    socket.on('desafio_final_iniciado', data => {
        gameState.desafioFinalAtual = data
        atualizarDesafioFinalUI()
        addLog(
            `Desafio final iniciado por ${data?.jogador?.nome || 'jogador'} (valide como ✅/❌)`,
            'warning'
        )
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
    })

    socket.on('jogo_finalizado', data => {
        gameState.desafioFinalAtual = null
        atualizarDesafioFinalUI()
        addLog(
            data?.mensagem || 'Jogo finalizado',
            data?.resultado === 'vitoria' ? 'success' : 'error'
        )
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
            return
        }

        addLog(`Habilidade usada: ${jogadorNome} (${heroi})`, 'info')
    })
}

// =====================================================
// GAME STATE MANAGEMENT
// =====================================================

function atualizarEstadoJogo(estado) {
    // backend envia o GameSession completo
    lastSession = estado

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
    }

    if (estado?.eventoAtivo !== undefined) {
        gameState.eventoAtual = estado.eventoAtivo
    }

    if (Array.isArray(estado?.deckEventos)) {
        gameState.eventosRestantes = estado.deckEventos.length
    }

    if (typeof estado?.cronometro === 'number') {
        timerState.seconds = estado.cronometro
        timerState.totalSeconds = Math.max(
            timerState.totalSeconds,
            estado.cronometro
        )
        updateTimerDisplay()
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

    // Update players list
    atualizarListaJogadores()

    // Update event display
    atualizarEventoUI()

    // Update riddle display
    atualizarCharadaUI()
    // Update tokens
    atualizarTokens()
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
            const podeRemover = jogador.id !== sessionData.mestreId

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
                ${
                    podeRemover
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
        btn.addEventListener('click', () => {
            const playerId = btn.dataset.playerId
            if (!playerId) return
            if (!socket || !socket.connected) {
                addLog('Socket desconectado; não é possível remover jogador', 'error')
                return
            }
            if (
                confirm('Tem certeza que deseja remover este jogador da sessão?')
            ) {
                socket.emit('remover_jogador', {
                    sessionId: sessionData.sessionId,
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
        jogadorId,
        correta: !!acertou
    })
}

function virarCarta5() {
    if (!socket || !socket.connected) {
        addLog('Socket desconectado; não é possível virar C5', 'error')
        return
    }
    socket.emit('virar_carta5', { sessionId: sessionData.sessionId })
    addLog('Carta C5 revelada pelo Mestre.', 'info')
}

function reiniciarSessao() {
    if (!socket || !socket.connected) {
        addLog('Socket desconectado; não é possível reiniciar a sessão', 'error')
        return
    }
    if (!confirm('Reiniciar a sessão? Isso resetará o jogo atual.')) return
    socket.emit('reiniciar_sessao', { sessionId: sessionData.sessionId })
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
        casaId
    })
    addLog(`Desafio exibido para ${casaId}.`, 'info')
}

function sairSessao() {
    if (confirm('Tem certeza que deseja sair da sessão?')) {
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
            tempo: timerState.seconds
        })
    }

    // Update preset buttons UI
    document.querySelectorAll('.btn-timer-preset').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.time) === seconds)
    })

    addLog(`⏱️ Tempo ajustado para ${formatTime(seconds)}`, 'info')
}
