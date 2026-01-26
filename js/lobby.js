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
    isMestre: false
}
let heroiSelecionado = null
let jogadoresConectados = []
let heroisOcupados = {}

// =====================================================
// INICIALIZAÇÃO
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    // Carregar dados da sessão do localStorage
    if (!carregarSessaoLocal()) {
        alert('Sessão não encontrada. Redirecionando...')
        window.location.href = 'home.html'
        return
    }

    // Obter código da URL
    const params = new URLSearchParams(window.location.search)
    const codigoUrl = params.get('sessao')

    if (codigoUrl && codigoUrl !== sessionData.sessionId) {
        sessionData.sessionId = codigoUrl
        salvarSessaoLocal()
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

    // Mostrar controles apropriados (mestre vs jogador)
    if (sessionData.isMestre) {
        document.getElementById('mestreControls').classList.remove('hidden')
        document.getElementById('jogadorControls').classList.add('hidden')
        document.getElementById('heroSubtitle').textContent =
            'Como Mestre, você pode observar a seleção dos jogadores'

        // Desabilitar seleção de herói para o mestre
        document.querySelectorAll('.hero-option').forEach(option => {
            option.style.pointerEvents = 'none'
            option.style.opacity = '0.7'
        })
    } else {
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
    document.getElementById('btnVoltar').addEventListener('click', () => {
        if (confirm('Tem certeza que deseja sair da sessão?')) {
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
}

// =====================================================
// SELEÇÃO DE HERÓI
// =====================================================

function selecionarHeroi(heroiTipo) {
    if (
        heroisOcupados[heroiTipo] &&
        heroisOcupados[heroiTipo] !== sessionData.jogadorId
    ) {
        alert('Este herói já foi escolhido por outro jogador.')
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

                return `
                <div class="player-slot ${readyClass}">
                    <div class="player-avatar">${avatarEmoji}</div>
                    <div class="player-info">
                        <div class="player-name">${jogador.nome}</div>
                        <div class="player-hero">${heroText}</div>
                    </div>
                    ${isMestre ? '<span class="player-badge mestre">Mestre</span>' : ''}
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
        alert(
            'Erro ao conectar ao servidor. Verifique se o backend está rodando.'
        )
    })

    // Atualização de estado
    socket.on('estado_atualizado', estado => {
        console.log('Estado atualizado:', estado)
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
        } else {
            window.location.href = `jogo.html?sessao=${sessionData.sessionId}`
        }
    })

    // Erro
    socket.on('acao_negada', data => {
        console.error('Ação negada:', data.motivo)
        alert(data.motivo)
    })

    // Sessão não encontrada
    socket.on('sessao_nao_encontrada', () => {
        alert('Sessão não encontrada ou expirada.')
        localStorage.removeItem('algorion_session')
        window.location.href = 'home.html'
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
        return true
    }
    return false
}
