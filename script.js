/* ================================================= */
/* === SISTEMA UNIFICADO: RPG + POMODORO + SRS   === */
/* ===         (COM WEB WORKER FIX)              === */
/* ================================================= */

var dadosBrutos = localStorage.getItem("dados");
var dados = dadosBrutos ? JSON.parse(dadosBrutos) : { 
    itens: [], 
    recompensas: [], 
    historicoEstudos: [], 
    materias: [], 
    objetivos: [], 
    historicoConquistas: [],
    srsItems: [],
    biblioteca: [],
    historicoDiario: [],
    streakAtual: 0,
    streakRecorde: 0,
    configTimer: { som: 'sino', notificacao: false, mostrarPrevisao: true },
    tema: 'claro',
    progressoGlobal: {}, 
    metasGlobais: { mes: 50, ano: 500 },
    ultimaData: "", 
    pontosAcumulados: 0,
    hp: 300,      
    maxHp: 300,   
    maestriaAcumulada: {} 
};

// --- GARANTIA DE INTEGRIDADE DOS DADOS ---
if (!dados.recompensas) dados.recompensas = [];
if (!dados.historicoEstudos) dados.historicoEstudos = [];
if (!dados.materias) dados.materias = [];
if (!dados.objetivos) dados.objetivos = [];
if (!dados.historicoConquistas) dados.historicoConquistas = [];
if (!dados.srsItems) dados.srsItems = [];
dados.srsItems.forEach(i => { if (i.resposta === undefined) i.resposta = ""; }); // compatibilidade com cards antigos
dados.srsItems.forEach(i => { if (!i.tipo) i.tipo = "normal"; }); // compatibilidade com cards antigos (antes do modo Cloze)
if (!dados.biblioteca) dados.biblioteca = [];
dados.biblioteca.forEach(l => { if (!l.tipo) l.tipo = 'pdf'; }); // compatibilidade com livros salvos antes do suporte a EPUB
dados.biblioteca.forEach(l => { if (l.prateleira === undefined) l.prateleira = ""; }); // compatibilidade com livros salvos antes das prateleiras
if (!dados.cbzLeituraDiaria) dados.cbzLeituraDiaria = { data: hoje(), livrosAbertos: [] }; // limite de 5 CBZ diferentes por dia

// === FINANÇAS PESSOAIS ===
if (!dados.financas) dados.financas = { lancamentos: [], categorias: ["Alimentação", "Transporte", "Lazer", "Moradia", "Assinaturas"], contasFixas: [], metas: [], orcamentos: {}, _penalidadesOrcamento: {} };
if (!dados.financas.lancamentos) dados.financas.lancamentos = [];
if (!dados.financas.categorias) dados.financas.categorias = ["Alimentação", "Transporte", "Lazer", "Moradia", "Assinaturas"];
if (!dados.financas.contasFixas) dados.financas.contasFixas = [];
if (!dados.financas.metas) dados.financas.metas = [];
if (!dados.financas.orcamentos) dados.financas.orcamentos = {};
if (!dados.financas._penalidadesOrcamento) dados.financas._penalidadesOrcamento = {};
if (!dados.financas.investimentos) dados.financas.investimentos = { historico: [] };
if (!dados.financas.investimentos.historico) dados.financas.investimentos.historico = [];
dados.financas.investimentos.historico.forEach(h => { if (h.aporte === undefined) h.aporte = 0; }); // compatibilidade com atualizações antigas (antes de separar aporte de rendimento)
if (!dados.historicoDiario) dados.historicoDiario = [];
if (dados.streakAtual === undefined) dados.streakAtual = 0;
if (dados.streakRecorde === undefined) dados.streakRecorde = 0;
if (!dados.maestriaAcumulada) dados.maestriaAcumulada = {};
if (!dados.configTimer) dados.configTimer = { som: 'sino', notificacao: false, mostrarPrevisao: true };
if (dados.configTimer.mostrarPrevisao === undefined) dados.configTimer.mostrarPrevisao = true;
if (!dados.tema) dados.tema = 'claro';
if (!dados.progressoGlobal) dados.progressoGlobal = {};
if (!dados.metasGlobais) dados.metasGlobais = { mes: 50, ano: 500 };
if (dados.hp === undefined) dados.hp = 300;
if (dados.maxHp === undefined) dados.maxHp = 300; 
if (dados.pontosAcumulados === undefined) dados.pontosAcumulados = 0;
if (dados.ultimaData === undefined) dados.ultimaData = "";
dados.itens.forEach(item => { if (!item.recorrencia) item.recorrencia = { tipo: 'diaria' }; }); // compatibilidade com missões antigas
dados.itens.forEach(item => { if (item.diasSeguidosIncompleta === undefined) item.diasSeguidosIncompleta = 0; }); // compatibilidade com o escalonamento de dano/pontos
dados.objetivos.forEach(o => { if (o.prazo === undefined) o.prazo = null; }); // compatibilidade com objetivos antigos
dados.biblioteca.forEach(l => { if (!l.anotacoes) l.anotacoes = []; if (l.capaDataUrl === undefined) l.capaDataUrl = null; }); // compatibilidade com livros antigos

// Correção para usuários antigos
if (dados.maxHp === 100) { dados.maxHp = 300; dados.hp = 300; salvar(); }

var nivelAnterior = null;
let meuRadarChart = null;
let meuHistoricoChart = null;
let meuMateriasChart = null;
let meuCategoriasChart = null;
let meuHistoricoFinancasChart = null;
let cardAtualRevisao = null;
let respostaRevelada = false;

// --- NOVO: seleção hierárquica de temas do SRS (::) — dura só a sessão, não é salva ---
let srsTemasConhecidos = new Set();
let srsTemasSelecionados = new Set();
let srsNosExpandidos = new Set();
let arvoreTemasSRS = {};

// --- VARIÁVEIS DO TIMER (WEB WORKER) ---
let timerWorker = null; 
let emFoco = true;
let tempoRestante = null;
let dataTermino = null;

// Criação do Worker Inline (Isso impede o navegador de pausar o timer em 2º plano)
const workerCode = `
    let intervalId;
    self.onmessage = function(e) {
        if (e.data === 'start') {
            if (intervalId) clearInterval(intervalId);
            intervalId = setInterval(() => { postMessage('tick'); }, 250); // Checa a cada 250ms
        } else if (e.data === 'stop') {
            clearInterval(intervalId);
        }
    };
`;
const blob = new Blob([workerCode], { type: "application/javascript" });
const workerUrl = URL.createObjectURL(blob);

const AUDIOS = {
    'sino': 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
    'levelup': 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3',
    'bipe': 'https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3',
    'natureza': 'https://assets.mixkit.co/active_storage/sfx/24/24-preview.mp3'
};

// Configuração do worker do PDF.js (precisa apontar para a mesma versão do <script> no HTML)
if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

function hoje() { return new Date().toLocaleDateString(); }
function hojeISO() { return new Date().toISOString().split('T')[0]; }

/* === FUNÇÕES BÁSICAS E DE DANO === */
function salvarDados() { localStorage.setItem("dados", JSON.stringify(dados)); }
function salvar() { salvarDados(); atualizar(); }

function isItemAtivoHoje(item) {
    if (!item.recorrencia || item.recorrencia.tipo !== 'semanal') return true;
    return item.recorrencia.diaSemana === new Date().getDay();
}

function textoRecorrencia(item) {
    if (!item.recorrencia || item.recorrencia.tipo === 'diaria') return "Diária";
    const dias = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
    return "Semanal (" + dias[item.recorrencia.diaSemana] + ")";
}

// NOVO: valor escalado de uma missão com base em quantos dias seguidos ela está sem ser feita.
// A 1ª vez que falta custa o valor normal; a partir da 2ª falta seguida, cresce 20% composto por dia.
function calcularPontosEscalonados(item) {
    const base = parseInt(item.pontos) || 0;
    const dias = item.diasSeguidosIncompleta || 0;
    return Math.round(base * Math.pow(1.2, dias));
}

// NOVO: soma o dano (já escalonado) de todas as missões ativas hoje que ainda não foram marcadas —
// é o dano que seria aplicado se o dia terminasse agora, sem marcar mais nada.
function calcularDanoPrevistoHoje() {
    let dano = 0;
    dados.itens.forEach(item => {
        if (isItemAtivoHoje(item) && !item.feito) {
            dano += calcularPontosEscalonados(item);
        }
    });
    return dano;
}

function ehDataIsoValida(str) { return typeof str === "string" && /^\d{4}-\d{2}-\d{2}$/.test(str); }

function resetDiario() {
    const hojeIso = hojeISO();

    if (dados.ultimaData === "") { dados.ultimaData = hojeIso; salvar(); return; }

    // Migração: versões antigas guardavam ultimaData no formato de hoje() (que depende do locale do
    // navegador — ver hoje()). Não é seguro calcular quantos dias se passaram a partir desse valor,
    // então na primeira execução após a atualização só realinhamos pro formato ISO, sem aplicar dano
    // (evita punir o usuário por causa da própria migração de formato).
    if (!ehDataIsoValida(dados.ultimaData)) { dados.ultimaData = hojeIso; salvar(); return; }

    if (dados.ultimaData === hojeIso) return; // já processado hoje, nada a fazer

    // NOVO: processa, dia por dia, TODOS os dias que passaram desde a última vez que o app foi aberto —
    // antes, se o usuário ficasse vários dias sem abrir o app, dano/streak/atraso só contavam 1 dia
    // (o "ontem" mais recente), e o resto dos dias perdidos era ignorado silenciosamente.
    let cursor = new Date(dados.ultimaData + "T00:00:00");
    const limite = new Date(hojeIso + "T00:00:00");
    let danoTotalGeral = 0;
    let diasProcessados = 0;
    const MAX_DIAS = 3650; // guarda de segurança contra data corrompida (~10 anos)

    while (cursor < limite && diasProcessados < MAX_DIAS) {
        const diaSemanaProcessado = cursor.getDay();
        let danoDoDia = 0;
        dados.itens.forEach(item => {
            const ativoNesseDia = !item.recorrencia || item.recorrencia.tipo === 'diaria' || (item.recorrencia.tipo === 'semanal' && item.recorrencia.diaSemana === diaSemanaProcessado);
            if (ativoNesseDia && !item.feito) {
                danoDoDia += calcularPontosEscalonados(item);
                item.diasSeguidosIncompleta = (item.diasSeguidosIncompleta || 0) + 1;
            }
        });

        danoTotalGeral += danoDoDia;
        dados.hp -= danoDoDia;
        if (dados.hp < 0) dados.hp = 0;

        // Sequência de dias (streak): conta como "dia sobrevivido" enquanto o HP não zerar,
        // mesmo que uma ou mais missões tenham ficado incompletas naquele dia.
        if (dados.hp > 0) {
            dados.streakAtual = (dados.streakAtual || 0) + 1;
            dados.streakRecorde = Math.max(dados.streakRecorde || 0, dados.streakAtual);
        }

        // Histórico de HP/XP (mantém só os últimos 30 registros)
        dados.historicoDiario.push({ data: cursor.toLocaleDateString(), hp: dados.hp, xp: dados.pontosAcumulados });
        if (dados.historicoDiario.length > 30) dados.historicoDiario.shift();

        diasProcessados++;
        if (dados.hp <= 0) break;
        cursor.setDate(cursor.getDate() + 1);
    }

    if (dados.hp <= 0) { dados.ultimaData = hojeIso; salvar(); verificarGameOver(); return; }

    if (danoTotalGeral > 0) {
        document.getElementById("display-dano-tomado").innerText = danoTotalGeral;
        document.getElementById("dano-modal").classList.remove("modal-oculto");
    }
    dados.itens.forEach(item => item.feito = false);
    dados.ultimaData = hojeIso;
    salvar();
}

function verificarGameOver() { if (dados.hp <= 0) document.getElementById("gameover-modal").classList.remove("modal-oculto"); }
function fecharModalDano() { document.getElementById("dano-modal").classList.add("modal-oculto"); }
function pontosParaProximoNivel(nivel) { return Math.floor(100 * Math.pow(1.1, nivel)); }

/* === CONFIRMAÇÃO SEGURA PARA AÇÕES DESTRUTIVAS === */
let acaoPerigosaPendente = null;
function pedirConfirmacaoPerigosa(mensagem, acao) {
    acaoPerigosaPendente = acao;
    document.getElementById("confirmacao-perigosa-mensagem").innerText = mensagem;
    document.getElementById("confirmacao-perigosa-input").value = "";
    document.getElementById("confirmacao-perigosa-modal").classList.remove("modal-oculto");
}
function cancelarConfirmacaoPerigosa() {
    acaoPerigosaPendente = null;
    document.getElementById("confirmacao-perigosa-modal").classList.add("modal-oculto");
}
function executarConfirmacaoPerigosa() {
    const valor = (document.getElementById("confirmacao-perigosa-input").value || "").trim().toUpperCase();
    if (valor !== "CONFIRMAR") { alert('Digite exatamente "CONFIRMAR" para prosseguir.'); return; }
    const acao = acaoPerigosaPendente;
    cancelarConfirmacaoPerigosa();
    if (acao) acao();
}
function confirmarGameOver() {
    pedirConfirmacaoPerigosa("Sua vida chegou a 0. Isso vai reiniciar seu progresso (RPG, timer, objetivos, SRS, biblioteca), mas suas missões do Checklist serão mantidas. Essa ação não pode ser desfeita.", () => {
        const missoesPreservadas = dados.itens.map(item => ({ ...item, feito: false }));
        localStorage.removeItem("dados");
        const dadosNovos = {
            itens: missoesPreservadas,
            recompensas: [], historicoEstudos: [], materias: [], objetivos: [],
            historicoConquistas: [], srsItems: [], biblioteca: [],
            historicoDiario: [], streakAtual: 0, streakRecorde: 0,
            configTimer: { som: 'sino', notificacao: false, mostrarPrevisao: true },
            tema: dados.tema, progressoGlobal: {}, metasGlobais: { mes: 50, ano: 500 },
            ultimaData: "", pontosAcumulados: 0, hp: 300, maxHp: 300, maestriaAcumulada: {}
        };
        localStorage.setItem("dados", JSON.stringify(dadosNovos));
        location.reload();
    });
}
function confirmarResetTotal() {
    pedirConfirmacaoPerigosa("Isso vai apagar TODOS os seus dados (RPG, timer, objetivos, SRS, biblioteca). Essa ação não pode ser desfeita.", () => {
        localStorage.removeItem("dados");
        location.reload();
    });
}

/* === LOJA E POÇÕES === */
function comprarPocao(custo, cura) {
    if (dados.hp >= dados.maxHp) { alert("Sua vida já está cheia!"); return; }
    if (dados.pontosAcumulados >= custo) {
        if(confirm(`Gastar ${custo} XP para recuperar ${cura} HP?`)) {
            dados.pontosAcumulados -= custo;
            dados.hp = Math.min(dados.maxHp, dados.hp + cura);
            salvar();
            alert(`Vida recuperada! (+${cura} HP) 💊`);
        }
    } else { alert(`Você precisa de ${custo} XP.`); }
}

function adicionarRecompensa() {
    const nome = document.getElementById("recompensa-nome").value; const custo = parseInt(document.getElementById("recompensa-custo").value);
    if (!nome || !custo) { alert("Preencha tudo."); return; }
    dados.recompensas.push({ nome: nome, custo: custo });
    document.getElementById("recompensa-nome").value = ""; document.getElementById("recompensa-custo").value = ""; salvar();
}
function comprarRecompensa(index) {
    const item = dados.recompensas[index];
    if (dados.pontosAcumulados >= item.custo) { if (confirm(`Resgatar "${item.nome}"?`)) { dados.pontosAcumulados -= item.custo; salvar(); alert(`🎉 Resgatado: ${item.nome}!`); } } else { alert("Pontos insuficientes!"); }
}
function removerRecompensa(index) { if(confirm("Remover?")) { dados.recompensas.splice(index, 1); salvar(); } }

/* === RPG E CHECKLIST === */
function alternarCampoDiaSemana() {
    const recorrencia = document.getElementById("item-recorrencia").value;
    const campoDia = document.getElementById("item-dia-semana");
    if (recorrencia === 'semanal') campoDia.classList.remove("oculto"); else campoDia.classList.add("oculto");
}

function adicionarItem() {
    var desc = document.getElementById("desc").value;
    var pts = document.getElementById("pts").value; var attrs = document.getElementById("attrs").value; var cat = document.getElementById("cat").value;
    if (!desc || !pts || !attrs) { alert("Preencha tudo."); return; }

    const tipoRecorrencia = document.getElementById("item-recorrencia").value;
    const recorrencia = tipoRecorrencia === 'semanal'
        ? { tipo: 'semanal', diaSemana: parseInt(document.getElementById("item-dia-semana").value) }
        : { tipo: 'diaria' };

    dados.itens.push({ descricao: desc, pontos: pts, atributos: attrs, categoria: cat.trim() || "Geral", feito: false, recorrencia: recorrencia });
    document.getElementById("desc").value = ""; document.getElementById("pts").value = ""; document.getElementById("attrs").value = ""; document.getElementById("cat").value = ""; salvar();
}
function alternarItem(index, marcado) {
    if (!dados.itens[index]) return;
    let item = dados.itens[index];
    let listaAtributos = item.atributos ? item.atributos.split(',').map(s => s.trim()).filter(s => s !== "") : [];

    if (marcado && !item.feito) {
        const diasAntes = item.diasSeguidosIncompleta || 0;
        const pontosConcedidos = calcularPontosEscalonados(item); // usa o atraso acumulado como bônus
        const cura = Math.ceil(pontosConcedidos / 2) || 1;

        dados.pontosAcumulados += pontosConcedidos;
        dados.hp += cura; if (dados.hp > dados.maxHp) dados.hp = dados.maxHp;
        listaAtributos.forEach(attr => { dados.maestriaAcumulada[attr] = (dados.maestriaAcumulada[attr] || 0) + 1; });

        item.ultimoValorConcedido = pontosConcedidos;
        item.diasAntesDoUltimoCompleto = diasAntes;
        item.diasSeguidosIncompleta = 0; // volta a valer o normal a partir de agora
    } else if (!marcado && item.feito) {
        const pontosDevolver = item.ultimoValorConcedido !== undefined ? item.ultimoValorConcedido : (parseInt(item.pontos) || 0);
        const cura = Math.ceil(pontosDevolver / 2) || 1;
        dados.pontosAcumulados = Math.max(0, dados.pontosAcumulados - pontosDevolver);
        dados.hp -= cura;
        if (dados.hp <= 0) { dados.hp = 0; item.feito = marcado; salvar(); verificarGameOver(); return; }
        listaAtributos.forEach(attr => { if (dados.maestriaAcumulada[attr]) dados.maestriaAcumulada[attr] = Math.max(0, dados.maestriaAcumulada[attr] - 1); });
        if (item.diasAntesDoUltimoCompleto !== undefined) item.diasSeguidosIncompleta = item.diasAntesDoUltimoCompleto; // restaura o atraso que havia antes
    }
    item.feito = marcado; salvar();
}
function removerItem(index) { 
    if (confirm("Excluir?")) { 
        let item = dados.itens[index]; 
        if (item.feito) { 
            const pontosConcedidos = item.ultimoValorConcedido !== undefined ? item.ultimoValorConcedido : (parseInt(item.pontos) || 0);
            dados.pontosAcumulados -= pontosConcedidos;
            let lista = item.atributos.split(','); 
            lista.forEach(a => { if(dados.maestriaAcumulada[a.trim()]) dados.maestriaAcumulada[a.trim()] -= 1; }); 
        } 
        dados.itens.splice(index, 1); salvar();
    } 
}
function editarCampo(index, campo, novoValor) { dados.itens[index][campo] = novoValor; salvar(); }
function editarCampoNumerico(index, campo, valor) {
    const num = parseInt(valor);
    if (isNaN(num) || num <= 0) { salvar(); return; } // valor inválido: apenas re-renderiza e mantém o antigo
    dados.itens[index][campo] = num; salvar();
}

/* === OBJETIVOS === */
function adicionarObjetivo() {
    const titulo = document.getElementById("obj-titulo").value; const tipo = document.getElementById("obj-tipo").value;
    const prazo = document.getElementById("obj-prazo").value || null;
    if (!titulo) return alert("Digite um título!");
    dados.objetivos.push({ id: Date.now(), titulo: titulo, tipo: tipo, marcos: [], concluido: false, prazo: prazo });
    document.getElementById("obj-titulo").value = ""; document.getElementById("obj-prazo").value = ""; salvar();
}
function editarPrazoObjetivo(idObjetivo, valor) {
    const obj = dados.objetivos.find(o => o.id === idObjetivo);
    if (!obj) return;
    obj.prazo = valor || null;
    salvar();
}
function removerObjetivo(id) { if(confirm("Excluir?")) { dados.objetivos = dados.objetivos.filter(o => o.id !== id); salvar(); } }
function adicionarMarco(idObjetivo, inputElement) {
    const texto = inputElement.value; if(!texto) return;
    const obj = dados.objetivos.find(o => o.id === idObjetivo);
    if(obj) { obj.marcos.push({ texto: texto, feito: false }); dados.pontosAcumulados += 2; inputElement.value = ""; salvar(); }
}
function alternarMarco(idObjetivo, indexMarco) {
    const obj = dados.objetivos.find(o => o.id === idObjetivo);
    if(!obj) return;
    const marco = obj.marcos[indexMarco]; marco.feito = !marco.feito;
    if (marco.feito) dados.pontosAcumulados += 5; else dados.pontosAcumulados = Math.max(0, dados.pontosAcumulados - 5);
    salvar();
}
function editarMarco(idObjetivo, indexMarco, novoTexto) {
    const obj = dados.objetivos.find(o => o.id === idObjetivo);
    if(!obj) return;
    obj.marcos[indexMarco].texto = novoTexto; salvar();
}
function arquivarObjetivo(id) {
    const objIndex = dados.objetivos.findIndex(o => o.id === id);
    if (objIndex === -1) return;
    const obj = dados.objetivos[objIndex];
    if(confirm(`Arquivar "${obj.titulo}"?`)) {
        dados.pontosAcumulados += 150;
        tocarSom();
        dados.historicoConquistas.unshift({
            titulo: obj.titulo,
            tipo: obj.tipo === 'cascata' ? 'Meta de Vida' : 'Skill',
            dataConclusao: new Date().toLocaleDateString(),
            passos: obj.marcos.map(m => m.texto)
        });
        dados.objetivos.splice(objIndex, 1);
        salvar(); alert("🏆 Conquista arquivada!");
    }
}
function limparConquistas() { if(confirm("Limpar conquistas?")) { dados.historicoConquistas = []; salvar(); } }

/* === NOVO: reordenar marcos por arrastar e soltar === */
let marcoArrastandoInfo = null; // { idObjetivo, index }

function arrastarMarcoInicio(event, idObjetivo, index) {
    marcoArrastandoInfo = { idObjetivo: idObjetivo, index: index };
    event.currentTarget.classList.add("arrastando");
    event.dataTransfer.effectAllowed = "move";
}
function arrastarMarcoSobre(event) {
    event.preventDefault();
    event.currentTarget.classList.add("drag-over-marco");
}
function arrastarMarcoSai(event) {
    event.currentTarget.classList.remove("drag-over-marco");
}
function arrastarMarcoSoltar(event, idObjetivo, indexDestino) {
    event.preventDefault();
    event.currentTarget.classList.remove("drag-over-marco");
    if (!marcoArrastandoInfo || marcoArrastandoInfo.idObjetivo !== idObjetivo) { marcoArrastandoInfo = null; return; }
    const obj = dados.objetivos.find(o => o.id === idObjetivo);
    if (!obj) { marcoArrastandoInfo = null; return; }
    const [marcoMovido] = obj.marcos.splice(marcoArrastandoInfo.index, 1);
    obj.marcos.splice(indexDestino, 0, marcoMovido);
    marcoArrastandoInfo = null;
    salvar();
}
function arrastarMarcoFim(event) {
    event.currentTarget.classList.remove("arrastando");
    document.querySelectorAll(".marco-item.drag-over-marco").forEach(el => el.classList.remove("drag-over-marco"));
}

/* === CONFIG E TEMA === */
function aplicarTema() {
    const btn = document.getElementById('btn-tema');
    if (dados.tema === 'escuro') { 
        document.body.classList.add('dark-mode'); 
        if(btn) btn.innerText = '☀️'; 
        if(meuRadarChart) { meuRadarChart.options.scales.r.pointLabels.font.color = '#fff'; meuRadarChart.options.scales.r.grid.color = '#444'; meuRadarChart.update(); } 
    } else { 
        document.body.classList.remove('dark-mode'); 
        if(btn) btn.innerText = '🌙'; 
        if(meuRadarChart) { meuRadarChart.options.scales.r.pointLabels.font.color = '#666'; meuRadarChart.options.scales.r.grid.color = '#ddd'; meuRadarChart.update(); } 
    }
}
function alternarTema() { dados.tema = dados.tema === 'claro' ? 'escuro' : 'claro'; aplicarTema(); if (leitorEpubRendition) aplicarTemaEpub(leitorEpubRendition); salvar(); atualizarGraficoRadar(); atualizarGraficoHistorico(); atualizarGraficoMaterias(); }
function salvarPreferenciasTimer() { dados.configTimer = { som: document.getElementById("select-som").value, notificacao: document.getElementById("check-notificacao").checked, mostrarPrevisao: document.getElementById("check-previsao").checked }; salvar(); calcularPrevisaoTermino(); }
function carregarPreferenciasTimer() {
    if (dados.configTimer) { document.getElementById("select-som").value = dados.configTimer.som || 'sino'; document.getElementById("check-notificacao").checked = dados.configTimer.notificacao || false; document.getElementById("check-previsao").checked = dados.configTimer.mostrarPrevisao !== false; }
    if (dados.metasGlobais) { document.getElementById("meta-horas-mes").value = dados.metasGlobais.mes || 50; document.getElementById("meta-horas-ano").value = dados.metasGlobais.ano || 500; }
}
function salvarMetasGlobais() { dados.metasGlobais = { mes: parseInt(document.getElementById("meta-horas-mes").value) || 50, ano: parseInt(document.getElementById("meta-horas-ano").value) || 500 }; salvar(); }
function tocarSom() { const somId = dados.configTimer.som || 'sino'; const som = new Audio(AUDIOS[somId] || AUDIOS['sino']); som.play().catch(e => console.log("Som bloqueado pelo navegador")); }
function enviarNotificacao(titulo, corpo) { if (dados.configTimer.notificacao && Notification.permission === "granted") { new Notification(titulo, { body: corpo, icon: 'https://cdn-icons-png.flaticon.com/512/2693/2693507.png' }); } }
function gerenciarNotificacao(checkbox) { if (checkbox.checked && Notification.permission !== "granted") { Notification.requestPermission().then(permission => { if (permission !== "granted") { checkbox.checked = false; alert("Permissão negada."); } }); } salvarPreferenciasTimer(); }

