/**
 * Crônicas de Algorion - Lobby
 * Sala de espera + Seleção de Heróis
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
let heroiSelecionado = null
let jogadoresConectados = []
let heroisOcupados = {}

// Helpers de UI (AlgorionUI)
const ui = window.AlgorionUI || null
const showToast = (message, variant = 'info', options = {}) => {
    ui?.toast?.(message, { variant, ...options })
}
const showAlertModal = options =>
    ui?.modal?.alert?.(options) ?? Promise.resolve()
const showConfirmModal = options =>
    ui?.modal?.confirm?.(options) ?? Promise.resolve(false)

// =====================================================
// INICIALIZAÇÃO
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    // Obter código da URL (link compartilhado)
    const params = new URLSearchParams(window.location.search)
    const codigoUrlRaw = params.get('sessao') || params.get('session')
    const codigoUrl = codigoUrlRaw
        ? String(codigoUrlRaw).trim().toUpperCase()
        : null

    // Carregar dados da sessão do localStorage.
    // Importante: quem abre o link pela primeira vez não terá sessionData salvo;
    // nesse caso, redireciona para a Home já com o código na URL.
    if (!carregarSessaoLocal()) {
        if (codigoUrl) {
            window.location.href = `home.html?sessao=${encodeURIComponent(codigoUrl)}`
            return
        }
        showAlertModal({
            title: 'Sessão não encontrada',
            message: 'Sessão não encontrada. Redirecionando...',
            confirmText: 'Ok'
        }).then(() => {
            window.location.href = 'home.html'
        })
        return
    }

    // Se veio com código na URL (ex.: jogador abriu o link), garantir novo cadastro.
    if (codigoUrl && codigoUrl !== sessionData.sessionId) {
        localStorage.removeItem('algorion_session')
        window.location.href = `home.html?sessao=${encodeURIComponent(codigoUrl)}`
        return
    }

    if (!sessionData?.nome) {
        localStorage.removeItem('algorion_session')
        window.location.href = `home.html?sessao=${encodeURIComponent(codigoUrl || '')}`
        return
    }

    initUI()
    conectarServidor()
    initEventListeners()
})

// =====================================================
// UI INITIALIZATION
// =====================================================

function initUI() {
    // Mostrar código da sessão
    document.getElementById('sessionCode').textContent =
        sessionData.sessionId || '------'

    // Mostrar nome do jogador
    document.getElementById('currentPlayerName').textContent =
        sessionData.nome || '---'

    // Mostrar controles apropriados (mestre vs jogador)
    if (sessionData.isMestre) {
        document.body.classList.add('is-mestre')
        document.getElementById('mestreControls').classList.remove('hidden')
        document.getElementById('jogadorControls').classList.add('hidden')
        document.getElementById('heroSubtitle').textContent =
            'Como Mestre, você pode observar a seleção dos jogadores'

        // Esconder seção de edição de nome para o mestre
        document.getElementById('playerNameSection').classList.add('hidden')

        // Desabilitar seleção de herói para o mestre
        document.querySelectorAll('.hero-option').forEach(option => {
            option.style.pointerEvents = 'none'
            option.style.opacity = '0.7'
        })
    } else {
        document.body.classList.remove('is-mestre')
        document.getElementById('mestreControls').classList.add('hidden')
        document.getElementById('jogadorControls').classList.remove('hidden')
    }
}

function initEventListeners() {
    // Seleção de heróis
    document.querySelectorAll('.hero-option').forEach(option => {
        option.addEventListener('click', () => {
            if (sessionData.isMestre) return
            selecionarHeroi(option.dataset.hero)
        })
    })

    // Trocar herói
    document
        .getElementById('btnChangeHero')
        .addEventListener('click', trocarHeroi)

    // Botão iniciar jogo (mestre)
    document
        .getElementById('btnIniciarJogo')
        .addEventListener('click', iniciarJogo)

    // Botão voltar
    document.getElementById('btnVoltar').addEventListener('click', async () => {
        const ui = window.AlgorionUI || null
        const confirmed = await (ui?.modal?.confirm?.({
            title: 'Sair da sessão',
            message: 'Tem certeza que deseja sair da sessão?',
            confirmText: 'Sair',
            cancelText: 'Cancelar'
        }) ?? Promise.resolve(false))

        if (confirmed) {
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

    // Copiar código
    document.getElementById('btnCopiarCodigo').addEventListener('click', () => {
        const codigo = document.getElementById('sessionCode').textContent
        navigator.clipboard.writeText(codigo).then(() => {
            const btn = document.getElementById('btnCopiarCodigo')
            btn.textContent = '✓'
            setTimeout(() => {
                btn.textContent = '📋'
            }, 1500)
        })
    })

    // Editar nome
    document
        .getElementById('btnEditName')
        .addEventListener('click', abrirEdicaoNome)
    document
        .getElementById('btnSaveName')
        .addEventListener('click', salvarNovoNome)
    document
        .getElementById('btnCancelName')
        .addEventListener('click', cancelarEdicaoNome)

    // Enter para salvar nome
    document.getElementById('inputNewName').addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            salvarNovoNome()
        }
    })

    // Remover jogador (somente mestre) - delegação de evento
    const playersList = document.getElementById('playersList')
    if (playersList) {
        playersList.addEventListener('click', e => {
            const target = e.target
            if (!(target instanceof HTMLElement)) return
            const btn = target.closest('.btn-remove-player')
            if (!btn) return
            if (!sessionData.isMestre) return

            const playerId = btn.dataset.playerId
            if (!playerId) return
            removerJogadorDoLobby(playerId)
        })
    }
}

function removerJogadorDoLobby(jogadorIdRemover) {
    if (!sessionData.isMestre) return
    if (!socket || !socket.connected) {
        showToast(
            'Socket desconectado; não é possível remover jogador agora.',
            'error'
        )
        return
    }

    if (jogadorIdRemover === sessionData.mestreId) {
        showToast('Você não pode remover o Mestre.', 'error')
        return
    }

    showConfirmModal({
        title: 'Remover jogador',
        message: 'Tem certeza que deseja remover este jogador da sessão?',
        confirmText: 'Remover',
        cancelText: 'Cancelar'
    }).then(confirmed => {
        if (confirmed) {
            socket.emit('remover_jogador', {
                sessionId: sessionData.sessionId,
                mestreId: sessionData.mestreId,
                jogadorIdRemover
            })
        }
    })
}

// =====================================================
// SELEÇÃO DE HERÓI
// =====================================================

function selecionarHeroi(heroiTipo) {
    if (
        heroisOcupados[heroiTipo] &&
        heroisOcupados[heroiTipo] !== sessionData.jogadorId
    ) {
        showToast('Este herói já foi escolhido por outro jogador.', 'warning')
        return
    }

    heroiSelecionado = heroiTipo

    // Atualizar UI
    document.querySelectorAll('.hero-option').forEach(option => {
        option.classList.remove('selected')
        if (option.dataset.hero === heroiTipo) {
            option.classList.add('selected')
        }
    })

    // Mostrar confirmação
    document.getElementById('selectedHeroName').textContent = heroiTipo
    document.getElementById('selectedHero').classList.remove('hidden')
    document.getElementById('heroSubtitle').textContent =
        'Herói selecionado! Aguarde os outros jogadores.'

    // Enviar para o servidor
    socket.emit('escolher_heroi', {
        sessionId: sessionData.sessionId,
        jogadorId: sessionData.jogadorId,
        nome: sessionData.nome,
        heroiTipo
    })
}

function trocarHeroi() {
    heroiSelecionado = null

    // Atualizar UI
    document.querySelectorAll('.hero-option').forEach(option => {
        option.classList.remove('selected')
    })
    document.getElementById('selectedHero').classList.add('hidden')
    document.getElementById('heroSubtitle').textContent =
        'Selecione um herói para jogar'

    // Notificar servidor (remover seleção)
    socket.emit('remover_heroi', {
        sessionId: sessionData.sessionId,
        jogadorId: sessionData.jogadorId
    })
}

// =====================================================
// EDIÇÃO DE NOME
// =====================================================

function abrirEdicaoNome() {
    document.getElementById('playerNameEdit').classList.remove('hidden')
    document.getElementById('inputNewName').value = sessionData.nome || ''
    document.getElementById('inputNewName').focus()
}

function cancelarEdicaoNome() {
    document.getElementById('playerNameEdit').classList.add('hidden')
    document.getElementById('inputNewName').value = ''
}

function salvarNovoNome() {
    const novoNome = document.getElementById('inputNewName').value.trim()

    if (!novoNome) {
        showToast('O nome não pode estar vazio.', 'warning')
        return
    }

    if (novoNome === sessionData.nome) {
        cancelarEdicaoNome()
        return
    }

    socket.emit('alterar_nome', {
        sessionId: sessionData.sessionId,
        jogadorId: sessionData.jogadorId,
        novoNome
    })
}

// =====================================================
// ATUALIZAÇÃO DE JOGADORES
// =====================================================

function atualizarListaJogadores(jogadores) {
    jogadoresConectados = jogadores
    const container = document.getElementById('playersList')

    if (jogadores.length === 0) {
        container.innerHTML = `
            <div class="player-slot empty">
                <span class="waiting-text">Aguardando jogadores...</span>
            </div>
        `
    } else {
        container.innerHTML = jogadores
            .map(jogador => {
                const isMestre = jogador.id === sessionData.mestreId
                const heroText = jogador.hero
                    ? jogador.hero.tipo
                    : 'Escolhendo...'
                const readyClass = jogador.hero ? 'ready' : 'connected'
                const avatarEmoji = getHeroEmoji(jogador.hero?.tipo)
                const podeRemover = sessionData.isMestre && !isMestre

                return `
                <div class="player-slot ${readyClass}">
                    <div class="player-avatar">${avatarEmoji}</div>
                    <div class="player-info">
                        <div class="player-name">${jogador.nome}</div>
                        <div class="player-hero">${heroText}</div>
                    </div>
                    <div class="player-right">
                        ${isMestre ? '<span class="player-badge mestre">Mestre</span>' : ''}
                        ${
                            podeRemover
                                ? `<button class="btn-remove-player" data-player-id="${jogador.id}" title="Remover jogador">Remover</button>`
                                : ''
                        }
                    </div>
                </div>
            `
            })
            .join('')
    }

    // Atualizar contador
    document.getElementById('playersConnected').textContent = jogadores.length

    // Atualizar heróis ocupados
    atualizarHeroisOcupados(jogadores)

    // Verificar se todos escolheram (para o mestre)
    verificarTodosProntos(jogadores)
}

function getHeroEmoji(heroTipo) {
    switch (heroTipo) {
        case 'Anao':
            return '⛏️'
        case 'Humano':
            return '🧑'
        case 'Sereia':
            return '🧜'
        case 'Bruxa':
            return '🧙'
        default:
            return '👤'
    }
}

function atualizarHeroisOcupados(jogadores) {
    heroisOcupados = {}

    jogadores.forEach(jogador => {
        if (jogador.hero) {
            heroisOcupados[jogador.hero.tipo] = jogador.id
        }
    })

    // Atualizar UI dos heróis
    document.querySelectorAll('.hero-option').forEach(option => {
        const heroTipo = option.dataset.hero
        const statusSpan = option.querySelector('.hero-status span')

        if (heroisOcupados[heroTipo]) {
            if (heroisOcupados[heroTipo] === sessionData.jogadorId) {
                option.classList.add('selected')
                option.classList.remove('taken')
                statusSpan.textContent = 'Você escolheu'
                statusSpan.className = 'status-available'
            } else {
                option.classList.add('taken')
                option.classList.remove('selected')
                const jogador = jogadores.find(
                    j => j.id === heroisOcupados[heroTipo]
                )
                statusSpan.textContent = `Escolhido por ${jogador?.nome || 'outro'}`
                statusSpan.className = 'status-taken'
            }
        } else {
            option.classList.remove('taken', 'selected')
            statusSpan.textContent = 'Disponível'
            statusSpan.className = 'status-available'
        }
    })
}

function verificarTodosProntos(jogadores) {
    if (!sessionData.isMestre) return

    const todosComHeroi =
        jogadores.length > 0 &&
        jogadores.every(j => j.hero !== null && j.hero !== undefined)
    const btnIniciar = document.getElementById('btnIniciarJogo')
    const readyStatus = document.getElementById('readyStatus')

    if (todosComHeroi && jogadores.length >= 1) {
        btnIniciar.disabled = false
        readyStatus.innerHTML = `
            <span class="status-icon">✅</span>
            <span class="status-text">Todos os jogadores estão prontos!</span>
        `
    } else {
        btnIniciar.disabled = true
        const semHeroi = jogadores.filter(j => !j.hero).length
        readyStatus.innerHTML = `
            <span class="status-icon">⏳</span>
            <span class="status-text">${semHeroi} jogador(es) ainda escolhendo herói...</span>
        `
    }
}

// =====================================================
// INICIAR JOGO
// =====================================================

function iniciarJogo() {
    if (!sessionData.isMestre) return

    socket.emit('iniciar_jogo', {
        sessionId: sessionData.sessionId,
        mestreId: sessionData.mestreId
    })
}

// =====================================================
// SOCKET.IO
// =====================================================

function conectarServidor() {
    socket = io(SERVER_URL, {
        transports: ['websocket', 'polling']
    })

    socket.on('connect', () => {
        console.log('Conectado ao servidor:', socket.id)

        // Entrar na sala da sessão
        socket.emit('entrar_lobby', {
            sessionId: sessionData.sessionId,
            jogadorId: sessionData.jogadorId,
            nome: sessionData.nome,
            isMestre: sessionData.isMestre
        })
    })

    socket.on('connect_error', err => {
        console.error('Erro de conexão:', err)
        showAlertModal({
            title: 'Erro de conexão',
            message:
                'Erro ao conectar ao servidor. Verifique se o backend está rodando.',
            confirmText: 'Ok'
        })
    })

    // Atualização de estado
    socket.on('estado_atualizado', estado => {
        console.log('Estado atualizado:', estado)
        if (estado?.fase === 'jogo') {
            if (sessionData.isMestre) {
                window.location.href = `mestre.html?sessao=${sessionData.sessionId}`
                return
            }
            const isPlayer = Array.isArray(estado?.listaJogadores)
                ? estado.listaJogadores.some(
                      j => j?.id === sessionData.jogadorId
                  )
                : false
            if (isPlayer) {
                if (sessionData.isSpectator) {
                    sessionData.isSpectator = false
                    salvarSessaoLocal()
                }
                window.location.href = `jogo.html?sessao=${sessionData.sessionId}`
            } else {
                sessionData.isSpectator = true
                salvarSessaoLocal()
                window.location.href = `jogo.html?sessao=${sessionData.sessionId}&spectator=1`
            }
            return
        }
        if (estado.listaJogadores) {
            atualizarListaJogadores(estado.listaJogadores)
        }
    })

    // Lobby atualizado
    socket.on('lobby_atualizado', data => {
        console.log('Lobby atualizado:', data)
        if (data.jogadores) {
            atualizarListaJogadores(data.jogadores)
        }
    })

    // Jogo iniciado
    socket.on('jogo_iniciado', data => {
        console.log('Jogo iniciado!', data)
        // Redirecionar para a página apropriada
        if (sessionData.isMestre) {
            window.location.href = `mestre.html?sessao=${sessionData.sessionId}`
            return
        }

        const isPlayer = Array.isArray(data?.jogadores)
            ? data.jogadores.some(j => j?.id === sessionData.jogadorId)
            : true

        if (isPlayer) {
            if (sessionData.isSpectator) {
                sessionData.isSpectator = false
                salvarSessaoLocal()
            }
            window.location.href = `jogo.html?sessao=${sessionData.sessionId}`
        } else {
            sessionData.isSpectator = true
            salvarSessaoLocal()
            window.location.href = `jogo.html?sessao=${sessionData.sessionId}&spectator=1`
        }
    })

    // Erro
    socket.on('acao_negada', data => {
        console.error('Ação negada:', data.motivo)
        showToast(data.motivo, 'error')
    })

    socket.on('sessao_reiniciada', () => {
        showAlertModal({
            title: 'Sessão reiniciada',
            message: 'Sessão reiniciada pelo Mestre. O jogo foi resetado.',
            confirmText: 'Ok'
        })
    })

    // Sessão não encontrada
    socket.on('sessao_encerrada', () => {
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

    socket.on('sessao_nao_encontrada', () => {
        showAlertModal({
            title: 'Sessão expirada',
            message: 'Sessão não encontrada ou expirada.',
            confirmText: 'Ok'
        }).then(() => {
            localStorage.removeItem('algorion_session')
            window.location.href = 'home.html'
        })
    })

    // Nome alterado com sucesso
    socket.on('nome_alterado', data => {
        console.log('Nome alterado:', data)
        sessionData.nome = data.novoNome
        salvarSessaoLocal()
        document.getElementById('currentPlayerName').textContent = data.novoNome
        cancelarEdicaoNome()
    })

    // Jogador removido pelo mestre
    socket.on('voce_foi_removido', data => {
        console.warn('Você foi removido da sessão:', data)
        showAlertModal({
            title: 'Removido da sessão',
            message: 'Você foi removido da sessão pelo Mestre.',
            confirmText: 'Ok'
        }).then(() => {
            localStorage.removeItem('algorion_session')
            window.location.href = 'home.html'
        })
    })
}

// =====================================================
// UTILITÁRIOS
// =====================================================

function salvarSessaoLocal() {
    localStorage.setItem('algorion_session', JSON.stringify(sessionData))
}

function carregarSessaoLocal() {
    const data = localStorage.getItem('algorion_session')
    if (data) {
        sessionData = JSON.parse(data)
        if (typeof sessionData.isSpectator !== 'boolean') {
            sessionData.isSpectator = false
        }
        return true
    }
    return false
}
