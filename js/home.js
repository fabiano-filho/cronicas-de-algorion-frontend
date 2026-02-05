/**
 * Crônicas de Algorion - Home Page
 * Tela inicial: Criar ou Entrar em Sessão
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

// =====================================================
// INICIALIZAÇÃO
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    initTabs()
    initFormHandlers()
    initCopyButtons()

    // Verificar se veio com código na URL
    checkUrlParams()
})

// =====================================================
// TABS
// =====================================================

function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn')

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab

            // Atualizar botões
            tabBtns.forEach(b => b.classList.remove('active'))
            btn.classList.add('active')

            // Atualizar conteúdo
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active')
            })
            document.getElementById(`tab-${tabId}`).classList.add('active')
        })
    })
}

// =====================================================
// FORMULÁRIOS
// =====================================================

function initFormHandlers() {
    // Criar Sessão
    document
        .getElementById('btnCriarSessao')
        .addEventListener('click', criarSessao)

    // Entrar em Sessão
    document
        .getElementById('btnEntrarSessao')
        .addEventListener('click', entrarSessao)

    // Ir para Lobby (após criar)
    document
        .getElementById('btnIrParaLobby')
        .addEventListener('click', irParaLobby)

    // Enter nos inputs
    document.getElementById('nomeMestre').addEventListener('keypress', e => {
        if (e.key === 'Enter') criarSessao()
    })

    document.getElementById('codigoEntrar').addEventListener('keypress', e => {
        if (e.key === 'Enter') entrarSessao()
    })

    // Auto-uppercase no código
    document.getElementById('codigoEntrar').addEventListener('input', e => {
        e.target.value = e.target.value.toUpperCase()
    })
}

// =====================================================
// CRIAR SESSÃO
// =====================================================

function criarSessao() {
    const nome = document.getElementById('nomeMestre').value.trim()

    if (!nome) {
        showToast('Por favor, digite seu nome.', 'warning')
        document.getElementById('nomeMestre').focus()
        return
    }

    // Mostrar loading
    const btnCriar = document.getElementById('btnCriarSessao')
    const textoOriginal = btnCriar.innerHTML
    btnCriar.disabled = true
    btnCriar.innerHTML = '<span class="btn-icon">⏳</span> Criando...'

    // Gerar IDs
    const sessionId = gerarCodigoSessao()
    const mestreId = gerarId()

    // Salvar dados
    sessionData = {
        sessionId,
        mestreId,
        jogadorId: mestreId,
        nome,
        isMestre: true,
        isSpectator: false
    }

    // Salvar no localStorage
    salvarSessaoLocal()

    // Conectar ao servidor e criar sessão
    conectarServidor(() => {
        socket.emit('iniciar_sessao', {
            sessionId,
            mestreId
        })

        // Aguardar confirmação do estado
        socket.once('estado_atualizado', estado => {
            console.log('Sessão criada com sucesso:', estado)
            btnCriar.innerHTML =
                '<span class="btn-icon">✓</span> Sessão Criada!'
            // Mostrar código gerado
            mostrarSessaoCriada(sessionId)
        })

        // Timeout de fallback
        setTimeout(() => {
            if (
                !document
                    .getElementById('sessaoCriada')
                    .classList.contains('hidden')
            )
                return
            btnCriar.innerHTML =
                '<span class="btn-icon">✓</span> Sessão Criada!'
            mostrarSessaoCriada(sessionId)
        }, 2000)
    })
}

function mostrarSessaoCriada(codigo) {
    document.getElementById('codigoSessao').textContent = codigo

    // Gerar link
    const baseUrl =
        window.location.origin +
        window.location.pathname.replace('home.html', '')
    const link = `${baseUrl}lobby.html?sessao=${codigo}`
    document.getElementById('linkSessao').value = link

    // Mostrar seção
    document.getElementById('sessaoCriada').classList.remove('hidden')

    // Desabilitar botão de criar
    document.getElementById('btnCriarSessao').disabled = true
    document.getElementById('btnCriarSessao').style.opacity = '0.5'
}

// =====================================================
// ENTRAR EM SESSÃO
// =====================================================

function entrarSessao() {
    const nome = document.getElementById('nomeJogador').value.trim()
    const codigo = document
        .getElementById('codigoEntrar')
        .value.trim()
        .toUpperCase()

    if (!nome) {
        mostrarErro('Por favor, digite seu nome.')
        document.getElementById('nomeJogador').focus()
        return
    }

    if (!codigo) {
        mostrarErro('Por favor, digite o código da sessão.')
        document.getElementById('codigoEntrar').focus()
        return
    }

    // Mostrar loading
    const btnEntrar = document.getElementById('btnEntrarSessao')
    const textoOriginal = btnEntrar.innerHTML
    btnEntrar.disabled = true
    btnEntrar.innerHTML = '<span class="btn-icon">⏳</span> Conectando...'

    // Gerar ID do jogador
    const jogadorId = gerarId()

    // Salvar dados
    sessionData = {
        sessionId: codigo,
        mestreId: null,
        jogadorId,
        nome,
        isMestre: false,
        isSpectator: false
    }

    // Conectar ao servidor e verificar se sessão existe
    conectarServidor(() => {
        // Solicitar verificação da sessão
        socket.emit('verificar_sessao', { sessionId: codigo })

        // Timeout para caso não haja resposta
        const timeout = setTimeout(() => {
            btnEntrar.disabled = false
            btnEntrar.innerHTML = textoOriginal
            mostrarErro('Tempo esgotado. Verifique o código e tente novamente.')
        }, 5000)

        // Listener para resposta
        socket.once('sessao_verificada', data => {
            clearTimeout(timeout)

            if (data.existe) {
                const fase = data?.fase || 'lobby'
                sessionData.isSpectator = fase === 'jogo'
                // Salvar no localStorage
                salvarSessaoLocal()
                // Redirecionar conforme fase
                if (fase === 'jogo') {
                    window.location.href = `jogo.html?sessao=${codigo}&spectator=1`
                } else {
                    window.location.href = `lobby.html?sessao=${codigo}`
                }
            } else {
                btnEntrar.disabled = false
                btnEntrar.innerHTML = textoOriginal
                mostrarErro('Sessão não encontrada. Verifique o código.')
            }
        })

        // Fallback: se o evento não existir, ir direto (compatibilidade)
        socket.once('connect_error', () => {
            clearTimeout(timeout)
            btnEntrar.disabled = false
            btnEntrar.innerHTML = textoOriginal
        })
    })
}

function mostrarErro(mensagem) {
    const container = document.getElementById('erroEntrar')
    container.querySelector('.erro-text').textContent = mensagem
    container.classList.remove('hidden')

    setTimeout(() => {
        container.classList.add('hidden')
    }, 4000)
}

// =====================================================
// NAVEGAÇÃO
// =====================================================

function irParaLobby() {
    if (sessionData.sessionId) {
        window.location.href = `lobby.html?sessao=${sessionData.sessionId}`
    }
}

function checkUrlParams() {
    const params = new URLSearchParams(window.location.search)
    const codigo = params.get('sessao')

    if (codigo) {
        // Preencher código e ir para aba "Entrar"
        document.getElementById('codigoEntrar').value = codigo.toUpperCase()

        // Mudar para aba "Entrar"
        document.querySelector('[data-tab="entrar"]').click()
    }
}

// =====================================================
// COPIAR
// =====================================================

function initCopyButtons() {
    document.getElementById('btnCopiarCodigo').addEventListener('click', () => {
        const codigo = document.getElementById('codigoSessao').textContent
        copiarParaClipboard(codigo, document.getElementById('btnCopiarCodigo'))
    })

    document.getElementById('btnCopiarLink').addEventListener('click', () => {
        const link = document.getElementById('linkSessao').value
        copiarParaClipboard(link, document.getElementById('btnCopiarLink'))
    })
}

function copiarParaClipboard(texto, botao) {
    navigator.clipboard
        .writeText(texto)
        .then(() => {
            // Feedback visual
            botao.classList.add('copied')
            const originalText = botao.textContent
            botao.textContent = '✓'

            setTimeout(() => {
                botao.classList.remove('copied')
                botao.textContent = originalText
            }, 1500)
        })
        .catch(err => {
            console.error('Erro ao copiar:', err)
            // Fallback
            const input = document.createElement('input')
            input.value = texto
            document.body.appendChild(input)
            input.select()
            document.execCommand('copy')
            document.body.removeChild(input)
        })
}

// =====================================================
// SOCKET.IO
// =====================================================

function conectarServidor(callback) {
    if (socket && socket.connected) {
        if (callback) callback()
        return
    }

    socket = io(SERVER_URL, {
        transports: ['websocket', 'polling']
    })

    socket.on('connect', () => {
        console.log('Conectado ao servidor:', socket.id)
        if (callback) callback()
    })

    socket.on('connect_error', err => {
        console.error('Erro de conexão:', err)
        showToast(
            'Erro ao conectar ao servidor. Verifique se o backend está rodando.',
            'error',
            { dedupeKey: 'connect_error', durationMs: 5000 }
        )
    })

    socket.on('estado_atualizado', estado => {
        console.log('Estado atualizado:', estado)
    })
}

// =====================================================
// UTILITÁRIOS
// =====================================================

function gerarCodigoSessao() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let codigo = ''
    for (let i = 0; i < 6; i++) {
        codigo += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return codigo
}

function gerarId() {
    return (
        'id_' +
        Date.now().toString(36) +
        '_' +
        Math.random().toString(36).substr(2, 9)
    )
}

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