/* === TIMER POMODORO (COM WEB WORKER) === */
function criarOuObterWorker() {
    if (!timerWorker) {
        timerWorker = new Worker(workerUrl);
        timerWorker.onmessage = function() {
            // Lógica principal rodando a cada "tick" do worker
            if (!dataTermino) return;
            
            tempoRestante = Math.ceil((dataTermino - Date.now()) / 1000);
            atualizarDisplay(tempoRestante);
            
            if (tempoRestante <= 0) {
                // Parar worker imediatamente para não disparar duas vezes
                timerWorker.postMessage('stop'); 
                tocarSom();
                dataTermino = null;
                alternarModo();
            }
        };
    }
    return timerWorker;
}

function registrarSessao(minutos) {
    const agora = new Date();
    const dataF = agora.toLocaleDateString() + " " + agora.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    let nomeMateria = document.getElementById("materia-atual").value.trim() || "Geral";
    
    // Adiciona ao histórico
    dados.historicoEstudos.unshift({ data: dataF, duracao: minutos+" min", materia: nomeMateria, tipo: "Foco" });
    if (dados.historicoEstudos.length > 15) dados.historicoEstudos.pop();
    
    // Atualiza acumulado da matéria
    let matObj = dados.materias.find(m => m.nome.toLowerCase() === nomeMateria.toLowerCase());
    if (matObj) { 
        matObj.tempoTotal += minutos; 
        matObj.ultimaDataDisplay = dataF; 
        matObj.ultimaDataISO = agora.toISOString();
    } else { 
        dados.materias.push({ nome: nomeMateria, tempoTotal: minutos, ultimaDataDisplay: dataF, ultimaDataISO: agora.toISOString() });
    }

    // Atualiza metas globais
    const chaveMes = `M_${agora.getMonth() + 1}_${agora.getFullYear()}`; const chaveAno = `Y_${agora.getFullYear()}`;
    dados.progressoGlobal[chaveMes] = (dados.progressoGlobal[chaveMes] || 0) + minutos; 
    dados.progressoGlobal[chaveAno] = (dados.progressoGlobal[chaveAno] || 0) + minutos;
    
    // XP
    dados.pontosAcumulados += (minutos * 2); // 2 XP por minuto estudado
    
    salvar(); // Salva e atualiza a tela
}

function contarSessoesHoje() { 
    const d = hoje();
    return dados.historicoEstudos.filter(i => i.data.startsWith(d) && i.tipo === "Foco").length; 
}

function iniciarTimer() {
    // Se já existe data de término, estamos "pausando"
    if (dataTermino !== null) { 
        if(timerWorker) timerWorker.postMessage('stop');
        dataTermino = null; 
        document.getElementById("btn-timer-principal").innerText = "Retomar"; 
        document.title = "⏸️ Pausado - Sistema Hardcore"; // Resetar título
        calcularPrevisaoTermino(); 
        return;
    }

    // Configuração Inicial (se for um novo início)
    if (tempoRestante === null || tempoRestante <= 0) {
        // Verifica Meta antes de começar
        const meta = parseInt(document.getElementById("meta-sessoes").value) || 1; 
        const sessoesRealizadas = contarSessoesHoje();
        if (emFoco && sessoesRealizadas >= meta) {
            if(!confirm("Meta diária atingida! Iniciar sessão extra?")) return;
        }
        
        const inputId = emFoco ? "input-foco" : "input-descanso";
        tempoRestante = (parseInt(document.getElementById(inputId).value) || 25) * 60; 
    }

    // Define o alvo e inicia o Worker
    dataTermino = Date.now() + (tempoRestante * 1000);
    document.getElementById("btn-timer-principal").innerText = "Pausar"; 
    calcularPrevisaoTermino();

    const worker = criarOuObterWorker();
    worker.postMessage('start');
}

function alternarModo() {
    if (emFoco) { 
        // Acabou o foco -> Registra e Verifica Meta
        const tempoFocado = parseInt(document.getElementById("input-foco").value) || 25;
        registrarSessao(tempoFocado); 
        
        const meta = parseInt(document.getElementById("meta-sessoes").value) || 1; 
        const sessoesRealizadas = contarSessoesHoje();
        
        if (sessoesRealizadas >= meta) { 
            enviarNotificacao("Meta Atingida!", "Parabéns! Você completou suas sessões."); 
            alert("🏆 Meta diária atingida! O timer foi pausado."); 
            resetarTimer(); 
            return; 
        }

        // Inicia Descanso
        emFoco = false;
        enviarNotificacao("Hora do Descanso!", "Relaxe um pouco.");
        tempoRestante = (parseInt(document.getElementById("input-descanso").value) || 5) * 60;
    } else {
        // Acabou o descanso -> Volta para Foco
        emFoco = true;
        enviarNotificacao("Hora de Focar!", "Vamos voltar ao trabalho!");
        tempoRestante = (parseInt(document.getElementById("input-foco").value) || 25) * 60;
    }

    // Atualiza UI
    document.getElementById("timer-status").innerText = emFoco ? "Status: Hora de Focar!" : "Status: Hora do Descanso!"; 
    document.getElementById("timer-status").style.color = emFoco ? "var(--secondary-color)" : "var(--primary-color)"; 
    atualizarDisplay(tempoRestante);

    // Auto-start após breve pausa
    setTimeout(() => { iniciarTimer(); }, 1500); 
}

function resetarTimer() {
    if(timerWorker) timerWorker.postMessage('stop'); 
    dataTermino = null; 
    emFoco = true;
    tempoRestante = (parseInt(document.getElementById("input-foco").value) || 25) * 60; 
    atualizarDisplay(tempoRestante); 
    document.getElementById("btn-timer-principal").innerText = "Iniciar Foco"; 
    document.getElementById("timer-status").innerText = "Status: Pronto para focar!";
    document.getElementById("timer-status").style.color = "var(--secondary-color)"; 
    document.title = "Sistema Pessoal Hardcore"; // Resetar título
    calcularPrevisaoTermino();
}

function atualizarDisplay(segundos) { 
    if (segundos < 0) segundos = 0; 
    const m = Math.floor(segundos/60).toString().padStart(2,'0');
    const s = (segundos%60).toString().padStart(2,'0');
    
    // Atualiza o Display na Tela
    document.getElementById("timer-minutos").innerText = m; 
    document.getElementById("timer-segundos").innerText = s;

    // Atualiza o Título da Aba (Para ver em outra tela)
    const icone = emFoco ? "🧠" : "☕";
    const estado = emFoco ? "Focando" : "Descanso";
    document.title = `(${m}:${s}) ${icone} ${estado}`;
}

function calcularPrevisaoTermino() {
    const el = document.getElementById("previsao-termino"); 
    if (!dados.configTimer.mostrarPrevisao || dataTermino === null) { el.classList.add("oculto"); return; }
    const termino = new Date(dataTermino); 
    el.innerText = `🏁 Termina às: ${termino.getHours().toString().padStart(2,'0')}:${termino.getMinutes().toString().padStart(2,'0')}`; 
    el.classList.remove("oculto");
}
function limparHistorico() { if(confirm("Limpar histórico recente?")) { dados.historicoEstudos = []; salvar(); } }
function removerMateria(nomeMateria) { 
    if(confirm(`Apagar a matéria "${nomeMateria}"?`)) { 
        dados.materias = dados.materias.filter(m => m.nome !== nomeMateria); 
        salvar(); 
    } 
}

/* === SISTEMA SRS (ANKI) === */
/* === CARDS SRS TIPO "CLOZE" (lacunas por trecho livre — pode ser parte de uma palavra ou várias palavras) === */
// Estado de marcação de lacunas, um por formulário ('srs' = Adicionar ao Deck, 'rapido' = modal de virar seleção em card).
// Não é salvo em `dados` — dura só enquanto o formulário está aberto.
let estadoClozeSRS = { ativo: false, segmentos: [] };
let estadoClozeRapido = { ativo: false, segmentos: [] };
let editarCardIdAtual = null; // id do card SRS em edição no formulário "Adicionar ao Deck" (null = modo criação normal)
let selecaoClozeAtual = { prefixo: null, inicio: 0, fim: 0 }; // último trecho selecionado na prévia (por índice de caractere)

function obterEstadoCloze(prefixo) { return prefixo === 'rapido' ? estadoClozeRapido : estadoClozeSRS; }
function idsFormularioCloze(prefixo) {
    return prefixo === 'rapido'
        ? { subtema: 'srs-rapido-subtema', resposta: 'srs-rapido-resposta', preview: 'srs-rapido-cloze-preview', botao: 'btn-cloze-rapido' }
        : { subtema: 'srs-subtema', resposta: 'srs-resposta', preview: 'srs-cloze-preview', botao: 'btn-cloze-srs' };
}

function alternarModoClozeSRS(prefixo) {
    const estado = obterEstadoCloze(prefixo);
    if (estado.ativo) { cancelarModoClozeSRS(prefixo); return; }

    const ids = idsFormularioCloze(prefixo);
    const inputSubtema = document.getElementById(ids.subtema);
    const frase = inputSubtema.value.trim();
    if (!frase) { alert("Digite a pergunta antes de marcar as lacunas."); return; }

    estado.ativo = true;
    estado.segmentos = [{ texto: frase, lacuna: false }]; // começa tudo como um único trecho visível (pergunta)
    inputSubtema.disabled = true;
    const btn = document.getElementById(ids.botao);
    btn.classList.add("ativo");
    btn.innerText = "✖ Cancelar marcação";
    renderizarPreviewCloze(prefixo);
    atualizarRespostaCloze(prefixo);
}

function cancelarModoClozeSRS(prefixo) {
    const estado = obterEstadoCloze(prefixo);
    estado.ativo = false;
    estado.segmentos = [];

    const ids = idsFormularioCloze(prefixo);
    const inputSubtema = document.getElementById(ids.subtema);
    if (inputSubtema) inputSubtema.disabled = false;
    const btn = document.getElementById(ids.botao);
    if (btn) { btn.classList.remove("ativo"); btn.innerText = "🕳 Marcar lacunas"; }
    const preview = document.getElementById(ids.preview);
    if (preview) { preview.classList.add("oculto"); preview.innerHTML = ""; }
    const respostaEl = document.getElementById(ids.resposta);
    if (respostaEl) respostaEl.readOnly = false;
}

// Mostra a frase como texto selecionável (igual selecionar pra copiar) — dá pra arrastar sobre parte
// de uma palavra, uma palavra inteira ou várias, e depois marcar exatamente aquele trecho como lacuna.
function renderizarPreviewCloze(prefixo) {
    const estado = obterEstadoCloze(prefixo);
    const ids = idsFormularioCloze(prefixo);
    const preview = document.getElementById(ids.preview);
    if (!preview) return;
    let html = `<span class="cloze-preview-aviso">Selecione um trecho (pode ser parte de uma palavra) e clique em "Marcar/Desmarcar lacuna":</span>`;
    html += `<div class="cloze-preview-texto" id="cloze-preview-texto-${prefixo}">`;
    estado.segmentos.forEach((seg, idx) => {
        html += `<span class="cloze-segmento${seg.lacuna ? ' marcado' : ''}" data-idx="${idx}">${escaparHtml(seg.texto)}</span>`;
    });
    html += `</div>`;
    html += `<div class="cloze-preview-botoes">
        <button type="button" class="btn-cloze-alternar" onclick="alternarSelecaoParaLacuna('${prefixo}')">🕳 Marcar/Desmarcar lacuna</button>
        <button type="button" class="btn-cloze-cancelar" onclick="cancelarModoClozeSRS('${prefixo}')">✖ Cancelar marcação</button>
    </div>`;
    preview.innerHTML = html;
    preview.classList.remove("oculto");

    const containerTexto = document.getElementById(`cloze-preview-texto-${prefixo}`);
    if (containerTexto) containerTexto.addEventListener("mouseup", () => capturarSelecaoCloze(prefixo, containerTexto));
}

// Guarda o trecho selecionado (em índice de caractere, relativo ao texto inteiro da prévia) pra usar
// quando o botão de marcar/desmarcar for clicado.
function capturarSelecaoCloze(prefixo, container) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return;

    const preRange = document.createRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(range.startContainer, range.startOffset);
    const inicio = preRange.toString().length;
    const fim = inicio + range.toString().length;

    if (fim > inicio) selecaoClozeAtual = { prefixo: prefixo, inicio: inicio, fim: fim };
}

// Junta segmentos vizinhos com o mesmo estado (lacuna ou não), pra não fragmentar demais o texto.
function mesclarSegmentosVizinhos(segmentos) {
    const resultado = [];
    segmentos.forEach(seg => {
        if (seg.texto === "") return;
        const ultimo = resultado[resultado.length - 1];
        if (ultimo && ultimo.lacuna === seg.lacuna) ultimo.texto += seg.texto;
        else resultado.push({ texto: seg.texto, lacuna: seg.lacuna });
    });
    return resultado;
}

// Pega o último trecho selecionado (capturarSelecaoCloze) e alterna o estado dele: se já era tudo
// lacuna, volta a ser pergunta; senão, vira lacuna (mesmo que seja só parte de uma palavra).
function alternarSelecaoParaLacuna(prefixo) {
    if (selecaoClozeAtual.prefixo !== prefixo || selecaoClozeAtual.fim <= selecaoClozeAtual.inicio) {
        alert("Selecione um trecho do texto primeiro (arraste o mouse sobre a palavra ou parte dela).");
        return;
    }
    const estado = obterEstadoCloze(prefixo);
    const inicio = selecaoClozeAtual.inicio, fim = selecaoClozeAtual.fim;

    const novosSegmentos = [];
    let cursor = 0;
    const estadosDentroDaSelecao = [];

    estado.segmentos.forEach(seg => {
        const inicioSeg = cursor;
        const fimSeg = cursor + seg.texto.length;
        cursor = fimSeg;

        const sobreposInicio = Math.max(inicioSeg, inicio);
        const sobreposFim = Math.min(fimSeg, fim);

        if (sobreposFim <= sobreposInicio) { novosSegmentos.push(seg); return; }

        if (sobreposInicio > inicioSeg) novosSegmentos.push({ texto: seg.texto.slice(0, sobreposInicio - inicioSeg), lacuna: seg.lacuna });

        estadosDentroDaSelecao.push(seg.lacuna);
        novosSegmentos.push({ texto: seg.texto.slice(sobreposInicio - inicioSeg, sobreposFim - inicioSeg), lacuna: seg.lacuna, __dentroSelecao: true });

        if (sobreposFim < fimSeg) novosSegmentos.push({ texto: seg.texto.slice(sobreposFim - inicioSeg), lacuna: seg.lacuna });
    });

    const jaEraTudoLacuna = estadosDentroDaSelecao.length > 0 && estadosDentroDaSelecao.every(l => l === true);
    novosSegmentos.forEach(seg => { if (seg.__dentroSelecao) { seg.lacuna = !jaEraTudoLacuna; delete seg.__dentroSelecao; } });

    estado.segmentos = mesclarSegmentosVizinhos(novosSegmentos);
    selecaoClozeAtual = { prefixo: null, inicio: 0, fim: 0 };
    window.getSelection().removeAllRanges();
    renderizarPreviewCloze(prefixo);
    atualizarRespostaCloze(prefixo);
}

// Preenche automaticamente o campo de resposta com os trechos marcados; trava (readonly) enquanto houver ao menos uma lacuna.
function atualizarRespostaCloze(prefixo) {
    const estado = obterEstadoCloze(prefixo);
    const ids = idsFormularioCloze(prefixo);
    const respostaEl = document.getElementById(ids.resposta);
    if (!respostaEl) return;
    const trechosLacuna = estado.segmentos.filter(s => s.lacuna).map(s => s.texto.trim()).filter(Boolean);
    respostaEl.value = trechosLacuna.join(", ");
    respostaEl.readOnly = trechosLacuna.length > 0;
}

// Monta o objeto do card: cloze (se houver lacunas marcadas no estado) ou normal (comportamento de sempre).
function construirCardObjetoSRS(tema, subtema, resposta, estadoCloze) {
    const temLacunas = estadoCloze && estadoCloze.ativo && estadoCloze.segmentos.some(s => s.lacuna);
    if (temLacunas) {
        return {
            id: Date.now(), tema: tema, subtema: subtema, tipo: "cloze",
            clozePartes: estadoCloze.segmentos.map(s => ({ texto: s.texto, lacuna: s.lacuna })),
            resposta: estadoCloze.segmentos.filter(s => s.lacuna).map(s => s.texto.trim()).filter(Boolean).join(", "),
            data_proxima_revisao: hojeISO(), intervalo_atual: 0, fator_facilidade: 2.5
        };
    }
    return { id: Date.now(), tema: tema, subtema: subtema, tipo: "normal", resposta: resposta, data_proxima_revisao: hojeISO(), intervalo_atual: 0, fator_facilidade: 2.5 };
}

// Extrai o texto e a resposta-alvo de um segmento cloze, aceitando tanto o formato novo ({texto, lacuna})
// quanto o formato antigo por palavra ({core, punct, espacoDepois, lacuna}), pra não quebrar cards já salvos.
function obterTextoSegmentoCloze(seg) {
    return seg.texto !== undefined ? seg.texto : (seg.core + seg.punct + (seg.espacoDepois || ""));
}
function obterRespostaCorretaSegmentoCloze(seg) {
    return (seg.texto !== undefined ? seg.texto : seg.core).trim();
}

// Renderiza a pergunta de um card cloze: um <input> por lacuna (revisão) ou, ao revelar, o que foi
// digitado colorido de azul (certo) ou vermelho (errado) — comparação sem diferenciar maiúsculas/espaços nas pontas.
function renderizarPerguntaCloze(item, revelado, respostasDigitadas) {
    if (!item.clozePartes) return item.subtema;
    let html = "";
    let idxLacuna = 0;
    item.clozePartes.forEach(seg => {
        const texto = obterTextoSegmentoCloze(seg);
        if (seg.lacuna) {
            const meuIndice = idxLacuna++;
            if (!revelado) {
                const largura = Math.max(4, Math.min(24, obterRespostaCorretaSegmentoCloze(seg).length + 2));
                html += `<input type="text" class="cloze-input-resposta" data-idx="${meuIndice}" style="width:${largura}ch" autocomplete="off" spellcheck="false">`;
            } else {
                const digitado = ((respostasDigitadas && respostasDigitadas[meuIndice]) || "").trim();
                const respostaCorreta = obterRespostaCorretaSegmentoCloze(seg);
                const correta = digitado !== "" && digitado.toLowerCase() === respostaCorreta.toLowerCase();
                if (digitado === "") {
                    html += `<span class="cloze-lacuna-revelada">${escaparHtml(texto)}</span>`;
                } else if (correta) {
                    html += `<span class="cloze-resposta-certa">${escaparHtml(digitado)}</span>`;
                } else {
                    html += `<span class="cloze-resposta-errada">${escaparHtml(digitado)}</span><span class="cloze-resposta-correta-hint"> (correto: ${escaparHtml(respostaCorreta)})</span>`;
                }
            }
        } else {
            html += escaparHtml(texto);
        }
    });
    return html;
}

function adicionarCardSRS() {
    const tema = document.getElementById("srs-tema").value.trim();
    const subtema = document.getElementById("srs-subtema").value.trim();
    const resposta = document.getElementById("srs-resposta").value.trim();
    if(!tema || !subtema) return alert("Preencha Tema e Subtema!");

    if (editarCardIdAtual) {
        const item = dados.srsItems.find(i => i.id === editarCardIdAtual);
        if (!item) { cancelarEdicaoCardSRS(); return; }

        const temLacunas = estadoClozeSRS.ativo && estadoClozeSRS.segmentos.some(s => s.lacuna);
        item.tema = tema;
        item.subtema = subtema;
        if (temLacunas) {
            item.tipo = "cloze";
            item.clozePartes = estadoClozeSRS.segmentos.map(s => ({ texto: s.texto, lacuna: s.lacuna }));
            item.resposta = estadoClozeSRS.segmentos.filter(s => s.lacuna).map(s => s.texto.trim()).filter(Boolean).join(", ");
        } else {
            item.tipo = "normal";
            delete item.clozePartes;
            item.resposta = resposta;
        }

        aplicarImagensPendentesNoCard(item, "srs").then(() => {
            cancelarEdicaoCardSRS();
            salvar();
            alert("Card atualizado! ✏️");
        });
        return;
    }

    const duplicado = dados.srsItems.some(i => i.tema.trim().toLowerCase() === tema.toLowerCase() && i.subtema.trim().toLowerCase() === subtema.toLowerCase());
    if (duplicado && !confirm("Já existe um card com esse tema e pergunta. Deseja adicionar mesmo assim?")) return;

    const novoCard = construirCardObjetoSRS(tema, subtema, resposta, estadoClozeSRS);
    aplicarImagensPendentesNoCard(novoCard, "srs").then(() => {
        dados.srsItems.push(novoCard);
        document.getElementById("srs-subtema").value = ""; document.getElementById("srs-resposta").value = "";
        cancelarModoClozeSRS('srs');
        resetarImagensPendentes('srs');
        salvar(); alert("Card adicionado ao Deck! 🧠");
    });
}

// Converte o formato antigo de card cloze (por palavra: core/punct/espacoDepois) pro formato novo
// (trechos livres: texto/lacuna), preservando o texto exatamente igual ao original.
function converterClozePartesParaSegmentos(clozePartes) {
    return mesclarSegmentosVizinhos(clozePartes.map(p => ({ texto: obterTextoSegmentoCloze(p), lacuna: p.lacuna })));
}

// Carrega um card (normal ou cloze) no formulário "Adicionar ao Deck" pra edição — reaproveita
// toda a UI de marcação de lacunas já existente, só reconstruindo o estado a partir do card salvo.
function carregarCardParaEdicao(idCard) {
    const item = dados.srsItems.find(i => i.id === idCard);
    if (!item) return;
    cancelarModoClozeSRS('srs'); // limpa qualquer marcação em andamento antes de carregar o card
    resetarImagensPendentes('srs');

    document.getElementById("srs-tema").value = item.tema;
    document.getElementById("srs-subtema").value = item.subtema;
    document.getElementById("srs-resposta").value = item.resposta || "";
    editarCardIdAtual = idCard;
    atualizarBotaoAdicionarCardSRS();

    if (item.imagemPerguntaId) carregarImagemSRS(item.imagemPerguntaId).then(blob => { if (blob) exibirPreviewImagemCard('srs', 'pergunta', blob); });
    if (item.imagemRespostaId) carregarImagemSRS(item.imagemRespostaId).then(blob => { if (blob) exibirPreviewImagemCard('srs', 'resposta', blob); });

    if (item.tipo === "cloze" && item.clozePartes) {
        estadoClozeSRS.ativo = true;
        estadoClozeSRS.segmentos = converterClozePartesParaSegmentos(item.clozePartes);
        document.getElementById("srs-subtema").disabled = true;
        const btn = document.getElementById("btn-cloze-srs");
        btn.classList.add("ativo");
        btn.innerText = "✖ Cancelar marcação";
        renderizarPreviewCloze("srs");
        atualizarRespostaCloze("srs");
    }

    document.getElementById("srs-tema").scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelarEdicaoCardSRS() {
    editarCardIdAtual = null;
    document.getElementById("srs-tema").value = "";
    document.getElementById("srs-subtema").value = "";
    document.getElementById("srs-resposta").value = "";
    cancelarModoClozeSRS("srs");
    resetarImagensPendentes("srs");
    atualizarBotaoAdicionarCardSRS();
}

function atualizarBotaoAdicionarCardSRS() {
    const btn = document.getElementById("btn-adicionar-card-srs");
    const btnCancelar = document.getElementById("btn-cancelar-edicao-srs");
    if (!btn || !btnCancelar) return;
    if (editarCardIdAtual) {
        btn.innerText = "💾 Salvar edição";
        btnCancelar.classList.remove("oculto");
    } else {
        btn.innerText = "+ Card";
        btnCancelar.classList.add("oculto");
    }
}

function sincronizarTemasSRS() {
    const temasReaisAtuais = new Set(dados.srsItems.map(i => i.tema));
    temasReaisAtuais.forEach(t => {
        if (!srsTemasConhecidos.has(t)) {
            srsTemasConhecidos.add(t);
            srsTemasSelecionados.add(t); // tema novo entra selecionado por padrão
        }
    });
    [...srsTemasConhecidos].forEach(t => {
        if (!temasReaisAtuais.has(t)) { srsTemasConhecidos.delete(t); srsTemasSelecionados.delete(t); }
    });
    atualizarDatalistTemas();
}

// Alimenta o <datalist> usado pelo autocomplete dos campos de tema (form de adicionar, modal rápido e edição inline na lista).
function atualizarDatalistTemas() {
    const datalist = document.getElementById("lista-temas-srs");
    if (!datalist) return;
    datalist.innerHTML = [...srsTemasConhecidos].sort((a, b) => a.localeCompare(b, "pt-BR")).map(t => `<option value="${escaparHtml(t)}">`).join("");
}

// --- Árvore hierárquica de temas (separador "::") ---
function construirArvoreTemas(temasUnicos) {
    const raiz = {};
    temasUnicos.forEach(tema => {
        const partes = tema.split('::').map(p => p.trim()).filter(p => p !== '');
        let nivelAtual = raiz;
        let caminhoAcumulado = '';
        partes.forEach((parte, idx) => {
            caminhoAcumulado = caminhoAcumulado ? caminhoAcumulado + '::' + parte : parte;
            if (!nivelAtual[parte]) nivelAtual[parte] = { nome: parte, caminho: caminhoAcumulado, filhos: {}, real: false };
            if (idx === partes.length - 1) nivelAtual[parte].real = true;
            nivelAtual = nivelAtual[parte].filhos;
        });
    });
    return raiz;
}
function coletarCaminhosReais(node) {
    let resultado = node.real ? [node.caminho] : [];
    Object.values(node.filhos).forEach(filho => { resultado = resultado.concat(coletarCaminhosReais(filho)); });
    return resultado;
}
function encontrarNoPorCaminho(arvore, caminho) {
    const partes = caminho.split('::');
    let nivelAtual = arvore, node = null;
    for (const parte of partes) {
        node = nivelAtual[parte];
        if (!node) return null;
        nivelAtual = node.filhos;
    }
    return node;
}
function estadoNoTema(node) {
    const reais = coletarCaminhosReais(node);
    if (reais.length === 0) return 'desmarcado';
    const marcados = reais.filter(c => srsTemasSelecionados.has(c)).length;
    if (marcados === 0) return 'desmarcado';
    if (marcados === reais.length) return 'marcado';
    return 'indeterminado';
}
function renderizarNoTemaHTML(node) {
    const estado = estadoNoTema(node);
    const temFilhos = Object.keys(node.filhos).length > 0;
    const expandido = srsNosExpandidos.has(node.caminho);
    const seta = temFilhos
        ? `<span class="srs-arvore-seta" onclick="alternarExpansaoTema('${node.caminho}', event)">${expandido ? '▾' : '▸'}</span>`
        : `<span class="srs-arvore-seta-vazia"></span>`;
    let html = `<li class="srs-arvore-item"><div class="srs-arvore-linha"><label class="srs-arvore-label">${seta}<input type="checkbox" ${estado === 'marcado' ? 'checked' : ''} ${estado === 'indeterminado' ? 'data-indeterminado="true"' : ''} onclick="alternarSelecaoTema('${node.caminho}')"><span>${escaparHtml(node.nome)}</span></label><button type="button" class="btn-excluir-tema" onclick="excluirTema('${node.caminho}')" title="Excluir este tema e todos os cards dele">🗑️</button></div>`;
    if (temFilhos) {
        html += `<ul class="srs-arvore-filhos ${expandido ? '' : 'oculto'}">`;
        Object.values(node.filhos).sort((a,b) => a.nome.localeCompare(b.nome)).forEach(filho => { html += renderizarNoTemaHTML(filho); });
        html += `</ul>`;
    }
    html += `</li>`;
    return html;
}
function renderizarArvoreTemasSRS() {
    const container = document.getElementById("srs-arvore-temas");
    if (!container) return;
    arvoreTemasSRS = construirArvoreTemas([...srsTemasConhecidos]);
    if (srsTemasConhecidos.size === 0) { container.innerHTML = "<p class='biblioteca-vazio'>Nenhum tema cadastrado ainda.</p>"; return; }
    let html = "<ul class='srs-arvore-raiz'>";
    Object.values(arvoreTemasSRS).sort((a,b) => a.nome.localeCompare(b.nome)).forEach(node => { html += renderizarNoTemaHTML(node); });
    html += "</ul>";
    container.innerHTML = html;
    container.querySelectorAll('input[data-indeterminado="true"]').forEach(el => { el.indeterminate = true; });
}
function alternarExpansaoTema(caminho, event) {
    event.stopPropagation();
    if (srsNosExpandidos.has(caminho)) srsNosExpandidos.delete(caminho); else srsNosExpandidos.add(caminho);
    renderizarArvoreTemasSRS();
}
function alternarSelecaoTema(caminho) {
    const node = encontrarNoPorCaminho(arvoreTemasSRS, caminho);
    if (!node) return;
    const marcarTudo = estadoNoTema(node) !== 'marcado';
    coletarCaminhosReais(node).forEach(c => { if (marcarTudo) srsTemasSelecionados.add(c); else srsTemasSelecionados.delete(c); });
    renderizarArvoreTemasSRS();
    atualizarBotaoResumoSRS();
}
function marcarTodosTemasSRS() { srsTemasSelecionados = new Set(srsTemasConhecidos); renderizarArvoreTemasSRS(); atualizarBotaoResumoSRS(); }
function limparTodosTemasSRS() { srsTemasSelecionados = new Set(); renderizarArvoreTemasSRS(); atualizarBotaoResumoSRS(); }
function abrirModalTemasSRS() {
    renderizarArvoreTemasSRS();
    document.getElementById("srs-temas-modal").classList.remove("modal-oculto");
}
function fecharModalTemasSRS() { document.getElementById("srs-temas-modal").classList.add("modal-oculto"); }

// Apaga do IndexedDB as imagens/áudios anexados a um card SRS (chamado antes de remover o card dos
// dados, senão o arquivo fica órfão guardado pra sempre, ocupando espaço à toa).
function excluirMidiasDoCardSRS(card) {
    const tarefas = [];
    if (card.imagemPerguntaId) tarefas.push(excluirImagemSRS(card.imagemPerguntaId).catch(() => {}));
    if (card.imagemRespostaId) tarefas.push(excluirImagemSRS(card.imagemRespostaId).catch(() => {}));
    if (card.midiaPerguntaId) tarefas.push(excluirImagemSRS(card.midiaPerguntaId).catch(() => {}));
    if (card.midiaRespostaId) tarefas.push(excluirImagemSRS(card.midiaRespostaId).catch(() => {}));
    return Promise.all(tarefas);
}

// NOVO: exclui um tema inteiro (e, por causa da hierarquia "::", todos os subtemas dele também) junto
// com TODOS os cards que pertencem a ele — antes só dava pra excluir card por card.
function excluirTema(caminho) {
    const node = encontrarNoPorCaminho(arvoreTemasSRS, caminho);
    if (!node) return;
    const caminhosReais = coletarCaminhosReais(node);
    const cardsAlvo = dados.srsItems.filter(i => caminhosReais.includes(i.tema));
    if (cardsAlvo.length === 0) { alert("Nenhum card encontrado nesse tema."); return; }

    fecharModalTemasSRS(); // evita sobrepor com o modal de confirmação abaixo
    pedirConfirmacaoPerigosa(
        `Excluir o tema "${node.nome}" e todos os ${cardsAlvo.length} card(s) dele (incluindo subtemas)? Essa ação não pode ser desfeita.`,
        () => {
            Promise.all(cardsAlvo.map(excluirMidiasDoCardSRS)).finally(() => {
                const idsParaExcluir = new Set(cardsAlvo.map(c => c.id));
                dados.srsItems = dados.srsItems.filter(i => !idsParaExcluir.has(i.id));
                srsNosExpandidos.delete(caminho);
                salvar();
                alert(`Tema excluído: ${cardsAlvo.length} card(s) removido(s).`);
            });
        }
    );
}
function confirmarSelecaoTemasSRS() {
    fecharModalTemasSRS();
    carregarRevisaoSRS();
    renderizarListaSRS();
    atualizarEstatisticasSRS();
}
function atualizarBotaoResumoSRS() {
    const btn = document.getElementById("btn-escolher-temas-srs");
    if (!btn) return;
    const total = srsTemasConhecidos.size;
    const selecionados = srsTemasSelecionados.size;
    if (total === 0) btn.innerText = "🗂️ Nenhum tema cadastrado";
    else if (selecionados === total) btn.innerText = "🗂️ Todos os temas";
    else if (selecionados === 0) btn.innerText = "🗂️ Nenhum tema selecionado";
    else btn.innerText = `🗂️ ${selecionados}/${total} temas selecionados`;
}

let urlsImagemRevisaoAtual = [];
function limparUrlsImagemRevisao() {
    urlsImagemRevisaoAtual.forEach(u => URL.revokeObjectURL(u));
    urlsImagemRevisaoAtual = [];
}
function exibirImagensRevisaoAtual(item) {
    if (!item) return;
    if (item.imagemPerguntaId) {
        carregarImagemSRS(item.imagemPerguntaId).then(blob => {
            const el = document.getElementById("srs-imagem-pergunta-atual");
            if (!blob || !el) return;
            const url = URL.createObjectURL(blob);
            urlsImagemRevisaoAtual.push(url);
            el.innerHTML = `<img src="${url}" alt="Imagem da pergunta">`;
            el.classList.remove("oculto");
        }).catch(() => {});
    }
    if (item.imagemRespostaId) {
        carregarImagemSRS(item.imagemRespostaId).then(blob => {
            const el = document.getElementById("srs-imagem-resposta-atual");
            if (!blob || !el) return;
            const url = URL.createObjectURL(blob);
            urlsImagemRevisaoAtual.push(url);
            el.innerHTML = `<img src="${url}" alt="Imagem da resposta">`;
            el.classList.remove("oculto");
        }).catch(() => {});
    }
    if (item.midiaPerguntaId) {
        carregarImagemSRS(item.midiaPerguntaId).then(blob => {
            const el = document.getElementById("srs-midia-pergunta-atual");
            if (!blob || !el) return;
            const url = URL.createObjectURL(blob);
            urlsImagemRevisaoAtual.push(url);
            el.innerHTML = item.midiaPerguntaTipo === "video" ? `<video src="${url}" controls></video>` : `<audio src="${url}" controls></audio>`;
            el.classList.remove("oculto");
        }).catch(() => {});
    }
    if (item.midiaRespostaId) {
        carregarImagemSRS(item.midiaRespostaId).then(blob => {
            const el = document.getElementById("srs-midia-resposta-atual");
            if (!blob || !el) return;
            const url = URL.createObjectURL(blob);
            urlsImagemRevisaoAtual.push(url);
            el.innerHTML = item.midiaRespostaTipo === "video" ? `<video src="${url}" controls></video>` : `<audio src="${url}" controls></audio>`;
            el.classList.remove("oculto");
        }).catch(() => {});
    }
}

// ============================================================
// === IMPORTAÇÃO DE BARALHOS DO ANKI (.apkg) ===
// ============================================================

let sqlJsInstancia = null;
function carregarSqlJs() {
    if (sqlJsInstancia) return Promise.resolve(sqlJsInstancia);
    return initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/${file}` })
        .then(SQL => { sqlJsInstancia = SQL; return SQL; });
}

function mostrarModalImportandoAnki(mostrar) {
    const modal = document.getElementById("importando-anki-modal");
    if (modal) modal.classList.toggle("modal-oculto", !mostrar);
}

// NOVO: o resultado da importação (e principalmente os motivos de falha) vinha num alert() — texto de
// alert() não pode ser selecionado/copiado na maioria dos navegadores. Agora mostramos num modal com
// um <textarea readonly> (selecionável e copiável normalmente) e um botão de copiar.
function mostrarResultadoImportacao(titulo, emoji, texto) {
    const modal = document.getElementById("resultado-importacao-modal");
    if (!modal) { alert(texto); return; } // fallback caso o HTML esteja desatualizado
    document.getElementById("resultado-importacao-titulo").innerText = titulo;
    document.getElementById("resultado-importacao-emoji").innerText = emoji;
    document.getElementById("resultado-importacao-texto").value = texto;
    modal.classList.remove("modal-oculto");
}
function fecharModalResultadoImportacao() {
    const modal = document.getElementById("resultado-importacao-modal");
    if (modal) modal.classList.add("modal-oculto");
}
function copiarResultadoImportacao(botaoEl) {
    const textarea = document.getElementById("resultado-importacao-texto");
    if (!textarea) return;
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length); // necessário em alguns navegadores mobile

    const avisar = (ok) => {
        if (!botaoEl) return;
        const textoOriginal = "📋 Copiar texto";
        botaoEl.innerText = ok ? "✅ Copiado!" : "Selecione o texto e copie com Ctrl+C";
        setTimeout(() => { botaoEl.innerText = textoOriginal; }, 2500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textarea.value).then(() => avisar(true)).catch(() => avisar(false));
    } else {
        try { avisar(document.execCommand("copy")); } catch (e) { avisar(false); }
    }
}

function importarApkg(event) {
    const arquivo = event.target.files[0];
    if (!arquivo) return;
    event.target.value = "";

    mostrarModalImportandoAnki(true);

    setTimeout(() => {
        processarImportacaoApkg(arquivo)
            .then(resumo => {
                mostrarModalImportandoAnki(false);
                salvar();
                let msg = `✅ ${resumo.sucesso} card(s) importado(s)\n⚠️ ${resumo.midiaNaoSuportada} card(s) com mídia não suportada (texto importado normalmente)\n❌ ${resumo.falhas} card(s) que falharam`;
                if (resumo.exemplosFalha.length > 0) {
                    msg += `\n\nExemplos de erro (copie esse texto e cole na conversa se quiser que eu investigue):\n- ${resumo.exemplosFalha.join("\n- ")}`;
                }
                const houveFalha = resumo.falhas > 0;
                mostrarResultadoImportacao(houveFalha ? "Importação concluída com falhas" : "Importação concluída", houveFalha ? "⚠️" : "✅", msg);
            })
            .catch(err => {
                console.error("Erro ao importar .apkg:", err);
                mostrarModalImportandoAnki(false);
                const detalheTecnico = (err && err.message) ? err.message : String(err);
                const msg = `Não foi possível importar esse arquivo.\n\nVerifique se é um .apkg válido exportado do Anki (baralhos muito novos, compactados com zstd, ainda não são suportados).\n\nErro técnico (copie esse texto e cole na conversa se quiser que eu investigue):\n${detalheTecnico}`;
                mostrarResultadoImportacao("Falha ao importar", "❌", msg);
            });
    }, 50);
}

function processarImportacaoApkg(arquivo) {
    const resumo = { sucesso: 0, midiaNaoSuportada: 0, falhas: 0, exemplosFalha: [] };

    return Promise.all([JSZip.loadAsync(arquivo), carregarSqlJs()]).then(([zip, SQL]) => {
        const arquivoMedia = zip.file("media");
        const promessaMedia = arquivoMedia ? arquivoMedia.async("string").then(txt => JSON.parse(txt)) : Promise.resolve({});

        return promessaMedia.then(mapaMedia => {
            const nomeParaIndice = {};
            Object.keys(mapaMedia).forEach(indice => { nomeParaIndice[mapaMedia[indice]] = indice; });

            const arquivoDb = zip.file("collection.anki21") || zip.file("collection.anki2");
            if (!arquivoDb) throw new Error("collection.anki2/anki21 não encontrado no .apkg.");

            return arquivoDb.async("uint8array").then(bytes => {
                const db = new SQL.Database(bytes);
                try {
                    return processarBancoAnki(db, zip, nomeParaIndice, resumo);
                } finally {
                    db.close();
                }
            });
        });
    }).then(() => resumo);
}

// Guarda até 5 exemplos de erro (com mensagem real) pra aparecer no resumo final, em vez de só contar.
function registrarFalha(resumo, mensagem) {
    resumo.falhas++;
    if (resumo.exemplosFalha.length < 5) resumo.exemplosFalha.push(mensagem);
}

function processarBancoAnki(db, zip, nomeParaIndice, resumo) {
    const colRows = db.exec("SELECT decks, models FROM col LIMIT 1");
    if (!colRows.length) throw new Error("Banco do Anki sem a tabela 'col' esperada.");
    const decksJson = JSON.parse(colRows[0].values[0][0]);
    const modelsJson = JSON.parse(colRows[0].values[0][1]);

    const linhas = db.exec(`
        SELECT notes.id, notes.mid, notes.flds,
               (SELECT cards.did FROM cards WHERE cards.nid = notes.id LIMIT 1) as did
        FROM notes
    `);
    if (!linhas.length) return Promise.resolve();

    const colunas = linhas[0].columns;
    const idxMid = colunas.indexOf("mid"), idxFlds = colunas.indexOf("flds"), idxDid = colunas.indexOf("did");

    const tarefas = linhas[0].values.map(linha => {
        const mid = String(linha[idxMid]);
        const did = String(linha[idxDid]);
        const flds = linha[idxFlds].split("\x1f");
        const modelo = modelsJson[mid];
        const deckInfo = decksJson[did];
        const tema = deckInfo ? deckInfo.name : "Importado do Anki";

        if (!modelo) { registrarFalha(resumo, `Tipo de nota (modelo) não encontrado no banco (mid ${mid}).`); return Promise.resolve(); }

        return converterNotaAnki(modelo, flds, tema, zip, nomeParaIndice)
            .then(card => {
                if (!card) { registrarFalha(resumo, "Conversão não gerou um card válido."); return; }
                if (card._midiaNaoSuportada) resumo.midiaNaoSuportada++;
                delete card._midiaNaoSuportada;
                dados.srsItems.push(card);
                resumo.sucesso++;
            })
            .catch(err => { registrarFalha(resumo, `[${modelo.name || "modelo sem nome"}] ${err.message || err}`); });
    });

    return Promise.all(tarefas);
}

function converterNotaAnki(modelo, flds, tema, zip, nomeParaIndice) {
    const ehCloze = modelo.type === 1 || /cloze/i.test(modelo.name || "");
    if (ehCloze) return converterNotaClozeAnki(flds[0] || "", tema, zip, nomeParaIndice);

    const campoFrente = flds[0] || "";
    let campoVerso = flds[1] || "";

    // NOVO: tipos de nota mais elaborados (ex: add-on Migaku, comum em decks de chinês) não guardam
    // TODA a resposta só no 2º campo — o card real no Anki combina vários campos (palavra, definição,
    // pinyin, imagem, áudio...) no verso, mesmo quando o 2º campo (aqui usado como base) também tem
    // conteúdo. Por isso sempre juntamos os campos extras não vazios (com o nome de cada um), não só
    // quando o 2º campo vem vazio — senão imagem/áudio desses campos extras nunca apareciam no card.
    if (modelo.flds && flds.length > 2) {
        const nomesCampos = modelo.flds.map(f => f.name);
        const extras = [];
        for (let i = 2; i < flds.length; i++) {
            const bruto = flds[i] || "";
            // Um campo só de imagem/áudio (ex: "Screenshot" com só um <img>) não tem "texto" depois de
            // tirar as tags, mas não pode ser descartado como vazio — senão a imagem/áudio dele some.
            const temConteudo = bruto.replace(/<\/?[^>]+>/g, "").trim() || /<img[^>]+src=/i.test(bruto) || /\[sound:/i.test(bruto);
            if (temConteudo) extras.push(`${nomesCampos[i] || ("Campo " + i)}: ${bruto}`);
        }
        if (extras.length > 0) {
            campoVerso = campoVerso.trim() ? [campoVerso, ...extras].join("<br>") : extras.join("<br>");
        }
    }

    return converterNotaBasicaAnki(campoFrente, campoVerso, tema, zip, nomeParaIndice);
}

// Um lado do card só é considerado "vazio de verdade" se não tiver NEM texto NEM imagem/mídia —
// cards que são só uma imagem (comuns em baralhos de anatomia, mapas, bandeiras etc.) são válidos.
function converterNotaBasicaAnki(campoFrente, campoVerso, tema, zip, nomeParaIndice) {
    return Promise.all([
        extrairMidiaDoCampo(campoFrente, zip, nomeParaIndice),
        extrairMidiaDoCampo(campoVerso, zip, nomeParaIndice)
    ]).then(([frente, verso]) => {
        const frenteVazia = !frente.texto.trim() && !frente.imagemId && !frente.midiaId;
        const versoVazio = !verso.texto.trim() && !verso.imagemId && !verso.midiaId;
        if (frenteVazia || versoVazio) throw new Error(`Frente ou Verso sem nenhum conteúdo (nem texto, nem imagem/mídia). Frente: "${campoFrente.slice(0, 60)}" | Verso: "${campoVerso.slice(0, 60)}"`);
        const card = {
            id: Date.now() + Math.floor(Math.random() * 1000000),
            tema: tema, subtema: frente.texto, resposta: verso.texto, tipo: "normal",
            data_proxima_revisao: hojeISO(), intervalo_atual: 0, fator_facilidade: 2.5
        };
        if (frente.imagemId) card.imagemPerguntaId = frente.imagemId;
        if (verso.imagemId) card.imagemRespostaId = verso.imagemId;
        if (frente.midiaId) { card.midiaPerguntaId = frente.midiaId; card.midiaPerguntaTipo = frente.midiaTipo; }
        if (verso.midiaId) { card.midiaRespostaId = verso.midiaId; card.midiaRespostaTipo = verso.midiaTipo; }
        card._midiaNaoSuportada = frente.midiaNaoSuportada || verso.midiaNaoSuportada;
        return card;
    });
}

function converterNotaClozeAnki(campoTexto, tema, zip, nomeParaIndice) {
    return extrairMidiaDoCampo(campoTexto, zip, nomeParaIndice).then(processado => {
        const semNada = !processado.texto.trim() && !processado.imagemId && !processado.midiaId;
        if (semNada) throw new Error(`Nota cloze sem nenhum conteúdo. Campo original: "${campoTexto.slice(0, 60)}"`);
        const segmentos = parsearClozeAnki(processado.texto);
        if (!segmentos.some(s => s.lacuna)) throw new Error(`Nota cloze sem nenhuma lacuna válida (esperava {{c1::...}}). Campo: "${campoTexto.slice(0, 60)}"`);
        const resposta = segmentos.filter(s => s.lacuna).map(s => s.texto.trim()).filter(Boolean).join(", ");
        const subtemaExibicao = segmentos.map(s => s.texto).join("");
        const card = {
            id: Date.now() + Math.floor(Math.random() * 1000000),
            tema: tema, subtema: subtemaExibicao, resposta: resposta, tipo: "cloze", clozePartes: segmentos,
            data_proxima_revisao: hojeISO(), intervalo_atual: 0, fator_facilidade: 2.5
        };
        if (processado.imagemId) card.imagemPerguntaId = processado.imagemId;
        if (processado.midiaId) { card.midiaPerguntaId = processado.midiaId; card.midiaPerguntaTipo = processado.midiaTipo; }
        card._midiaNaoSuportada = processado.midiaNaoSuportada;
        return card;
    });
}

function parsearClozeAnki(texto) {
    const segmentos = [];
    const regex = /\{\{c\d+::(.*?)(?:::.*?)?\}\}/g;
    let ultimoIndice = 0, match;
    while ((match = regex.exec(texto)) !== null) {
        if (match.index > ultimoIndice) segmentos.push({ texto: texto.slice(ultimoIndice, match.index), lacuna: false });
        segmentos.push({ texto: match[1], lacuna: true });
        ultimoIndice = regex.lastIndex;
    }
    if (ultimoIndice < texto.length) segmentos.push({ texto: texto.slice(ultimoIndice), lacuna: false });
    return segmentos.filter(s => s.texto !== "");
}

function extrairMidiaDoCampo(campoHtml, zip, nomeParaIndice) {
    let texto = campoHtml || "";
    let imagemId = null, midiaId = null, midiaTipo = null, midiaNaoSuportada = false;
    const tarefas = [];

    const matchImg = texto.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    if (matchImg) {
        texto = texto.replace(matchImg[0], "");
        const indice = nomeParaIndice[matchImg[1]];
        if (indice !== undefined && zip.file(indice)) {
            tarefas.push(
                zip.file(indice).async("blob").then(blob => {
                    const novoId = `anki_img_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
                    return salvarImagemSRS(novoId, blob).then(() => { imagemId = novoId; });
                }).catch(() => { midiaNaoSuportada = true; })
            );
        } else {
            midiaNaoSuportada = true;
        }
    }

    const matchSom = texto.match(/\[sound:([^\]]+)\]/i);
    if (matchSom) {
        texto = texto.replace(matchSom[0], "");
        const nomeArquivo = matchSom[1];
        const extensao = (nomeArquivo.split(".").pop() || "").toLowerCase();
        const tipo = ["mp4", "webm", "mov", "ogv"].includes(extensao) ? "video" : "audio";
        const indice = nomeParaIndice[nomeArquivo];
        if (indice !== undefined && zip.file(indice)) {
            tarefas.push(
                zip.file(indice).async("blob").then(blob => {
                    const novoId = `anki_midia_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
                    return salvarImagemSRS(novoId, blob).then(() => { midiaId = novoId; midiaTipo = tipo; });
                }).catch(() => { midiaNaoSuportada = true; })
            );
        } else {
            midiaNaoSuportada = true;
        }
    }

    texto = texto.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?[^>]+>/g, "").trim();
    texto = converterSintaxeMigaku(texto);

    return Promise.all(tarefas).then(() => ({ texto, imagemId, midiaId, midiaTipo, midiaNaoSuportada }));
}

// NOVO: o add-on Migaku (comum em decks de chinês) guarda cada palavra no formato
// "caractere[pinyin_com_tom_numerico;classe_gramatical]" e só converte pra pinyin com acento na hora
// de exibir, via um JavaScript embutido no template do card — que a gente não executa. Sem isso, o
// texto importado ficava com os colchetes crus (ex: "一点[yi1 dian3;m]"). Convertemos aqui pra texto
// legível (ex: "一点 (yīdiǎn)"), com a mesma lógica de tom→acento que o script deles usa.
function decodificarSilabaPinyin(silaba) {
    const substituicoes = {
        a: ['ā', 'á', 'ǎ', 'à'], e: ['ē', 'é', 'ě', 'è'], u: ['ū', 'ú', 'ǔ', 'ù'],
        i: ['ī', 'í', 'ǐ', 'ì'], o: ['ō', 'ó', 'ǒ', 'ò'], 'ü': ['ǖ', 'ǘ', 'ǚ', 'ǜ']
    };
    const medias = ['i', 'u', 'ü'];
    if (!silaba) return silaba;
    const tom = parseInt(silaba[silaba.length - 1], 10);
    if (isNaN(tom) || tom < 1 || tom > 5) return silaba; // não é sílaba com tom numérico no final
    const semV = silaba.replace(/v/g, 'ü');
    if (tom === 5) return semV.slice(0, -1); // tom neutro: só tira o número, sem acento
    for (let i = 0; i < semV.length; i++) {
        const c1 = semV[i], c2 = semV[i + 1];
        if (medias.includes(c1) && substituicoes[c2]) return semV.slice(0, i + 1) + substituicoes[c2][tom - 1] + semV.slice(i + 2, -1);
        if (substituicoes[c1]) return semV.slice(0, i) + substituicoes[c1][tom - 1] + semV.slice(i + 1, -1);
    }
    return silaba;
}
function converterSintaxeMigaku(texto) {
    if (!texto || texto.indexOf('[') === -1) return texto;
    return texto.replace(/([一-鿿]+?)\[(.*?)\]/g, (match, hanzi, colchete) => {
        const leitura = (colchete.split(';')[0] || '').trim();
        const silabas = leitura.match(/\S+?\d/g) || [];
        if (silabas.length === 0) return hanzi;
        const pinyin = silabas.map(decodificarSilabaPinyin).join('');
        return `${hanzi} (${pinyin})`;
    });
}

function carregarRevisaoSRS() {
    const areaDisplay = document.getElementById("srs-card-display");
    const controls = document.getElementById("srs-controls");
    const feedback = document.getElementById("srs-feedback");
    const btnRevelar = document.getElementById("btn-revelar-resposta");
    if(!areaDisplay) return;

    const hojeData = hojeISO();
    const filtroParcial = srsTemasSelecionados.size < srsTemasConhecidos.size;
    let paraRevisar = dados.srsItems.filter(item => item.data_proxima_revisao <= hojeData && srsTemasSelecionados.has(item.tema));

    // Evita reconstruir o card que já está em revisão (perdendo a resposta revelada ou as lacunas
    // já digitadas) quando um salvar() de OUTRA parte do app — ex: uma sessão de Pomodoro terminando
    // em segundo plano — dispara atualizar()/carregarRevisaoSRS() de novo sem o usuário ter avançado.
    if (cardAtualRevisao && paraRevisar.length > 0 && paraRevisar[0].id === cardAtualRevisao.id) {
        return;
    }

    limparUrlsImagemRevisao();
    respostaRevelada = false;

    if(paraRevisar.length === 0) {
        areaDisplay.innerHTML = `<h3>🎉 Tudo em dia!</h3><p>Você revisou todos os cards${filtroParcial ? " dos temas selecionados" : ""} por hoje.</p>`;
        controls.classList.add("oculto");
        if (btnRevelar) btnRevelar.classList.add("oculto");
        feedback.innerText = "";
        cardAtualRevisao = null;
    } else {
        cardAtualRevisao = paraRevisar[0];
        const ehCloze = cardAtualRevisao.tipo === "cloze" && cardAtualRevisao.clozePartes;
        const perguntaHtml = ehCloze ? renderizarPerguntaCloze(cardAtualRevisao, false) : escaparHtml(cardAtualRevisao.subtema);
               const blocoResposta = ehCloze ? "" : `<div id="srs-resposta-area" class="oculto" style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed var(--border-color); font-size: 1em; color: var(--secondary-color);"><div id="srs-imagem-resposta-atual" class="srs-card-imagem oculto"></div><div id="srs-midia-resposta-atual" class="srs-card-midia oculto"></div>${cardAtualRevisao.resposta ? escaparHtml(cardAtualRevisao.resposta) : '<em style="color:var(--text-secondary);">(sem resposta cadastrada)</em>'}</div>`;
        areaDisplay.innerHTML = `<div style="font-size: 0.9em; color: var(--secondary-color); margin-bottom:10px;">${escaparHtml(cardAtualRevisao.tema)}</div><div id="srs-imagem-pergunta-atual" class="srs-card-imagem oculto"></div><div id="srs-midia-pergunta-atual" class="srs-card-midia oculto"></div><div id="srs-pergunta-atual" style="font-size: 1.4em; font-weight: bold;">${perguntaHtml}</div>${blocoResposta}<div style="margin-top: 15px; font-size: 0.8em; color: #999;">Intervalo atual: ${cardAtualRevisao.intervalo_atual} dias</div>`;;
        controls.classList.add("oculto");
        if (btnRevelar) btnRevelar.classList.remove("oculto");
        feedback.innerText = "Pense na resposta e depois revele.";
        exibirImagensRevisaoAtual(cardAtualRevisao);
    }
}

function revelarRespostaSRS() {
    respostaRevelada = true;
    if (cardAtualRevisao && cardAtualRevisao.tipo === "cloze" && cardAtualRevisao.clozePartes) {
        const perguntaEl = document.getElementById("srs-pergunta-atual");
        const respostasDigitadas = [];
        if (perguntaEl) {
            perguntaEl.querySelectorAll(".cloze-input-resposta").forEach(input => {
                respostasDigitadas[parseInt(input.dataset.idx, 10)] = input.value;
            });
            perguntaEl.innerHTML = renderizarPerguntaCloze(cardAtualRevisao, true, respostasDigitadas);
        }
    } else {
        const respostaArea = document.getElementById("srs-resposta-area");
        if (respostaArea) respostaArea.classList.remove("oculto");
    }
    const btnRevelar = document.getElementById("btn-revelar-resposta");
    if (btnRevelar) btnRevelar.classList.add("oculto");
    document.getElementById("srs-controls").classList.remove("oculto");
    document.getElementById("srs-feedback").innerText = "Como foi sua memória?";
}

function processarRevisaoSRS(qualidade) {
    if(!cardAtualRevisao) return;
    let novoIntervalo = 0;
    if (qualidade === 'dificil') novoIntervalo = 1;
    else if (qualidade === 'bom') novoIntervalo = (cardAtualRevisao.intervalo_atual === 0) ? 1 : Math.ceil(cardAtualRevisao.intervalo_atual * cardAtualRevisao.fator_facilidade);
    else if (qualidade === 'facil') { novoIntervalo = (cardAtualRevisao.intervalo_atual === 0) ? 4 : Math.ceil(cardAtualRevisao.intervalo_atual * cardAtualRevisao.fator_facilidade * 1.3); cardAtualRevisao.fator_facilidade += 0.15; }
    
    cardAtualRevisao.intervalo_atual = novoIntervalo;
    const dataObj = new Date(); dataObj.setDate(dataObj.getDate() + novoIntervalo);
    cardAtualRevisao.data_proxima_revisao = dataObj.toISOString().split('T')[0];
    dados.pontosAcumulados += 10;

    // NOVO: salvar() dispara atualizar(), que reconstrói o app INTEIRO (checklist, biblioteca,
    // finanças com 2 gráficos, RPG com mais 3 gráficos, e a lista completa do deck de SRS) a cada
    // resposta de revisão — era isso que fazia passar pro próximo card demorar vários segundos,
    // principalmente em decks grandes importados do Anki. Aqui só persistimos os dados e atualizamos
    // as partes da tela que realmente mudaram: o próprio card de revisão e as estatísticas do SRS.
    salvarDados();
    carregarRevisaoSRS();
    atualizarEstatisticasSRS();
}
function removerCardSRS(id) {
    if (!confirm("Excluir este card do deck?")) return;
    const card = dados.srsItems.find(i => i.id === id);
    Promise.resolve(card ? excluirMidiasDoCardSRS(card) : null).finally(() => {
        dados.srsItems = dados.srsItems.filter(i => i.id !== id);
        salvar();
    });
}

function editarCampoSRS(id, campo, valor) {
    const item = dados.srsItems.find(i => i.id === id);
    if (!item) return;
    const valorLimpo = (valor || "").trim();
    if (campo === 'resposta' && (valorLimpo === '' || valorLimpo === '(sem resposta — clique para adicionar)')) { item.resposta = ""; salvar(); return; }
    if ((campo === 'tema' || campo === 'subtema') && valorLimpo === '') { salvar(); return; } // não permite ficar vazio
    item[campo] = valorLimpo;
    salvar();
}

function atualizarEstatisticasSRS() {
    const el = document.getElementById("srs-estatisticas");
    if (!el) return;
    const total = dados.srsItems.length;
    const hojeData = hojeISO();
    const paraHoje = dados.srsItems.filter(i => i.data_proxima_revisao <= hojeData).length;
    const dominados = dados.srsItems.filter(i => i.intervalo_atual > 30).length;
    el.innerText = `${total} card(s) no total · ${paraHoje} para revisar hoje · ${dominados} dominado(s) (intervalo > 30 dias)`;
}

function renderizarListaSRS() {
    const lista = document.getElementById("lista-srs-completa");
    if(!lista) return;
    if (elementoEmEdicaoDentroDe("lista-srs-completa")) return; // não reconstrói enquanto edita um card aqui
    dados.srsItems.sort((a,b) => a.tema.localeCompare(b.tema));
    // NOVO: monta tudo num array e junta uma vez só no final, em vez de "lista.innerHTML += ..." a
    // cada card — esse padrão é O(n²) (o navegador reserializa/reparseia o HTML acumulado inteiro a
    // cada iteração), e ficava bem perceptível em decks grandes importados do Anki (centenas/milhares
    // de cards).
    const partesHtml = [];
    dados.srsItems.forEach(item => {
        const partesData = item.data_proxima_revisao.split('-');
        const ehCloze = item.tipo === "cloze" && item.clozePartes;
        let corpoHtml;
        if (ehCloze) {
            let fraseHtml = "";
            item.clozePartes.forEach(seg => {
                const texto = obterTextoSegmentoCloze(seg);
                fraseHtml += seg.lacuna ? `<span class="cloze-palavra-lista">${escaparHtml(texto)}</span>` : escaparHtml(texto);
            });
            corpoHtml = `<strong>🕳 ${fraseHtml}</strong><div style="font-size:0.85em; color:var(--text-secondary); margin-top:4px;">Resposta: ${escaparHtml(item.resposta)} <button class="btn-editar-cloze" onclick="carregarCardParaEdicao(${item.id})" title="Editar lacunas">✏️ Editar</button></div>`;
        } else {
            const respostaTxt = item.resposta ? escaparHtml(item.resposta) : '(sem resposta — clique para adicionar)';
            const temImagem = item.imagemPerguntaId || item.imagemRespostaId;
            corpoHtml = `<strong contenteditable="true" onblur="editarCampoSRS(${item.id}, 'subtema', this.innerText)">${escaparHtml(item.subtema)}</strong>${temImagem ? ' <span title="Este card tem imagem">🖼️</span>' : ''}<div style="font-size:0.85em; color:var(--text-secondary); margin-top:4px;" contenteditable="true" onblur="editarCampoSRS(${item.id}, 'resposta', this.innerText)">${respostaTxt}</div>`;
        }
        partesHtml.push(`<div class="srs-item-mini"><div style="flex:1;"><input class="srs-tag-input" list="lista-temas-srs" value="${escaparHtml(item.tema)}" onblur="editarCampoSRS(${item.id}, 'tema', this.value)"><br>${corpoHtml}</div><div style="text-align:right;"><div style="font-size:0.8em; color:var(--text-secondary); white-space:nowrap;">Rev: ${partesData[2]}/${partesData[1]}</div><button onclick="removerCardSRS(${item.id})" style="background:none; color:var(--danger-color); padding:0; font-size:1.2em;">&times;</button></div></div>`);
    });
    lista.innerHTML = partesHtml.join("");
}

/* === BIBLIOTECA DE LIVROS (IndexedDB + PDF.js + epub.js) === */

// --- Camada de armazenamento (IndexedDB guarda os arquivos; localStorage guarda só os metadados) ---
const BIBLIOTECA_DB_NAME = "bibliotecaPDF";
const BIBLIOTECA_DB_VERSION = 1;
const BIBLIOTECA_STORE_NAME = "arquivos";
let dbBibliotecaInstance = null;

function abrirDBBiblioteca() {
    return new Promise((resolve, reject) => {
        if (dbBibliotecaInstance) { resolve(dbBibliotecaInstance); return; }
        const request = indexedDB.open(BIBLIOTECA_DB_NAME, BIBLIOTECA_DB_VERSION);
        request.onupgradeneeded = function(e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(BIBLIOTECA_STORE_NAME)) {
                db.createObjectStore(BIBLIOTECA_STORE_NAME);
            }
        };
        request.onsuccess = function(e) { dbBibliotecaInstance = e.target.result; resolve(dbBibliotecaInstance); };
        request.onerror = function(e) { reject(e); };
    });
}
function salvarArquivoLivro(id, arrayBuffer) {
    return abrirDBBiblioteca().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(BIBLIOTECA_STORE_NAME, "readwrite");
        tx.objectStore(BIBLIOTECA_STORE_NAME).put(arrayBuffer, id);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
    }));
}
function carregarArquivoLivro(id) {
    return abrirDBBiblioteca().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(BIBLIOTECA_STORE_NAME, "readonly");
        const req = tx.objectStore(BIBLIOTECA_STORE_NAME).get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e);
    }));
}
function excluirArquivoLivro(id) {
    return abrirDBBiblioteca().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(BIBLIOTECA_STORE_NAME, "readwrite");
        tx.objectStore(BIBLIOTECA_STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
    }));
}

// === IMAGENS DOS CARDS SRS (pergunta e/ou resposta) — mesmo padrão de armazenamento da biblioteca ===
const IMAGENS_SRS_DB_NAME = "imagensSRS";
const IMAGENS_SRS_DB_VERSION = 1;
const IMAGENS_SRS_STORE_NAME = "imagens";
let dbImagensSRSInstance = null;

function abrirDBImagensSRS() {
    return new Promise((resolve, reject) => {
        if (dbImagensSRSInstance) { resolve(dbImagensSRSInstance); return; }
        const request = indexedDB.open(IMAGENS_SRS_DB_NAME, IMAGENS_SRS_DB_VERSION);
        request.onupgradeneeded = function(e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IMAGENS_SRS_STORE_NAME)) {
                db.createObjectStore(IMAGENS_SRS_STORE_NAME);
            }
        };
        request.onsuccess = function(e) { dbImagensSRSInstance = e.target.result; resolve(dbImagensSRSInstance); };
        request.onerror = function(e) { reject(e); };
    });
}
function salvarImagemSRS(id, blob) {
    return abrirDBImagensSRS().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(IMAGENS_SRS_STORE_NAME, "readwrite");
        tx.objectStore(IMAGENS_SRS_STORE_NAME).put(blob, id);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
    }));
}
function carregarImagemSRS(id) {
    return abrirDBImagensSRS().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(IMAGENS_SRS_STORE_NAME, "readonly");
        const req = tx.objectStore(IMAGENS_SRS_STORE_NAME).get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e);
    }));
}
function excluirImagemSRS(id) {
    return abrirDBImagensSRS().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(IMAGENS_SRS_STORE_NAME, "readwrite");
        tx.objectStore(IMAGENS_SRS_STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
    }));
}

// Reduz a imagem antes de guardar (largura máx. 800px, JPEG) — evita encher o IndexedDB com fotos gigantes.
function redimensionarImagemParaBlob(arquivo, larguraMax) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(arquivo);
        const img = new Image();
        img.onload = () => {
            const escala = Math.min(1, larguraMax / img.width);
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(img.width * escala);
            canvas.height = Math.round(img.height * escala);
            canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Falha ao gerar imagem.")), "image/jpeg", 0.82);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível ler essa imagem.")); };
        img.src = url;
    });
}

// Estado das imagens escolhidas mas ainda não salvas, por formulário ('srs' ou 'rapido') e campo ('pergunta'/'resposta').
// null = sem mudança (mantém o que já existia, se houver); Blob = imagem nova; "REMOVER" = tirar a imagem existente.
let imagensPendentes = { srs: { pergunta: null, resposta: null }, rapido: { pergunta: null, resposta: null } };

// Ao escolher um arquivo de imagem, abre o modal de desenho em vez de já processar a imagem direto —
// só depois de confirmar o desenho (ou sem desenhar nada) é que ela vira o "blob pendente" de sempre.
function selecionarImagemCard(prefixo, campo, inputEl) {
    const arquivo = inputEl.files[0];
    if (!arquivo) return;
    abrirModalDesenhoImagem(arquivo, prefixo, campo);
}

// === NOVO: modal de desenho/oclusão de imagem (tipo "oclusão de imagem" do Anki) ===
// Desenha direto em cima do <canvas> com um retângulo sólido; ao confirmar, a imagem final
// (já com o desenho "achatado" nela) substitui o arquivo original — não guardamos as formas
// separadamente, só a imagem resultante, exatamente como no restante do fluxo de imagens já existente.
let desenhoImagemEstado = { prefixo: null, campo: null, imagemBase: null, corAtual: "#ffeb3b" };

function abrirModalDesenhoImagem(arquivo, prefixo, campo) {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
        const larguraMax = 700;
        const escala = Math.min(1, larguraMax / img.width);
        const canvas = document.getElementById("desenho-imagem-canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);

        desenhoImagemEstado.prefixo = prefixo;
        desenhoImagemEstado.campo = campo;
        desenhoImagemEstado.imagemBase = img;

        configurarCanvasDesenhoImagem();
        document.getElementById("desenho-imagem-modal").classList.remove("modal-oculto");
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert("Não foi possível carregar essa imagem."); };
    img.src = url;
}

// Liga os eventos de desenho (mouse e toque) uma única vez — o <canvas> é sempre o mesmo elemento,
// só o conteúdo dele muda a cada imagem aberta.
function configurarCanvasDesenhoImagem() {
    const canvas = document.getElementById("desenho-imagem-canvas");
    if (!canvas || canvas.dataset.configurado) return;
    canvas.dataset.configurado = "true";

    let desenhando = false, inicioX = 0, inicioY = 0, snapshot = null;

    function posRelativa(evt) {
        const rect = canvas.getBoundingClientRect();
        const ponto = evt.touches ? evt.touches[0] : evt;
        return {
            x: (ponto.clientX - rect.left) * (canvas.width / rect.width),
            y: (ponto.clientY - rect.top) * (canvas.height / rect.height)
        };
    }
    function iniciar(evt) {
        evt.preventDefault();
        const pos = posRelativa(evt);
        inicioX = pos.x; inicioY = pos.y;
        desenhando = true;
        snapshot = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    }
    function mover(evt) {
        if (!desenhando) return;
        evt.preventDefault();
        const pos = posRelativa(evt);
        const ctx = canvas.getContext("2d");
        ctx.putImageData(snapshot, 0, 0);
        ctx.fillStyle = desenhoImagemEstado.corAtual;
        const x = Math.min(inicioX, pos.x), y = Math.min(inicioY, pos.y);
        const w = Math.abs(pos.x - inicioX), h = Math.abs(pos.y - inicioY);
        ctx.fillRect(x, y, w, h);
    }
    function finalizar() { desenhando = false; snapshot = null; }

    canvas.addEventListener("mousedown", iniciar);
    canvas.addEventListener("mousemove", mover);
    canvas.addEventListener("mouseup", finalizar);
    canvas.addEventListener("mouseleave", finalizar);
    canvas.addEventListener("touchstart", iniciar);
    canvas.addEventListener("touchmove", mover);
    canvas.addEventListener("touchend", finalizar);
}

function selecionarCorDesenho(botaoEl) {
    desenhoImagemEstado.corAtual = botaoEl.dataset.cor;
    document.querySelectorAll(".swatch-cor").forEach(b => b.classList.remove("ativo"));
    botaoEl.classList.add("ativo");
}

// Redesenha só a imagem original, apagando todos os retângulos feitos até agora.
function limparDesenhoImagem() {
    const canvas = document.getElementById("desenho-imagem-canvas");
    if (!canvas || !desenhoImagemEstado.imagemBase) return;
    canvas.getContext("2d").drawImage(desenhoImagemEstado.imagemBase, 0, 0, canvas.width, canvas.height);
}

function fecharModalDesenhoImagem() {
    document.getElementById("desenho-imagem-modal").classList.add("modal-oculto");
    const idPrefixo = desenhoImagemEstado.prefixo === "rapido" ? "srs-rapido" : "srs";
    const inputEl = document.getElementById(`${idPrefixo}-imagem-${desenhoImagemEstado.campo}`);
    if (inputEl) inputEl.value = ""; // permite escolher o mesmo arquivo de novo, se quiser
    desenhoImagemEstado.prefixo = null;
    desenhoImagemEstado.campo = null;
    desenhoImagemEstado.imagemBase = null;
}
function cancelarDesenhoImagem() { fecharModalDesenhoImagem(); }

// "Achata" o desenho na imagem (canvas inteiro vira um blob único) e entrega pro mesmo pipeline
// de imagem pendente que já existia — o resto do sistema (salvar no IndexedDB, editar, excluir a
// antiga, incluir no backup) continua funcionando sem nenhuma mudança.
function confirmarDesenhoImagem() {
    const canvas = document.getElementById("desenho-imagem-canvas");
    const prefixo = desenhoImagemEstado.prefixo, campo = desenhoImagemEstado.campo;
    if (!prefixo || !campo) return;
    canvas.toBlob(blob => {
        if (!blob) { alert("Não foi possível salvar essa imagem."); return; }
        imagensPendentes[prefixo][campo] = blob;
        exibirPreviewImagemCard(prefixo, campo, blob);
        fecharModalDesenhoImagem();
    }, "image/jpeg", 0.85);
}

function exibirPreviewImagemCard(prefixo, campo, blobOuNull) {
    const idPrefixo = prefixo === "rapido" ? "srs-rapido" : "srs";
    const previewEl = document.getElementById(`${idPrefixo}-imagem-${campo}-preview`);
    if (!previewEl) return;
    if (!blobOuNull) { previewEl.innerHTML = ""; previewEl.classList.add("oculto"); return; }
    const url = URL.createObjectURL(blobOuNull);
    previewEl.innerHTML = `<img src="${url}" alt="Prévia"><button type="button" class="btn-remover-imagem-card" onclick="removerImagemPendente('${prefixo}','${campo}')" title="Remover imagem">✖</button>`;
    previewEl.classList.remove("oculto");
}

function removerImagemPendente(prefixo, campo) {
    imagensPendentes[prefixo][campo] = "REMOVER";
    exibirPreviewImagemCard(prefixo, campo, null);
    const idPrefixo = prefixo === "rapido" ? "srs-rapido" : "srs";
    const inputEl = document.getElementById(`${idPrefixo}-imagem-${campo}`);
    if (inputEl) inputEl.value = "";
}

function resetarImagensPendentes(prefixo) {
    imagensPendentes[prefixo] = { pergunta: null, resposta: null };
    exibirPreviewImagemCard(prefixo, "pergunta", null);
    exibirPreviewImagemCard(prefixo, "resposta", null);
}

// Aplica as imagens pendentes de um formulário num card (novo ou em edição): salva as novas, remove
// as marcadas pra excluir, e apaga a imagem antiga do IndexedDB quando ela é substituída ou removida.
function aplicarImagensPendentesNoCard(item, prefixo) {
    const pendentes = imagensPendentes[prefixo];
    const tarefas = [];

    ["pergunta", "resposta"].forEach(campo => {
        const chave = campo === "pergunta" ? "imagemPerguntaId" : "imagemRespostaId";
        const pendente = pendentes[campo];
        if (pendente === "REMOVER") {
            const idAntigo = item[chave];
            if (idAntigo) tarefas.push(excluirImagemSRS(idAntigo).catch(() => {}));
            delete item[chave];
        } else if (pendente instanceof Blob) {
            const idAntigo = item[chave];
            const novoId = `${Date.now()}_${campo}_${Math.floor(Math.random() * 100000)}`;
            tarefas.push(
                salvarImagemSRS(novoId, pendente).then(() => {
                    item[chave] = novoId;
                    return idAntigo ? excluirImagemSRS(idAntigo).catch(() => {}) : null;
                })
            );
        }
    });

    return Promise.all(tarefas);
}

// --- Utilitário: achata o sumário (TOC) do EPUB em uma lista única, incluindo subitens ---
function flattenToc(tocArray) {
    let resultado = [];
    (tocArray || []).forEach(item => {
        resultado.push({ label: (item.label || "").trim(), href: item.href });
        if (item.subitems && item.subitems.length > 0) {
            resultado = resultado.concat(flattenToc(item.subitems));
        }
    });
    return resultado;
}

// --- Upload (aceita múltiplos arquivos PDF e/ou EPUB de uma vez) ---
function handleUploadLivros(event) {
    const arquivos = Array.from(event.target.files || []);
    if (arquivos.length === 0) return;
    const statusEl = document.getElementById("biblioteca-status-import");
    let processados = 0;
    statusEl.innerText = `Processando ${arquivos.length} arquivo(s)...`;

    const LIMITE_TAMANHO_AVISO = 150 * 1024 * 1024; // 150MB — só avisa, não bloqueia

    arquivos.forEach((arquivo, idx) => {
        if (arquivo.size > LIMITE_TAMANHO_AVISO) {
            const tamanhoMB = Math.round(arquivo.size / (1024 * 1024));
            const continuar = confirm(`"${arquivo.name}" tem ${tamanhoMB}MB. Arquivos muito grandes podem deixar o navegador lento ou travar. Deseja continuar mesmo assim?`);
            if (!continuar) {
                processados++;
                statusEl.innerText = `${processados}/${arquivos.length} — "${arquivo.name}" pulado (muito grande).`;
                return;
            }
        }

        const nomeMin = arquivo.name.toLowerCase();
        const tipo = nomeMin.endsWith(".epub") ? "epub" : (nomeMin.endsWith(".cbz") ? "cbz" : "pdf");
        const reader = new FileReader();
        reader.onload = function(e) {
            const arrayBuffer = e.target.result;
            const id = Date.now() + "_" + idx + "_" + Math.floor(Math.random() * 100000);
            const titulo = arquivo.name.replace(/\.(pdf|epub|cbz)$/i, "");

            const finalizarAdicao = (dadosLivro) => {
                salvarArquivoLivro(id, arrayBuffer).then(() => {
                    dados.biblioteca.push(dadosLivro);
                    processados++;
                    statusEl.innerText = `${processados}/${arquivos.length} livro(s) adicionado(s).`;
                    salvar();
                    if (processados === arquivos.length) setTimeout(() => { statusEl.innerText = ""; }, 3000);
                });
            };

            if (tipo === "pdf") {
                pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise.then(pdfDoc => {
                    gerarCapaPDF(pdfDoc).then(capaDataUrl => {
                        finalizarAdicao({
                            id: id, tipo: "pdf", titulo: titulo,
                            paginaAtual: 1, totalPaginas: pdfDoc.numPages,
                            capaDataUrl: capaDataUrl,
                            concluido: false, dataUpload: hoje(), dataConclusao: null
                        });
                    });
                }).catch(err => {
                    console.error("Erro ao ler PDF:", err);
                    processados++;
                    statusEl.innerText = `Erro ao processar "${arquivo.name}".`;
                });
            } else if (tipo === "cbz") {
                JSZip.loadAsync(arrayBuffer.slice(0)).then(zip => {
                    const nomesImagens = Object.keys(zip.files)
                        .filter(nome => !zip.files[nome].dir && /\.(jpe?g|png|gif|webp|bmp)$/i.test(nome))
                        .sort(compararNomesNaturalmente);

                    if (nomesImagens.length === 0) {
                        processados++;
                        statusEl.innerText = `"${arquivo.name}" não parece ter imagens dentro (CBZ inválido).`;
                        return;
                    }

                    gerarCapaCBZ(zip, nomesImagens[0]).then(capaDataUrl => {
                        finalizarAdicao({
                            id: id, tipo: "cbz", titulo: titulo,
                            paginaAtual: 1, totalPaginas: nomesImagens.length,
                            capaDataUrl: capaDataUrl,
                            concluido: false, dataUpload: hoje(), dataConclusao: null
                        });
                    });
                }).catch(err => {
                    console.error("Erro ao ler CBZ:", err);
                    processados++;
                    statusEl.innerText = `Erro ao processar "${arquivo.name}".`;
                });
            } else {
                const bookTemp = ePub(arrayBuffer.slice(0));
                bookTemp.ready.then(() => {
                    const flatToc = flattenToc(bookTemp.navigation.toc);
                    gerarCapaEPUB(bookTemp).then(capaDataUrl => {
                        finalizarAdicao({
                            id: id, tipo: "epub", titulo: titulo,
                            cfiAtual: null, percentualLido: 0,
                            capituloAtual: null, totalCapitulos: flatToc.length,
                            locationsSalvas: null, capaDataUrl: capaDataUrl,
                            concluido: false, dataUpload: hoje(), dataConclusao: null
                        });
                        bookTemp.destroy();
                    });
                }).catch(err => {
                    console.error("Erro ao ler EPUB:", err);
                    processados++;
                    statusEl.innerText = `Erro ao processar "${arquivo.name}".`;
                });
            }
        };
        reader.readAsArrayBuffer(arquivo);
    });

    event.target.value = ""; // permite selecionar os mesmos arquivos de novo depois
}

// --- Geração de capa (thumbnail) para exibir no card do livro ---
function gerarCapaPDF(pdfDoc) {
    return pdfDoc.getPage(1).then(page => {
        const viewport = page.getViewport({ scale: 1 });
        const escala = 160 / viewport.width; // miniatura com ~160px de largura
        const viewportMini = page.getViewport({ scale: escala });
        const canvasMini = document.createElement("canvas");
        canvasMini.width = viewportMini.width;
        canvasMini.height = viewportMini.height;
        const ctxMini = canvasMini.getContext("2d");
        return page.render({ canvasContext: ctxMini, viewport: viewportMini }).promise.then(() => {
            return canvasMini.toDataURL("image/jpeg", 0.7);
        });
    }).catch(() => null);
}
function gerarCapaEPUB(book) {
    return book.coverUrl().then(url => {
        if (!url) return null;
        return fetch(url).then(r => r.blob()).then(blob => new Promise(resolve => {
            const leitor = new FileReader();
            leitor.onload = () => { URL.revokeObjectURL(url); resolve(leitor.result); };
            leitor.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
            leitor.readAsDataURL(blob);
        }));
    }).catch(() => null);
}

// Usa a primeira imagem (já ordenada) do CBZ como capa, reduzida a uma miniatura (~160px de largura)
function gerarCapaCBZ(zip, nomeArquivo) {
    return zip.files[nomeArquivo].async("blob").then(blob => new Promise(resolve => {
        const url = URL.createObjectURL(blob);
        const imgTemp = new Image();
        imgTemp.onload = () => {
            const escala = 160 / imgTemp.width;
            const canvasMini = document.createElement("canvas");
            canvasMini.width = 160;
            canvasMini.height = Math.round(imgTemp.height * escala);
            canvasMini.getContext("2d").drawImage(imgTemp, 0, 0, canvasMini.width, canvasMini.height);
            URL.revokeObjectURL(url);
            resolve(canvasMini.toDataURL("image/jpeg", 0.7));
        };
        imgTemp.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        imgTemp.src = url;
    })).catch(() => null);
}

// NOVO: recolhe/expande a Estante de livros concluídos. Sempre começa recolhida ao carregar a página
// (o HTML já vem com a classe "oculto" no #estante-grid); o estado não é salvo entre sessões.
function alternarEstanteConcluidos() {
    const grid = document.getElementById("estante-grid");
    const seta = document.getElementById("seta-estante");
    if (!grid || !seta) return;
    grid.classList.toggle("oculto");
    seta.innerText = grid.classList.contains("oculto") ? "▶" : "▼";
}

// --- Renderização das listas (Lendo agora / Estante) ---
// Usado pra transformar texto do usuário em HTML com segurança (nome de prateleira, título de livro, etc.)
function escaparHtml(texto) {
    const div = document.createElement("div");
    div.textContent = texto == null ? "" : String(texto);
    return div.innerHTML;
}

// Evita que uma reconstrução de innerHTML disparada por um salvar() de OUTRA parte do app (ex: uma
// sessão de Pomodoro terminando em segundo plano) apague uma edição em andamento — um contenteditable
// ou <input>/<textarea> focado dentro do container ainda não perdeu o foco (onblur), então ainda não
// foi salvo; reconstruir o container agora descartaria o que a pessoa estava digitando.
function elementoEmEdicaoDentroDe(containerId) {
    const container = document.getElementById(containerId);
    const ativo = document.activeElement;
    if (!container || !ativo || !container.contains(ativo)) return false;
    return ativo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(ativo.tagName);
}

// Nomes de prateleira que estão expandidas no momento (não persiste entre carregamentos de página —
// igual à Estante, que também sempre começa recolhida).
let prateleirasAbertas = new Set();
let livroSelecionadoParaPrateleira = null;

function renderizarBiblioteca() {
    const listaEl = document.getElementById("lista-biblioteca");
    const estanteEl = document.getElementById("estante-grid");
    if (!listaEl || !estanteEl) return;

    const emAndamento = dados.biblioteca.filter(l => !l.concluido);
    const concluidos = dados.biblioteca.filter(l => l.concluido);

    listaEl.innerHTML = montarSecaoComPrateleiras(emAndamento, false, "Nenhum livro em andamento. Envie um PDF, EPUB ou CBZ acima para começar.");
    estanteEl.innerHTML = montarSecaoComPrateleiras(concluidos, true, "Nenhum livro concluído ainda.");
}

// Livros sem prateleira aparecem soltos no grid, como sempre; livros com prateleira são agrupados
// em blocos recolhíveis (um por nome de prateleira, em ordem alfabética).
function montarSecaoComPrateleiras(livros, concluido, textoVazio) {
    if (livros.length === 0) return `<p class="biblioteca-vazio">${textoVazio}</p>`;

    const semPrateleira = livros.filter(l => !l.prateleira);
    const comPrateleira = livros.filter(l => l.prateleira);

    let html = "";
    if (semPrateleira.length > 0) {
        html += semPrateleira.map(l => montarCardLivro(l, concluido)).join("");
    }

    const grupos = {};
    comPrateleira.forEach(l => { (grupos[l.prateleira] = grupos[l.prateleira] || []).push(l); });

    Object.keys(grupos).sort((a, b) => a.localeCompare(b, "pt-BR")).forEach(nome => {
        const aberta = prateleirasAbertas.has(nome);
        const nomeSeguro = escaparHtml(nome);
        html += `<div class="prateleira-bloco">
            <div class="prateleira-cabecalho" data-nome="${nomeSeguro}" onclick="alternarPrateleira(this)">
                <span class="seta-prateleira">${aberta ? "▼" : "▶"}</span> 📁 ${nomeSeguro} (${grupos[nome].length})
                <button class="btn-renomear-prateleira" data-nome="${nomeSeguro}" onclick="event.stopPropagation(); renomearPrateleira(this.dataset.nome)" title="Renomear prateleira">✏️</button>
            </div>
            <div class="biblioteca-grid${aberta ? "" : " oculto"}">${grupos[nome].map(l => montarCardLivro(l, concluido)).join("")}</div>
        </div>`;
    });

    return html || `<p class="biblioteca-vazio">${textoVazio}</p>`;
}

function alternarPrateleira(headerEl) {
    const nome = headerEl.dataset.nome;
    const corpo = headerEl.nextElementSibling;
    if (!corpo) return;
    const agoraOculto = corpo.classList.toggle("oculto");
    if (agoraOculto) prateleirasAbertas.delete(nome); else prateleirasAbertas.add(nome);
    const seta = headerEl.querySelector(".seta-prateleira");
    if (seta) seta.innerText = agoraOculto ? "▶" : "▼";
}

function renomearPrateleira(nomeAtual) {
    const novoNome = prompt(`Renomear prateleira "${nomeAtual}" para:`, nomeAtual);
    if (novoNome === null) return; // cancelou
    const novoNomeLimpo = novoNome.trim();
    if (!novoNomeLimpo) { alert("O nome não pode ficar vazio. Pra tirar um livro da prateleira, use o botão 📁 no card dele."); return; }
    if (prateleirasAbertas.has(nomeAtual)) { prateleirasAbertas.delete(nomeAtual); prateleirasAbertas.add(novoNomeLimpo); }
    dados.biblioteca.forEach(l => { if (l.prateleira === nomeAtual) l.prateleira = novoNomeLimpo; });
    salvar();
}

// Abre o seletor de prateleira pra um livro específico: lista as prateleiras já existentes (clicáveis)
// e permite criar uma nova ou remover o livro de qualquer prateleira.
function abrirSeletorPrateleira(idLivro) {
    livroSelecionadoParaPrateleira = idLivro;
    const nomesExistentes = [...new Set(dados.biblioteca.map(l => l.prateleira).filter(p => p))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const listaEl = document.getElementById("prateleira-lista-existentes");
    listaEl.innerHTML = nomesExistentes.length
        ? nomesExistentes.map(nome => `<button class="btn-prateleira-opcao" data-nome="${escaparHtml(nome)}" onclick="moverLivroParaPrateleira(this.dataset.nome)">📁 ${escaparHtml(nome)}</button>`).join("")
        : `<p style="font-size:0.85em; color:var(--text-secondary); margin:0;">Nenhuma prateleira criada ainda.</p>`;
    document.getElementById("prateleira-nome-input").value = "";
    document.getElementById("prateleira-modal").classList.remove("modal-oculto");
}
function fecharModalPrateleira() {
    document.getElementById("prateleira-modal").classList.add("modal-oculto");
    livroSelecionadoParaPrateleira = null;
}
function moverLivroParaPrateleira(nomePrateleira) {
    const livro = dados.biblioteca.find(l => l.id === livroSelecionadoParaPrateleira);
    if (livro) livro.prateleira = nomePrateleira;
    fecharModalPrateleira();
    salvar();
}
function confirmarNovaPrateleira() {
    const nomeDigitado = document.getElementById("prateleira-nome-input").value.trim();
    if (!nomeDigitado) return;
    // reaproveita uma prateleira já existente com o mesmo nome (ignorando maiúsculas/espaços), pra não criar duplicada por causa de digitação
    const existente = dados.biblioteca.map(l => l.prateleira).find(p => p && p.trim().toLowerCase() === nomeDigitado.toLowerCase());
    moverLivroParaPrateleira(existente || nomeDigitado);
}
function removerLivroDaPrateleira() {
    moverLivroParaPrateleira("");
}

function montarCardLivro(livro, concluido) {
    const tipo = livro.tipo || "pdf";
    const iconeCapa = tipo === "epub" ? "📗" : (tipo === "cbz" ? "🖼️" : "📖");
    const tagTipo = tipo === "epub" ? "EPUB" : (tipo === "cbz" ? "CBZ" : "PDF");
    const capaHtml = livro.capaDataUrl ? `<img src="${livro.capaDataUrl}" alt="Capa de ${escaparHtml(livro.titulo)}">` : (concluido ? "📚" : iconeCapa);
    const tituloSeguro = escaparHtml(livro.titulo);
    const btnPrateleira = `<button class="btn-prateleira-livro" onclick="abrirSeletorPrateleira('${livro.id}')" title="${livro.prateleira ? "Prateleira: " + escaparHtml(livro.prateleira) : "Mover para prateleira"}">📁</button>`;
    let progressoTxt, pct;

    if (tipo === "epub") {
        pct = livro.percentualLido || 0;
        progressoTxt = livro.capituloAtual ? `Cap. ${livro.capituloAtual} / ${livro.totalCapitulos} (${pct}%)` : `${pct}% lido`;
    } else {
        pct = livro.totalPaginas > 0 ? Math.round((livro.paginaAtual / livro.totalPaginas) * 100) : 0;
        progressoTxt = `Pág. ${livro.paginaAtual} / ${livro.totalPaginas} (${pct}%)`;
    }

    if (concluido) {
        return `<div class="livro-card concluido"><div class="livro-capa">${capaHtml}</div><span class="badge-concluido">Concluído</span><span class="livro-tipo-tag">${tagTipo}</span><span class="livro-titulo">${tituloSeguro}</span><span class="livro-progresso-txt">Finalizado em ${livro.dataConclusao}</span><div class="livro-acoes"><button class="btn-continuar-leitura" onclick="abrirLeitor('${livro.id}')">🔁 Reler</button>${btnPrateleira}<button class="btn-remover-livro" onclick="removerLivro('${livro.id}')">🗑️</button></div></div>`;
    }
    return `<div class="livro-card"><div class="livro-capa">${capaHtml}</div><span class="livro-tipo-tag">${tagTipo}</span><span class="livro-titulo">${tituloSeguro}</span><span class="livro-progresso-txt">${progressoTxt}</span><div class="barra-livro"><div class="fill-livro" style="width:${pct}%"></div></div><div class="livro-acoes"><button class="btn-continuar-leitura" onclick="abrirLeitor('${livro.id}')">📖 Ler</button>${btnPrateleira}<button class="btn-remover-livro" onclick="removerLivro('${livro.id}')">🗑️</button></div></div>`;
}

// --- Leitor (PDF via canvas + camada de texto, EPUB via epub.js) ---
let leitorTipoAtual = null; // 'pdf', 'epub' ou 'cbz'
let leitorPdfAtual = null;
let leitorEpubBook = null;
let leitorEpubRendition = null;
let leitorCbzPaginas = []; // URLs de imagem (blob:) das páginas do CBZ aberto, em ordem
let leitorLivroAtualId = null;
let leitorPaginaAtual = 1;
let leitorRenderizando = false;
let buscaLivroResultados = []; // resultados da busca no livro atual: {pagina} pro PDF, {cfi, excerpt} pro EPUB
let buscaLivroIndiceAtual = -1;
let termoDestacadoAtual = ""; // termo atualmente marcado/destacado no texto (usado pelo destaque do PDF a cada página renderizada)

function abrirLeitor(id) {
    const livro = dados.biblioteca.find(l => l.id === id);
    if (!livro) return;
    const tipo = livro.tipo || "pdf";
    if (tipo === "epub") abrirLeitorEpub(livro);
    else if (tipo === "cbz") abrirLeitorCbz(livro);
    else abrirLeitorPdf(livro);
}

function abrirLeitorPdf(livro) {
    carregarArquivoLivro(livro.id).then(arrayBuffer => {
        if (!arrayBuffer) { alert("Arquivo não encontrado. Ele pode ter sido removido."); return; }
        pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise.then(pdfDoc => {
            leitorTipoAtual = "pdf";
            leitorPdfAtual = pdfDoc;
            leitorLivroAtualId = livro.id;
            leitorPaginaAtual = Math.min(livro.paginaAtual, pdfDoc.numPages);

            document.getElementById("leitor-titulo-livro").innerText = livro.titulo;
            document.getElementById("pdf-page-wrapper").classList.remove("oculto");
            document.getElementById("epub-viewer").classList.add("oculto");
            document.getElementById("cbz-viewer").classList.add("oculto");
            document.getElementById("leitor-pdf").classList.remove("oculto");
            document.getElementById("leitor-pdf").scrollIntoView({ behavior: "smooth", block: "start" });
            renderizarAnotacoesLivro(livro);
            configurarUiLeitorPorTipo("pdf");

            renderizarPaginaPDF(leitorPaginaAtual);
        }).catch(err => { console.error(err); alert("Não foi possível abrir este PDF."); });
    });
}

// Ordena nomes de arquivo "naturalmente" (pagina2 antes de pagina10), como a maioria dos leitores de CBZ faz.
function compararNomesNaturalmente(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

// NOVO: limite de 5 arquivos CBZ diferentes lidos por dia. Reabrir um CBZ já contado no mesmo dia
// não gasta o limite de novo — o limite é sobre quantos livros diferentes, não quantas vezes.
function podeAbrirCbzHoje(livroId) {
    if (dados.cbzLeituraDiaria.data !== hoje()) {
        dados.cbzLeituraDiaria = { data: hoje(), livrosAbertos: [] };
    }
    if (dados.cbzLeituraDiaria.livrosAbertos.includes(livroId)) return true;
    if (dados.cbzLeituraDiaria.livrosAbertos.length >= 5) return false;
    dados.cbzLeituraDiaria.livrosAbertos.push(livroId);
    salvar();
    return true;
}

function abrirLeitorCbz(livro) {
    if (!podeAbrirCbzHoje(livro.id)) {
        alert(`Você já atingiu o limite de 5 quadrinhos (CBZ) diferentes por hoje. Volte amanhã para continuar lendo! 📚`);
        return;
    }
    carregarArquivoLivro(livro.id).then(arrayBuffer => {
        if (!arrayBuffer) { alert("Arquivo não encontrado. Ele pode ter sido removido."); return; }
        JSZip.loadAsync(arrayBuffer).then(zip => {
            const nomesImagens = Object.keys(zip.files)
                .filter(nome => !zip.files[nome].dir && /\.(jpe?g|png|gif|webp|bmp)$/i.test(nome))
                .sort(compararNomesNaturalmente);

            if (nomesImagens.length === 0) { alert("Nenhuma imagem encontrada dentro deste CBZ."); return; }

            Promise.all(nomesImagens.map(nome => zip.files[nome].async("blob").then(blob => URL.createObjectURL(blob))))
                .then(urls => {
                    leitorCbzPaginas.forEach(u => URL.revokeObjectURL(u)); // libera URLs de uma leitura anterior, se houver
                    leitorCbzPaginas = urls;
                    leitorTipoAtual = "cbz";
                    leitorLivroAtualId = livro.id;
                    leitorPaginaAtual = Math.min(livro.paginaAtual || 1, urls.length);

                    document.getElementById("leitor-titulo-livro").innerText = livro.titulo;
                    document.getElementById("pdf-page-wrapper").classList.add("oculto");
                    document.getElementById("epub-viewer").classList.add("oculto");
                    document.getElementById("cbz-viewer").classList.remove("oculto");
                    document.getElementById("leitor-pdf").classList.remove("oculto");
                    document.getElementById("leitor-pdf").scrollIntoView({ behavior: "smooth", block: "start" });
                    renderizarAnotacoesLivro(livro);
                    configurarUiLeitorPorTipo("cbz");

                    renderizarPaginaCBZ(leitorPaginaAtual);
                });
        }).catch(err => { console.error(err); alert("Não foi possível abrir este CBZ. Verifique se o arquivo não está corrompido."); });
    });
}

function renderizarPaginaCBZ(numPagina) {
    if (!leitorCbzPaginas.length || leitorRenderizando) return;
    leitorRenderizando = true;
    const img = document.getElementById("cbz-imagem");
    img.onload = () => {
        leitorRenderizando = false;
        leitorPaginaAtual = numPagina;
        document.getElementById("leitor-pagina-info").innerText = `Pág. ${numPagina} / ${leitorCbzPaginas.length}`;
        atualizarBotoesNavegacaoLeitor();
        salvarProgressoLeituraAtual();
    };
    img.onerror = () => { leitorRenderizando = false; };
    img.src = leitorCbzPaginas[numPagina - 1];
}

function registrarTemasEpub(rendition) {
    rendition.themes.register("claro", {
        "body": { "color": "#333333", "background": "#ffffff" }
    });
    rendition.themes.register("escuro", {
        "body": { "color": "#e0e0e0", "background": "#121212" },
        "a": { "color": "#64b5f6 !important" }
    });
}
function aplicarTemaEpub(rendition) {
    rendition.themes.select(dados.tema === 'escuro' ? "escuro" : "claro");
}

function abrirLeitorEpub(livro) {
    carregarArquivoLivro(livro.id).then(arrayBuffer => {
        if (!arrayBuffer) { alert("Arquivo não encontrado. Ele pode ter sido removido."); return; }

        leitorTipoAtual = "epub";
        leitorLivroAtualId = livro.id;

        const book = ePub(arrayBuffer.slice(0));
        leitorEpubBook = book;

        document.getElementById("leitor-titulo-livro").innerText = livro.titulo;
        document.getElementById("pdf-page-wrapper").classList.add("oculto");
        document.getElementById("cbz-viewer").classList.add("oculto");
        const viewerEl = document.getElementById("epub-viewer");
        viewerEl.innerHTML = "";
        viewerEl.classList.remove("oculto");
        document.getElementById("leitor-pdf").classList.remove("oculto");
        document.getElementById("leitor-pdf").scrollIntoView({ behavior: "smooth", block: "start" });
        renderizarAnotacoesLivro(livro);
        configurarUiLeitorPorTipo("epub");

        book.ready.then(() => {
            const prepararLocalizacoes = livro.locationsSalvas
                ? book.locations.load(livro.locationsSalvas)
                : book.locations.generate(1000).then(() => {
                    livro.locationsSalvas = book.locations.save();
                    salvar();
                });

            Promise.resolve(prepararLocalizacoes).then(() => {
                const rendition = book.renderTo("epub-viewer", { width: "100%", height: "100%" });
                leitorEpubRendition = rendition;

                registrarTemasEpub(rendition);
                aplicarTemaEpub(rendition);
                configurarSelecaoEpub(rendition);

                rendition.display(livro.cfiAtual || undefined);

                rendition.on("relocated", (location) => {
                    processarProgressoEpub(livro, location);
                });
            });
        }).catch(err => { console.error(err); alert("Não foi possível abrir este EPUB."); });
    });
}

function processarProgressoEpub(livro, location) {
    const pct = Math.round((location.start.percentage || 0) * 100);
    const item = leitorEpubBook.navigation.get(location.start.href);
    let capNum = livro.capituloAtual, capTitulo = null;
    if (item) {
        const flatToc = flattenToc(leitorEpubBook.navigation.toc);
        const idx = flatToc.findIndex(t => t.href === item.href);
        if (idx !== -1) capNum = idx + 1;
        capTitulo = (item.label || "").trim();
    }

    livro.cfiAtual = location.start.cfi;
    livro.percentualLido = pct;
    livro.capituloAtual = capNum;
    document.getElementById("leitor-pagina-info").innerText = capTitulo ? `${capTitulo} (${pct}%)` : `${pct}% lido`;
    atualizarBotoesNavegacaoLeitor(location);
    salvar();
}

function renderizarPaginaPDF(numPagina) {
    if (!leitorPdfAtual || leitorRenderizando) return;
    leitorRenderizando = true;

    leitorPdfAtual.getPage(numPagina).then(page => {
        const canvas = document.getElementById("pdf-canvas");
        const ctx = canvas.getContext("2d");
        const viewport = page.getViewport({ scale: 1.3 });

        // Renderiza o canvas na resolução real da tela (devicePixelRatio) para as letras saírem nítidas
        // em telas retina/zoom, mas mantém o tamanho exibido em CSS igual ao viewport lógico.
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = viewport.width + "px";
        // (a altura exibida continua vindo do "height: auto" do CSS — se fixássemos aqui também,
        // o encolhimento pelo max-width do wrapper deixaria a página esticada/desproporcional,
        // e a seleção de texto desalinharia de novo no eixo vertical)

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

        page.render({ canvasContext: ctx, viewport: viewport, transform: transform }).promise.then(() => {
            leitorRenderizando = false;
            leitorPaginaAtual = numPagina;
            document.getElementById("leitor-pagina-info").innerText = `Pág. ${numPagina} / ${leitorPdfAtual.numPages}`;
            atualizarBotoesNavegacaoLeitor();
            salvarProgressoLeituraAtual();
            renderizarCamadaTextoPDF(page, viewport, canvas);
        });
    }).catch(() => { leitorRenderizando = false; });
}

// --- camada de texto selecionável por cima do PDF ---
function renderizarCamadaTextoPDF(page, viewport, canvas) {
    const textLayerDiv = document.getElementById("pdf-text-layer");
    if (!textLayerDiv || !pdfjsLib.renderTextLayer) return;

    textLayerDiv.innerHTML = "";
    textLayerDiv.style.transform = "none"; // a camada nasce direto no tamanho exibido; não precisa mais escalar depois

    // Gera a camada de texto usando a escala REALMENTE exibida do canvas (que pode estar reduzida pelo CSS),
    // em vez de renderizar na escala "nativa" (1.3) e depois escalar tudo via transform. Assim as posições dos
    // spans já nascem corretas, e o desalinhamento não pode mais acontecer (nem crescer com a distância do topo).
    const escalaExibicao = canvas.clientWidth / viewport.width;
    const viewportExibicao = page.getViewport({ scale: viewport.scale * escalaExibicao });

    textLayerDiv.style.width = viewportExibicao.width + "px";
    textLayerDiv.style.height = viewportExibicao.height + "px";
    textLayerDiv.style.setProperty("--scale-factor", viewportExibicao.scale);

    page.getTextContent().then(textContent => {
        const tarefa = pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: viewportExibicao
        });
        tarefa.promise.then(() => {
            if (termoDestacadoAtual) destacarTermoNaPaginaPDF(termoDestacadoAtual);
        }).catch(() => {});
    }).catch(() => {});
}

// === BUSCA DE TEXTO DENTRO DO LIVRO ABERTO (PDF e EPUB — CBZ é imagem, não tem texto) ===
function resetBuscaLivro() {
    if (leitorTipoAtual === "epub") limparDestaquesEpub();
    buscaLivroResultados = [];
    buscaLivroIndiceAtual = -1;
    termoDestacadoAtual = "";
    const barra = document.getElementById("leitor-busca");
    if (barra) barra.classList.add("oculto");
    const input = document.getElementById("input-busca-livro");
    if (input) input.value = "";
    atualizarUiResultadoBusca();
}

// Marca em amarelo TODAS as ocorrências encontradas no EPUB (persiste entre seções, é gerenciado pelo próprio epub.js).
function aplicarDestaquesEpub() {
    if (!leitorEpubRendition) return;
    buscaLivroResultados.forEach(r => {
        try {
            leitorEpubRendition.annotations.highlight(r.cfi, {}, () => {}, "busca-destaque", { fill: "yellow", "fill-opacity": "0.4", "mix-blend-mode": "multiply" });
        } catch (e) { /* CFI inválido/fora do alcance — ignora */ }
    });
}
function limparDestaquesEpub() {
    if (!leitorEpubRendition) return;
    buscaLivroResultados.forEach(r => {
        try { leitorEpubRendition.annotations.remove(r.cfi, "highlight"); } catch (e) {}
    });
}

// Marca em amarelo TODAS as ocorrências do termo dentro dos <span> já renderizados da página atual do PDF.
// Ressalva conhecida: se o termo estiver dividido entre dois <span> diferentes (comum em PDFs com texto
// justificado), essa ocorrência específica não é encontrada — ver conversa sobre o PDFFindController.
function destacarTermoNaPaginaPDF(termo) {
    const textLayerDiv = document.getElementById("pdf-text-layer");
    if (!textLayerDiv || !termo) return;
    const termoEscapado = termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const termoLower = termo.toLowerCase();
    textLayerDiv.querySelectorAll("span").forEach(span => {
        if (!span.textContent.toLowerCase().includes(termoLower)) return;
        const regex = new RegExp(`(${termoEscapado})`, "gi"); // regex nova a cada span — evita bug de lastIndex de regex global reaproveitada
        span.innerHTML = span.textContent.replace(regex, '<mark class="pdf-destaque-busca">$1</mark>');
    });
}

// Mostra/esconde os controles que só fazem sentido pra determinados tipos de livro
// (ir-para-página não existe no EPUB; busca de texto não existe no CBZ).
function configurarUiLeitorPorTipo(tipo) {
    document.getElementById("form-ir-pagina").classList.toggle("oculto", tipo === "epub");
    document.getElementById("btn-busca-livro").classList.toggle("oculto", tipo === "cbz");
    document.getElementById("btn-finalizar-leitura").classList.add("oculto");
    resetBuscaLivro();
}

function alternarBuscaLivro() {
    const barra = document.getElementById("leitor-busca");
    if (!barra) return;
    barra.classList.toggle("oculto");
    if (!barra.classList.contains("oculto")) document.getElementById("input-busca-livro").focus();
}

function buscarNoLivro() {
    const termo = document.getElementById("input-busca-livro").value.trim();
    if (!termo) return;
    const infoEl = document.getElementById("busca-resultado-info");
    infoEl.innerText = "Buscando...";
    if (leitorTipoAtual === "epub") limparDestaquesEpub(); // limpa destaques de uma busca anterior
    buscaLivroResultados = [];
    buscaLivroIndiceAtual = -1;
    termoDestacadoAtual = termo;

    const promessa = leitorTipoAtual === "pdf" ? buscarNoPDF(termo)
        : leitorTipoAtual === "epub" ? buscarNoEPUB(termo)
        : Promise.resolve([]);

    promessa.then(resultados => {
        buscaLivroResultados = resultados;
        if (leitorTipoAtual === "epub") aplicarDestaquesEpub();
        if (resultados.length > 0) navegarResultadoBusca(0, true);
        else atualizarUiResultadoBusca();
    });
}

// Varre todas as páginas do PDF já aberto procurando o termo (sem diferenciar maiúsculas/minúsculas).
function buscarNoPDF(termo) {
    if (!leitorPdfAtual) return Promise.resolve([]);
    const termoBusca = termo.toLowerCase();
    const total = leitorPdfAtual.numPages;
    const tarefas = [];
    for (let i = 1; i <= total; i++) {
        tarefas.push(
            leitorPdfAtual.getPage(i)
                .then(page => page.getTextContent())
                .then(textContent => {
                    const textoPagina = textContent.items.map(it => it.str).join(" ").toLowerCase();
                    return textoPagina.includes(termoBusca) ? { pagina: i } : null;
                })
                .catch(() => null)
        );
    }
    return Promise.all(tarefas).then(res => res.filter(r => r !== null));
}

// Usa a busca nativa do epub.js, seção por seção (padrão recomendado pela própria lib).
function buscarNoEPUB(termo) {
    if (!leitorEpubBook) return Promise.resolve([]);
    return Promise.all(
        leitorEpubBook.spine.spineItems.map(item =>
            item.load(leitorEpubBook.load.bind(leitorEpubBook))
                .then(() => { const r = item.find(termo); item.unload(); return r; })
                .catch(() => [])
        )
    ).then(listas => listas.flat());
}

function atualizarUiResultadoBusca() {
    const infoEl = document.getElementById("busca-resultado-info");
    const btnAnt = document.getElementById("btn-busca-anterior");
    const btnProx = document.getElementById("btn-busca-proxima");
    if (!infoEl || !btnAnt || !btnProx) return;
    if (buscaLivroResultados.length === 0) {
        infoEl.innerText = buscaLivroIndiceAtual === -1 && document.getElementById("input-busca-livro").value.trim() ? "Nenhum resultado" : "";
        btnAnt.disabled = true;
        btnProx.disabled = true;
        return;
    }
    infoEl.innerText = `${buscaLivroIndiceAtual + 1} / ${buscaLivroResultados.length}`;
    btnAnt.disabled = false;
    btnProx.disabled = false;
}

// direcaoOuIndice: +1/-1 pra ir pro próximo/anterior resultado (com volta ao início/fim), ou um índice absoluto quando absoluto=true
function navegarResultadoBusca(direcaoOuIndice, absoluto) {
    if (buscaLivroResultados.length === 0) return;
    buscaLivroIndiceAtual = absoluto
        ? direcaoOuIndice
        : (buscaLivroIndiceAtual + direcaoOuIndice + buscaLivroResultados.length) % buscaLivroResultados.length;

    const resultado = buscaLivroResultados[buscaLivroIndiceAtual];
    resetScrollLeitor();
    if (leitorTipoAtual === "pdf") renderizarPaginaPDF(resultado.pagina);
    else if (leitorTipoAtual === "epub" && leitorEpubRendition) leitorEpubRendition.display(resultado.cfi);
    atualizarUiResultadoBusca();
}

function obterTotalPaginasAtual() {
    if (leitorTipoAtual === "pdf") return leitorPdfAtual ? leitorPdfAtual.numPages : 1;
    if (leitorTipoAtual === "cbz") return leitorCbzPaginas.length;
    return 1;
}

function livroAtualJaConcluido() {
    const livro = dados.biblioteca.find(l => l.id === leitorLivroAtualId);
    return !!(livro && livro.concluido);
}

function atualizarBotoesNavegacaoLeitor(locationEpub) {
    const btnFinalizar = document.getElementById("btn-finalizar-leitura");
    let chegouAoFim;
    if (leitorTipoAtual === "epub") {
        chegouAoFim = !!(locationEpub && locationEpub.atEnd);
        document.getElementById("btn-pagina-anterior").disabled = !!(locationEpub && locationEpub.atStart);
        document.getElementById("btn-pagina-proxima").disabled = chegouAoFim;
    } else {
        chegouAoFim = leitorPaginaAtual >= obterTotalPaginasAtual();
        document.getElementById("btn-pagina-anterior").disabled = leitorPaginaAtual <= 1;
        document.getElementById("btn-pagina-proxima").disabled = chegouAoFim;
    }
    if (btnFinalizar) btnFinalizar.classList.toggle("oculto", !chegouAoFim || livroAtualJaConcluido());
}

// Marca o livro atual como concluído (+100 XP) — só é chamado quando o usuário clica em "Finalizar",
// nunca automaticamente ao alcançar a última página/local.
function concluirLivroAtual() {
    const livro = dados.biblioteca.find(l => l.id === leitorLivroAtualId);
    if (!livro || livro.concluido) return;
    livro.concluido = true;
    livro.dataConclusao = hoje();
    dados.pontosAcumulados += 100; // Bônus de XP por concluir um livro
    tocarSom();
    salvar();
    alert(`🎉 Livro "${livro.titulo}" concluído! Ele foi movido para a Estante. (+100 XP)`);
    fecharLeitor();
}
function finalizarLeituraAtual() {
    concluirLivroAtual();
}

// NOVO: volta o leitor pro topo (tanto a rolagem interna do wrapper quanto a posição da página)
// sempre que o usuário troca de página/local — evita ter que rolar manualmente até o topo do livro.
function resetScrollLeitor() {
    const wrapper = document.querySelector(".leitor-canvas-wrapper");
    if (wrapper) { wrapper.scrollTop = 0; wrapper.scrollLeft = 0; }
    const secao = document.getElementById("leitor-pdf");
    if (secao) secao.scrollIntoView({ behavior: "auto", block: "start" });
}

function proximaPagina() {
    resetScrollLeitor();
    if (leitorTipoAtual === "epub") { if (leitorEpubRendition) leitorEpubRendition.next(); }
    else if (leitorTipoAtual === "cbz") { if (leitorPaginaAtual < leitorCbzPaginas.length) renderizarPaginaCBZ(leitorPaginaAtual + 1); }
    else { if (leitorPdfAtual && leitorPaginaAtual < leitorPdfAtual.numPages) renderizarPaginaPDF(leitorPaginaAtual + 1); }
}
function paginaAnterior() {
    resetScrollLeitor();
    if (leitorTipoAtual === "epub") { if (leitorEpubRendition) leitorEpubRendition.prev(); }
    else if (leitorTipoAtual === "cbz") { if (leitorPaginaAtual > 1) renderizarPaginaCBZ(leitorPaginaAtual - 1); }
    else { if (leitorPdfAtual && leitorPaginaAtual > 1) renderizarPaginaPDF(leitorPaginaAtual - 1); }
}

// NOVO: vai direto para a página digitada (só PDF/CBZ — EPUB não pagina por número).
function irParaPaginaDigitada() {
    const input = document.getElementById("input-ir-pagina");
    const numero = parseInt(input.value, 10);
    if (!numero || (leitorTipoAtual !== "pdf" && leitorTipoAtual !== "cbz")) return;
    const total = obterTotalPaginasAtual();
    const alvo = Math.max(1, Math.min(numero, total));
    resetScrollLeitor();
    if (leitorTipoAtual === "cbz") renderizarPaginaCBZ(alvo);
    else renderizarPaginaPDF(alvo);
    input.value = "";
}

function salvarProgressoLeituraAtual() {
    if (!leitorLivroAtualId || (leitorTipoAtual !== "pdf" && leitorTipoAtual !== "cbz")) return;
    const livro = dados.biblioteca.find(l => l.id === leitorLivroAtualId);
    if (!livro) return;

    livro.paginaAtual = leitorPaginaAtual;
    livro.totalPaginas = obterTotalPaginasAtual();
    salvar();
}

function fecharLeitor() {
    document.getElementById("leitor-pdf").classList.add("oculto");

    if (leitorEpubRendition) { leitorEpubRendition.destroy(); leitorEpubRendition = null; }
    if (leitorEpubBook) { leitorEpubBook.destroy(); leitorEpubBook = null; }
    const viewerEl = document.getElementById("epub-viewer");
    if (viewerEl) viewerEl.innerHTML = "";
    const textLayerEl = document.getElementById("pdf-text-layer");
    if (textLayerEl) textLayerEl.innerHTML = "";

    leitorCbzPaginas.forEach(u => URL.revokeObjectURL(u));
    leitorCbzPaginas = [];
    const cbzImg = document.getElementById("cbz-imagem");
    if (cbzImg) cbzImg.src = "";

    resetBuscaLivro();

    esconderBarraSelecao();
    document.getElementById("lista-anotacoes").classList.add("oculto");

    leitorPdfAtual = null;
    leitorLivroAtualId = null;
    leitorTipoAtual = null;
}

function removerLivro(id) {
    const livro = dados.biblioteca.find(l => l.id === id);
    if (!livro) return;
    if (!confirm(`Remover "${livro.titulo}" da biblioteca? O arquivo será apagado.`)) return;
    if (leitorLivroAtualId === id) fecharLeitor();

    excluirArquivoLivro(id).then(() => {
        dados.biblioteca = dados.biblioteca.filter(l => l.id !== id);
        salvar();
    });
}

/* === SELEÇÃO DE TEXTO, ANOTAÇÕES E ATALHO PARA CARD SRS === */
let textoSelecionadoAtual = "";
let cfiSelecaoAtual = null; // guarda o cfiRange exato entregue pelo evento "selected" do epub.js, no momento da seleção

// PDF: a seleção acontece no documento principal, dentro de #pdf-text-layer
document.addEventListener("selectionchange", () => {
    if (leitorTipoAtual !== "pdf") return;
    const leitorEl = document.getElementById("leitor-pdf");
    if (!leitorEl || leitorEl.classList.contains("oculto")) return;

    const selecao = window.getSelection();
    const texto = selecao ? selecao.toString().trim() : "";
    const textLayerEl = document.getElementById("pdf-text-layer");
    const dentroDoTexto = texto && selecao.anchorNode && textLayerEl && textLayerEl.contains(selecao.anchorNode);

    if (dentroDoTexto) { textoSelecionadoAtual = texto; mostrarBarraSelecao(); }
    else if (!texto) { esconderBarraSelecao(); }
});

// EPUB: a seleção acontece dentro do iframe do epub.js, capturada pelo evento "selected"
function configurarSelecaoEpub(rendition) {
    rendition.on("selected", (cfiRange, contents) => {
        const sel = contents && contents.window ? contents.window.getSelection() : null;
        const texto = sel ? sel.toString().trim() : "";
        if (texto) { textoSelecionadoAtual = texto; cfiSelecaoAtual = cfiRange; mostrarBarraSelecao(); }
    });
}

function mostrarBarraSelecao() {
    const barra = document.getElementById("leitor-selecao-barra");
    const preview = document.getElementById("leitor-selecao-texto");
    if (!barra || !preview) return;
    const resumo = textoSelecionadoAtual.length > 90 ? textoSelecionadoAtual.slice(0, 90) + "…" : textoSelecionadoAtual;
    preview.innerText = `"${resumo}"`;
    barra.classList.remove("oculto");
}
function esconderBarraSelecao() {
    const barra = document.getElementById("leitor-selecao-barra");
    if (barra) barra.classList.add("oculto");
}

// --- Anotações ---
function abrirModalAnotacao() {
    if (!textoSelecionadoAtual) return;
    document.getElementById("anotacao-trecho-preview").innerText = `"${textoSelecionadoAtual}"`;
    document.getElementById("anotacao-nota-input").value = "";
    document.getElementById("anotacao-modal").classList.remove("modal-oculto");
}
function fecharModalAnotacao() {
    document.getElementById("anotacao-modal").classList.add("modal-oculto");
}
function salvarAnotacao() {
    const livro = dados.biblioteca.find(l => l.id === leitorLivroAtualId);
    if (!livro) { fecharModalAnotacao(); return; }
    const nota = document.getElementById("anotacao-nota-input").value.trim();
    if (!livro.anotacoes) livro.anotacoes = [];

    let local = null;
    if (leitorTipoAtual === "pdf") {
        local = { tipo: "pdf", pagina: leitorPaginaAtual };
    } else if (leitorTipoAtual === "epub" && cfiSelecaoAtual) {
        local = { tipo: "epub", cfi: cfiSelecaoAtual };
    }

    livro.anotacoes.unshift({ id: Date.now(), trecho: textoSelecionadoAtual, nota: nota, data: hoje(), local: local });
    fecharModalAnotacao();
    esconderBarraSelecao();
    salvar();
    renderizarAnotacoesLivro(livro);
}
function alternarListaAnotacoes() {
    document.getElementById("lista-anotacoes").classList.toggle("oculto");
}
function renderizarAnotacoesLivro(livro) {
    const lista = document.getElementById("lista-anotacoes");
    const btn = document.getElementById("btn-toggle-anotacoes");
    if (!lista || !btn || !livro) return;
    const anotacoes = livro.anotacoes || [];
    btn.innerText = `📝 Minhas Anotações (${anotacoes.length})`;
    lista.innerHTML = "";
    anotacoes.forEach(a => {
        let localHtml = "";
        if (a.local && a.local.tipo === "pdf" && a.local.pagina) {
            localHtml = `<button type="button" class="anotacao-local" onclick="irParaLocalAnotacao(${a.id})">📄 Pág. ${a.local.pagina}</button>`;
        } else if (a.local && a.local.tipo === "epub" && a.local.cfi) {
            localHtml = `<button type="button" class="anotacao-local" onclick="irParaLocalAnotacao(${a.id})">📄 Ver trecho</button>`;
        }
        lista.innerHTML += `<li class="anotacao-item">
            <div class="anotacao-trecho">"${escaparHtml(a.trecho)}"</div>
            ${a.nota ? `<div class="anotacao-nota">${escaparHtml(a.nota)}</div>` : ""}
            ${localHtml}
            <div class="anotacao-acoes">
                <button class="btn-anotacao-srs" onclick="virarAnotacaoEmSrs(${a.id})">🧠 Virar Card SRS</button>
                <button class="btn-anotacao-remover" onclick="removerAnotacao(${a.id})">🗑️</button>
            </div>
        </li>`;
    });
}
function removerAnotacao(idAnotacao) {
    const livro = dados.biblioteca.find(l => l.id === leitorLivroAtualId);
    if (!livro) return;
    if (!confirm("Remover esta anotação?")) return;
    livro.anotacoes = (livro.anotacoes || []).filter(a => a.id !== idAnotacao);
    salvar();
    renderizarAnotacoesLivro(livro);
}

// Navega direto até o trecho de origem de uma anotação (página do PDF ou CFI do EPUB).
// Anotações salvas antes do campo "local" existir simplesmente não têm botão de navegação (ver renderizarAnotacoesLivro).
function irParaLocalAnotacao(idAnotacao) {
    const livro = dados.biblioteca.find(l => l.id === leitorLivroAtualId);
    if (!livro) return;
    const anotacao = (livro.anotacoes || []).find(a => a.id === idAnotacao);
    if (!anotacao || !anotacao.local) return;
    resetScrollLeitor();
    if (anotacao.local.tipo === "pdf" && anotacao.local.pagina && leitorTipoAtual === "pdf") {
        renderizarPaginaPDF(anotacao.local.pagina);
    } else if (anotacao.local.tipo === "epub" && anotacao.local.cfi && leitorEpubRendition) {
        leitorEpubRendition.display(anotacao.local.cfi);
    }
}

// --- Atalho: virar seleção (ou anotação salva) em card SRS ---
function abrirModalSrsRapido() {
    if (!textoSelecionadoAtual) return;
    cancelarModoClozeSRS('rapido');
    resetarImagensPendentes('rapido');
    const livro = dados.biblioteca.find(l => l.id === leitorLivroAtualId);
    document.getElementById("srs-rapido-tema").value = livro ? livro.titulo : "";
    document.getElementById("srs-rapido-subtema").value = textoSelecionadoAtual;
    document.getElementById("srs-rapido-resposta").value = "";
    document.getElementById("srs-rapido-modal").classList.remove("modal-oculto");
}
function virarAnotacaoEmSrs(idAnotacao) {
    const livro = dados.biblioteca.find(l => l.id === leitorLivroAtualId);
    if (!livro) return;
    const anotacao = (livro.anotacoes || []).find(a => a.id === idAnotacao);
    if (!anotacao) return;
    cancelarModoClozeSRS('rapido');
    resetarImagensPendentes('rapido');
    document.getElementById("srs-rapido-tema").value = livro.titulo;
    document.getElementById("srs-rapido-subtema").value = anotacao.trecho;
    document.getElementById("srs-rapido-resposta").value = "";
    document.getElementById("srs-rapido-modal").classList.remove("modal-oculto");
}
function fecharModalSrsRapido() {
    document.getElementById("srs-rapido-modal").classList.add("modal-oculto");
    cancelarModoClozeSRS('rapido');
    resetarImagensPendentes('rapido');
}
// Troca o conteúdo dos campos Pergunta/Resposta do modal rápido — útil quando o texto selecionado
// deveria virar a RESPOSTA (não a pergunta), sem precisar copiar/colar manualmente.
function inverterPerguntaRespostaRapido() {
    const subtemaEl = document.getElementById("srs-rapido-subtema");
    const respostaEl = document.getElementById("srs-rapido-resposta");
    const temp = subtemaEl.value;
    subtemaEl.value = respostaEl.value;
    respostaEl.value = temp;
}
function confirmarSrsRapido() {
    const tema = document.getElementById("srs-rapido-tema").value.trim();
    const subtema = document.getElementById("srs-rapido-subtema").value.trim();
    const resposta = document.getElementById("srs-rapido-resposta").value.trim();
    if (!tema || !subtema) { alert("Preencha Tema e Pergunta!"); return; }

    const duplicado = dados.srsItems.some(i => i.tema.trim().toLowerCase() === tema.toLowerCase() && i.subtema.trim().toLowerCase() === subtema.toLowerCase());
    if (duplicado && !confirm("Já existe um card com esse tema e pergunta. Deseja adicionar mesmo assim?")) return;

    const novoCard = construirCardObjetoSRS(tema, subtema, resposta, estadoClozeRapido);
    aplicarImagensPendentesNoCard(novoCard, "rapido").then(() => {
        dados.srsItems.push(novoCard);
        fecharModalSrsRapido();
        esconderBarraSelecao();
        salvar();
        alert("Card adicionado ao Deck! 🧠");
    });
}

/* === CONQUISTAS: exibir/ocultar os passos de um objetivo/skill arquivado === */
function alternarPassosConquista(idx) {
    const lista = document.getElementById(`passos-${idx}`);
    const btn = document.getElementById(`btn-passos-${idx}`);
    if (!lista || !btn) return;
    const agoraOculto = lista.classList.toggle("oculto");
    btn.innerText = agoraOculto ? "Ver passos ▾" : "Ocultar passos ▲";
}

/* === ATUALIZAÇÃO VISUAL (DOM) === */
function atualizar() {
    const dataDisplay = document.getElementById("data");
    if (dataDisplay) dataDisplay.innerText = "Hoje: " + hoje();

    // Checklist (só exibe missões ativas hoje: diárias sempre, semanais só no seu dia)
    // Não reconstrói enquanto a pessoa está editando um campo aqui (contenteditable focado) — ver elementoEmEdicaoDentroDe.
    var area = document.getElementById("checklists");
    if (area && !elementoEmEdicaoDentroDe("checklists")) {
        area.innerHTML = "";
        var categoriasAgrupadas = {};
        dados.itens.forEach((item, index) => {
            if (!isItemAtivoHoje(item)) return;
            let c = item.categoria || "Geral";
            if (!categoriasAgrupadas[c]) categoriasAgrupadas[c] = [];
            categoriasAgrupadas[c].push({ ...item, originalIndex: index });
        });
        for (var nomeCat in categoriasAgrupadas) {
            let html = `<div class="bloco-categoria"><h3>${escaparHtml(nomeCat)}</h3><table class='tabela-checklist'><thead><tr><th>✔️</th><th>Missão</th><th>Pts / ❤️ Cura</th><th>Atributos</th><th>Recorrência</th><th>Ação</th></tr></thead><tbody>`;
            categoriasAgrupadas[nomeCat].forEach(item => {
                                let pontosEfetivos = calcularPontosEscalonados(item);
                let healAmount = Math.ceil(pontosEfetivos / 2) || 1;
                let diasAtraso = item.diasSeguidosIncompleta || 0;
                let celulaPontos = diasAtraso > 0
                    ? `<span contenteditable="true" onblur="editarCampoNumerico(${item.originalIndex}, 'pontos', this.innerText)">${item.pontos}</span> <strong style="color:var(--danger-color);">(hoje: ${pontosEfetivos} XP)</strong> / +${healAmount} HP`
                    : `<span contenteditable="true" onblur="editarCampoNumerico(${item.originalIndex}, 'pontos', this.innerText)">${item.pontos}</span> XP / +${healAmount} HP`;
                let seloAtraso = diasAtraso > 0 ? `<br><span class="srs-tag" style="background:var(--danger-bg); color:var(--danger-color); margin-top:4px;">🔥 ${diasAtraso}x atrasada</span>` : "";
                html += `<tr><td><input type='checkbox' ${item.feito ? 'checked' : ''} onchange='alternarItem(${item.originalIndex}, this.checked)'></td><td contenteditable="true" onblur="editarCampo(${item.originalIndex}, 'descricao', this.innerText)">${escaparHtml(item.descricao)}</td><td>${celulaPontos}</td><td contenteditable="true" onblur="editarCampo(${item.originalIndex}, 'atributos', this.innerText)">${escaparHtml(item.atributos)}</td><td><span class="srs-tag">${textoRecorrencia(item)}</span>${seloAtraso}</td><td><button onclick='removerItem(${item.originalIndex})'>🗑️</button></td></tr>`;
            });
            area.innerHTML += html + "</tbody></table></div>";
        }
        if (Object.keys(categoriasAgrupadas).length === 0) {
            area.innerHTML = "<p style='color:var(--text-secondary); text-align:center;'>Nenhuma missão ativa hoje.</p>";
        }
    }

    // Loja e Históricos
    var areaLoja = document.getElementById("lista-recompensas");
    if (areaLoja) {
        areaLoja.innerHTML = "";
        dados.recompensas.forEach((r, index) => {
            const pode = dados.pontosAcumulados >= r.custo;
            areaLoja.innerHTML += `<div class="item-loja"><span><strong>${escaparHtml(r.nome)}</strong> (${r.custo} pts)</span><div><button class="btn-comprar" ${pode ? '' : 'disabled'} onclick="comprarRecompensa(${index})">🛒 Resgatar</button><button onclick="removerRecompensa(${index})" style="background:none; color:var(--danger-color); padding:5px; border:none; cursor:pointer;">🗑️</button></div></div>`;
        });
    }
    const areaHistorico = document.getElementById("corpo-historico");
    if (areaHistorico) {
        areaHistorico.innerHTML = "";
        if (dados.historicoEstudos.length === 0) areaHistorico.innerHTML = "<tr><td colspan='3' style='color:var(--text-secondary);'>Vazio</td></tr>";
        else dados.historicoEstudos.forEach(s => areaHistorico.innerHTML += `<tr><td>${s.data}</td><td>${s.materia || 'Geral'}</td><td>${s.duracao}</td></tr>`);
    }
    const areaMaterias = document.getElementById("corpo-materias");
    const sugestoes = document.getElementById("sugestoes-materias");
    if (areaMaterias) {
        areaMaterias.innerHTML = ""; if (sugestoes) sugestoes.innerHTML = "";
        dados.materias.sort((a,b) => new Date(b.ultimaDataISO) - new Date(a.ultimaDataISO));
        dados.materias.forEach(m => {
            const nomeSeguro = escaparHtml(m.nome);
            areaMaterias.innerHTML += `<tr><td style="font-weight:bold;">${nomeSeguro}</td><td>${m.tempoTotal} min</td><td style="font-size:0.9em;"><span style="color:var(--text-secondary); margin-right:10px;">${escaparHtml(m.ultimaDataDisplay)}</span> <button data-materia="${nomeSeguro}" onclick="removerMateria(this.dataset.materia)" style="background:none; border:none; cursor:pointer;">🗑️</button></td></tr>`;
            if(sugestoes) sugestoes.innerHTML += `<option value="${nomeSeguro}">`;
        });
    }

    // Objetivos
    const areaCascata = document.getElementById("lista-cascata");
    const areaLab = document.getElementById("lista-aprendizado");
    if (areaCascata && areaLab) {
        areaCascata.innerHTML = ""; areaLab.innerHTML = "";
        dados.objetivos.forEach((obj) => {
            const total = obj.marcos.length; const feitos = obj.marcos.filter(m => m.feito).length;
            const progresso = total === 0 ? 0 : Math.round((feitos / total) * 100);
            const corBarra = obj.tipo === 'cascata' ? 'var(--primary-color)' : 'var(--secondary-color)';
            let htmlMarcos = "";
            obj.marcos.forEach((m, idx) => {
                htmlMarcos += `<li class="marco-item" draggable="true"
                    ondragstart="arrastarMarcoInicio(event, ${obj.id}, ${idx})"
                    ondragover="arrastarMarcoSobre(event)"
                    ondragleave="arrastarMarcoSai(event)"
                    ondrop="arrastarMarcoSoltar(event, ${obj.id}, ${idx})"
                    ondragend="arrastarMarcoFim(event)">
                    <span class="marco-handle" title="Arraste para reordenar">⠿</span>
                    <input type="checkbox" ${m.feito ? 'checked' : ''} onchange="alternarMarco(${obj.id}, ${idx})">
                    <span contenteditable="true" onblur="editarMarco(${obj.id}, ${idx}, this.innerText)" style="flex:1; word-break: break-word; ${m.feito ? 'text-decoration:line-through; color:var(--text-secondary);' : ''}">${escaparHtml(m.texto)}</span>
                </li>`;
            });
            let botaoConcluir = (progresso === 100 && total > 0) ? `<button onclick="arquivarObjetivo(${obj.id})" class="btn-arquivar">✨ Concluir & Arquivar (+150XP)</button>` : "";
            const atrasado = obj.prazo && progresso < 100 && obj.prazo < hojeISO();
            const htmlPrazo = `<div class="prazo-objetivo">🗓️ Prazo: <input type="date" value="${obj.prazo || ''}" onchange="editarPrazoObjetivo(${obj.id}, this.value)">${atrasado ? '<span class="badge-atrasado">⚠️ Atrasado</span>' : ''}</div>`;
            const htmlCard = `<div class="objetivo-card" style="border-left: 5px solid ${corBarra}"><div class="obj-header"><span class="obj-titulo">${escaparHtml(obj.titulo)}</span><button onclick="removerObjetivo(${obj.id})" style="background:none; color:var(--danger-color); padding:0; font-size:1.2em;">&times;</button></div><div class="obj-header"><span class="obj-progresso-txt">${progresso}% Concluído</span></div><div class="barra-objetivo"><div class="fill-objetivo" style="width:${progresso}%; background:${corBarra}"></div></div>${htmlPrazo}<ul class="marcos-lista">${htmlMarcos}</ul><input type="text" class="marco-input-novo" placeholder="+ Marco..." onkeypress="if(event.key === 'Enter') adicionarMarco(${obj.id}, this)">${botaoConcluir}</div>`;
            if (obj.tipo === 'cascata') areaCascata.innerHTML += htmlCard; else areaLab.innerHTML += htmlCard;
        });
        if(areaCascata.innerHTML === "") areaCascata.innerHTML = "<p style='color:var(--text-secondary); text-align:center;'>Nenhuma meta de vida ativa.</p>";
        if(areaLab.innerHTML === "") areaLab.innerHTML = "<p style='color:var(--text-secondary); text-align:center;'>Nenhum projeto de estudo ativo.</p>";
    }
    const areaConquistas = document.getElementById("historico-conquistas");
    if(areaConquistas) {
        areaConquistas.innerHTML = "";
        if (dados.historicoConquistas.length === 0) {
            areaConquistas.innerHTML = "<p style='grid-column: 1/-1; text-align:center; color:var(--text-secondary); font-style:italic;'>Ainda nenhuma conquista.</p>";
        } else {
            dados.historicoConquistas.forEach((h, idx) => {
                const temPassos = h.passos && h.passos.length > 0;
                let htmlPassos = "";
                if (temPassos) {
                    htmlPassos = `<button class="btn-ver-passos" id="btn-passos-${idx}" onclick="alternarPassosConquista(${idx})">Ver passos ▾</button><ul class="conquista-passos-lista oculto" id="passos-${idx}">`;
                    h.passos.forEach(p => { htmlPassos += `<li>${escaparHtml(p)}</li>`; });
                    htmlPassos += `</ul>`;
                }
                areaConquistas.innerHTML += `<div class="item-historico"><span class="hist-titulo">${escaparHtml(h.titulo)}</span><span class="hist-data">${escaparHtml(h.dataConclusao)}</span><span class="hist-tipo">${escaparHtml(h.tipo)}</span>${htmlPassos}</div>`;
            });
        }
    }

    // SRS
    // SRS
    sincronizarTemasSRS();
    carregarRevisaoSRS();
    renderizarListaSRS();
    atualizarEstatisticasSRS();
    atualizarBotaoResumoSRS();

    // Biblioteca
    renderizarBiblioteca();

    // Finanças
    renderizarFinancas();

    // Metas e XP
    const dataAtual = new Date();
    const chaveMes = `M_${dataAtual.getMonth() + 1}_${dataAtual.getFullYear()}`;
    const chaveAno = `Y_${dataAtual.getFullYear()}`;
    // NOVO: preenche os cabeçalhos "Este Mês (...)" / "Este Ano (...)" das Metas de Longo Prazo —
    // antes ficavam sempre em branco, pois nada no código escrevia nesses spans.
    const labelMes = document.getElementById("label-mes-atual");
    if (labelMes) labelMes.innerText = dataAtual.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const labelAno = document.getElementById("label-ano-atual");
    if (labelAno) labelAno.innerText = dataAtual.getFullYear();
    const minutosMes = dados.progressoGlobal[chaveMes] || 0;
    const minutosAno = dados.progressoGlobal[chaveAno] || 0;
    const barMes = document.getElementById("progresso-mes");
    if(barMes) { barMes.style.width = Math.min(100, (minutosMes / ((dados.metasGlobais.mes||50)*60)) * 100) + "%"; document.getElementById("texto-progresso-mes").innerText = `${(minutosMes/60).toFixed(1)}h / ${dados.metasGlobais.mes}h`; }
    const barAno = document.getElementById("progresso-ano");
    if(barAno) { barAno.style.width = Math.min(100, (minutosAno / ((dados.metasGlobais.ano||500)*60)) * 100) + "%"; document.getElementById("texto-progresso-ano").innerText = `${(minutosAno/60).toFixed(1)}h / ${dados.metasGlobais.ano}h`; }

    const sessoesRealizadas = contarSessoesHoje();
    const fbMeta = document.getElementById("feedback-meta");
    const metaSessoes = document.getElementById("meta-sessoes");
    if(metaSessoes && fbMeta) { 
        const meta = parseInt(metaSessoes.value) || 1;
        fbMeta.innerHTML = `Sessões hoje: <strong>${sessoesRealizadas}</strong> / ${meta}`; 
        fbMeta.style.color = sessoesRealizadas >= meta ? "var(--primary-color)" : "var(--text-secondary)";
    }

    var nivel = 0, resto = dados.pontosAcumulados;
    while (resto >= pontosParaProximoNivel(nivel)) { resto -= pontosParaProximoNivel(nivel); nivel++; }
    if (nivelAnterior !== null && nivel > nivelAnterior) { 
        document.getElementById("novo-nivel-display").innerText = nivel; 
        document.getElementById("level-up-modal").classList.remove("modal-oculto");
    }
    nivelAnterior = nivel;
    document.getElementById("nivel").innerText = nivel; 
    document.getElementById("faltam").innerText = Math.max(0, pontosParaProximoNivel(nivel) - resto); 
    document.getElementById("total-geral").innerText = dados.pontosAcumulados;
    document.getElementById("progresso").style.width = (pontosParaProximoNivel(nivel) > 0 ? (resto/pontosParaProximoNivel(nivel))*100 : 0) + "%";

    const hpPorcentagem = (dados.hp / dados.maxHp) * 100;
    document.getElementById("barra-hp-fill").style.width = hpPorcentagem + "%";
    document.getElementById("texto-hp").innerText = `${dados.hp} / ${dados.maxHp}`;

    const danoPrevistoEl = document.getElementById("texto-dano-previsto");
    if (danoPrevistoEl) {
        const danoPrevisto = calcularDanoPrevistoHoje();
        danoPrevistoEl.innerText = danoPrevisto > 0 ? `⚠️ -${danoPrevisto} HP previsto hoje` : "";
    }

    const streakAtualEl = document.getElementById("streak-atual");
    const streakRecordeEl = document.getElementById("streak-recorde");
    if (streakAtualEl) streakAtualEl.innerText = dados.streakAtual || 0;
    if (streakRecordeEl) streakRecordeEl.innerText = dados.streakRecorde || 0;
    
    atualizarGraficoRadar();
    atualizarGraficoHistorico();
    atualizarGraficoMaterias();
}

function atualizarGraficoRadar() {
    const canvas = document.getElementById('radarChart'); if (!canvas) return; 
    const ctx = canvas.getContext('2d');
    const labels = Object.keys(dados.maestriaAcumulada).filter(a => dados.maestriaAcumulada[a] > 0);
    const valores = labels.map(a => dados.maestriaAcumulada[a]);
    if (meuRadarChart) meuRadarChart.destroy();
    if (labels.length === 0) { ctx.clearRect(0,0,canvas.width,canvas.height); return; }
    const isDark = dados.tema === 'escuro';
    meuRadarChart = new Chart(ctx, {
        type: 'radar',
        data: { labels: labels, datasets: [{ label: 'Maestria', data: valores, backgroundColor: 'rgba(33, 150, 243, 0.2)', borderColor: 'rgba(33, 150, 243, 1)', borderWidth: 2, pointBackgroundColor: 'rgba(33, 150, 243, 1)' }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { r: { beginAtZero: true, ticks: { display: false }, pointLabels: { font: { size: 12, weight: 'bold' }, color: isDark ? '#fff' : '#666' }, grid: { color: isDark ? '#444' : '#ddd' } } }, plugins: { legend: { display: false } } }
    });
}

function atualizarGraficoHistorico() {
    const canvas = document.getElementById('historicoChart'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (meuHistoricoChart) meuHistoricoChart.destroy();
    if (!dados.historicoDiario || dados.historicoDiario.length === 0) { ctx.clearRect(0,0,canvas.width,canvas.height); return; }
    const isDark = dados.tema === 'escuro';
    const labels = dados.historicoDiario.map(d => d.data);
    const hpData = dados.historicoDiario.map(d => d.hp);
    const xpData = dados.historicoDiario.map(d => d.xp);
    meuHistoricoChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'HP', data: hpData, borderColor: '#e53935', backgroundColor: 'rgba(229,57,53,0.1)', yAxisID: 'yHP', tension: 0.3 },
                { label: 'XP Acumulado', data: xpData, borderColor: '#2196F3', backgroundColor: 'rgba(33,150,243,0.1)', yAxisID: 'yXP', tension: 0.3 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                yHP: { type: 'linear', position: 'left', min: 0, max: dados.maxHp, ticks: { color: isDark ? '#fff' : '#666' }, grid: { color: isDark ? '#333' : '#eee' } },
                yXP: { type: 'linear', position: 'right', min: 0, ticks: { color: isDark ? '#fff' : '#666' }, grid: { drawOnChartArea: false } },
                x: { ticks: { color: isDark ? '#fff' : '#666' }, grid: { color: isDark ? '#333' : '#eee' } }
            },
            plugins: { legend: { labels: { color: isDark ? '#fff' : '#666' } } }
        }
    });
}

function atualizarGraficoMaterias() {
    const canvas = document.getElementById('materiasChart'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (meuMateriasChart) meuMateriasChart.destroy();
    if (!dados.materias || dados.materias.length === 0) { ctx.clearRect(0,0,canvas.width,canvas.height); return; }
    const isDark = dados.tema === 'escuro';
    const labels = dados.materias.map(m => m.nome);
    const valores = dados.materias.map(m => m.tempoTotal);
    const cores = ['#2196F3','#4caf50','#ff9800','#9c27b0','#e53935','#00bcd4','#8bc34a','#ffc107','#795548','#607d8b'];
    meuMateriasChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'Minutos estudados', data: valores, backgroundColor: labels.map((_,i) => cores[i % cores.length]) }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { color: isDark ? '#fff' : '#666' }, grid: { color: isDark ? '#333' : '#eee' } },
                x: { ticks: { color: isDark ? '#fff' : '#666' }, grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function fecharModal() { document.getElementById("level-up-modal").classList.add("modal-oculto"); }

// ============================================================
// === FINANÇAS PESSOAIS ===
// ============================================================

// --- Utilitários ---
function formatarMoeda(v) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function formatarDataBR(iso) { if (!iso) return ""; const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; }
function mesAtualChave() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function chaveMesDaData(iso) { return iso ? iso.slice(0, 7) : ""; }

function lancamentosDoMes(chaveMes) {
    return dados.financas.lancamentos.filter(l => chaveMesDaData(l.data) === chaveMes);
}
function totalPorTipoNoMes(chaveMes, tipo) {
    return lancamentosDoMes(chaveMes).filter(l => l.tipo === tipo).reduce((soma, l) => soma + l.valor, 0);
}
function totalPorCategoriaNoMes(chaveMes, categoria) {
    return lancamentosDoMes(chaveMes).filter(l => l.tipo === 'saida' && l.categoria === categoria).reduce((soma, l) => soma + l.valor, 0);
}

// --- 1) Lançamentos ---
function adicionarLancamento() {
    const data = document.getElementById("financas-lanc-data").value || hojeISO();
    const tipo = document.getElementById("financas-lanc-tipo").value;
    const categoria = document.getElementById("financas-lanc-categoria").value;
    const valor = parseFloat(document.getElementById("financas-lanc-valor").value);
    const descricao = document.getElementById("financas-lanc-descricao").value.trim();

    if (!valor || valor <= 0) { alert("Informe um valor válido."); return; }
    if (!categoria) { alert("Escolha uma categoria (crie uma primeiro, se a lista estiver vazia)."); return; }

    dados.financas.lancamentos.unshift({ id: Date.now(), data: data, tipo: tipo, categoria: categoria, valor: valor, descricao: descricao });
    document.getElementById("financas-lanc-valor").value = "";
    document.getElementById("financas-lanc-descricao").value = "";
    verificarOrcamentosEstourados();
    salvar();
}
function removerLancamento(id) {
    dados.financas.lancamentos = dados.financas.lancamentos.filter(l => l.id !== id);
    salvar();
}

// --- 3) Categorias customizáveis ---
function adicionarCategoriaFinancas() {
    const input = document.getElementById("financas-nova-categoria");
    const nome = input.value.trim();
    if (!nome) return;
    if (dados.financas.categorias.some(c => c.toLowerCase() === nome.toLowerCase())) { alert("Essa categoria já existe."); return; }
    dados.financas.categorias.push(nome);
    input.value = "";
    salvar();
}
function renomearCategoriaFinancas(nomeAtual) {
    const novoNome = prompt(`Renomear categoria "${nomeAtual}" para:`, nomeAtual);
    if (novoNome === null) return;
    const novoNomeLimpo = novoNome.trim();
    if (!novoNomeLimpo) { alert("O nome não pode ficar vazio."); return; }

    const idx = dados.financas.categorias.indexOf(nomeAtual);
    if (idx === -1) return;
    dados.financas.categorias[idx] = novoNomeLimpo;
    dados.financas.lancamentos.forEach(l => { if (l.categoria === nomeAtual) l.categoria = novoNomeLimpo; });
    dados.financas.contasFixas.forEach(c => { if (c.categoria === nomeAtual) c.categoria = novoNomeLimpo; });
    if (dados.financas.orcamentos[nomeAtual] !== undefined) {
        dados.financas.orcamentos[novoNomeLimpo] = dados.financas.orcamentos[nomeAtual];
        delete dados.financas.orcamentos[nomeAtual];
    }
    salvar();
}
function removerCategoriaFinancas(nome) {
    const emUso = dados.financas.lancamentos.some(l => l.categoria === nome) || dados.financas.contasFixas.some(c => c.categoria === nome);
    if (emUso && !confirm(`A categoria "${nome}" já foi usada em lançamentos ou contas fixas. Remover mesmo assim? (Os lançamentos existentes mantêm o nome antigo, só não vai mais aparecer na lista pra novos lançamentos.)`)) return;
    dados.financas.categorias = dados.financas.categorias.filter(c => c !== nome);
    delete dados.financas.orcamentos[nome];
    salvar();
}
function sincronizarSelectsCategoriaFinancas() {
    const opcoes = dados.financas.categorias.map(c => `<option value="${escaparHtml(c)}">${escaparHtml(c)}</option>`).join("");
    document.querySelectorAll(".select-categoria-financas").forEach(sel => {
        const valorAtual = sel.value;
        sel.innerHTML = opcoes;
        if (dados.financas.categorias.includes(valorAtual)) sel.value = valorAtual;
    });
}

// --- 8) Orçamento por categoria ---
function editarOrcamentoCategoria(categoria, valor) {
    const numero = parseFloat(valor);
    if (!numero || numero <= 0) delete dados.financas.orcamentos[categoria];
    else dados.financas.orcamentos[categoria] = numero;
    salvar();
}
// Aplica -15 HP na 1ª vez que uma categoria estoura o orçamento num mês (não desconta de novo no mesmo mês).
function verificarOrcamentosEstourados() {
    const chaveMes = mesAtualChave();
    let mudou = false;
    Object.keys(dados.financas.orcamentos).forEach(categoria => {
        const limite = dados.financas.orcamentos[categoria];
        const gasto = totalPorCategoriaNoMes(chaveMes, categoria);
        const chave = `${chaveMes}_${categoria}`;
        if (gasto > limite && !dados.financas._penalidadesOrcamento[chave]) {
            dados.financas._penalidadesOrcamento[chave] = true;
            dados.hp = Math.max(0, dados.hp - 15);
            mudou = true;
            alert(`⚠️ Você estourou o orçamento de "${categoria}" este mês! -15 HP`);
        }
    });
    return mudou;
}

// --- 5) Metas de economia ---
function adicionarMetaFinancas() {
    const nome = document.getElementById("financas-meta-nome").value.trim();
    const valorAlvo = parseFloat(document.getElementById("financas-meta-valor").value);
    const prazo = document.getElementById("financas-meta-prazo").value || null;
    if (!nome || !valorAlvo || valorAlvo <= 0) { alert("Preencha nome e valor alvo da meta."); return; }

    dados.financas.metas.push({ id: Date.now(), nome: nome, valorAlvo: valorAlvo, valorGuardado: 0, prazo: prazo, bonusXpDado: false });
    document.getElementById("financas-meta-nome").value = "";
    document.getElementById("financas-meta-valor").value = "";
    document.getElementById("financas-meta-prazo").value = "";
    salvar();
}
function atualizarValorGuardadoMeta(id, valor) {
    const meta = dados.financas.metas.find(m => m.id === id);
    if (!meta) return;
    meta.valorGuardado = Math.max(0, parseFloat(valor) || 0);
    if (meta.valorGuardado >= meta.valorAlvo && !meta.bonusXpDado) {
        meta.bonusXpDado = true;
        dados.pontosAcumulados += 50;
        tocarSom();
        alert(`🎉 Meta "${meta.nome}" batida! +50 XP`);
    }
    salvar();
}
function removerMetaFinancas(id) {
    if (!confirm("Remover essa meta?")) return;
    dados.financas.metas = dados.financas.metas.filter(m => m.id !== id);
    salvar();
}

// --- 6) Gastos fixos recorrentes ---
// Calcula o vencimento no mês seguinte ao de referência, ajustando pra meses com menos dias (ex: dia 31 em fevereiro -> dia 28/29).
function proximoMesData(diaVencimento, aPartirDeISO) {
    const base = new Date(aPartirDeISO + "T00:00:00");
    let ano = base.getFullYear(), mes = base.getMonth() + 2; // +1 pra mês seguinte (base.getMonth() é 0-indexado) +1 de novo pro "new Date(ano, mes, 0)" pegar o último dia do mês certo
    if (mes > 12) { mes -= 12; ano++; }
    const ultimoDiaMes = new Date(ano, mes, 0).getDate();
    const dia = Math.min(diaVencimento, ultimoDiaMes);
    return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
function calcularProximoVencimento(diaVencimento) {
    const hojeD = new Date();
    const ano = hojeD.getFullYear(), mes = hojeD.getMonth() + 1;
    const ultimoDiaMesAtual = new Date(ano, mes, 0).getDate();
    const diaAjustado = Math.min(diaVencimento, ultimoDiaMesAtual);
    const vencimentoEsteMes = `${ano}-${String(mes).padStart(2, '0')}-${String(diaAjustado).padStart(2, '0')}`;
    return vencimentoEsteMes >= hojeISO() ? vencimentoEsteMes : proximoMesData(diaVencimento, hojeISO());
}

function adicionarContaFixa() {
    const nome = document.getElementById("financas-fixa-nome").value.trim();
    const valor = parseFloat(document.getElementById("financas-fixa-valor").value);
    const dia = parseInt(document.getElementById("financas-fixa-dia").value, 10);
    const categoria = document.getElementById("financas-fixa-categoria").value;
    if (!nome || !valor || valor <= 0 || !dia || dia < 1 || dia > 31) { alert("Preencha nome, valor e um dia de vencimento válido (1 a 31)."); return; }

    dados.financas.contasFixas.push({
        id: Date.now(), nome: nome, valor: valor, diaVencimento: dia,
        categoria: categoria || dados.financas.categorias[0] || "Geral",
        proximoVencimento: calcularProximoVencimento(dia), penalizouVencimento: false
    });
    document.getElementById("financas-fixa-nome").value = "";
    document.getElementById("financas-fixa-valor").value = "";
    document.getElementById("financas-fixa-dia").value = "";
    salvar();
}
// Marcar como paga gera o lançamento de saída correspondente e já calcula o próximo vencimento (mês seguinte).
function marcarContaFixaPaga(id) {
    const conta = dados.financas.contasFixas.find(c => c.id === id);
    if (!conta) return;
    dados.financas.lancamentos.unshift({
        id: Date.now(), data: hojeISO(), tipo: 'saida', categoria: conta.categoria,
        valor: conta.valor, descricao: `${conta.nome} (conta fixa)`
    });
    // NOVO: se a conta ficou vencida por mais de um mês antes de ser paga, avança quantos meses forem
    // necessários até cair no futuro — antes, avançava só 1 mês a partir da data antiga de vencimento,
    // podendo devolver uma data que ainda estava no passado (a conta reaparecia "vencida" e penalizava
    // de novo, mesmo tendo sido paga agora).
    let proximo = proximoMesData(conta.diaVencimento, conta.proximoVencimento);
    let tentativas = 0;
    while (proximo <= hojeISO() && tentativas < 60) { proximo = proximoMesData(conta.diaVencimento, proximo); tentativas++; }
    conta.proximoVencimento = proximo;
    conta.penalizouVencimento = false;
    verificarOrcamentosEstourados();
    salvar();
}
function removerContaFixa(id) {
    if (!confirm("Remover essa conta fixa?")) return;
    dados.financas.contasFixas = dados.financas.contasFixas.filter(c => c.id !== id);
    salvar();
}

// --- 9) Lembrete de contas a vencer ---
// Só roda 1x quando o app abre (não há como avisar com o navegador fechado, já que roda como arquivo local).
function verificarContasAVencer() {
    const hojeIsoAtual = hojeISO();
    let mudou = false;
    dados.financas.contasFixas.forEach(conta => {
        if (conta.proximoVencimento < hojeIsoAtual && !conta.penalizouVencimento) {
            conta.penalizouVencimento = true;
            dados.hp = Math.max(0, dados.hp - 10);
            mudou = true;
        }
    });
    if (dados.financas.contasFixas.some(c => c.proximoVencimento <= hojeIsoAtual)) {
        enviarNotificacao("💰 Contas a vencer", "Você tem contas fixas vencendo hoje ou já vencidas. Confira a aba Finanças.");
    }
    if (mudou) salvar();
}
function atualizarBannerVencimentoContas() {
    const banner = document.getElementById("financas-banner-vencimento");
    if (!banner) return;
    const hojeIsoAtual = hojeISO();
    const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
    const amanhaISO = amanha.toISOString().split('T')[0];

    const vencidas = dados.financas.contasFixas.filter(c => c.proximoVencimento < hojeIsoAtual);
    const venceHoje = dados.financas.contasFixas.filter(c => c.proximoVencimento === hojeIsoAtual);
    const venceAmanha = dados.financas.contasFixas.filter(c => c.proximoVencimento === amanhaISO);

    if (vencidas.length === 0 && venceHoje.length === 0 && venceAmanha.length === 0) {
        banner.classList.add("oculto"); banner.innerHTML = ""; return;
    }
    let partes = [];
    if (vencidas.length) partes.push(`🔴 <strong>${vencidas.length} conta(s) vencida(s):</strong> ${vencidas.map(c => escaparHtml(c.nome)).join(", ")}`);
    if (venceHoje.length) partes.push(`🟡 <strong>Vence hoje:</strong> ${venceHoje.map(c => escaparHtml(c.nome)).join(", ")}`);
    if (venceAmanha.length) partes.push(`🟠 <strong>Vence amanhã:</strong> ${venceAmanha.map(c => escaparHtml(c.nome)).join(", ")}`);
    banner.innerHTML = partes.join("<br>");
    banner.classList.remove("oculto");
}

// --- NOVO: Investimentos (acompanhamento semanal/mensal/total) ---
// Cada atualização registra o VALOR TOTAL guardado naquele momento; o rendimento é sempre calculado
// em relação ao registro anterior (por isso a cadência esperada é semanal — "toda semana" vira,
// na prática, "desde a última atualização").
function registrarAtualizacaoInvestimento() {
    const valorInput = document.getElementById("financas-invest-valor");
    const aporteInput = document.getElementById("financas-invest-aporte");
    const novoValor = parseFloat(valorInput.value);
    if (isNaN(novoValor) || novoValor < 0) { alert("Informe um valor válido."); return; }
    const aporte = Math.max(0, parseFloat(aporteInput.value) || 0);

    const historico = dados.financas.investimentos.historico;
    const anterior = historico.length > 0 ? historico[historico.length - 1] : null;
    // NOVO: desconta o aporte (dinheiro que você mesmo colocou agora) do rendimento — antes esse campo
    // existia no formulário mas nunca era lido em lugar nenhum do código, então um aporte era contado
    // como se fosse ganho do investimento.
    const rendimentoValor = anterior ? (novoValor - anterior.valorTotal) - aporte : 0;
    const rendimentoPercentual = anterior && anterior.valorTotal > 0 ? (rendimentoValor / anterior.valorTotal) * 100 : 0;

    historico.push({ id: Date.now(), data: hojeISO(), valorTotal: novoValor, aporte: aporte, rendimentoValor: rendimentoValor, rendimentoPercentual: rendimentoPercentual });
    valorInput.value = "";
    aporteInput.value = "";
    salvar();
}
function removerUltimaAtualizacaoInvestimento() {
    if (dados.financas.investimentos.historico.length === 0) return;
    if (!confirm("Remover a última atualização de investimento registrada?")) return;
    dados.financas.investimentos.historico.pop();
    salvar();
}

// Resumo "ao vivo": semanal (desde a última atualização) e mensal (desde o início do mês atual) —
// esses dois desaparecem daqui e passam a viver só no histórico assim que o mês vira. O total
// (desde o primeiro registro) fica sempre visível, independente do mês.
function obterResumoInvestimentos() {
    const historico = dados.financas.investimentos.historico;
    if (historico.length === 0) return null;

    const atual = historico[historico.length - 1];
    const primeiro = historico[0];

    // NOVO: "esta semana" usa o rendimento já calculado (e líquido de aporte) na própria atualização
    // mais recente, em vez de refazer a subtração crua valorTotal - valorTotal (que ignorava aporte).
    const semanal = historico.length > 1
        ? { valor: atual.rendimentoValor, percentual: atual.rendimentoPercentual }
        : null;

    const mensal = calcularCrescimentoInvestimentoNoMes(mesAtualChave()) || { rendimentoValor: 0, rendimentoPercentual: 0 };

    // NOVO: desconta do total todos os aportes feitos DEPOIS do primeiro registro — o aporte do
    // próprio primeiro registro já está embutido no valorTotal dele (é a linha de base), então não
    // entra nessa soma.
    const somaAportesAposPrimeiro = historico.slice(1).reduce((soma, h) => soma + (h.aporte || 0), 0);
    const valorTotalBruto = atual.valorTotal - primeiro.valorTotal;
    const valorTotalLiquido = valorTotalBruto - somaAportesAposPrimeiro;
    const total = { valor: valorTotalLiquido, percentual: primeiro.valorTotal > 0 ? (valorTotalLiquido / primeiro.valorTotal) * 100 : 0 };

    return {
        valorAtual: atual.valorTotal,
        dataUltimaAtualizacao: atual.data,
        semanal: semanal,
        mensal: { valor: mensal.rendimentoValor, percentual: mensal.rendimentoPercentual },
        total: total
    };
}

// Calcula o rendimento do investimento dentro de um mês específico (usado tanto pro resumo "ao vivo"
// do mês atual quanto pra cada mês fechado dentro do histórico expansível).
function calcularCrescimentoInvestimentoNoMes(chaveMes) {
    const historico = dados.financas.investimentos.historico;
    if (historico.length === 0) return null;
    const registrosDoMes = historico.filter(h => chaveMesDaData(h.data) === chaveMes);
    if (registrosDoMes.length === 0) return null;

    const registrosAntes = historico.filter(h => chaveMesDaData(h.data) < chaveMes);
    const temBaseAnterior = registrosAntes.length > 0;
    const valorInicio = temBaseAnterior ? registrosAntes[registrosAntes.length - 1].valorTotal : registrosDoMes[0].valorTotal;
    const valorFim = registrosDoMes[registrosDoMes.length - 1].valorTotal;

    // NOVO: desconta os aportes feitos dentro do mês do rendimento — se já havia um registro ANTES
    // do mês (valorInicio veio dele), todo aporte do mês é descontado; se o mês começa sem linha de
    // base (o 1º registro do mês É o valorInicio), o aporte desse 1º registro já está embutido nele
    // e não deve ser descontado de novo, só os aportes dos registros seguintes dentro do mês.
    const registrosParaSomarAporte = temBaseAnterior ? registrosDoMes : registrosDoMes.slice(1);
    const somaAportes = registrosParaSomarAporte.reduce((soma, h) => soma + (h.aporte || 0), 0);

    const rendimentoValor = (valorFim - valorInicio) - somaAportes;
    const rendimentoPercentual = valorInicio > 0 ? (rendimentoValor / valorInicio) * 100 : 0;
    return { valorInicio: valorInicio, valorFim: valorFim, rendimentoValor: rendimentoValor, rendimentoPercentual: rendimentoPercentual };
}

function renderizarResumoInvestimentos() {
    const container = document.getElementById("financas-invest-resumo");
    if (!container) return;
    const resumo = obterResumoInvestimentos();
    if (!resumo) { container.innerHTML = `<p style="color:var(--text-secondary);">Nenhuma atualização registrada ainda.</p>`; return; }

    const corSemanal = resumo.semanal ? (resumo.semanal.valor >= 0 ? '#4caf50' : 'var(--danger-color)') : 'var(--text-secondary)';
    const corMensal = resumo.mensal.valor >= 0 ? '#4caf50' : 'var(--danger-color)';
    const corTotal = resumo.total.valor >= 0 ? '#4caf50' : 'var(--danger-color)';
    const txtSemanal = resumo.semanal ? `${formatarMoeda(resumo.semanal.valor)} (${resumo.semanal.percentual.toFixed(2)}%)` : '—';

    container.innerHTML = `
        <div class="status-box">
            <div><strong>Valor atual</strong><p>${formatarMoeda(resumo.valorAtual)}</p></div>
            <div><strong>Esta semana</strong><p style="color:${corSemanal};">${txtSemanal}</p></div>
            <div><strong>Este mês</strong><p style="color:${corMensal};">${formatarMoeda(resumo.mensal.valor)} (${resumo.mensal.percentual.toFixed(2)}%)</p></div>
            <div><strong>Total (desde o início)</strong><p style="color:${corTotal};">${formatarMoeda(resumo.total.valor)} (${resumo.total.percentual.toFixed(2)}%)</p></div>
        </div>
        <p style="font-size:0.8em; color:var(--text-secondary); text-align:center; margin-top:8px;">Última atualização: ${formatarDataBR(resumo.dataUltimaAtualizacao)}</p>
    `;
}

// --- NOVO: Histórico Mensal Detalhado (expansível) ---
// Sempre começa recolhido ao carregar a página, mesmo padrão da Estante de livros concluídos.
function alternarHistoricoMensalFinancas() {
    const corpo = document.getElementById("lista-historico-mensal-financas");
    const seta = document.getElementById("seta-historico-financas");
    if (!corpo) return;
    const agoraOculto = corpo.classList.toggle("oculto");
    if (seta) seta.innerText = agoraOculto ? "▶" : "▼";
}

function renderizarHistoricoMensalFinancas() {
    const container = document.getElementById("lista-historico-mensal-financas");
    if (!container) return;

    const chaveMesAtual = mesAtualChave();
    const mesesComDados = new Set();
    dados.financas.lancamentos.forEach(l => mesesComDados.add(chaveMesDaData(l.data)));
    dados.financas.investimentos.historico.forEach(h => mesesComDados.add(chaveMesDaData(h.data)));
    mesesComDados.delete(chaveMesAtual); // o mês em andamento já aparece "ao vivo" no resto da aba

    const mesesOrdenados = [...mesesComDados].sort().reverse();
    if (mesesOrdenados.length === 0) {
        container.innerHTML = `<p style="color:var(--text-secondary);">Ainda não há meses fechados pra mostrar aqui — eles aparecem sozinhos assim que o mês atual virar.</p>`;
        return;
    }

    container.innerHTML = mesesOrdenados.map(chaveMes => {
        const [ano, mes] = chaveMes.split('-');
        const nomeMes = new Date(parseInt(ano, 10), parseInt(mes, 10) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

        const entradas = totalPorTipoNoMes(chaveMes, 'entrada');
        const saidas = totalPorTipoNoMes(chaveMes, 'saida');
        const saldo = entradas - saidas;

        const crescInvest = calcularCrescimentoInvestimentoNoMes(chaveMes);
        let blocoInvest = "";
        if (crescInvest) {
            const cor = crescInvest.rendimentoValor >= 0 ? '#4caf50' : 'var(--danger-color)';
            const atualizacoesDoMes = dados.financas.investimentos.historico.filter(h => chaveMesDaData(h.data) === chaveMes);
            blocoInvest = `<div class="historico-mes-investimento">
                <strong>📈 Investimento no mês:</strong> <span style="color:${cor};">${formatarMoeda(crescInvest.rendimentoValor)} (${crescInvest.rendimentoPercentual.toFixed(2)}%)</span>
                <ul class="historico-mes-atualizacoes">
                    ${atualizacoesDoMes.map(a => `<li>${formatarDataBR(a.data)}: ${formatarMoeda(a.valorTotal)} <span style="color:${a.rendimentoValor >= 0 ? '#4caf50' : 'var(--danger-color)'};">(${a.rendimentoValor >= 0 ? '+' : ''}${formatarMoeda(a.rendimentoValor)}, ${a.rendimentoPercentual.toFixed(2)}%)</span></li>`).join("")}
                </ul>
            </div>`;
        }

        return `<div class="historico-mes-item">
            <div class="historico-mes-cabecalho"><strong>${escaparHtml(nomeMes)}</strong></div>
            <div class="historico-mes-resumo">
                <span>Entradas: <strong style="color:#4caf50;">${formatarMoeda(entradas)}</strong></span>
                <span>Saídas: <strong style="color:var(--danger-color);">${formatarMoeda(saidas)}</strong></span>
                <span>Saldo: <strong style="color:${saldo >= 0 ? '#4caf50' : 'var(--danger-color)'};">${formatarMoeda(saldo)}</strong></span>
            </div>
            ${blocoInvest}
        </div>`;
    }).join("");
}

// --- 4) e 7) Gráficos (Chart.js, mesmo padrão do RPG) ---
function atualizarGraficoCategoriasFinancas() {
    const canvas = document.getElementById('graficoCategoriasChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (meuCategoriasChart) meuCategoriasChart.destroy();

    const chaveMes = mesAtualChave();
    const categoriasComGasto = dados.financas.categorias
        .map(c => ({ nome: c, total: totalPorCategoriaNoMes(chaveMes, c) }))
        .filter(c => c.total > 0);

    const isDark = dados.tema === 'escuro';
    if (categoriasComGasto.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = isDark ? '#888' : '#999';
        ctx.textAlign = 'center';
        ctx.fillText('Nenhum gasto categorizado este mês ainda.', canvas.width / 2, canvas.height / 2);
        return;
    }
    const cores = ['#2196F3', '#4caf50', '#ff9800', '#9c27b0', '#e53935', '#00bcd4', '#8bc34a', '#ffc107', '#795548', '#607d8b'];
    meuCategoriasChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: categoriasComGasto.map(c => c.nome),
            datasets: [{ data: categoriasComGasto.map(c => c.total), backgroundColor: categoriasComGasto.map((_, i) => cores[i % cores.length]) }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: isDark ? '#fff' : '#666' } } } }
    });
}
function atualizarGraficoHistoricoFinancas() {
    const canvas = document.getElementById('graficoHistoricoFinancasChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (meuHistoricoFinancasChart) meuHistoricoFinancasChart.destroy();

    const meses = [];
    const base = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
        meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const labels = meses.map(m => { const [a, mm] = m.split('-'); return `${mm}/${a.slice(2)}`; });
    const entradasPorMes = meses.map(m => totalPorTipoNoMes(m, 'entrada'));
    const saidasPorMes = meses.map(m => totalPorTipoNoMes(m, 'saida'));
    const saldoPorMes = meses.map((m, i) => entradasPorMes[i] - saidasPorMes[i]);

    const isDark = dados.tema === 'escuro';
    meuHistoricoFinancasChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Entradas', data: entradasPorMes, borderColor: '#4caf50', backgroundColor: 'rgba(76,175,80,0.1)', tension: 0.3 },
                { label: 'Saídas', data: saidasPorMes, borderColor: '#e53935', backgroundColor: 'rgba(229,57,53,0.1)', tension: 0.3 },
                { label: 'Saldo', data: saldoPorMes, borderColor: '#2196F3', backgroundColor: 'rgba(33,150,243,0.1)', tension: 0.3 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { ticks: { color: isDark ? '#fff' : '#666' }, grid: { color: isDark ? '#333' : '#eee' } },
                x: { ticks: { color: isDark ? '#fff' : '#666' }, grid: { color: isDark ? '#333' : '#eee' } }
            },
            plugins: { legend: { labels: { color: isDark ? '#fff' : '#666' } } }
        }
    });
}

// --- Renderização geral da aba (chamada a cada atualizar(), igual Biblioteca/SRS) ---
function renderizarFinancas() {
    const container = document.getElementById("aba-financas");
    if (!container) return;

    sincronizarSelectsCategoriaFinancas();
    atualizarBannerVencimentoContas();

    const chaveMes = mesAtualChave();
    const totalEntradas = totalPorTipoNoMes(chaveMes, 'entrada');
    const totalSaidas = totalPorTipoNoMes(chaveMes, 'saida');
    const saldo = totalEntradas - totalSaidas;

    const elEntradas = document.getElementById("financas-total-entradas");
    const elSaidas = document.getElementById("financas-total-saidas");
    const elSaldo = document.getElementById("financas-saldo");
    if (elEntradas) elEntradas.innerText = formatarMoeda(totalEntradas);
    if (elSaidas) elSaidas.innerText = formatarMoeda(totalSaidas);
    if (elSaldo) { elSaldo.innerText = formatarMoeda(saldo); elSaldo.style.color = saldo >= 0 ? "#4caf50" : "var(--danger-color)"; }

    // Lançamentos do mês, mais recente primeiro
    const corpoLanc = document.getElementById("corpo-lancamentos");
    if (corpoLanc) {
        const doMes = lancamentosDoMes(chaveMes).slice().sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);
        corpoLanc.innerHTML = doMes.length === 0
            ? `<tr><td colspan="6" style="color:var(--text-secondary);">Nenhum lançamento este mês.</td></tr>`
            : doMes.map(l => `<tr><td>${formatarDataBR(l.data)}</td><td>${l.tipo === 'entrada' ? '🟢 Entrada' : '🔴 Saída'}</td><td>${escaparHtml(l.categoria)}</td><td>${formatarMoeda(l.valor)}</td><td>${escaparHtml(l.descricao || "")}</td><td><button onclick="removerLancamento(${l.id})" style="background:none; color:var(--danger-color); border:none; cursor:pointer;">🗑️</button></td></tr>`).join("");
    }

    // Categorias
    const listaCat = document.getElementById("lista-categorias-financas");
    if (listaCat) {
        listaCat.innerHTML = dados.financas.categorias.map(c =>
            `<span class="tag-categoria-financas" data-categoria="${escaparHtml(c)}">${escaparHtml(c)} <button onclick="renomearCategoriaFinancas(this.parentElement.dataset.categoria)" title="Renomear">✏️</button><button onclick="removerCategoriaFinancas(this.parentElement.dataset.categoria)" title="Remover">✖</button></span>`
        ).join("") || `<p style="color:var(--text-secondary);">Nenhuma categoria ainda.</p>`;
    }

    // Orçamentos
    const listaOrc = document.getElementById("lista-orcamentos-financas");
    if (listaOrc && !elementoEmEdicaoDentroDe("lista-orcamentos-financas")) {
        listaOrc.innerHTML = dados.financas.categorias.length === 0
            ? `<p style="color:var(--text-secondary);">Crie uma categoria primeiro.</p>`
            : dados.financas.categorias.map(c => {
                const limite = dados.financas.orcamentos[c];
                const gasto = totalPorCategoriaNoMes(chaveMes, c);
                const estourou = limite && gasto > limite;
                return `<div class="linha-orcamento-financas${estourou ? ' estourado' : ''}">
                    <span>${estourou ? '⚠️ ' : ''}${escaparHtml(c)}</span>
                    <span class="orcamento-gasto-info">${formatarMoeda(gasto)}${limite ? ' / ' + formatarMoeda(limite) : ''}</span>
                    <input type="number" placeholder="Sem limite" value="${limite || ''}" min="0" step="0.01" data-categoria="${escaparHtml(c)}" onblur="editarOrcamentoCategoria(this.dataset.categoria, this.value)">
                </div>`;
            }).join("");
    }

    // Metas
    const listaMetas = document.getElementById("lista-metas-financas");
    if (listaMetas && !elementoEmEdicaoDentroDe("lista-metas-financas")) {
        listaMetas.innerHTML = dados.financas.metas.length === 0
            ? `<p style="color:var(--text-secondary);">Nenhuma meta criada ainda.</p>`
            : dados.financas.metas.map(m => {
                const pct = Math.min(100, Math.round((m.valorGuardado / m.valorAlvo) * 100));
                const bateu = m.valorGuardado >= m.valorAlvo;
                return `<div class="card-meta-financas">
                    <div class="card-meta-topo">
                        <strong>${escaparHtml(m.nome)}${bateu ? ' 🎉' : ''}</strong>
                        <button onclick="removerMetaFinancas(${m.id})" style="background:none; color:var(--danger-color); border:none; cursor:pointer;">🗑️</button>
                    </div>
                    <div class="barra"><div class="barra-fill-meta" style="width:${pct}%; background: ${bateu ? 'linear-gradient(90deg,#4caf50,#8bc34a)' : 'linear-gradient(90deg,#2196F3,#64b5f6)'};"></div></div>
                    <div class="card-meta-info">
                        <input type="number" value="${m.valorGuardado}" min="0" step="0.01" onblur="atualizarValorGuardadoMeta(${m.id}, this.value)"> guardado de ${formatarMoeda(m.valorAlvo)} (${pct}%)${m.prazo ? ` — prazo: ${formatarDataBR(m.prazo)}` : ''}
                    </div>
                </div>`;
            }).join("");
    }

    // Contas fixas
    const listaFixas = document.getElementById("lista-contas-fixas");
    if (listaFixas) {
        const hojeIsoAtual = hojeISO();
        listaFixas.innerHTML = dados.financas.contasFixas.length === 0
            ? `<p style="color:var(--text-secondary);">Nenhuma conta fixa cadastrada.</p>`
            : dados.financas.contasFixas.slice().sort((a, b) => a.proximoVencimento.localeCompare(b.proximoVencimento)).map(c => {
                const vencida = c.proximoVencimento < hojeIsoAtual;
                const status = vencida ? '🔴 Vencida' : (c.proximoVencimento === hojeIsoAtual ? '🟡 Vence hoje' : `Vence em ${formatarDataBR(c.proximoVencimento)}`);
                return `<div class="linha-conta-fixa${vencida ? ' vencida' : ''}">
                    <span><strong>${escaparHtml(c.nome)}</strong> (${escaparHtml(c.categoria)}) — ${formatarMoeda(c.valor)}</span>
                    <span>${status}</span>
                    <div>
                        <button onclick="marcarContaFixaPaga(${c.id})">✔️ Marcar como paga</button>
                        <button onclick="removerContaFixa(${c.id})" style="background:none; color:var(--danger-color); border:none; cursor:pointer;">🗑️</button>
                    </div>
                </div>`;
            }).join("");
    }

    atualizarGraficoCategoriasFinancas();
    atualizarGraficoHistoricoFinancas();
    renderizarResumoInvestimentos();
    renderizarHistoricoMensalFinancas();
}

function abrirAba(evt, nomeAba) {
    var conts = document.getElementsByClassName("tab-content"); for (var i=0; i<conts.length; i++) conts[i].classList.remove("active");
    var btns = document.getElementsByClassName("tab-btn"); for (var i=0; i<btns.length; i++) btns[i].classList.remove("active");
    document.getElementById(nomeAba).classList.add("active"); evt.currentTarget.classList.add("active");
    if(nomeAba === 'aba-rpg') { atualizarGraficoRadar(); atualizarGraficoHistorico(); }
    if(nomeAba === 'aba-timer') { atualizarGraficoMaterias(); }
    if(nomeAba === 'aba-financas') { atualizarGraficoCategoriasFinancas(); atualizarGraficoHistoricoFinancas(); }
}
// === EXPORTAR / IMPORTAR BACKUP (com opção de incluir os arquivos dos livros) ===
function exportarDados() {
    document.getElementById("exportar-backup-modal").classList.remove("modal-oculto");
}
function fecharModalExportarBackup() {
    document.getElementById("exportar-backup-modal").classList.add("modal-oculto");
}

function baixarBlobComoArquivo(blob, nomeArquivo) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// Backup leve de sempre: só o localStorage (progresso, XP, SRS, prateleiras, metadados da biblioteca), sem os arquivos.
function exportarSoDados() {
    fecharModalExportarBackup();
    baixarBlobComoArquivo(new Blob([JSON.stringify(dados)], { type: "application/json" }), "backup_rpg_vida.json");
}

function exportarComTodosLivros() {
    fecharModalExportarBackup();
    gerarBackupComLivros(dados.biblioteca);
}

// A Estante continua no backup (metadados intactos — progresso, anotações, prateleira, data de conclusão),
// só o ARQUIVO dos livros já concluídos não entra no zip.
function exportarComLivrosEmAndamento() {
    fecharModalExportarBackup();
    gerarBackupComLivros(dados.biblioteca.filter(l => !l.concluido));
}

function gerarBackupComLivros(livrosParaIncluirArquivo) {
    const idsImagens = new Set();
    dados.srsItems.forEach(item => {
        if (item.imagemPerguntaId) idsImagens.add(item.imagemPerguntaId);
        if (item.imagemRespostaId) idsImagens.add(item.imagemRespostaId);
    });

    if (livrosParaIncluirArquivo.length === 0 && idsImagens.size === 0) {
        alert("Não há arquivos de livro nem imagens de cards pra incluir nesse modo — gerando o backup só com os dados.");
        baixarBlobComoArquivo(new Blob([JSON.stringify(dados)], { type: "application/json" }), "backup_rpg_vida.json");
        return;
    }

    alert(`Preparando backup com ${livrosParaIncluirArquivo.length} arquivo(s) de livro e ${idsImagens.size} imagem(ns) de card — isso pode levar alguns segundos, dependendo do tamanho.`);

    const zip = new JSZip();
    zip.file("dados.json", JSON.stringify(dados)); // metadados de TODOS os livros e cards, sempre — só o binário é seletivo
    const pastaLivros = zip.folder("livros");
    const pastaImagens = zip.folder("imagens_srs");

    // NOVO: carrega os arquivos em lotes pequenos (em vez de todos os livros/imagens em paralelo de
    // uma vez só) — evita ter, por exemplo, vários PDFs grandes na memória ao mesmo tempo, o que
    // travava em máquinas com pouca RAM. O resultado continua sendo um único .zip no final; só a
    // leitura dos arquivos fica espaçada em grupos pequenos.
    const TAMANHO_LOTE = 3;
    function processarEmLotes(itens, processarItem) {
        let indice = 0;
        function proximoLote() {
            if (indice >= itens.length) return Promise.resolve();
            const lote = itens.slice(indice, indice + TAMANHO_LOTE);
            indice += TAMANHO_LOTE;
            return Promise.all(lote.map(processarItem)).then(proximoLote);
        }
        return proximoLote();
    }

    processarEmLotes(livrosParaIncluirArquivo, livro =>
        carregarArquivoLivro(livro.id).then(arrayBuffer => {
            if (arrayBuffer) pastaLivros.file(`${livro.id}.bin`, arrayBuffer);
        }).catch(() => {})
    )
        .then(() => processarEmLotes([...idsImagens], id =>
            carregarImagemSRS(id).then(blob => {
                if (blob) pastaImagens.file(`${id}.jpg`, blob);
            }).catch(() => {})
        ))
        // streamFiles: reduz o pico de memória do JSZip ao montar o zip final (não precisa saber o
        // tamanho comprimido de cada arquivo de antemão antes de escrevê-lo).
        .then(() => zip.generateAsync({ type: "blob", streamFiles: true }))
        .then(blob => baixarBlobComoArquivo(blob, "backup_rpg.zip"))
        .catch(err => {
            console.error("Erro ao gerar backup com livros:", err);
            alert("Não foi possível gerar o backup com os arquivos. Tente novamente ou exporte só os dados.");
        });
}

function importarDados(e) {
    const arquivo = e.target.files[0];
    if (!arquivo) return;

    if (arquivo.name.toLowerCase().endsWith(".zip")) {
        importarBackupComLivros(arquivo);
        return;
    }

    const r = new FileReader();
    r.onload = function(ev) {
        try {
            if (confirm("Substituir dados?")) {
                dados = JSON.parse(ev.target.result);
                salvar();
                location.reload();
            }
        } catch (err) { alert("Erro no arquivo."); }
    };
    r.readAsText(arquivo);
}

function importarBackupComLivros(arquivo) {
    if (!confirm("Substituir dados e restaurar os arquivos deste backup?")) return;

    JSZip.loadAsync(arquivo).then(zip => {
        const arquivoDados = zip.file("dados.json");
        if (!arquivoDados) { alert("Este .zip não parece ser um backup válido (falta o dados.json)."); return; }

        return arquivoDados.async("string").then(jsonTexto => {
            dados = JSON.parse(jsonTexto);

            const arquivosLivros = Object.keys(zip.files).filter(nome => nome.startsWith("livros/") && nome.toLowerCase().endsWith(".bin"));
            const arquivosImagens = Object.keys(zip.files).filter(nome => nome.startsWith("imagens_srs/") && nome.toLowerCase().endsWith(".jpg"));

            const tarefasLivros = arquivosLivros.map(nomeArquivo => {
                const id = nomeArquivo.slice("livros/".length, -4); // tira o prefixo e a extensão ".bin"
                return zip.files[nomeArquivo].async("arraybuffer").then(buffer => salvarArquivoLivro(id, buffer));
            });
            const tarefasImagens = arquivosImagens.map(nomeArquivo => {
                const id = nomeArquivo.slice("imagens_srs/".length, -4); // tira o prefixo e a extensão ".jpg"
                return zip.files[nomeArquivo].async("blob").then(blob => salvarImagemSRS(id, blob));
            });

            return Promise.all([...tarefasLivros, ...tarefasImagens]);
        });
    }).then(() => {
        salvar();
        alert("Backup restaurado com sucesso!");
        location.reload();
    }).catch(err => {
        console.error("Erro ao importar backup:", err);
        alert("Não foi possível importar este backup. Verifique se o arquivo não está corrompido.");
    });
}

window.onload = function() { 
    resetDiario(); 
    verificarGameOver(); 
    carregarPreferenciasTimer(); 
    aplicarTema(); 
    verificarContasAVencer();
    atualizar(); 
};