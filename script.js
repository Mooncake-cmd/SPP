/* ================================================= */
/* === SISTEMA UNIFICADO: RPG + POMODORO + SRS   === */
/* ===         (COM WEB WORKER FIX)              === */
/* ================================================= */

function criarDadosPadrao() {
    return {
        itens: [],
        recompensas: [],
        historicoEstudos: [],
        materias: [],
        objetivos: [],
        historicoConquistas: [],
        chefoes: [],
        srsItems: [],
        srsRevisoesLog: [],
        srsLimiteNovosPorDia: 20,
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
}

var dadosBrutos = localStorage.getItem("dados");
var dados;
// NOVO: sem isso, um "dados" corrompido no localStorage (gravação cortada por fechamento abrupto do
// navegador, corrupção externa etc.) lançava uma exceção não capturada NA PRIMEIRA LINHA do script —
// a página inteira quebrava, sem nem o resto do app (incluindo "Resetar Tudo") chegar a existir. Agora
// cai num perfil em branco, guarda o conteúdo bruto original numa chave separada (pra alguém técnico
// tentar recuperar depois, se der) e avisa — em vez de travar tudo em silêncio.
try {
    dados = dadosBrutos ? JSON.parse(dadosBrutos) : criarDadosPadrao();
} catch (err) {
    console.error("Não foi possível interpretar os dados salvos no localStorage (JSON corrompido):", err);
    if (dadosBrutos) {
        try { localStorage.setItem("dados_backup_corrompido_" + Date.now(), dadosBrutos); } catch (e2) { /* localStorage cheio — nada a fazer, segue com o perfil em branco mesmo assim */ }
    }
    dados = criarDadosPadrao();
    alert("Não foi possível carregar seus dados salvos (o arquivo ficou corrompido). Um perfil em branco foi criado. Uma cópia do conteúdo antigo ficou guardada no armazenamento do navegador, caso queira tentar recuperar manualmente. Se você tiver um backup exportado, restaure-o em \"Gerenciar Dados\".");
}

// --- GARANTIA DE INTEGRIDADE DOS DADOS ---
if (!dados.recompensas) dados.recompensas = [];
if (!dados.historicoEstudos) dados.historicoEstudos = [];
if (!dados.materias) dados.materias = [];
if (!dados.objetivos) dados.objetivos = [];
if (!dados.historicoConquistas) dados.historicoConquistas = [];
if (!dados.chefoes) dados.chefoes = [];
// Migração: chefões criados antes do ciclo de vida Ativo/Selado usavam `concluido`/`xpRecompensa`.
dados.chefoes.forEach(c => {
    if (c.estado === undefined) {
        if (c.concluido) {
            c.estado = "selado";
            c.dataSelado = c.dataSelado || new Date().toISOString();
            c.respawnEm = c.respawnEm || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
        } else {
            c.estado = "ativo";
            c.dataSelado = null;
            c.respawnEm = null;
        }
        delete c.concluido;
        delete c.dataConclusao;
        delete c.xpRecompensa;
    }
});
// NOVO: dados.srsItems agora vive de verdade no IndexedDB (ver window.onload) — o valor aqui (vindo
// do JSON do localStorage) pode não ser o definitivo ainda, então as passadas de compatibilidade de
// cada card (resposta/tipo) rodam lá, sobre o valor final, não aqui. Só a rede de segurança mínima.
if (!dados.srsItems) dados.srsItems = [];
if (!dados.srsRevisoesLog) dados.srsRevisoesLog = []; // histórico de cada revisão (card, data, nota) — base pra otimizar um algoritmo mais sofisticado (ex: FSRS) no futuro
if (dados.srsLimiteNovosPorDia === undefined) dados.srsLimiteNovosPorDia = 20; // limite de cards NUNCA revisados (intervalo_atual === 0) introduzidos por dia
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
if (!dados.lembretes) dados.lembretes = {}; // lembretes do calendário, por data ISO: { "2026-09-15": [{id, texto}] }
if (dados.hp === undefined) dados.hp = 300;
if (dados.maxHp === undefined) dados.maxHp = 300; 
if (dados.pontosAcumulados === undefined) dados.pontosAcumulados = 0;
if (dados.ultimaData === undefined) dados.ultimaData = "";
dados.itens.forEach(item => { if (!item.recorrencia) item.recorrencia = { tipo: 'diaria' }; }); // compatibilidade com missões antigas
dados.itens.forEach(item => { if (item.diasSeguidosIncompleta === undefined) item.diasSeguidosIncompleta = 0; }); // compatibilidade com o escalonamento de dano/pontos
dados.itens.forEach(item => { if (item.chefaoId === undefined) item.chefaoId = null; }); // compatibilidade com missões de antes dos Chefões
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
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.2.67/legacy/build/pdf.worker.min.mjs";
}

function hoje() { return new Date().toLocaleDateString(); }
// Usa componentes locais (não toISOString(), que é UTC) — senão o "dia" do app vira algumas
// horas antes da meia-noite local em fusos atrás de UTC (ex: Brasília, UTC-3), fazendo o
// reset diário achar que "hoje" já foi processado quando a meia-noite local ainda nem chegou.
function hojeISO() {
    return dataParaIsoLocal(new Date());
}

/* === FUNÇÕES BÁSICAS E DE DANO === */
// NOVO: dados.srsItems fica de fora do JSON do localStorage (ver "CARDS DO SRS" mais abaixo, perto
// de abrirDBImagensSRS) — ele é guardado à parte no IndexedDB, que tem cota muito maior. Só grava lá
// quando algo de fato mudou (srsItemsAlterado), já que o array pode ser grande e salvar() roda a
// cada ação do app inteiro (RPG, finanças etc.), não só quando o SRS muda. A gravação no IndexedDB é
// "fire-and-forget": salvarDados() continua totalmente síncrono pra quem chama, igual antes.
let srsItemsAlterado = false;
function salvarDados() {
    // NOVO: timestamp de "última mudança local" (ver "SINCRONIZAÇÃO COM GOOGLE DRIVE" mais abaixo) —
    // atualizado em TODA salvarDados() (ela só é chamada quando algo de fato mudou, é a convenção já
    // usada em todo o resto do app), ANTES de destructurar "dados" pra já ir junto no JSON salvo.
    // Object.assign (não substituição direta) preserva outras chaves que já possam estar em
    // _syncMeta — como midiaSincronizada (ver "MÍDIA DOS CARDS NO GOOGLE DRIVE"), que senão seria
    // apagada por essa mesma chamada sempre que sincronizarMidiaComDriveAgora chama salvar() em seguida.
    dados._syncMeta = Object.assign({}, dados._syncMeta, { ultimaModificacaoEm: Date.now(), dispositivoId: obterIdDispositivoSync() });
    const { srsItems, ...dadosSemCards } = dados;
    localStorage.setItem("dados", JSON.stringify(dadosSemCards));
    // NOVO: a gravação no IndexedDB continua "fire-and-forget" pra quem só quer salvar() e seguir em
    // frente (é assim que quase toda ação do app chama isso) — mas devolve a promise pra quem PRECISA
    // ter certeza de que terminou antes de continuar (ver comentário em salvar() logo abaixo: recarregar
    // a página logo depois de importar um backup grande sem esperar essa gravação terminar perdia os
    // cards silenciosamente — localStorage é síncrono e sempre completava a tempo, o IndexedDB não).
    let promessaSrsItems = Promise.resolve();
    if (srsItemsAlterado) {
        srsItemsAlterado = false;
        promessaSrsItems = salvarSrsItemsIndexedDB(dados.srsItems).catch(err => console.error("Falha ao salvar os cards de SRS no IndexedDB:", err));
    }
    agendarSincronizacaoDrive();
    return promessaSrsItems;
}
// Retorna a mesma promise de salvarDados() — quem só chama salvar() e segue em frente (a grande
// maioria dos ~90 lugares no app) nem precisa saber que ela existe, continua funcionando igual. Só
// importa pra quem recarrega a página logo em seguida (ver importarDados/importarBackupComLivros/
// aplicarDadosRemotosDrive) — esses agora fazem salvar().then(() => location.reload()) em vez de
// chamar os dois em sequência sem esperar, pra garantir que os cards realmente foram gravados antes
// de a página (e o array em memória) sumir.
function salvar() { const promessa = salvarDados(); atualizar(); return promessa; }

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
                const valor = calcularPontosEscalonados(item);
                danoDoDia += valor;
                item.diasSeguidosIncompleta = (item.diasSeguidosIncompleta || 0) + 1;
                // NOVO: se essa missão está ligada a um chefão, não cumpri-la regenera o HP dele nesse
                // mesmo valor — o dano que ele teria tomado se a missão fosse concluída.
                if (item.chefaoId) regenerarChefao(item.chefaoId, valor);
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

// NOVO: resetDiario()/verificarGameOver() ficam represados (ver aguardarChecagemInicialDoDrive, seção
// de sincronização com o Drive) até o app ter tido uma chance curta de checar se existe uma versão mais
// nova em outro aparelho — sem essa flag, um conflito resolvido depois via manterVersaoLocalDrive()
// rodaria os dois de novo em cima de um HP que já foi decrementado, ou uma sincronização periódica no
// meio da sessão (bem depois do carregamento) acabaria dando gatilho neles outra vez sem sentido.
let resetDiarioEGameOverJaRodaram = false;
function rodarResetDiarioEGameOverUmaVez() {
    if (resetDiarioEGameOverJaRodaram) return;
    resetDiarioEGameOverJaRodaram = true;
    resetDiario();
    verificarGameOver();
    atualizar();
}
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
        const missoesPreservadas = dados.itens.map(item => ({ ...item, feito: false, chefaoId: null }));
        localStorage.removeItem("dados");
        const dadosNovos = {
            itens: missoesPreservadas,
            recompensas: [], historicoEstudos: [], materias: [], objetivos: [],
            historicoConquistas: [], chefoes: [], srsItems: [], srsRevisoesLog: [], biblioteca: [],
            historicoDiario: [], streakAtual: 0, streakRecorde: 0,
            configTimer: { som: 'sino', notificacao: false, mostrarPrevisao: true },
            tema: dados.tema, srsLimiteNovosPorDia: dados.srsLimiteNovosPorDia, progressoGlobal: {}, metasGlobais: { mes: 50, ano: 500 },
            ultimaData: "", pontosAcumulados: 0, hp: 300, maxHp: 300, maestriaAcumulada: {}
        };
        localStorage.setItem("dados", JSON.stringify(dadosNovos));
        // NOVO: dados.srsItems agora vive à parte no IndexedDB (ver abrirDBSrsCards) — sem limpar ele
        // aqui também, os cards "resetados" ressuscitariam sozinhos no próximo carregamento (a
        // hidratação de window.onload traria de volta o array antigo do IndexedDB por cima do
        // srsItems: [] escrito acima). Só recarrega depois da limpeza terminar, pra não arriscar a
        // navegação cortar a transação do IndexedDB no meio.
        limparSrsItemsIndexedDB().catch(err => console.error("Falha ao limpar os cards de SRS no reset:", err)).finally(() => location.reload());
    });
}
function confirmarResetTotal() {
    pedirConfirmacaoPerigosa("Isso vai apagar TODOS os seus dados (RPG, timer, objetivos, SRS, biblioteca). Essa ação não pode ser desfeita.", () => {
        localStorage.removeItem("dados");
        // NOVO: mesmo motivo do confirmarGameOver acima — dados.srsItems vive à parte no IndexedDB
        // agora, precisa ser limpo explicitamente aqui também.
        limparSrsItemsIndexedDB().catch(err => console.error("Falha ao limpar os cards de SRS no reset:", err)).finally(() => location.reload());
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
    const chefaoSelect = document.getElementById("item-chefao");
    const chefaoId = chefaoSelect && chefaoSelect.value ? parseInt(chefaoSelect.value) : null;

    dados.itens.push({ descricao: desc, pontos: pts, atributos: attrs, categoria: cat.trim() || "Geral", feito: false, recorrencia: recorrencia, chefaoId: chefaoId });
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
        if (item.chefaoId) aplicarDanoChefao(item.chefaoId, pontosConcedidos);

        item.ultimoValorConcedido = pontosConcedidos;
        item.diasAntesDoUltimoCompleto = diasAntes;
        item.diasSeguidosIncompleta = 0; // volta a valer o normal a partir de agora
    } else if (!marcado && item.feito) {
        const pontosDevolver = item.ultimoValorConcedido !== undefined ? item.ultimoValorConcedido : (parseInt(item.pontos) || 0);
        const cura = Math.ceil(pontosDevolver / 2) || 1;
        dados.pontosAcumulados = Math.max(0, dados.pontosAcumulados - pontosDevolver);
        dados.hp -= cura;
        // NOVO: reverte o dano no chefão ANTES do early-return de game over abaixo — senão desmarcar
        // uma missão que também zera o HP do jogador nunca chegaria a devolver o HP do chefão.
        if (item.chefaoId) reverterDanoChefao(item.chefaoId, pontosDevolver);
        if (dados.hp <= 0) { dados.hp = 0; item.feito = marcado; salvar(); verificarGameOver(); return; }
        listaAtributos.forEach(attr => { if (dados.maestriaAcumulada[attr]) dados.maestriaAcumulada[attr] = Math.max(0, dados.maestriaAcumulada[attr] - 1); });
        if (item.diasAntesDoUltimoCompleto !== undefined) item.diasSeguidosIncompleta = item.diasAntesDoUltimoCompleto; // restaura o atraso que havia antes
    }
    item.feito = marcado; salvar();
}
// NOVO: "trancar" uma missão por N dias — enquanto travada, nome/descrição, valor em pontos,
// atributos, chefão vinculado e a própria exclusão ficam bloqueados. Concluir/desconcluir (checkbox)
// continua livre de propósito — trancar não deveria impedir de cumprir a missão, só de alterá-la ou
// apagá-la pra escapar dela. Destrava sozinha quando a data passa (comparação contra hojeISO(), sem
// job nenhum) — de propósito não existe destravar manualmente antes da data: isso quebraria o
// propósito da trava.
function estaMissaoTravada(item) {
    return !!(item && item.travadaAte && item.travadaAte >= hojeISO());
}
function textoMissaoTravadaAte(item) {
    return new Date(item.travadaAte + "T00:00:00").toLocaleDateString("pt-BR");
}
function travarMissao(index) {
    const item = dados.itens[index];
    if (!item) return;
    if (estaMissaoTravada(item)) { alert(`Essa missão já está trancada até ${textoMissaoTravadaAte(item)}.`); return; }
    const dias = parseInt(prompt("Trancar essa missão por quantos dias? (nome, valor, atributos, chefão vinculado e exclusão ficam bloqueados até lá)"), 10);
    if (!dias || dias <= 0) return;
    const data = new Date();
    data.setDate(data.getDate() + dias);
    item.travadaAte = dataParaIsoLocal(data);
    salvar();
}

function removerItem(index) {
    const item = dados.itens[index];
    if (item && estaMissaoTravada(item)) { alert(`Essa missão está trancada até ${textoMissaoTravadaAte(item)} — não pode ser excluída até lá.`); return; }
    if (confirm("Excluir?")) {
        if (item.feito) {
            const pontosConcedidos = item.ultimoValorConcedido !== undefined ? item.ultimoValorConcedido : (parseInt(item.pontos) || 0);
            dados.pontosAcumulados -= pontosConcedidos;
            let lista = item.atributos.split(',');
            lista.forEach(a => { if(dados.maestriaAcumulada[a.trim()]) dados.maestriaAcumulada[a.trim()] -= 1; });
            if (item.chefaoId) reverterDanoChefao(item.chefaoId, pontosConcedidos); // não deixa dano "preso" num chefão por causa de uma missão excluída
        }
        dados.itens.splice(index, 1); salvar();
    }
}
function editarCampo(index, campo, novoValor) {
    const item = dados.itens[index];
    if (!item) return;
    if (estaMissaoTravada(item)) { alert(`Essa missão está trancada até ${textoMissaoTravadaAte(item)} — não pode ser editada até lá.`); atualizar(); return; }
    item[campo] = novoValor;
    salvar();
}

// ============================================================
// === CHEFÕES (boss battles) — ciclo de vida: Ativo (Em Combate) <-> Selado no Tártaro ===
// ============================================================

const DIAS_RESPAWN_CHEFAO = 5;

function adicionarChefao() {
    const nome = document.getElementById("chefao-nome").value.trim();
    const maxHp = parseInt(document.getElementById("chefao-hp").value);
    if (!nome || !maxHp || maxHp <= 0) { alert("Preencha o nome e um HP máximo válido."); return; }

    dados.chefoes.push({ id: Date.now(), nome, hp: maxHp, maxHp, estado: "ativo", dataSelado: null, respawnEm: null });
    document.getElementById("chefao-nome").value = "";
    document.getElementById("chefao-hp").value = "";
    salvar();
}

function removerChefao(id) {
    if (!confirm("Excluir este chefão? As missões ligadas a ele voltam a não ter chefão nenhum.")) return;
    dados.itens.forEach(item => { if (item.chefaoId === id) item.chefaoId = null; });
    dados.chefoes = dados.chefoes.filter(c => c.id !== id);
    salvar();
}

// Aplica dano a um chefão ATIVO (chamado quando uma missão ligada a ele é concluída). Um chefão já
// selado está fora de combate e não recebe dano. Ao zerar o HP: vira "selado", agenda o respawn pra
// DIAS_RESPAWN_CHEFAO dias à frente, registra a conquista (sem XP — a derrota em si já é o marco) e
// mostra o modal de vitória.
function aplicarDanoChefao(chefaoId, dano) {
    const chefao = dados.chefoes.find(c => c.id === chefaoId);
    if (!chefao || chefao.estado !== "ativo") return;
    chefao.hp = Math.max(0, chefao.hp - dano);
    if (chefao.hp === 0) {
        chefao.estado = "selado";
        chefao.dataSelado = new Date().toISOString();
        chefao.respawnEm = new Date(Date.now() + DIAS_RESPAWN_CHEFAO * 24 * 60 * 60 * 1000).toISOString();
        dados.historicoConquistas.unshift({ titulo: chefao.nome, tipo: "Chefão", dataConclusao: new Date().toLocaleDateString(), passos: [] });
        mostrarModalBossDerrotado(chefao);
    }
}

// Reverte o dano de uma missão desfeita/excluída. Se isso trouxer um chefão selado de volta a HP > 0,
// ele volta a ficar ativo (cancela o selamento e o respawn agendado) — desfazer a missão que o derrotou
// desfaz a derrota também.
function reverterDanoChefao(chefaoId, dano) {
    const chefao = dados.chefoes.find(c => c.id === chefaoId);
    if (!chefao) return;
    const estavaSelado = chefao.estado === "selado";
    chefao.hp = Math.min(chefao.maxHp, chefao.hp + dano);
    if (estavaSelado && chefao.hp > 0) {
        chefao.estado = "ativo";
        chefao.dataSelado = null;
        chefao.respawnEm = null;
    }
}

// NOVO: regenera um chefão ATIVO quando uma missão ligada a ele NÃO é cumprida até virar o dia — o
// mesmo valor de dano que ele teria tomado se a missão fosse concluída (chamado por resetDiario()).
// Um chefão já selado não regenera por isso — ele só volta pelo respawn de tempo (verificarRespawnChefoes).
function regenerarChefao(chefaoId, valor) {
    const chefao = dados.chefoes.find(c => c.id === chefaoId);
    if (!chefao || chefao.estado !== "ativo") return;
    chefao.hp = Math.min(chefao.maxHp, chefao.hp + valor);
}

// Verifica todos os chefões selados e restaura (HP cheio, volta a "ativo") qualquer um cujo prazo de
// respawn já passou. Retorna true se restaurou algum (pra quem chama saber se precisa re-renderizar).
function verificarRespawnChefoes() {
    const agora = Date.now();
    let houveRespawn = false;
    dados.chefoes.forEach(chefao => {
        if (chefao.estado === "selado" && chefao.respawnEm && agora >= new Date(chefao.respawnEm).getTime()) {
            chefao.hp = chefao.maxHp;
            chefao.estado = "ativo";
            chefao.dataSelado = null;
            chefao.respawnEm = null;
            houveRespawn = true;
        }
    });
    return houveRespawn;
}

// Formata um intervalo em "NNd NNh NNm" (ex: "04d 22h 15m"), como o contador do Pacto do Tártaro.
function formatarTempoRestante(ms) {
    if (ms <= 0) return "00d 00h 00m";
    const totalMinutos = Math.floor(ms / 60000);
    const dias = Math.floor(totalMinutos / (60 * 24));
    const horas = Math.floor((totalMinutos % (60 * 24)) / 60);
    const minutos = totalMinutos % 60;
    return `${String(dias).padStart(2, "0")}d ${String(horas).padStart(2, "0")}h ${String(minutos).padStart(2, "0")}m`;
}

// Atualiza só o texto dos contadores regressivos já na tela (sem reconstruir o DOM) — chamado a cada
// tick do setInterval enquanto nenhum chefão selado ainda completou o respawn.
function atualizarContadoresChefoesSelados() {
    dados.chefoes.filter(c => c.estado === "selado").forEach(chefao => {
        const el = document.getElementById(`contador-chefao-${chefao.id}`);
        if (el) el.innerText = formatarTempoRestante(new Date(chefao.respawnEm).getTime() - Date.now());
    });
}

function mostrarModalBossDerrotado(chefao) {
    document.getElementById("boss-derrotado-nome").innerText = chefao.nome;
    document.getElementById("boss-derrotado-dias").innerText = DIAS_RESPAWN_CHEFAO;
    document.getElementById("boss-derrotado-modal").classList.remove("modal-oculto");
}
function fecharModalBoss() { document.getElementById("boss-derrotado-modal").classList.add("modal-oculto"); }

function editarChefaoDaMissao(index, valor) {
    const item = dados.itens[index];
    if (!item) return;
    if (estaMissaoTravada(item)) { alert(`Essa missão está trancada até ${textoMissaoTravadaAte(item)} — não pode ser editada até lá.`); atualizar(); return; }
    item.chefaoId = valor ? parseInt(valor) : null;
    salvar();
}

// Monta as <option> de um <select> de chefão — usado tanto no form de Adicionar Missão quanto na
// reatribuição por linha do checklist. Chefões selados continuam na lista (marcados) pra não sumir
// do select de uma missão que já estava ligada a eles.
function opcoesChefaoHtml(chefaoIdSelecionado) {
    let html = `<option value=""${!chefaoIdSelecionado ? " selected" : ""}>Nenhum</option>`;
    dados.chefoes.forEach(c => {
        const rotulo = c.estado === "selado" ? `${c.nome} (selado)` : c.nome;
        html += `<option value="${c.id}"${chefaoIdSelecionado === c.id ? " selected" : ""}>${escaparHtml(rotulo)}</option>`;
    });
    return html;
}

function cardChefaoAtivoHtml(chefao) {
    const percentual = chefao.maxHp > 0 ? Math.max(0, (chefao.hp / chefao.maxHp) * 100) : 0;
    const missoesLigadas = dados.itens.filter(i => i.chefaoId === chefao.id);
    const listaMissoes = missoesLigadas.length > 0
        ? `<ul class="lista-missoes-chefao">${missoesLigadas.map(m => `<li>${escaparHtml(m.descricao)}</li>`).join("")}</ul>`
        : `<p style="font-size:0.85em; color:var(--text-secondary);">Nenhuma missão ligada a esse chefão ainda.</p>`;
    return `<div class="card-chefao">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong>${escaparHtml(chefao.nome)}</strong>
            <button onclick="removerChefao(${chefao.id})" style="background:none; color:var(--danger-color); padding:0; font-size:1.1em;">&times;</button>
        </div>
        <div class="barra-fundo-hp" style="margin-top:8px;"><div class="barra-boss-fill" style="width:${percentual}%;"></div></div>
        <div style="font-size:0.85em; color:var(--text-secondary); margin-top:4px;">${chefao.hp} / ${chefao.maxHp} HP</div>
        ${listaMissoes}
    </div>`;
}

// Gera uma fileira de elos de corrente (elipses alternando rotação, imitando elos entrelaçados de
// verdade) ao longo de uma linha reta — usado pra desenhar as duas correntes em X do card de chefão
// selado, sem depender de nenhuma imagem externa (o site precisa continuar funcionando offline).
function gerarElosCorrente(x1, y1, x2, y2, numElos) {
    const anguloBase = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    let elos = "";
    for (let i = 0; i < numElos; i++) {
        const t = i / (numElos - 1);
        const x = (x1 + (x2 - x1) * t).toFixed(1);
        const y = (y1 + (y2 - y1) * t).toFixed(1);
        const rot = (anguloBase + (i % 2 === 0 ? 0 : 90)).toFixed(1);
        elos += `<ellipse cx="${x}" cy="${y}" rx="11" ry="6.5" transform="rotate(${rot} ${x} ${y})" fill="none" stroke="url(#elo-grad-${anguloBase > 0 ? "a" : "b"})" stroke-width="2.4"/>`;
    }
    return elos;
}

// As duas correntes cruzadas em X que cobrem o card do chefão selado, do canto a canto.
function svgCorrenteChefaoSelado() {
    const elosDiagonal1 = gerarElosCorrente(6, 6, 294, 104, 9);
    const elosDiagonal2 = gerarElosCorrente(294, 6, 6, 104, 9);
    return `<svg class="svg-corrente-chefao" viewBox="0 0 300 110" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
            <linearGradient id="elo-grad-a" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#9c9ca6"/><stop offset="55%" stop-color="#4a4a54"/><stop offset="100%" stop-color="#19191f"/>
            </linearGradient>
            <linearGradient id="elo-grad-b" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#9c9ca6"/><stop offset="55%" stop-color="#4a4a54"/><stop offset="100%" stop-color="#19191f"/>
            </linearGradient>
        </defs>
        <g opacity="0.4">${elosDiagonal1}${elosDiagonal2}</g>
    </svg>`;
}

function cardChefaoSeladoHtml(chefao) {
    const restante = new Date(chefao.respawnEm).getTime() - Date.now();
    return `<div class="card-chefao card-chefao-selado">
        ${svgCorrenteChefaoSelado()}
        <div class="chefao-selado-conteudo">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                <div class="placa-nome-chefao">${escaparHtml(chefao.nome)}</div>
                <button onclick="removerChefao(${chefao.id})" class="btn-remover-chefao-selado" title="Excluir chefão">&times;</button>
            </div>
            <div class="placa-status-chefao">⛓️ Banido</div>
            <div class="bloco-timer-chefao">
                <div class="timer-label-chefao">Libertação do Tártaro em</div>
                <div class="timer-valor-chefao" id="contador-chefao-${chefao.id}">${formatarTempoRestante(restante)}</div>
            </div>
        </div>
    </div>`;
}

function renderizarChefoes() {
    verificarRespawnChefoes(); // corrige na hora qualquer chefão cujo prazo já passou, antes de desenhar

    const areaAtivos = document.getElementById("lista-chefoes");
    if (!areaAtivos) return;
    const areaSelados = document.getElementById("lista-chefoes-selados");
    const contagemSelados = document.getElementById("pacto-tartaro-contagem");

    const ativos = dados.chefoes.filter(c => c.estado !== "selado");
    const selados = dados.chefoes.filter(c => c.estado === "selado");

    areaAtivos.innerHTML = ativos.length > 0
        ? ativos.map(cardChefaoAtivoHtml).join("")
        : "<p style='color:var(--text-secondary); text-align:center;'>Nenhum chefão em combate no momento.</p>";

    if (areaSelados) {
        areaSelados.innerHTML = selados.length > 0
            ? selados.map(cardChefaoSeladoHtml).join("")
            : "<p style='color:var(--text-secondary); text-align:center; font-size:0.9em;'>Nenhum chefão selado no momento.</p>";
    }
    if (contagemSelados) contagemSelados.innerText = selados.length;

    // Select de vínculo no form de Adicionar Missão — só chefões ATIVOS fazem sentido pra ligar uma
    // missão NOVA (um selado está fora de combate, sem dano pra receber até o respawn).
    const selectAdicionar = document.getElementById("item-chefao");
    if (selectAdicionar) {
        const valorAtual = selectAdicionar.value;
        let opcoes = `<option value="">Nenhum</option>`;
        ativos.forEach(c => { opcoes += `<option value="${c.id}">${escaparHtml(c.nome)}</option>`; });
        selectAdicionar.innerHTML = opcoes;
        selectAdicionar.value = valorAtual; // preserva a escolha se ainda existir na lista
    }
}
function editarCampoNumerico(index, campo, valor) {
    const item = dados.itens[index];
    if (!item) return;
    if (estaMissaoTravada(item)) { alert(`Essa missão está trancada até ${textoMissaoTravadaAte(item)} — não pode ser editada até lá.`); atualizar(); return; }
    const num = parseInt(valor);
    if (isNaN(num) || num <= 0) { salvar(); return; } // valor inválido: apenas re-renderiza e mantém o antigo
    item[campo] = num; salvar();
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
// NOVO: trocar de tema é uma mudança puramente visual (CSS, já aplicada por aplicarTema() — o resto
// da tela reage sozinha via variável CSS). Antes isso chamava salvar(), que dispara atualizar() e
// reconstrói o app INTEIRO — checklist, biblioteca, finanças e a lista completa de SRS, incluindo
// milhares de cards num deck grande — só pra trocar uma cor. Em decks grandes isso bloqueava a aba
// tempo suficiente pro navegador mostrar o aviso de "página não está respondendo". salvarDados()
// persiste a preferência sem refazer esse trabalho todo.
function alternarTema() { dados.tema = dados.tema === 'claro' ? 'escuro' : 'claro'; aplicarTema(); if (leitorEpubRendition) aplicarTemaEpub(leitorEpubRendition); salvarDados(); atualizarGraficoRadar(); atualizarGraficoHistorico(); atualizarGraficoMaterias(); }
function salvarPreferenciasTimer() { dados.configTimer = { som: document.getElementById("select-som").value, notificacao: document.getElementById("check-notificacao").checked, mostrarPrevisao: document.getElementById("check-previsao").checked }; salvar(); calcularPrevisaoTermino(); }
function carregarPreferenciasTimer() {
    if (dados.configTimer) { document.getElementById("select-som").value = dados.configTimer.som || 'sino'; document.getElementById("check-notificacao").checked = dados.configTimer.notificacao || false; document.getElementById("check-previsao").checked = dados.configTimer.mostrarPrevisao !== false; }
    if (dados.metasGlobais) { document.getElementById("meta-horas-mes").value = dados.metasGlobais.mes || 50; document.getElementById("meta-horas-ano").value = dados.metasGlobais.ano || 500; }
    const limiteNovosEl = document.getElementById("srs-limite-novos");
    if (limiteNovosEl) limiteNovosEl.value = dados.srsLimiteNovosPorDia ?? 20;
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
        // Ver comentário em limparCampoRicoAnkiAoEditar — mesmo motivo da edição inline na lista.
        // frenteTemplateHtml/camposFrente nunca são usados por card cloze (a pergunta vem sempre de
        // clozePartes), então limpar aqui sempre é seguro nos dois ramos abaixo.
        limparCampoRicoAnkiAoEditar(item, 'frente');
        if (temLacunas) {
            item.tipo = "cloze";
            item.clozePartes = estadoClozeSRS.segmentos.map(s => ({ texto: s.texto, lacuna: s.lacuna }));
            item.resposta = estadoClozeSRS.segmentos.filter(s => s.lacuna).map(s => s.texto.trim()).filter(Boolean).join(", ");
            // NOVO: só limpa versoTemplateHtml (versão rica de card NORMAL, deixaria de fazer sentido
            // depois de virar cloze) — mantém camposVerso de propósito, é o mecanismo de Embasamento/
            // Saiba mais de cards cloze importados do Anki (ver converterNotaClozeAnki), não editado aqui.
            delete item.versoTemplateHtml;
        } else {
            item.tipo = "normal";
            delete item.clozePartes;
            item.resposta = resposta;
            limparCampoRicoAnkiAoEditar(item, 'resposta');
        }

        aplicarImagensPendentesNoCard(item, "srs").then(() => {
            cancelarEdicaoCardSRS();
            srsItemsAlterado = true;
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
        srsItemsAlterado = true;
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
    // NOVO: draggable + eventos de arrastar (arrastarTemaInicio/Sobre/Sai/Soltar/Fim) — arrastar esse
    // tema pra cima de outro nó da árvore o move pra dentro dele (mesma reescrita de prefixo usada pelo
    // botão "📁 Mover" e por renomearTemaSRS — ver comentário em reescreverPrefixoTemaSRS). Só funciona
    // com mouse (desktop); o botão "📁" abaixo é a via que também funciona em celular/touch.
    let html = `<li class="srs-arvore-item"><div class="srs-arvore-linha" draggable="true"
        ondragstart="arrastarTemaInicio(event, '${node.caminho}')"
        ondragover="arrastarTemaSobre(event, '${node.caminho}')"
        ondragleave="arrastarTemaSai(event)"
        ondrop="arrastarTemaSoltar(event, '${node.caminho}')"
        ondragend="arrastarTemaFim(event)"><label class="srs-arvore-label">${seta}<input type="checkbox" ${estado === 'marcado' ? 'checked' : ''} ${estado === 'indeterminado' ? 'data-indeterminado="true"' : ''} onclick="alternarSelecaoTema('${node.caminho}')"><span>${escaparHtml(node.nome)}</span></label><button type="button" class="btn-renomear-tema" onclick="renomearTemaSRS('${node.caminho}')" title="Renomear este tema">✏️</button><button type="button" class="btn-mover-tema" onclick="abrirModalMoverTema('${node.caminho}')" title="Mover este tema pra dentro de outro">📁</button><button type="button" class="btn-excluir-tema" onclick="excluirTema('${node.caminho}')" title="Excluir este tema e todos os cards dele">🗑️</button></div>`;
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

// ============================================================
// === RENOMEAR / MOVER TEMA (reescrita de prefixo em lote) ===
// ============================================================
// Não existe uma entidade "deck" separada nesse app — cada card só guarda uma string livre em
// item.tema, e a hierarquia "Tema::Subtema" (ver construirArvoreTemas) é só o "::" cortando essa
// string. Por isso "renomear um tema" e "mover um tema pra dentro de outro" são a MESMA operação por
// baixo dos panos: reescrever o PREFIXO do caminho em todos os cards que pertencem a ele (e aos
// subtemas dele) — reaproveita a mesma árvore/coleta de caminhos já usada por excluirTema.
// Retorna quantos cards foram alterados (0 se não achou nada, ou se o caminho novo é igual ao antigo).
function reescreverPrefixoTemaSRS(caminhoAntigo, caminhoNovo) {
    caminhoAntigo = (caminhoAntigo || "").trim();
    caminhoNovo = (caminhoNovo || "").trim();
    if (!caminhoNovo || caminhoAntigo === caminhoNovo) return 0;
    let alterados = 0;
    dados.srsItems.forEach(item => {
        if (item.tema === caminhoAntigo) { item.tema = caminhoNovo; alterados++; }
        else if (item.tema.startsWith(caminhoAntigo + "::")) { item.tema = caminhoNovo + item.tema.slice(caminhoAntigo.length); alterados++; }
    });
    if (alterados === 0) return 0;
    srsItemsAlterado = true;

    // NOVO: migra/limpa o limite de cards novos por dia configurado por tema-RAIZ (ver
    // srsLimitesNovosPorTema/temaRaizSRS) — sem isso, um limite customizado ficava "órfão" (associado a
    // um nome de raiz que nenhum card usa mais) depois de renomear ou mover um tema-raiz.
    const raizAntiga = temaRaizSRS(caminhoAntigo);
    const raizNova = temaRaizSRS(caminhoNovo);
    if (raizAntiga !== raizNova && dados.srsLimitesNovosPorTema) {
        // Renomeação de raiz PURA (o tema continua no mesmo nível, só muda de nome) migra o valor pro
        // nome novo. Mover pra dentro de outro tema (caminhoNovo ganhou um "::" na frente) NÃO migra —
        // a partir de agora esses cards passam a valer a cota da raiz de DESTINO, que pode já ter sua
        // própria configuração; copiar o valor antigo por cima seria sobrescrever sem querer.
        const eraRenomeacaoDeRaizPura = !caminhoAntigo.includes("::") && !caminhoNovo.includes("::");
        if (eraRenomeacaoDeRaizPura && Object.prototype.hasOwnProperty.call(dados.srsLimitesNovosPorTema, raizAntiga)) {
            dados.srsLimitesNovosPorTema[raizNova] = dados.srsLimitesNovosPorTema[raizAntiga];
        }
        const raizAntigaAindaExiste = dados.srsItems.some(i => temaRaizSRS(i.tema) === raizAntiga);
        if (!raizAntigaAindaExiste) delete dados.srsLimitesNovosPorTema[raizAntiga];
    }
    return alterados;
}

// Se o caminho de destino já existir (ou já tiver subtemas), os cards vão simplesmente se juntar aos
// que já estão lá — não é um erro, mas costuma ser sem querer, então confirma antes.
function confirmarFusaoDeTemaSeNecessario(caminhoNovo) {
    const existe = srsTemasConhecidos.has(caminhoNovo) || [...srsTemasConhecidos].some(t => t.startsWith(caminhoNovo + "::"));
    if (!existe) return true;
    return confirm(`Já existe um tema "${caminhoNovo}". Os cards vão se juntar nele. Continuar?`);
}

// Aplica o resultado de uma reescrita bem-sucedida: atualiza os Sets de tema (sincronizarTemasSRS já
// remove o caminho antigo e adiciona o novo, comparando com dados.srsItems), redesenha a árvore sem
// fechar o modal, e persiste.
function finalizarReescritaDeTemaSRS(caminhoAntigo, caminhoNovo) {
    srsNosExpandidos.delete(caminhoAntigo);
    srsNosExpandidos.add(caminhoNovo);
    sincronizarTemasSRS();
    renderizarArvoreTemasSRS();
    salvar();
}

function renomearTemaSRS(caminho) {
    const node = encontrarNoPorCaminho(arvoreTemasSRS, caminho);
    if (!node) return;
    const novoNome = prompt(`Renomear "${node.nome}" para:`, node.nome);
    if (novoNome === null) return; // cancelou
    const novoNomeLimpo = novoNome.trim();
    if (!novoNomeLimpo) { alert("O nome não pode ficar vazio."); return; }
    if (novoNomeLimpo.includes("::")) { alert('O nome não pode conter "::" — é o separador usado pra indicar subtema. Pra mover esse tema pra dentro de outro, use o botão "📁 Mover".'); return; }
    const partesPai = caminho.split("::").slice(0, -1);
    const caminhoNovo = [...partesPai, novoNomeLimpo].join("::");
    if (caminhoNovo === caminho) return;
    if (!confirmarFusaoDeTemaSeNecessario(caminhoNovo)) return;
    const alterados = reescreverPrefixoTemaSRS(caminho, caminhoNovo);
    if (alterados === 0) return;
    finalizarReescritaDeTemaSRS(caminho, caminhoNovo);
}

// === Mover tema pra dentro de outro — via botão (funciona em qualquer aparelho, inclusive celular) ===
// Restrito de propósito a mover pra dentro de um tema-RAIZ existente (não um subtema arbitrário) — é o
// caso de uso pedido ("arrastar um deck pra dentro de outro") e evita todo o problema de detectar ciclo
// (mover um tema pra dentro de um dos seus próprios subtemas): como só oferece raízes como destino, e a
// própria raiz do tema sendo movido já sai da lista, não tem como cair dentro de si mesmo.
let temaMoverOrigem = null;
function abrirModalMoverTema(caminho) {
    const node = encontrarNoPorCaminho(arvoreTemasSRS, caminho);
    if (!node) return;
    temaMoverOrigem = caminho;
    document.getElementById("mover-tema-titulo").innerText = `Mover "${node.nome}" para dentro de:`;
    const raizAtual = temaRaizSRS(caminho);
    const raizesPossiveis = [...new Set([...srsTemasConhecidos].map(temaRaizSRS))]
        .filter(r => r !== raizAtual)
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
    const select = document.getElementById("select-mover-tema-destino");
    select.innerHTML = `<option value="">🔝 Tema-raiz (tirar de dentro de qualquer tema)</option>` +
        raizesPossiveis.map(r => `<option value="${escaparHtml(r)}">${escaparHtml(r)}</option>`).join("");
    document.getElementById("mover-tema-modal").classList.remove("modal-oculto");
}
function fecharModalMoverTema() {
    document.getElementById("mover-tema-modal").classList.add("modal-oculto");
    temaMoverOrigem = null;
}
function confirmarMoverTemaSRS() {
    if (!temaMoverOrigem) { fecharModalMoverTema(); return; }
    const node = encontrarNoPorCaminho(arvoreTemasSRS, temaMoverOrigem);
    if (!node) { fecharModalMoverTema(); return; }
    const destino = document.getElementById("select-mover-tema-destino").value;
    const caminhoNovo = destino ? `${destino}::${node.nome}` : node.nome;
    const origem = temaMoverOrigem;
    if (caminhoNovo === origem) { fecharModalMoverTema(); return; }
    if (!confirmarFusaoDeTemaSeNecessario(caminhoNovo)) return;
    const alterados = reescreverPrefixoTemaSRS(origem, caminhoNovo);
    fecharModalMoverTema();
    if (alterados === 0) return;
    finalizarReescritaDeTemaSRS(origem, caminhoNovo);
}

// === Mover tema arrastando (desktop) — mesma reescrita de prefixo, só que soltando em cima de OUTRO
// nó da própria árvore (pode ser raiz ou subtema, diferente do modal acima que só oferece raízes) ===
let temaArrastandoCaminho = null;
function arrastarTemaInicio(event, caminho) {
    temaArrastandoCaminho = caminho;
    event.currentTarget.classList.add("arrastando");
    event.dataTransfer.effectAllowed = "move";
}
function arrastarTemaSobre(event, caminhoDestino) {
    if (!temaArrastandoCaminho || caminhoDestino === temaArrastandoCaminho || caminhoDestino.startsWith(temaArrastandoCaminho + "::")) return;
    event.preventDefault();
    event.currentTarget.classList.add("drag-over-tema");
}
function arrastarTemaSai(event) {
    event.currentTarget.classList.remove("drag-over-tema");
}
function arrastarTemaSoltar(event, caminhoDestino) {
    event.preventDefault();
    event.currentTarget.classList.remove("drag-over-tema");
    const origem = temaArrastandoCaminho;
    temaArrastandoCaminho = null;
    if (!origem || caminhoDestino === origem || caminhoDestino.startsWith(origem + "::")) return;
    const nodeOrigem = encontrarNoPorCaminho(arvoreTemasSRS, origem);
    if (!nodeOrigem) return;
    const caminhoNovo = `${caminhoDestino}::${nodeOrigem.nome}`;
    if (caminhoNovo === origem) return;
    if (!confirmarFusaoDeTemaSeNecessario(caminhoNovo)) return;
    const alterados = reescreverPrefixoTemaSRS(origem, caminhoNovo);
    if (alterados === 0) return;
    srsNosExpandidos.add(caminhoDestino); // expande o destino pra já mostrar onde caiu
    finalizarReescritaDeTemaSRS(origem, caminhoNovo);
}
function arrastarTemaFim(event) {
    event.currentTarget.classList.remove("arrastando");
    document.querySelectorAll(".srs-arvore-linha.drag-over-tema").forEach(el => el.classList.remove("drag-over-tema"));
    temaArrastandoCaminho = null;
}

// Apaga do IndexedDB as imagens/áudios anexados a um card SRS (chamado antes de remover o card dos
// dados, senão o arquivo fica órfão guardado pra sempre, ocupando espaço à toa).
// Extrai os ids de mídia (data-srs-img-id="..."/data-srs-midia-id="...") embutidos dentro do HTML rico
// de um campo — é assim que cards importados do Anki guardam a mídia (ver renderizarTemplateAnkiComHtmlRico/
// extrairCampoAnkiComoHtml), diferente dos campos separados tipo midiaPerguntaId usados por cards
// criados manualmente na interface do app.
function idsMidiaEmHtmlRico(html) {
    if (!html) return [];
    const ids = [];
    const regex = /data-srs-(?:img|midia)-id="([^"]+)"/g;
    let m;
    while ((m = regex.exec(html)) !== null) ids.push(m[1]);
    return ids;
}

// Todos os ids de imagem/mídia (áudio/vídeo) que um card SRS pode ter — o campo singular de sempre
// mais as "extras" (cards criados manualmente com mais de uma imagem/áudio no mesmo lado), MAIS
// (NOVO) os embutidos no HTML rico dos campos de cards importados do Anki (camposFrente/camposVerso/
// frenteTemplateHtml/versoTemplateHtml) — antes essa função só via os campos antigos, então a mídia de
// decks do Anki nunca entrava no backup completo (gerarBackupComLivros) nem seria sincronizada com o
// Drive. Dedup com Set porque o mesmo id pode aparecer tanto em camposFrente quanto em
// frenteTemplateHtml (os dois guardam o mesmo HTML rico, em formatos diferentes).
function todosIdsMidiaDoCardSRS(card) {
    const idsCamposAntigos = [
        card.imagemPerguntaId, ...(card.imagensExtrasPerguntaIds || []),
        card.imagemRespostaId, ...(card.imagensExtrasRespostaIds || []),
        card.midiaPerguntaId, ...(card.midiasExtrasPerguntaIds || []).map(m => m.id),
        card.midiaRespostaId, ...(card.midiasExtrasRespostaIds || []).map(m => m.id)
    ].filter(Boolean);
    const idsHtmlRico = [
        ...(card.camposFrente || []).flatMap(c => idsMidiaEmHtmlRico(c.html)),
        ...(card.camposVerso || []).flatMap(c => idsMidiaEmHtmlRico(c.html)),
        ...idsMidiaEmHtmlRico(card.frenteTemplateHtml),
        ...idsMidiaEmHtmlRico(card.versoTemplateHtml)
    ];
    return [...new Set([...idsCamposAntigos, ...idsHtmlRico])];
}
function excluirMidiasDoCardSRS(card) {
    const ids = todosIdsMidiaDoCardSRS(card);
    const exclusoesLocais = ids.map(id => excluirImagemSRS(id).catch(() => {}));
    // NOVO: se a mídia foi sincronizada com o Drive (ver "MÍDIA DOS CARDS NO GOOGLE DRIVE"), apaga lá
    // também — senão o arquivo remoto fica órfão pra sempre. Só tenta quando conectado; falhar aqui
    // (offline, sem permissão) nunca deve travar a exclusão local, que é o que importa na hora pro
    // usuário — por isso cada exclusão remota tem seu próprio .catch(), independente das outras.
    const exclusoesDrive = driveConectado ? ids.map(id => excluirMidiaDoDrive(id).catch(() => {})) : [];
    return Promise.all([...exclusoesLocais, ...exclusoesDrive]);
}

// NOVO: remove do histórico de revisões (dados.srsRevisoesLog) as entradas de cards que acabaram de
// ser excluídos — sem isso, ficavam "órfãs" (apontando pra um cardId que não existe mais) pra sempre,
// inflando o backup à toa e distorcendo qualquer estatística futura que olhe o log inteiro sem
// filtrar por cards existentes (ex: o FSRS, que usa esse log como base de treino — ver CLAUDE.md).
function removerEntradasLogSRS(idsExcluidos) {
    dados.srsRevisoesLog = dados.srsRevisoesLog.filter(r => !idsExcluidos.has(r.cardId));
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
            mostrarProgressoOperacao("Excluindo tema e cards...", "🗑️");
            const total = cardsAlvo.length;
            let excluidos = 0;
            atualizarProgressoOperacao(0, total, "🗑️", "Excluindo cards...");
            Promise.all(cardsAlvo.map(card =>
                excluirMidiasDoCardSRS(card).finally(() => {
                    excluidos++;
                    atualizarProgressoOperacao(excluidos, total, "🗑️", "Excluindo cards...");
                })
            )).finally(() => {
                const idsParaExcluir = new Set(cardsAlvo.map(c => c.id));
                dados.srsItems = dados.srsItems.filter(i => !idsParaExcluir.has(i.id));
                removerEntradasLogSRS(idsParaExcluir);
                srsNosExpandidos.delete(caminho);
                srsItemsAlterado = true;
                salvar();
                esconderProgressoOperacao();
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

// NOVO: exclusão de VÁRIOS temas de uma vez — antes só dava pra excluir um tema por vez (🗑️ na árvore
// de "Escolher Temas"), cada um com sua própria confirmação. Reaproveita a mesma árvore hierárquica
// (arvoreTemasSRS/coletarCaminhosReais) e o mesmo fluxo de exclusão em lote de excluirTema (limpar
// mídia de cada card, barra de progresso, um salvar() só no final) — só que operando sobre a UNIÃO de
// todos os temas marcados, com uma confirmação e um progresso só pro lote inteiro. Tem seu próprio
// Set de seleção (srsTemasParaExcluir), independente de srsTemasSelecionados (que é o filtro de quais
// temas entram na revisão) — marcar um tema pra excluir aqui não mexe no filtro de revisão.
let srsTemasParaExcluir = new Set();

function estadoNoTemaExcluir(node) {
    const reais = coletarCaminhosReais(node);
    if (reais.length === 0) return 'desmarcado';
    const marcados = reais.filter(c => srsTemasParaExcluir.has(c)).length;
    if (marcados === 0) return 'desmarcado';
    if (marcados === reais.length) return 'marcado';
    return 'indeterminado';
}
function renderizarNoTemaExcluirHTML(node) {
    const estado = estadoNoTemaExcluir(node);
    const temFilhos = Object.keys(node.filhos).length > 0;
    const expandido = srsNosExpandidos.has(node.caminho); // reaproveita o mesmo estado de expandido/recolhido da outra árvore
    const seta = temFilhos
        ? `<span class="srs-arvore-seta" onclick="alternarExpansaoTemaExcluir('${node.caminho}', event)">${expandido ? '▾' : '▸'}</span>`
        : `<span class="srs-arvore-seta-vazia"></span>`;
    let html = `<li class="srs-arvore-item"><div class="srs-arvore-linha"><label class="srs-arvore-label">${seta}<input type="checkbox" ${estado === 'marcado' ? 'checked' : ''} ${estado === 'indeterminado' ? 'data-indeterminado="true"' : ''} onclick="alternarSelecaoTemaExcluir('${node.caminho}')"><span>${escaparHtml(node.nome)}</span></label></div>`;
    if (temFilhos) {
        html += `<ul class="srs-arvore-filhos ${expandido ? '' : 'oculto'}">`;
        Object.values(node.filhos).sort((a,b) => a.nome.localeCompare(b.nome)).forEach(filho => { html += renderizarNoTemaExcluirHTML(filho); });
        html += `</ul>`;
    }
    html += `</li>`;
    return html;
}
function renderizarArvoreTemasExcluirSRS() {
    const container = document.getElementById("srs-arvore-temas-excluir");
    if (!container) return;
    arvoreTemasSRS = construirArvoreTemas([...srsTemasConhecidos]);
    if (srsTemasConhecidos.size === 0) { container.innerHTML = "<p class='biblioteca-vazio'>Nenhum tema cadastrado ainda.</p>"; return; }
    let html = "<ul class='srs-arvore-raiz'>";
    Object.values(arvoreTemasSRS).sort((a,b) => a.nome.localeCompare(b.nome)).forEach(node => { html += renderizarNoTemaExcluirHTML(node); });
    html += "</ul>";
    container.innerHTML = html;
    container.querySelectorAll('input[data-indeterminado="true"]').forEach(el => { el.indeterminate = true; });
}
function alternarExpansaoTemaExcluir(caminho, event) {
    event.stopPropagation();
    if (srsNosExpandidos.has(caminho)) srsNosExpandidos.delete(caminho); else srsNosExpandidos.add(caminho);
    renderizarArvoreTemasExcluirSRS();
}
function alternarSelecaoTemaExcluir(caminho) {
    const node = encontrarNoPorCaminho(arvoreTemasSRS, caminho);
    if (!node) return;
    const marcarTudo = estadoNoTemaExcluir(node) !== 'marcado';
    coletarCaminhosReais(node).forEach(c => { if (marcarTudo) srsTemasParaExcluir.add(c); else srsTemasParaExcluir.delete(c); });
    renderizarArvoreTemasExcluirSRS();
}
function marcarTodosTemasParaExcluir() { srsTemasParaExcluir = new Set(srsTemasConhecidos); renderizarArvoreTemasExcluirSRS(); }
function limparTodosTemasParaExcluir() { srsTemasParaExcluir = new Set(); renderizarArvoreTemasExcluirSRS(); }
function abrirModalExcluirTemasSRS() {
    srsTemasParaExcluir = new Set();
    renderizarArvoreTemasExcluirSRS();
    document.getElementById("srs-excluir-temas-modal").classList.remove("modal-oculto");
}
function fecharModalExcluirTemasSRS() { document.getElementById("srs-excluir-temas-modal").classList.add("modal-oculto"); }

function confirmarExclusaoTemasSelecionadosSRS() {
    if (srsTemasParaExcluir.size === 0) { alert("Nenhum tema selecionado."); return; }
    const temasSelecionados = new Set(srsTemasParaExcluir); // congela a seleção antes do modal fechar
    const cardsAlvo = dados.srsItems.filter(i => temasSelecionados.has(i.tema));
    if (cardsAlvo.length === 0) { alert("Nenhum card encontrado nos temas selecionados."); return; }

    const qtdTemas = temasSelecionados.size;
    fecharModalExcluirTemasSRS(); // evita sobrepor com o modal de confirmação abaixo
    pedirConfirmacaoPerigosa(
        `Excluir ${qtdTemas} tema(s) selecionado(s) e todos os ${cardsAlvo.length} card(s) deles? Essa ação não pode ser desfeita.`,
        () => {
            mostrarProgressoOperacao("Excluindo temas e cards...", "🗑️");
            const total = cardsAlvo.length;
            let excluidos = 0;
            atualizarProgressoOperacao(0, total, "🗑️", "Excluindo cards...");
            Promise.all(cardsAlvo.map(card =>
                excluirMidiasDoCardSRS(card).finally(() => {
                    excluidos++;
                    atualizarProgressoOperacao(excluidos, total, "🗑️", "Excluindo cards...");
                })
            )).finally(() => {
                const idsParaExcluir = new Set(cardsAlvo.map(c => c.id));
                dados.srsItems = dados.srsItems.filter(i => !idsParaExcluir.has(i.id));
                removerEntradasLogSRS(idsParaExcluir);
                temasSelecionados.forEach(caminho => srsNosExpandidos.delete(caminho));
                srsItemsAlterado = true;
                srsTemasParaExcluir = new Set();
                salvar();
                esconderProgressoOperacao();
                alert(`${qtdTemas} tema(s) excluído(s): ${cardsAlvo.length} card(s) removido(s).`);
            });
        }
    );
}

let urlsImagemRevisaoAtual = [];
function limparUrlsImagemRevisao() {
    urlsImagemRevisaoAtual.forEach(u => URL.revokeObjectURL(u));
    urlsImagemRevisaoAtual = [];
}
// Carrega uma lista de imagens (ids) num container, uma do lado da outra — usado tanto pra imagem
// única de sempre quanto pras extras (cards do Anki com mais de uma imagem no mesmo lado).
function exibirListaImagensRevisao(ids, elId, altBase) {
    const el = document.getElementById(elId);
    if (!el || ids.length === 0) return;
    Promise.all(ids.map(id => carregarImagemSRS(id).catch(() => null))).then(blobs => {
        let algumaCarregada = false;
        blobs.forEach((blob, idx) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            urlsImagemRevisaoAtual.push(url);
            el.innerHTML += `<img src="${url}" alt="${altBase} ${idx + 1}">`;
            algumaCarregada = true;
        });
        if (algumaCarregada) el.classList.remove("oculto");
    });
}
// Mesma ideia, mas pra áudio/vídeo — cada item é {id, tipo}.
function exibirListaMidiasRevisao(itens, elId) {
    const el = document.getElementById(elId);
    if (!el || itens.length === 0) return;
    Promise.all(itens.map(m => carregarImagemSRS(m.id).then(blob => ({ blob, tipo: m.tipo })).catch(() => null))).then(resultados => {
        let algumaCarregada = false;
        resultados.forEach(res => {
            if (!res || !res.blob) return;
            const url = URL.createObjectURL(res.blob);
            urlsImagemRevisaoAtual.push(url);
            el.innerHTML += res.tipo === "video" ? `<video src="${url}" controls></video>` : `<audio src="${url}" controls></audio>`;
            algumaCarregada = true;
        });
        if (algumaCarregada) el.classList.remove("oculto");
    });
}

function exibirImagensRevisaoAtual(item) {
    if (!item) return;

    // NOVO: quando o lado tem HTML rico (camposFrente/camposVerso), as imagens/mídias desse lado já
    // aparecem embutidas no próprio texto, na posição certa (ver resolverMidiaInlineNoContainer) —
    // mostrar de novo aqui duplicava tudo (um card chegava a mostrar a mesma imagem repetida em bloco
    // à parte). Só mostra o bloco genérico pra um lado quando ele NÃO tem HTML rico (cards antigos, ou
    // a pergunta de um cloze — que nunca tem camposFrente, só camposVerso quando há campos extras).
    if (!item.camposFrente) {
        const idsImagemPergunta = [item.imagemPerguntaId, ...(item.imagensExtrasPerguntaIds || [])].filter(Boolean);
        exibirListaImagensRevisao(idsImagemPergunta, "srs-imagem-pergunta-atual", "Imagem da pergunta");

        const midiasPergunta = [
            item.midiaPerguntaId ? { id: item.midiaPerguntaId, tipo: item.midiaPerguntaTipo } : null,
            ...(item.midiasExtrasPerguntaIds || [])
        ].filter(Boolean);
        exibirListaMidiasRevisao(midiasPergunta, "srs-midia-pergunta-atual");
    }

    if (!item.camposVerso) {
        const idsImagemResposta = [item.imagemRespostaId, ...(item.imagensExtrasRespostaIds || [])].filter(Boolean);
        exibirListaImagensRevisao(idsImagemResposta, "srs-imagem-resposta-atual", "Imagem da resposta");

        const midiasResposta = [
            item.midiaRespostaId ? { id: item.midiaRespostaId, tipo: item.midiaRespostaTipo } : null,
            ...(item.midiasExtrasRespostaIds || [])
        ].filter(Boolean);
        exibirListaMidiasRevisao(midiasResposta, "srs-midia-resposta-atual");
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

// ============================================================
// === BARRA DE PROGRESSO GENÉRICA (importação Anki, exclusão de tema, backup com arquivos) ===
// ============================================================
// Modal + barra de progresso compartilhados pelas 3 operações demoradas do app. Também reflete o
// progresso no título da aba (mesma ideia do timer pomodoro, que já faz isso) pra dar pra acompanhar
// mesmo com a aba em segundo plano.
let tituloAbaAntesDoProgresso = null;
// NOVO: recarregar/fechar a aba no meio de uma dessas 3 operações (principalmente a importação de
// .apkg, a mais demorada) perde tudo o que já tinha sido processado — os cards convertidos até ali só
// existem em memória, só são gravados de verdade no final (ver salvar() em importarApkg). Sem aviso
// nenhum, era fácil fechar por engano achando que a barra travou (ver fix de lotes acima) e perder a
// importação inteira sem saber. O aviso nativo do navegador não deixa a gente escolher o texto exato
// (cada um mostra uma mensagem genérica própria), mas continua sendo o jeito certo de dar essa chance
// de "tem certeza?" antes de sair.
function avisarSairDuranteProgresso(e) {
    e.preventDefault();
    e.returnValue = "";
}
function mostrarProgressoOperacao(tituloModal, emoji) {
    if (tituloAbaAntesDoProgresso === null) tituloAbaAntesDoProgresso = document.title;
    window.addEventListener("beforeunload", avisarSairDuranteProgresso);
    const modal = document.getElementById("progresso-operacao-modal");
    if (!modal) return;
    document.getElementById("progresso-operacao-emoji").innerText = emoji;
    document.getElementById("progresso-operacao-titulo").innerText = tituloModal;
    document.getElementById("progresso-operacao-barra").style.width = "0%";
    document.getElementById("progresso-operacao-texto").innerText = "Iniciando...";
    modal.classList.remove("modal-oculto");
}
function atualizarProgressoOperacao(concluidos, total, emoji, tituloAba) {
    const pct = total > 0 ? Math.min(100, Math.round((concluidos / total) * 100)) : 0;
    const barra = document.getElementById("progresso-operacao-barra");
    if (barra) barra.style.width = pct + "%";
    const texto = document.getElementById("progresso-operacao-texto");
    if (texto) texto.innerText = `${Math.min(Math.round(concluidos), total)} de ${total} (${pct}%)`;
    document.title = `(${pct}%) ${emoji} ${tituloAba}`;
}
function esconderProgressoOperacao() {
    window.removeEventListener("beforeunload", avisarSairDuranteProgresso);
    const modal = document.getElementById("progresso-operacao-modal");
    if (modal) modal.classList.add("modal-oculto");
    if (tituloAbaAntesDoProgresso !== null) {
        document.title = tituloAbaAntesDoProgresso;
        tituloAbaAntesDoProgresso = null;
    }
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

    mostrarProgressoOperacao("Importando baralho do Anki...", "📥");

    setTimeout(() => {
        processarImportacaoApkg(arquivo)
            .then(resumo => {
                esconderProgressoOperacao();
                salvar();
                if (resumo.deckVazio) {
                    mostrarResultadoImportacao("Deck vazio", "⚠️", "Esse .apkg não tinha nenhuma nota — não havia nada pra importar. Confira se é o arquivo certo (ex: exportou um subdeck vazio por engano).");
                    return;
                }
                let msg = `✅ ${resumo.sucesso} card(s) importado(s)\n⚠️ ${resumo.midiaNaoSuportada} card(s) com mídia não suportada (texto importado normalmente)\n❌ ${resumo.falhas} card(s) que falharam`;
                if (resumo.notasComLatex) {
                    msg += `\n🧮 ${resumo.notasComLatex} card(s) com fórmula LaTeX não renderizada (aparece como texto cru, ex: "[$]x^2[/$]")`;
                }
                if (resumo.versoVazio) {
                    msg += `\n📭 ${resumo.versoVazio} card(s) importado(s) com o verso (resposta) vazio — igual acontece no Anki de verdade quando só a frente tem conteúdo (ex: campo de tradução ainda não preenchido, ou card "divisor" sem resposta por design do deck)`;
                }
                if (resumo.duplicadosPulados) {
                    msg += `\n🔁 ${resumo.duplicadosPulados} card(s) pulado(s) por já existir (mesmo tema, pergunta e resposta de um card já importado antes)`;
                }
                if (resumo.exemplosFalha.length > 0) {
                    msg += `\n\nExemplos de erro (copie esse texto e cole na conversa se quiser que eu investigue):\n- ${resumo.exemplosFalha.join("\n- ")}`;
                }
                if (resumo.avisosFidelidade && resumo.avisosFidelidade.length > 0) {
                    msg += `\n\n⚠️ Diferenças de fidelidade encontradas nesse deck (o card importa, mas fica diferente do Anki nesse ponto):\n- ${resumo.avisosFidelidade.join("\n- ")}`;
                }
                const houveFalha = resumo.falhas > 0;
                mostrarResultadoImportacao(houveFalha ? "Importação concluída com falhas" : "Importação concluída", houveFalha ? "⚠️" : "✅", msg);
            })
            .catch(err => {
                console.error("Erro ao importar .apkg:", err);
                esconderProgressoOperacao();
                const detalheTecnico = (err && err.message) ? err.message : String(err);
                const msg = `Não foi possível importar esse arquivo.\n\nVerifique se é um .apkg válido exportado do Anki.\n\nErro técnico (copie esse texto e cole na conversa se quiser que eu investigue):\n${detalheTecnico}`;
                mostrarResultadoImportacao("Falha ao importar", "❌", msg);
            });
    }, 50);
}

// ============================================================
// === DECODIFICADOR MÍNIMO DE PROTOBUF PRO MAPA DE MÍDIA DO ANKI 2.1.50+ ===
// ============================================================
// Decks exportados pelo Anki 2.1.50 em diante não usam mais um JSON simples pra mapear os nomes
// numéricos dentro do .zip pros nomes reais dos arquivos de mídia — usam uma mensagem protobuf
// "MediaEntries" (ver proto/anki/import_export.proto no código-fonte do Anki). Em vez de trazer uma
// biblioteca de protobuf inteira só pra isso, decodificamos à mão só os 2 campos que interessam:
// MediaEntries { repeated MediaEntry entries = 1; }
// MediaEntry { string name = 1; uint32 size = 2; bytes sha1 = 3; optional uint32 legacy_zip_filename = 255; }
// Numa exportação nova (sem "buracos" na numeração), o Anki não preenche legacy_zip_filename — o nome
// numérico do arquivo dentro do .zip é simplesmente a posição do MediaEntry na lista (0, 1, 2, ...),
// então usamos o índice de iteração como padrão e só sobrescrevemos se legacy_zip_filename vier definido.
function lerVarintProtobuf(bytes, pos) {
    let resultado = 0, deslocamento = 0, b;
    do {
        b = bytes[pos++];
        resultado |= (b & 0x7f) << deslocamento;
        deslocamento += 7;
    } while (b & 0x80);
    return [resultado >>> 0, pos];
}
function pularCampoProtobuf(bytes, pos, wireType) {
    if (wireType === 0) return lerVarintProtobuf(bytes, pos)[1]; // varint
    if (wireType === 2) { const [tamanho, pos2] = lerVarintProtobuf(bytes, pos); return pos2 + tamanho; } // length-delimited
    if (wireType === 5) return pos + 4; // 32-bit
    if (wireType === 1) return pos + 8; // 64-bit
    throw new Error("MediaEntries: wire type de protobuf não suportado (" + wireType + ")");
}
function decodificarMediaEntryProtobuf(bytes) {
    let pos = 0, nome = null, indiceLegado = null;
    while (pos < bytes.length) {
        const [tag, pos1] = lerVarintProtobuf(bytes, pos);
        const numeroCampo = tag >>> 3, wireType = tag & 0x7;
        pos = pos1;
        if (numeroCampo === 1 && wireType === 2) {
            const [tamanho, pos2] = lerVarintProtobuf(bytes, pos);
            nome = new TextDecoder("utf-8").decode(bytes.subarray(pos2, pos2 + tamanho));
            pos = pos2 + tamanho;
        } else if (numeroCampo === 255 && wireType === 0) {
            const [valor, pos2] = lerVarintProtobuf(bytes, pos);
            indiceLegado = valor;
            pos = pos2;
        } else {
            pos = pularCampoProtobuf(bytes, pos, wireType);
        }
    }
    return { nome, indiceLegado };
}
function decodificarMediaEntriesProtobuf(bytes) {
    const mapaMedia = {};
    let pos = 0, indiceIteracao = 0;
    while (pos < bytes.length) {
        const [tag, pos1] = lerVarintProtobuf(bytes, pos);
        const numeroCampo = tag >>> 3, wireType = tag & 0x7;
        pos = pos1;
        if (numeroCampo === 1 && wireType === 2) {
            const [tamanho, pos2] = lerVarintProtobuf(bytes, pos);
            const entry = decodificarMediaEntryProtobuf(bytes.subarray(pos2, pos2 + tamanho));
            pos = pos2 + tamanho;
            if (entry.nome !== null) {
                const indice = entry.indiceLegado !== null ? entry.indiceLegado : indiceIteracao;
                mapaMedia[indice] = entry.nome;
                indiceIteracao++;
            }
        } else {
            pos = pularCampoProtobuf(bytes, pos, wireType);
        }
    }
    return mapaMedia;
}

// Decodificador genérico (reaproveita lerVarintProtobuf/pularCampoProtobuf) que só extrai os poucos
// campos pedidos de uma mensagem protobuf, ignorando (pulando) todo o resto — usado pra ler
// NotetypeConfig e CardTemplateConfig do schema novo do Anki (ver construirModelosSchemaNovo) sem
// precisar escrever um decodificador dedicado pra cada mensagem.
function decodificarCamposProtobuf(bytes, camposString, camposVarint) {
    const resultado = {};
    let pos = 0;
    while (pos < bytes.length) {
        const [tag, pos1] = lerVarintProtobuf(bytes, pos);
        const numeroCampo = tag >>> 3, wireType = tag & 0x7;
        pos = pos1;
        if (wireType === 2 && camposString.includes(numeroCampo)) {
            const [tamanho, pos2] = lerVarintProtobuf(bytes, pos);
            resultado[numeroCampo] = new TextDecoder("utf-8").decode(bytes.subarray(pos2, pos2 + tamanho));
            pos = pos2 + tamanho;
        } else if (wireType === 0 && camposVarint.includes(numeroCampo)) {
            const [valor, pos2] = lerVarintProtobuf(bytes, pos);
            resultado[numeroCampo] = valor;
            pos = pos2;
        } else {
            pos = pularCampoProtobuf(bytes, pos, wireType);
        }
    }
    return resultado;
}

// NOVO: no schema 18 do Anki (2.1.50+, o mesmo do collection.anki21b), as colunas col.decks/col.models
// ficam vazias — decks e tipos de nota passaram a viver em tabelas dedicadas, com parte do conteúdo em
// protobuf. Reconstrói o mesmo formato JSON (deckId -> {name}) que o resto do importador já espera de
// col.decks, a partir da tabela "decks" (onde o nome já é uma coluna de texto simples, sem protobuf).
function construirDecksSchemaNovo(db) {
    const decksJson = {};
    const linhas = db.exec("SELECT id, name FROM decks");
    // NOVO: no schema 18, o nome do deck usa o caractere de controle \x1f (unit separator) como
    // separador de hierarquia entre deck pai e subdeck, em vez de "::" como nas exportações antigas
    // (JSON de col.decks). Convertemos aqui pra bater com o que o resto do app já espera (ver
    // construirArvoreTemas, "separador '::'") — sem isso, a árvore de temas tratava o nome inteiro
    // como um único tema achatado (com os \x1f aparecendo como caracteres estranhos no meio do texto).
    if (linhas.length) linhas[0].values.forEach(([id, name]) => { decksJson[String(id)] = { name: name.replace(/\x1f/g, "::") }; });
    return decksJson;
}

// Mesma ideia de construirDecksSchemaNovo, mas pra tipos de nota (modelsJson: notetypeId -> {name,
// type, flds, tmpls}) — reconstruída a partir de "notetypes" (nome já é coluna simples; só o "kind"
// — 0=normal, 1=cloze — vem no protobuf de config, campo 1), "fields" (nome do campo também já é
// coluna simples, só precisamos da ordem) e "templates" (qfmt/afmt vêm no protobuf de config, campos
// 1 e 2 — ver CardTemplateConfig no código-fonte do Anki).
function construirModelosSchemaNovo(db) {
    const modelsJson = {};
    const linhasNotetypes = db.exec("SELECT id, name, config FROM notetypes");
    if (!linhasNotetypes.length) return modelsJson;
    linhasNotetypes[0].values.forEach(([id, name, config]) => {
        const cfg = decodificarCamposProtobuf(config, [], [1]);
        modelsJson[String(id)] = { name, type: cfg[1] || 0, flds: [], tmpls: [] };
    });

    const linhasFields = db.exec("SELECT ntid, ord, name FROM fields");
    if (linhasFields.length) linhasFields[0].values.forEach(([ntid, ord, name]) => {
        const modelo = modelsJson[String(ntid)];
        if (modelo) modelo.flds[ord] = { name };
    });

    const linhasTemplates = db.exec("SELECT ntid, ord, config FROM templates");
    if (linhasTemplates.length) linhasTemplates[0].values.forEach(([ntid, ord, config]) => {
        const modelo = modelsJson[String(ntid)];
        if (!modelo) return;
        const cfg = decodificarCamposProtobuf(config, [1, 2], []);
        modelo.tmpls[ord] = { qfmt: cfg[1] || "", afmt: cfg[2] || "" };
    });

    // flds/tmpls são preenchidos por posição (ord) acima, então podem ficar com "buracos" (sparse)
    // se algum ord vier fora de sequência — normaliza pra array denso, já que o resto do importador
    // (camposReferenciadosAnki, prepararTemplateAnki etc.) espera um array comum.
    Object.values(modelsJson).forEach(modelo => {
        modelo.flds = modelo.flds.filter(Boolean);
        modelo.tmpls = modelo.tmpls.filter(Boolean);
    });

    return modelsJson;
}

// Detecta o "magic number" padrão de um frame zstd (os 4 bytes 28 B5 2F FD) — usado em vários pontos
// da importação do Anki, porque exportações mais recentes (2.1.50+) comprimem em zstd não só o
// media/collection.anki21b, mas também, em algumas versões, cada arquivo de mídia individualmente
// (ver descomprimirBlobSeZstd).
function ehBytesZstd(bytes) {
    return bytes.length >= 4 && bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd;
}

// NOVO: em algumas exportações do Anki, cada arquivo de mídia (imagem, áudio) dentro do .apkg também
// vem comprimido em zstd individualmente — não só o media/collection.anki21b, já tratados. Detecta
// pelo magic number e descomprime antes de salvar; sem isso, o blob salvo era o zstd cru, que o
// navegador não consegue decodificar como imagem/áudio (a imagem simplesmente não aparecia, sem erro
// nenhum no console — só carregava com 0x0 de dimensão).
function descomprimirBlobSeZstd(blob) {
    return blob.arrayBuffer().then(buffer => {
        const bytes = new Uint8Array(buffer);
        if (!ehBytesZstd(bytes)) return blob;
        const descomprimido = fzstd.decompress(bytes);
        return new Blob([descomprimido], { type: blob.type || "application/octet-stream" });
    });
}

// NOVO: o JSZip não infere o Content-Type de um arquivo pelo nome/extensão — o blob que
// zip.file(x).async("blob") devolve vem com "type" vazio sempre que o arquivo original não estava
// comprimido em zstd (o único lugar que já setava um "type" era descomprimirBlobSeZstd, e só no
// caminho comprimido). Pra formatos "sniffáveis" como JPG/PNG isso não dava problema — o navegador
// consegue adivinhar o tipo pelos bytes mesmo sem Content-Type — mas SVG usado num <img> via blob URL
// EXIGE o MIME certo por segurança (é tratado como possível conteúdo executável): sem isso, a imagem
// aparece como ícone de "quebrada" (naturalWidth 0), sem erro nenhum no console avisando por quê.
const TIPOS_MIME_POR_EXTENSAO_MIDIA = {
    svg: "image/svg+xml", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", bmp: "image/bmp", avif: "image/avif", tif: "image/tiff", tiff: "image/tiff",
    mp3: "audio/mpeg", ogg: "audio/ogg", oga: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4",
    flac: "audio/flac", aac: "audio/aac", opus: "audio/opus", weba: "audio/webm",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", ogv: "video/ogg", mkv: "video/x-matroska"
};
function corrigirTipoMimeBlob(blob, nomeArquivo) {
    const extensao = ((nomeArquivo || "").split(".").pop() || "").toLowerCase();
    const tipoCerto = TIPOS_MIME_POR_EXTENSAO_MIDIA[extensao];
    if (!tipoCerto || blob.type === tipoCerto) return blob;
    return new Blob([blob], { type: tipoCerto });
}

function processarImportacaoApkg(arquivo) {
    const resumo = { sucesso: 0, midiaNaoSuportada: 0, falhas: 0, exemplosFalha: [] };

    return Promise.all([JSZip.loadAsync(arquivo), carregarSqlJs()]).then(([zip, SQL]) => {
        const arquivoMedia = zip.file("media");
        const promessaMedia = arquivoMedia ? arquivoMedia.async("uint8array").then(bytes => {
            try {
                return JSON.parse(new TextDecoder("utf-8").decode(bytes));
            } catch (e) {
                // NOVO: no formato novo do Anki (2.1.50+), o "media" não é só o protobuf MediaEntries
                // cru — em exportações mais recentes ele também vem comprimido em zstd, igual ao
                // collection.anki21b (ver mais abaixo). Sem descomprimir primeiro, tentávamos decodificar
                // como protobuf os bytes ainda comprimidos, o que sempre falhava ("wire type não
                // suportado") por não ser protobuf válido, só lixo binário comprimido.
                const bytesProtobuf = ehBytesZstd(bytes) ? fzstd.decompress(bytes) : bytes;
                return decodificarMediaEntriesProtobuf(bytesProtobuf);
            }
        }) : Promise.resolve({});

        return promessaMedia.then(mapaMedia => {
            const nomeParaIndice = {};
            Object.keys(mapaMedia).forEach(indice => { nomeParaIndice[mapaMedia[indice]] = indice; });

            // NOVO: exportações do Anki 2.1.50+ incluem um "collection.anki2" que NÃO é o banco de
            // verdade — é só um arquivo de aviso (1 nota dizendo "atualize o Anki"), mantido por
            // compatibilidade com versões antigas que não entendem o formato novo. O banco de verdade
            // fica no collection.anki21b (comprimido em zstd) quando ele existe — por isso ele tem que
            // ser preferido PRIMEIRO; os arquivos "planos" só servem de fallback pra exportações mais
            // antigas que nem tem collection.anki21b. Preferir o plano (como fazíamos antes) importava
            // só esse aviso genérico e descartava os cards de verdade.
            const arquivoDbZstd = zip.file("collection.anki21b");
            const arquivoDbPlano = zip.file("collection.anki21") || zip.file("collection.anki2");
            if (!arquivoDbPlano && !arquivoDbZstd) throw new Error("collection.anki2/anki21/anki21b não encontrado no .apkg.");

            const promessaBytesDb = arquivoDbZstd
                ? arquivoDbZstd.async("uint8array").then(bytesComprimidos => fzstd.decompress(bytesComprimidos))
                : arquivoDbPlano.async("uint8array");

            return promessaBytesDb.then(bytes => {
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
// Diferenças de fidelidade conhecidas (o card importa, mas fica diferente do Anki nesse ponto
// específico — ver checarProblemasDeFidelidadeDoModelo) — deduplicado, porque a mesma mensagem se
// repetiria pra cada nota do mesmo modelo num deck grande.
function adicionarAvisoFidelidadeApkg(resumo, mensagem) {
    if (!resumo.avisosFidelidade) resumo.avisosFidelidade = [];
    if (!resumo.avisosFidelidade.includes(mensagem)) resumo.avisosFidelidade.push(mensagem);
}

// Chave de identidade de um card pra detectar duplicata na importação de .apkg (ver processarBancoAnki)
// — mesmo critério de "já existe" já usado na adição manual (tema+pergunta, linha ~1242), com a
// resposta somada: pergunta sozinha não basta aqui porque uma nota cloze com 2+ números de lacuna (ver
// converterNotaClozeAnki) gera 2 cards com a MESMA pergunta renderizada (o texto completo, com as 2
// lacunas visíveis) e respostas DIFERENTES — comparar só a pergunta faria o 2º card parecer duplicata
// do 1º e ser descartado por engano.
function assinaturaCardSRS(tema, subtema, resposta) {
    return `${(tema || "").trim().toLowerCase()}\u0000${(subtema || "").trim().toLowerCase()}\u0000${(resposta || "").trim().toLowerCase()}`;
}

function processarBancoAnki(db, zip, nomeParaIndice, resumo) {
    const colRows = db.exec("SELECT decks, models FROM col LIMIT 1");
    if (!colRows.length) throw new Error("Banco do Anki sem a tabela 'col' esperada.");
    const decksBruto = colRows[0].values[0][0];
    const modelsBruto = colRows[0].values[0][1];
    // NOVO: no schema 18 do Anki (2.1.50+, o mesmo do collection.anki21b), col.decks/col.models vêm
    // vazios — decks e tipos de nota passam a viver em tabelas dedicadas (ver construirDecksSchemaNovo/
    // construirModelosSchemaNovo). Sem isso, JSON.parse("") derrubava a importação inteira com
    // "Unexpected end of JSON input" mesmo já tendo lido os cards certos do banco.
    const decksJson = decksBruto ? JSON.parse(decksBruto) : construirDecksSchemaNovo(db);
    const modelsJson = modelsBruto ? JSON.parse(modelsBruto) : construirModelosSchemaNovo(db);

    const linhas = db.exec(`
        SELECT notes.id, notes.mid, notes.flds,
               (SELECT cards.did FROM cards WHERE cards.nid = notes.id LIMIT 1) as did
        FROM notes
    `);
    // NOVO: um deck sem NENHUMA nota (exportado vazio por engano, ou um subdeck vazio) antes "importava
    // com sucesso" mostrando "0 card(s) importado(s)" sem explicar por quê — parecia um bug de
    // importação em vez do que realmente é (o arquivo não tinha nada pra importar).
    if (!linhas.length) { resumo.deckVazio = true; return Promise.resolve(); }

    const colunas = linhas[0].columns;
    const idxMid = colunas.indexOf("mid"), idxFlds = colunas.indexOf("flds"), idxDid = colunas.indexOf("did");

    const notas = linhas[0].values;
    const totalNotas = notas.length;
    let processadas = 0;
    atualizarProgressoOperacao(0, totalNotas, "📥", "Importando baralho...");

    // NOVO: reimportar um .apkg já importado antes (ex: pra pegar uma correção de fidelidade nova, sem
    // ter que apagar o deck e perder o histórico de revisão) duplicava TODO card que já tinha entrado
    // certo — a importação nunca checava se o card já existia, só fazia push de tudo de novo. Calculado
    // 1x aqui (fora do loop de notas) com todos os cards já presentes no momento em que a importação
    // começou; cada card novo aceito também entra nesse mesmo Set, pra um card gerado por uma nota não
    // ser visto como duplicata de outro card da MESMA importação (ex: 2 templates da mesma nota nunca
    // têm tema+pergunta+resposta iguais, então isso não afeta o caso normal — só evita reprocessar o
    // Set inteiro de novo a cada nota).
    const assinaturasJaImportadas = new Set(dados.srsItems.map(it => assinaturaCardSRS(it.tema, it.subtema, it.resposta)));

    // NOVO: alguns recursos do Anki não têm suporte nenhum aqui — não quebram a importação (o card
    // ainda entra, com o resto do conteúdo), mas o resultado final na tela pode ficar visivelmente
    // diferente do que o Anki mostraria. Antes isso acontecia em silêncio, sem nenhum aviso; agora
    // detectamos e avisamos, do mesmo jeito que já avisamos mídia não suportada. Cada checagem roda só
    // 1x por MODELO (tipo de nota) — o problema é do template, então vale pra toda nota daquele tipo,
    // sem repetir o mesmo aviso centenas de vezes num deck grande.
    const modelosJaChecados = new Set();
    function checarProblemasDeFidelidadeDoModelo(modelo) {
        if (modelosJaChecados.has(modelo.id)) return;
        modelosJaChecados.add(modelo.id);
        const nomeModelo = modelo.name || "sem nome";
        if (/image\s*occlusion/i.test(nomeModelo)) {
            adicionarAvisoFidelidadeApkg(resumo, `Modelo "${nomeModelo}" é do tipo Image Occlusion (ocultar partes de uma imagem) — não tem suporte dedicado; o card pode não aparecer como no Anki.`);
            return; // já é um caso especial conhecido, não precisa checar os filtros de template abaixo
        }
        const tmpl = modelo.tmpls && modelo.tmpls[0];
        const textoTemplate = ((tmpl && tmpl.qfmt) || "") + " " + ((tmpl && tmpl.afmt) || "");
        if (/\{\{type:/i.test(textoTemplate)) {
            adicionarAvisoFidelidadeApkg(resumo, `Modelo "${nomeModelo}" usa {{type:Campo}} (resposta digitada com correção letra-a-letra) — importado como campo comum, sem essa interação.`);
        }
        if (/\{\{tts[\s:]/i.test(textoTemplate)) {
            adicionarAvisoFidelidadeApkg(resumo, `Modelo "${nomeModelo}" usa {{tts:...}} (texto-pra-voz gerado pelo Anki) — não suportado; o texto aparece normal, mas sem esse áudio.`);
        }
    }
    // Detecta LaTeX ([latex]...[/latex], [$]...[/$], [$$]...[/$$]) no conteúdo CRU da nota (é uma
    // marcação dentro do campo, não do template — por isso checa por nota, não por modelo). Sem
    // MathJax/similar pra renderizar, isso vira texto cru na tela em vez da fórmula matemática.
    const regexLatex = /\[(latex|\$\$?)\]/i;

    function processarNota(linha) {
        const mid = String(linha[idxMid]);
        const did = String(linha[idxDid]);
        const flds = linha[idxFlds].split("\x1f");
        const modelo = modelsJson[mid];
        const deckInfo = decksJson[did];
        const tema = deckInfo ? deckInfo.name : "Importado do Anki";

        const marcarProcessada = () => { processadas++; atualizarProgressoOperacao(processadas, totalNotas, "📥", "Importando baralho..."); };

        if (!modelo) { registrarFalha(resumo, `Tipo de nota (modelo) não encontrado no banco (mid ${mid}).`); marcarProcessada(); return Promise.resolve(); }
        checarProblemasDeFidelidadeDoModelo(modelo);
        if (regexLatex.test(linha[idxFlds])) resumo.notasComLatex = (resumo.notasComLatex || 0) + 1;

        return converterNotaAnki(modelo, flds, tema, zip, nomeParaIndice)
            .then(cards => {
                if (!cards || cards.length === 0) { registrarFalha(resumo, "Conversão não gerou nenhum card válido."); return; }
                // NOVO: uma nota com múltiplos templates (ver prepararTemplatesAnki) vira múltiplos
                // cards aqui — cada um conta pro "sucesso" normalmente, como se fossem notas separadas.
                cards.forEach(card => {
                    const midiaNaoSuportadaCard = !!card._midiaNaoSuportada;
                    const versoVazioCard = !!card._versoVazio;
                    delete card._midiaNaoSuportada;
                    delete card._versoVazio;
                    // NOVO: reimportar um .apkg já importado antes (pra pegar uma correção nova) não deve
                    // duplicar os cards que já tinham entrado certo — ver assinaturaCardSRS/
                    // assinaturasJaImportadas acima. SÓ checa quando a pergunta (subtema) tem algum texto
                    // de verdade — cards cuja frente é só imagem, sem nenhum texto que distinga um do
                    // outro (ex: notas de Image Occlusion, onde cabeçalho/rodapé/observações costumam vir
                    // todos em branco e a única coisa que muda de fato é a imagem em si) NUNCA entram
                    // nessa checagem. Motivo: os ids de mídia (data-srs-img-id/data-srs-midia-id) são
                    // gerados de novo, ALEATORIAMENTE, a cada importação (ver extrairCampoAnkiComoHtml) —
                    // não dá pra usá-los pra reconhecer "é o mesmo card de uma importação anterior". Sem
                    // nenhum texto sobrando pra comparar, todo card assim cairia na MESMA assinatura vazia
                    // e pareceria duplicata de qualquer outro — bug real encontrado num deck real: 45 de
                    // 46 notas de Image Occlusion (imagens diferentes entre si) foram descartadas como
                    // "duplicata" da 1ª, só por coincidirem em tema+pergunta-vazia+resposta genérica.
                    const temTextoDistintivo = (card.subtema || "").trim() !== "";
                    if (temTextoDistintivo) {
                        const assinatura = assinaturaCardSRS(card.tema, card.subtema, card.resposta);
                        if (assinaturasJaImportadas.has(assinatura)) {
                            resumo.duplicadosPulados = (resumo.duplicadosPulados || 0) + 1;
                            return;
                        }
                        assinaturasJaImportadas.add(assinatura);
                    }
                    if (midiaNaoSuportadaCard) resumo.midiaNaoSuportada++;
                    if (versoVazioCard) resumo.versoVazio = (resumo.versoVazio || 0) + 1;
                    dados.srsItems.push(card);
                    resumo.sucesso++;
                });
                srsItemsAlterado = true;
            })
            .catch(err => { registrarFalha(resumo, `[${modelo.name || "modelo sem nome"}] ${err.message || err}`); })
            .finally(marcarProcessada);
    }

    // NOVO: processar TODAS as notas de uma vez (um Promise.all só, sobre milhares de tarefas) travava
    // decks pesados em mídia — cada campo com imagem/áudio dispara uma descompressão do zip E uma
    // gravação no IndexedDB (às vezes as duas coisas em dobro, ver extrairMidiaDoCampo/
    // extrairCampoAnkiComoHtml), tudo isso sem limite nenhum de quantas rodam ao mesmo tempo. Num deck
    // de ~190MB com muita mídia, isso enfileira dezenas de milhares de microtasks de uma vez: o
    // navegador nunca sobra um instante pra repintar a tela (a barra de progresso parece "travada"
    // mesmo com o JS de verdade avançando por baixo dos panos) e a memória usada pra segurar todos os
    // blobs pendentes ao mesmo tempo pode esgotar. Processar em lotes pequenos, com uma pausa real
    // (setTimeout) entre eles, limita quanto fica pendente ao mesmo tempo e devolve o controle pro
    // navegador repintar a cada lote — a barra passa a avançar de verdade, em vez de só no final.
    // NOVO: mesmo nível de paralelismo configurável pelo usuário usado no backup/sincronização de mídia
    // (ver FATORES_NIVEL_PARALELISMO_ARQUIVOS) — "conservador" mantém esse valor-base de sempre.
    const TAMANHO_LOTE_IMPORTACAO = 25 * obterFatorParalelismoArquivos();
    function processarLote(inicio) {
        const lote = notas.slice(inicio, inicio + TAMANHO_LOTE_IMPORTACAO);
        if (lote.length === 0) return Promise.resolve();
        return Promise.all(lote.map(processarNota))
            .then(() => new Promise(resolve => setTimeout(resolve, 0)))
            .then(() => processarLote(inicio + TAMANHO_LOTE_IMPORTACAO));
    }

    return processarLote(0);
}

// Mesmo teste de "tem conteúdo de verdade" usado em vários pontos do importador (campo extra do
// fallback antigo, seções condicionais {{#Campo}}/{{^Campo}} do template novo, hint {{hint:Campo}}):
// um campo só de imagem/áudio não sobra texto depois de tirar as tags, mas não conta como vazio.
function campoAnkiTemConteudo(bruto) {
    bruto = bruto || "";
    return !!(bruto.replace(/<\/?[^>]+>/g, "").trim() || /<img[^>]+src=/i.test(bruto) || /\[sound:/i.test(bruto));
}

// Sempre resolve com um ARRAY de cards (1 ou mais) — nunca um card solto — porque um tipo de nota com
// múltiplos templates gera múltiplos cards por nota (ver mais abaixo).
function converterNotaAnki(modelo, flds, tema, zip, nomeParaIndice) {
    const ehCloze = modelo.type === 1 || /cloze/i.test(modelo.name || "");
    if (ehCloze) {
        // NOVO: antes sempre lia o cloze do campo 0 — quebra em decks onde o campo 0 é metadado (ex:
        // "MATÉRIA"/matéria+logo) e o texto com {{c1::...}} de verdade está em outro campo. Agora lemos
        // do template (qfmt tem {{cloze:NomeDoCampo}}) quais campos são os de verdade — normalmente só
        // 1, mas o add-on "Cloze Overlapper" espalha os números por campos SEPARADOS (Text1 só tem
        // {{c1::...}}, Text2 só {{c2::...}}, etc., referenciados juntos no mesmo qfmt como
        // {{cloze:Text1}} {{cloze:Text2}} ...) — ver encontrarNomesCamposClozeAnki. Se não achar nenhum,
        // cai no campo 0 como antes (decks onde isso já era o campo certo continuam funcionando igual).
        const nomesCamposCloze = encontrarNomesCamposClozeAnki(modelo);
        const nomesCampos = (modelo.flds || []).map(f => f.name);
        const idxs = nomesCamposCloze.map(nome => nomesCampos.indexOf(nome)).filter(i => i !== -1);
        return converterNotaClozeAnki(modelo, flds, idxs.length > 0 ? idxs : [0], tema, zip, nomeParaIndice);
    }

    // NOVO: um tipo de nota pode ter MAIS DE UM TEMPLATE (ord 0, 1, 2...) — no Anki de verdade, cada
    // nota gera 1 card POR TEMPLATE cujo campo obrigatório não estiver vazio (ex: o deck "Ultimate
    // Geography" tem 4 templates — País↔Capital, Capital↔País, Bandeira↔País, Mapa↔País — uma nota só
    // gera o card "Bandeira" se o campo Flag dela não estiver vazio). Usar só o 1º template (como
    // fazíamos antes) descartava silenciosamente até 3 em cada 4 cards reais desse tipo de deck, sem
    // erro nem aviso nenhum — a importação "dava certo" com uma fração do conteúdo de verdade.
    const preps = prepararTemplatesAnki(modelo);
    if (preps.length > 0) {
        return Promise.all(preps.map(prep =>
            converterNotaComTemplateAnki(prep, modelo, flds, tema, zip, nomeParaIndice)
                .then(card => ({ ok: true, card }), err => ({ ok: false, err }))
        )).then(resultados => {
            const cards = resultados.filter(r => r.ok).map(r => r.card);
            if (cards.length > 0) return cards;
            // Nenhum template gerou card pra essa nota — sobra só a mensagem de erro do 1º template
            // (mantém o comportamento de sempre pra modelos de 1 template só, a grande maioria dos decks).
            throw resultados[0].err;
        });
    }

    // Fallback: só chega aqui se o deck não tiver um template legível (raro) — mantém a heurística
    // antiga por posição de campo, melhor do que simplesmente falhar a importação.
    const campoFrente = flds[0] || "";
    let campoVerso = flds[1] || "";
    if (modelo.flds && flds.length > 2) {
        const nomesCampos = modelo.flds.map(f => f.name);
        const extras = [];
        for (let i = 2; i < flds.length; i++) {
            const bruto = flds[i] || "";
            if (campoAnkiTemConteudo(bruto)) extras.push(`${nomesCampos[i] || ("Campo " + i)}: ${bruto}`);
        }
        if (extras.length > 0) {
            campoVerso = campoVerso.trim() ? [campoVerso, ...extras].join("<br>") : extras.join("<br>");
        }
    }
    return converterNotaBasicaAnki(campoFrente, campoVerso, tema, zip, nomeParaIndice).then(card => [card]);
}

// Retorna TODOS os nomes de campo referenciados como {{cloze:NomeDoCampo}} no qfmt (na ordem em que
// aparecem, sem repetir) — normalmente só 1, mas ver comentário em converterNotaAnki sobre o add-on
// Cloze Overlapper, que referencia vários campos cloze juntos no mesmo template.
function encontrarNomesCamposClozeAnki(modelo) {
    const tmpl = modelo.tmpls && modelo.tmpls[0];
    if (!tmpl || !tmpl.qfmt) return [];
    const nomesCampos = (modelo.flds || []).map(f => f.name);
    const encontrados = [];
    const regex = /\{\{cloze:([^}]+)\}\}/g;
    let m;
    while ((m = regex.exec(tmpl.qfmt)) !== null) {
        const nome = m[1].trim();
        if (nomesCampos.includes(nome) && !encontrados.includes(nome)) encontrados.push(nome);
    }
    return encontrados;
}

// Tira do template tudo que não é conteúdo de verdade do card: o JS/CSS embutido (alguns add-ons,
// como o Migaku, embutem vários KB de JS no template que a gente nunca executa) e mídia "de cano" —
// escrita direto no texto do template, não vinda de nenhum campo da nota (ex: um bipe de silêncio
// "[sound:_1sec.mp3]" embutido no afmt, comum em decks mais antigos, pra contornar bug de autoplay do
// Anki). Sem isso, esse tipo de mídia vira um player de áudio/imagem falso em TODO card do deck — a
// mídia de verdade (a que vem de {{NomeDoCampo}}) é sempre extraída à parte, campo por campo, então
// nada de real se perde aqui.
function limparTemplateAnki(template) {
    return (template || "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/\[sound:[^\]]*\]/gi, "")
        .replace(/<img[^>]*>/gi, "");
}

// Quais campos um template (já limpo) realmente referencia — usado pra saber em qual lado do card
// (frente/verso) a mídia de cada campo deve aparecer (um campo só citado no afmt, ex: "Screenshot" só
// usado na resposta, não deve colocar imagem na pergunta).
function camposReferenciadosAnki(templateLimpo, nomesCampos) {
    const encontrados = new Set();
    const regex = /\{\{[#^/]?(?:[\w-]+:)?([^}]+)\}\}/g;
    let m;
    while ((m = regex.exec(templateLimpo)) !== null) {
        const nome = m[1].trim();
        if (nomesCampos.includes(nome)) encontrados.add(nome);
    }
    return encontrados;
}

// Prepara (e cacheia no próprio objeto do modelo, evitando reprocessar o mesmo template gigante a
// cada nota) os dados fixos do template de um tipo de nota: só qfmt/afmt já limpos — quais campos
// cada lado referencia de VERDADE depende de quais seções condicionais estão ativas em CADA nota (ver
// resolverSecoesCondicionaisAnki em converterNotaComTemplateAnki), então isso não pode ser cacheado
// aqui por modelo. Retorna null se o deck não tiver um template legível (cai no fallback por posição).
function prepararTemplateAnki(modelo) {
    if (modelo.__templateAnkiPreparado !== undefined) return modelo.__templateAnkiPreparado;
    const tmpl = modelo.tmpls && modelo.tmpls[0];
    const nomesCampos = (modelo.flds || []).map(f => f.name);
    let preparado = null;
    if (tmpl && tmpl.qfmt && nomesCampos.length > 0) {
        preparado = { qfmt: limparTemplateAnki(tmpl.qfmt), afmt: limparTemplateAnki(tmpl.afmt || "") };
    }
    modelo.__templateAnkiPreparado = preparado;
    return preparado;
}

// Mesma ideia de prepararTemplateAnki, mas pra TODOS os templates do modelo (modelo.tmpls[0], [1],
// [2]...), não só o primeiro — usada por converterNotaAnki pra gerar 1 card por template válido.
// Continua cacheada no próprio objeto do modelo, então só roda de verdade na 1ª nota daquele tipo.
function prepararTemplatesAnki(modelo) {
    if (modelo.__templatesAnkiPreparados !== undefined) return modelo.__templatesAnkiPreparados;
    const nomesCampos = (modelo.flds || []).map(f => f.name);
    // NOVO: fonte/tamanho/etc. do CSS compartilhado do modelo (ver extrairEstilosDeClassesAnki) —
    // calculado 1x aqui (mesmo cache por modelo de sempre), aplicado nos dois esqueletos abaixo.
    const mapaClassesEstilo = extrairEstilosDeClassesAnki(modelo.css);
    const preparados = nomesCampos.length > 0
        ? (modelo.tmpls || []).filter(t => t && t.qfmt).map(tmpl => {
            const afmt = limparTemplateAnki(tmpl.afmt || "");
            // NOVO: no Anki de verdade, revelar a resposta SUBSTITUI a tela inteira pelo que o afmt
            // renderiza — {{FrontSide}} é só uma forma de o próprio afmt "pedir" pra repetir a frente
            // dentro dessa nova tela. Templates que NÃO usam {{FrontSide}} (ex: "Ultimate Geography",
            // cujo afmt redeclara {{Country}} do zero) já são standalone — mostram tudo que precisam
            // sozinhos. Nosso site sempre manteve a pergunta visível e só ACRESCENTAVA a resposta
            // embaixo (ver revelarRespostaSRS) — assumindo que o afmt sempre segue o padrão
            // "{{FrontSide}}<hr>resto". Pra um afmt standalone, isso duplicava o conteúdo da frente na
            // tela (ex: "United Kingdom" aparecendo 2x). Guardamos aqui se o afmt usa {{FrontSide}} pra
            // decidir, na hora de revelar, se a pergunta deve continuar visível ou ser escondida.
            const usaFrontSide = /\{\{FrontSide\}\}/.test(afmt);
            const qfmt = limparTemplateAnki(tmpl.qfmt);
            // NOVO: sanitiza a "casca" do template (labels/divs/estrutura literal do próprio template
            // — ex: os rótulos "CAPITAL"/"FLAG" do deck Ultimate Geography, perdidos até agora porque
            // montarCaixasCamposAnki só extrai VALORES de campo, nunca o texto ao redor) com a MESMA
            // allowlist usada pro conteúdo dos campos (ver sanitizarNoAnki) — feito 1x aqui, cacheado
            // por template, porque só depende do texto do template em si, nunca dos valores das notas.
            // Os tokens {{...}} sobrevivem intactos: pro parser HTML eles são só texto dentro de um nó
            // de texto, nunca uma tag — sanitizar ELEMENTOS não os atinge (ver
            // renderizarTemplateAnkiComHtmlRico, que substitui esses tokens depois).
            const qfmtEsqueleto = sanitizarEsqueletoTemplateAnki(qfmt.replace(/\{\{FrontSide\}\}/g, ""), mapaClassesEstilo);
            const afmtEsqueleto = sanitizarEsqueletoTemplateAnki(afmt.replace(/\{\{FrontSide\}\}/g, ""), mapaClassesEstilo);
            return { qfmt, afmt, qfmtEsqueleto, afmtEsqueleto, usaFrontSide, nomeTemplate: tmpl.name };
        })
        : [];
    modelo.__templatesAnkiPreparados = preparados;
    return preparados;
}

// Ver comentário em prepararTemplatesAnki. Roda o texto (já limpo) do template através da mesma
// sanitização usada pro HTML dos campos, pra remover atributos/tags perigosos da estrutura literal do
// PRÓPRIO template (nunca confiamos 100% num .apkg, mesmo na parte que não é conteúdo de nota).
function sanitizarEsqueletoTemplateAnki(templateLimpo, mapaClassesEstilo) {
    const doc = new DOMParser().parseFromString(templateLimpo, "text/html");
    sanitizarNoAnki(doc.body, mapaClassesEstilo);
    return doc.body.innerHTML;
}

// Substitui {{Campo}}/{{modificador:Campo}} pelo HTML RICO já sanitizado de cada campo (ver
// extrairCampoAnkiComoHtml) DENTRO do esqueleto do template — preserva rótulos/estrutura literal ao
// redor (ex: "CAPITAL", <hr>, disposição), diferente de montarCaixasCamposAnki, que só joga os
// VALORES em caixas soltas sem nada do texto original do template. O esqueleto já deve estar
// sanitizado (ver sanitizarEsqueletoTemplateAnki) e com as seções condicionais já resolvidas (ver
// resolverSecoesCondicionaisAnki) antes de chamar essa função. NUNCA sanitiza de novo aqui — o HTML de
// cada campo já vem sanitizado; sanitizar de novo destruiria as referências de mídia já resolvidas
// (data-srs-img-id/data-srs-midia-id).
function renderizarTemplateAnkiComHtmlRico(esqueletoResolvido, campos, hintsColetados) {
    let resultado = esqueletoResolvido;
    resultado = resultado.replace(/\{\{hint:([^}]+)\}\}/g, (m, nomeCampo) => {
        const nome = nomeCampo.trim();
        const c = campos[nome];
        if (!c || !c.rico.temConteudo) return "";
        const idx = hintsColetados.length;
        hintsColetados.push({ nome, html: c.rico.html });
        return `${MARCA_INICIO_HINT_ANKI}HINT${idx}${MARCA_FIM_HINT_ANKI}`;
    });
    resultado = resultado.replace(/\{\{(?:[\w-]+:)?([^}]+)\}\}/g, (m, nomeCampo) => {
        const nome = nomeCampo.trim();
        if (nome === "Tags" || nome === "Type" || nome === "Deck" || nome === "Subdeck" || nome === "Card") return "";
        const c = campos[nome];
        return c ? c.rico.html : "";
    });
    return resultado;
}

// "Vazio" pra esse HTML já resolvido (com <img data-srs-img-id> ainda sem src de verdade, resolvido só
// na hora de exibir — ver resolverMidiaInlineNoContainer): conta como conteúdo real ter texto sobrando
// depois de tirar as tags, OU ter uma referência de mídia já resolvida.
function htmlRicoTemConteudoReal(html) {
    if (!html) return false;
    if (/data-srs-img-id=|data-srs-midia-id=/.test(html)) return true;
    return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim().length > 0;
}

// Interpreta o mini-formato de template do Anki (mustache-like): {{Campo}}/{{modificador:Campo}} viram
// o texto já processado do campo; {{#Campo}}...{{/Campo}} e {{^Campo}}...{{/Campo}} são seções
// condicionais (mostra se o campo tem/não tem conteúdo); {{FrontSide}} vira vazio (a frente já é
// exibida separada pelo app, repeti-la na resposta seria redundante); {{hint:Campo}} vira um
// placeholder que vira uma caixa expansível de verdade depois (ver resolverHintsAnki).
// Resolve só as seções condicionais {{#Campo}}...{{/Campo}} / {{^Campo}}...{{/Campo}} de um template
// (já limpo), pros valores de campo de UMA nota específica — extraído de renderizarTemplateAnki pra
// ser reaproveitado também ANTES de decidir quais campos "contam" pro lado frente/verso (ver
// converterNotaComTemplateAnki). Sem isso, um campo mencionado dentro de uma seção escondida (ex:
// {{Country}} usado só dentro de {{#Capital}}...{{/Capital}}, pra decidir SE existe o card de
// Capital, não pra aparecer sozinho) era contado como "conteúdo de verdade" mesmo quando a seção
// inteira estava oculta — gerando cards que o Anki de verdade não geraria pra aquela nota (decks com
// múltiplos templates condicionais por campo, ex: "Ultimate Geography").
function resolverSecoesCondicionaisAnki(templateLimpo, campos) {
    let resultado = templateLimpo;
    // Repete a resolução de seções algumas vezes: templates mais elaborados (o do add-on Migaku, por
    // exemplo) aninham seção dentro de seção ("Is Audio Card" dentro de "Is Vocabulary Card") — uma
    // passada só não dá conta de resolver a de dentro.
    for (let i = 0; i < 5; i++) {
        const antes = resultado;
        resultado = resultado.replace(/\{\{#([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (m, nome, conteudo) => {
            const c = campos[nome.trim()];
            return c && campoAnkiTemConteudo(c.raw) ? conteudo : "";
        });
        resultado = resultado.replace(/\{\{\^([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (m, nome, conteudo) => {
            const c = campos[nome.trim()];
            return c && campoAnkiTemConteudo(c.raw) ? "" : conteudo;
        });
        if (resultado === antes) break;
    }
    return resultado;
}

function renderizarTemplateAnki(templateLimpo, campos, hintsColetados) {
    let resultado = templateLimpo.replace(/\{\{FrontSide\}\}/g, "");
    resultado = resolverSecoesCondicionaisAnki(resultado, campos);

    resultado = resultado.replace(/\{\{hint:([^}]+)\}\}/g, (m, nomeCampo) => {
        const c = campos[nomeCampo.trim()];
        if (!c || !c.texto || !c.texto.trim()) return "";
        const idx = hintsColetados.length;
        hintsColetados.push({ nome: nomeCampo.trim(), texto: c.texto });
        return `${MARCA_INICIO_HINT_ANKI}HINT${idx}${MARCA_FIM_HINT_ANKI}`;
    });

    resultado = resultado.replace(/\{\{(?:[\w-]+:)?([^}]+)\}\}/g, (m, nomeCampo) => {
        const nome = nomeCampo.trim();
        if (nome === "Tags" || nome === "Type" || nome === "Deck" || nome === "Subdeck" || nome === "Card") return "";
        const c = campos[nome];
        return c ? c.texto : "";
    });

    return resultado;
}

// Troca os placeholders de {{hint:Campo}} (já resolvidos por renderizarTemplateAnki pra um token
// simples) pela caixa expansível de verdade — feito DEPOIS que o HTML do template ao redor já virou
// texto puro (ver converterHtmlParaTextoPlanoProtegido), senão a tag <details> seria destruída junto
// com o resto do HTML do template.
function resolverHintsAnki(html, hints) {
    let resultado = html;
    hints.forEach((hint, idx) => {
        const token = `${MARCA_INICIO_HINT_ANKI}HINT${idx}${MARCA_FIM_HINT_ANKI}`;
        // Tira símbolo decorativo comum no início do nome do campo (ex: "✚ Saiba mais") — o ➕ do
        // resumo já indica visualmente que é expansível, não precisa repetir.
        const nomeLimpo = hint.nome.replace(/^[✚+*]\s*/, "");
        // hint.html (pipeline novo, HTML rico) tem prioridade sobre hint.texto (pipeline antigo, texto
        // achatado) — ver renderizarTemplateAnkiComHtmlRico.
        const conteudoHint = hint.html !== undefined ? hint.html : hint.texto;
        const bloco = `${MARCA_INICIO_HINT_ANKI}<details class="srs-hint-anki"><summary>➕ ${escaparHtml(nomeLimpo)}</summary>${conteudoHint}</details>${MARCA_FIM_HINT_ANKI}`;
        resultado = resultado.split(token).join(bloco);
    });
    return resultado;
}

// ============================================================
// === PIPELINE NOVO: HTML rico por campo (preserva formatação/posição de imagem do Anki) ===
// ============================================================
// Tudo abaixo é ADITIVO: roda em paralelo ao pipeline antigo (extrairMidiaDoCampo +
// converterHtmlParaTextoPlano), sem substituí-lo — subtema/resposta em texto puro continuam sendo
// calculados exatamente como antes (usados por busca, edição de card, lista, backup), e só um campo
// NOVO (camposFrente/camposVerso) é adicionado ao card quando o HTML rico existe. Como isso envolve
// preservar HTML de um arquivo .apkg — não confiável — no mesmo localStorage/origem que guarda dados
// financeiros do usuário, o sanitizador é allowlist estrita (nunca denylist) e nunca insere o HTML
// bruto na página: o DOMParser roda numa árvore desconectada, então mesmo um <script> embutido nunca
// chega a executar.
const TAGS_ANKI_PERMITIDAS = new Set([
    "B", "STRONG", "I", "EM", "U", "S", "SUP", "SUB", "SMALL", "BR", "HR", "DIV", "SPAN", "P",
    "UL", "OL", "LI", "TABLE", "TBODY", "THEAD", "TR", "TD", "TH", "IMG"
]);
const PROPRIEDADES_CSS_ANKI_PERMITIDAS = new Set([
    "color", "background-color", "font-weight", "font-style", "text-decoration", "text-align",
    "border", "border-top", "border-bottom", "border-left", "border-right",
    "padding", "padding-top", "padding-bottom", "padding-left", "padding-right",
    "margin-top", "margin-bottom", "width", "max-width", "height", "max-height", "vertical-align",
    // NOVO: fonte/tamanho do CSS do MODELO Anki (ver extrairEstilosDeClassesAnki) — ex. o rótulo
    // "CAPITAL" do deck Ultimate Geography é menor/cinza/maiúsculo só por causa de ".type{font-size:
    // 70%; text-transform:uppercase}" no modelo.css, nunca por style inline num campo.
    "font-size", "font-family", "text-transform", "letter-spacing", "line-height", "font-variant",
    // NOVO: "background" (abreviado) — comum em decks gerados por IA/editor visual, que usam
    // "background:#COR" ou "background:linear-gradient(...)" em vez de "background-color". Sem isso,
    // um texto branco sobre um cabeçalho colorido assim (ex: "background:#0F7A52" no card, "color:
    // #FFFFFF" no texto) ficava com a cor do texto preservada mas o fundo descartado — texto branco
    // invisível sobre o fundo branco do site, não só "sem a cor certa". O filtro de url()/expression()/
    // javascript:/@import logo abaixo se aplica a QUALQUER propriedade, então continua seguro contra
    // imagem/código embutido no valor. "display"/"grid-*"/flex — mesmos decks costumam montar
    // pseudo-tabelas com <div style="display:grid; grid-template-columns:..."> em vez de <table> de
    // verdade (já permitido); sem essas propriedades, as "linhas" viravam blocos empilhados sem
    // nenhuma coluna, perdendo a estrutura de tabela inteira.
    "background", "display", "grid-template-columns", "grid-column", "gap", "align-items", "justify-content"
]);

// Faixas de sanidade pra font-size (evita que um .apkg hostil estoure o layout do card com um valor
// absurdo, ex. "font-size: 9999px" — não é um risco de execução de código, é só robustez de layout).
const LIMITES_FONT_SIZE_ANKI = { px: [8, 60], em: [0.4, 4], rem: [0.4, 4], "%": [40, 300] };

// Filtra um valor de atributo "style" (ou corpo de uma regra CSS — mesma sintaxe "prop: valor;...",
// ver extrairEstilosDeClassesAnki) pra só deixar passar propriedades inofensivas (a lista acima), com
// valor curto e sem nada que possa carregar recurso externo ou executar código.
function sanitizarEstiloInlineAnki(valorStyle) {
    if (!valorStyle) return "";
    const permitido = [];
    String(valorStyle).split(";").forEach(parte => {
        const idx = parte.indexOf(":");
        if (idx === -1) return;
        const prop = parte.slice(0, idx).trim().toLowerCase();
        const valor = parte.slice(idx + 1).trim();
        if (!PROPRIEDADES_CSS_ANKI_PERMITIDAS.has(prop)) return;
        if (!valor || valor.length > 100) return;
        if (/url\(|expression\(|javascript:|@import|[<>]/i.test(valor)) return;
        if (prop === "font-size") {
            const m = valor.match(/^([\d.]+)(px|em|rem|%)$/);
            if (!m) return;
            const [min, max] = LIMITES_FONT_SIZE_ANKI[m[2]];
            const num = parseFloat(m[1]);
            if (isNaN(num) || num < min || num > max) return;
        }
        permitido.push(`${prop}: ${valor}`);
    });
    return permitido.join("; ");
}

// NOVO: extrai do CSS COMPARTILHADO do modelo Anki (modelo.css — nunca lido até agora) as regras de
// seletor de classe simples (".nome { ... }", sem combinador/pseudo-classe/seletor de atributo) pra
// aplicar como estilo nos elementos do esqueleto do template que usam essa classe (ver sanitizarNoAnki)
// — é isso que faz o rótulo "Capital" do Ultimate Geography sair pequeno/cinza/maiúsculo, igual no
// Anki, em vez de com o mesmo tamanho/cor do resto do card. Escopo DELIBERADAMENTE restrito: qualquer
// coisa mais complexa (combinadores como ".value > img", @media, @font-face, animações,
// pseudo-classes) é ignorada silenciosamente — semisso quebrar nada, só sem aplicar aquele estilo
// específico. Sem @import/url() nenhum risco de carregar recurso externo; sanitizarEstiloInlineAnki já
// filtra o corpo de cada regra com a mesma allowlist usada pro style inline.
function extrairEstilosDeClassesAnki(css) {
    const mapa = new Map();
    if (!css || css.length > 20000) return mapa;
    const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const regexBloco = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = regexBloco.exec(semComentarios)) !== null) {
        const estiloSeguro = sanitizarEstiloInlineAnki(m[2]);
        if (!estiloSeguro) continue;
        m[1].split(",").forEach(seletor => {
            const nome = seletor.trim();
            if (!/^\.[a-zA-Z_][a-zA-Z0-9_-]*$/.test(nome)) return; // só classe única — ver comentário acima
            const nomeClasse = nome.slice(1);
            const existente = mapa.get(nomeClasse);
            mapa.set(nomeClasse, existente ? `${existente}; ${estiloSeguro}` : estiloSeguro);
        });
    }
    return mapa;
}

// Sanitiza (em memória, numa árvore DOM desconectada da página) o HTML de um campo do Anki: remove
// por completo tags perigosas (com todo o conteúdo dentro) e "desembrulha" qualquer outra tag fora da
// allowlist (mantém só texto/filhos); no que sobra, tira TODO atributo exceto um "style" já filtrado.
// Em <img>, guarda width/height originais (antes de apagá-los) como max-width/max-height em px no
// style — é isso que resolve tanto o logo aparecendo gigante (ignorava o width="30" do template)
// quanto os símbolos matemáticos pequenos (que agora ficam na posição de verdade dentro do texto, não
// soltos numa lista à parte). O src original vira um atributo temporário em vez de ir pro <img> de
// verdade — nunca confiamos numa URL vinda do deck; a extração de mídia (via zip) resolve isso depois.
function sanitizarNoAnki(raiz, mapaClassesEstilo) {
    const TAGS_REMOVER_INTEIRO = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "FORM", "NOSCRIPT", "TEMPLATE"]);
    let mudou = true;
    while (mudou) {
        mudou = false;
        const todos = raiz.querySelectorAll("*");
        for (const el of todos) {
            if (TAGS_REMOVER_INTEIRO.has(el.tagName)) { el.remove(); mudou = true; break; }
            if (!TAGS_ANKI_PERMITIDAS.has(el.tagName)) {
                while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
                el.remove();
                mudou = true; break;
            }
        }
    }
    raiz.querySelectorAll("*").forEach(el => {
        const estiloSeguro = sanitizarEstiloInlineAnki(el.getAttribute("style"));
        // NOVO: resolve as classes do elemento (ex. class="type") pro estilo vindo do CSS do MODELO
        // (ver extrairEstilosDeClassesAnki), ANTES de apagar o atributo "class" — nenhuma classe
        // sobrevive na árvore final (mantém o mesmo invariante de sempre: só "style" e alguns
        // data-* sobrevivem), só o efeito visual dela.
        const estilosDasClasses = [];
        if (mapaClassesEstilo && mapaClassesEstilo.size > 0) {
            (el.getAttribute("class") || "").trim().split(/\s+/).forEach(nomeClasse => {
                const estiloClasse = nomeClasse && mapaClassesEstilo.get(nomeClasse);
                if (estiloClasse) estilosDasClasses.push(estiloClasse);
            });
        }
        let imgInfo = null;
        if (el.tagName === "IMG") {
            imgInfo = {
                src: el.getAttribute("src") || "",
                alt: el.getAttribute("alt") || "",
                largura: parseInt(el.getAttribute("width"), 10),
                altura: parseInt(el.getAttribute("height"), 10)
            };
        }
        // NOVO: o placeholder de áudio/vídeo (um <span data-srs-midia-src-original="arquivo.ogg">,
        // criado ANTES de chamar sanitizarNoAnki — ver extrairCampoAnkiComoHtml) também precisa
        // sobreviver a essa limpeza, senão o resolvedor de mídia que roda DEPOIS (mais abaixo, no
        // mesmo extrairCampoAnkiComoHtml) nunca encontra o marcador pra substituir — o span sobra
        // vazio, sem nenhum erro, e o áudio simplesmente some da tela (bug real encontrado num deck de
        // japonês: nenhum "❌"/"⚠️" na importação, mas nenhum player de áudio aparecia na revisão).
        const midiaSrcOriginal = el.getAttribute("data-srs-midia-src-original");
        Array.from(el.attributes).forEach(attr => el.removeAttribute(attr.name));
        // Ordem importa (igual à cascata real do CSS): a classe do modelo tem a especificidade mais
        // baixa, então entra primeiro; o style inline do próprio elemento (mais específico) vem depois
        // e pode sobrescrever a mesma propriedade; max-width/max-height da imagem continuam por último.
        const estilos = [...estilosDasClasses];
        if (estiloSeguro) estilos.push(estiloSeguro);
        if (imgInfo) {
            if (imgInfo.src) el.setAttribute("data-srs-img-src-original", imgInfo.src);
            if (imgInfo.alt) el.setAttribute("alt", imgInfo.alt);
            if (!isNaN(imgInfo.largura) && imgInfo.largura > 0) estilos.push(`max-width: ${imgInfo.largura}px`);
            if (!isNaN(imgInfo.altura) && imgInfo.altura > 0) estilos.push(`max-height: ${imgInfo.altura}px`);
        }
        if (midiaSrcOriginal) el.setAttribute("data-srs-midia-src-original", midiaSrcOriginal);
        if (estilos.length) el.setAttribute("style", estilos.join("; "));
    });
}

// Mesma detecção de pinyin/furigana de converterAnotacoesPinyin, mas operando direto no DOM (usada só
// pelo pipeline novo) — insere nós de verdade na árvore em vez de string+marcador invisível, então não
// corre risco de colidir com os marcadores do pipeline antigo quando um hint tem pinyin dentro.
function aplicarPinyinNosTextNodes(raiz) {
    const regexTeste = /[一-鿿]+?\[[^\]]*?\]/;
    const nos = [];
    const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, null);
    let no;
    while ((no = walker.nextNode())) {
        if (no.nodeValue && regexTeste.test(no.nodeValue)) nos.push(no);
    }
    nos.forEach(no => {
        const texto = no.nodeValue;
        const regex = /([一-鿿]+?)\[([^\]]*?)\]/g;
        const frag = document.createDocumentFragment();
        let ultimoIndice = 0, m, teveMatch = false;
        while ((m = regex.exec(texto)) !== null) {
            const [full, hanzi, colchete] = m;
            let leitura;
            if (colchete.indexOf(";") !== -1) {
                const primeiraLeitura = (colchete.split(";")[0] || "").trim();
                const silabas = primeiraLeitura.match(/\S+?\d/g) || [];
                leitura = silabas.length > 0 ? silabas.map(decodificarSilabaPinyin).join("") : primeiraLeitura;
            } else {
                leitura = colchete.trim();
            }
            teveMatch = true;
            if (m.index > ultimoIndice) frag.appendChild(document.createTextNode(texto.slice(ultimoIndice, m.index)));
            if (leitura) {
                const span = document.createElement("span");
                span.className = "hanzi-hover";
                span.setAttribute("data-pinyin", leitura);
                span.textContent = hanzi;
                frag.appendChild(span);
            } else {
                frag.appendChild(document.createTextNode(hanzi));
            }
            ultimoIndice = m.index + full.length;
        }
        if (!teveMatch) return;
        if (ultimoIndice < texto.length) frag.appendChild(document.createTextNode(texto.slice(ultimoIndice)));
        no.parentNode.replaceChild(frag, no);
    });
}

// Converte um campo bruto do Anki (HTML de verdade — negrito, tabela, cor, sublinhado, <img>
// posicionada no meio do texto etc.) num bloco de HTML seguro, em vez de achatar tudo pra texto puro
// como o pipeline antigo (extrairMidiaDoCampo) faz. Roda em paralelo a ele, sem alterá-lo.
function extrairCampoAnkiComoHtml(campoHtmlBruto, zip, nomeParaIndice) {
    const bruto = (campoHtmlBruto || "").replace(/\[sound:([^\]]+)\]/gi, (m, nomeArquivo) =>
        `<span data-srs-midia-src-original="${escaparAtributoHtml(nomeArquivo)}"></span>`
    );

    const doc = new DOMParser().parseFromString(bruto, "text/html");
    sanitizarNoAnki(doc.body);
    aplicarPinyinNosTextNodes(doc.body);

    const tarefas = [];
    let midiaNaoSuportada = false;

    doc.body.querySelectorAll("img[data-srs-img-src-original]").forEach(img => {
        const src = img.getAttribute("data-srs-img-src-original");
        img.removeAttribute("data-srs-img-src-original");
        const indice = nomeParaIndice[src];
        if (indice !== undefined && zip.file(indice)) {
            tarefas.push(
                zip.file(indice).async("blob").then(descomprimirBlobSeZstd).then(blob => corrigirTipoMimeBlob(blob, src)).then(blob => {
                    const novoId = `anki_img_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
                    return salvarImagemSRS(novoId, blob).then(() => { img.setAttribute("data-srs-img-id", novoId); });
                }).catch(() => { midiaNaoSuportada = true; img.remove(); })
            );
        } else if (/^https?:\/\//i.test(src)) {
            // NOVO: alguns decks (comuns em bancos de questão online, ex: QConcursos) usam imagem
            // "hotlinked" — uma URL externa de verdade — em vez de empacotar o arquivo dentro do
            // .apkg. O Anki de verdade também só carrega essa imagem direto da internet nesse caso;
            // antes a gente tratava isso como "mídia não suportada" e removia a imagem, porque só
            // sabíamos resolver nomes de arquivo local (via nomeParaIndice). Mantemos o <img> apontando
            // pra essa URL — é só uma requisição normal de imagem, nunca script/execução.
            img.setAttribute("src", src);
        } else {
            midiaNaoSuportada = true;
            img.remove();
        }
    });

    doc.body.querySelectorAll("[data-srs-midia-src-original]").forEach(span => {
        const nomeArquivo = span.getAttribute("data-srs-midia-src-original");
        span.removeAttribute("data-srs-midia-src-original");
        const extensao = (nomeArquivo.split(".").pop() || "").toLowerCase();
        const tipo = ["mp4", "webm", "mov", "ogv"].includes(extensao) ? "video" : "audio";
        const indice = nomeParaIndice[nomeArquivo];
        if (indice !== undefined && zip.file(indice)) {
            tarefas.push(
                zip.file(indice).async("blob").then(descomprimirBlobSeZstd).then(blob => corrigirTipoMimeBlob(blob, nomeArquivo)).then(blob => {
                    const novoId = `anki_midia_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
                    return salvarImagemSRS(novoId, blob).then(() => {
                        span.setAttribute("data-srs-midia-id", novoId);
                        span.setAttribute("data-srs-midia-tipo", tipo);
                    });
                }).catch(() => { midiaNaoSuportada = true; span.remove(); })
            );
        } else {
            midiaNaoSuportada = true;
            span.remove();
        }
    });

    return Promise.all(tarefas).then(() => {
        const html = doc.body.innerHTML.trim();
        const texto = (doc.body.textContent || "").trim();
        // NOVO: "tem mídia" precisa contar tanto a imagem/mídia empacotada no .apkg (ainda sem src de
        // verdade aqui — só ganha um data-srs-img-id, resolvido depois em resolverMidiaInlineNoContainer)
        // quanto a imagem hospedada externamente (já ganhou o "src" de verdade acima, ver comentário na
        // URL http/https). Sem contar a segunda, um campo cujo ÚNICO conteúdo é uma imagem externa (sem
        // nenhum texto) virava "temConteudo: false" mesmo com o <img> funcionando de verdade no html —
        // fazendo o card inteiro ser rejeitado como "sem nenhum conteúdo depois de renderizar o template".
        const temMidia = !!(doc.body.querySelector("img[data-srs-img-id], img[src]") || doc.body.querySelector("[data-srs-midia-id]"));
        return { html, texto, temConteudo: !!(texto || temMidia), midiaNaoSuportada };
    });
}

// Resolve, dentro de um container JÁ inserido na página, os placeholders de imagem/mídia deixados por
// extrairCampoAnkiComoHtml (data-srs-img-id / data-srs-midia-id) em elementos de verdade com blob URL
// — feito à parte porque URL.createObjectURL() só vale pra esta sessão de página, tem que ser refeito
// toda vez que o card é exibido (o card salvo só guarda o id do IndexedDB, nunca a URL). Retorna a
// lista de blob URLs criadas, pra quem chamar liberar depois (ver limparUrlsImagemRevisao).
function resolverMidiaInlineNoContainer(container) {
    if (!container) return Promise.resolve([]);
    const urls = [];
    const tarefas = [];

    container.querySelectorAll("img[data-srs-img-id]").forEach(img => {
        // NOVO: carregarImagemSRSComFallbackDrive busca no Drive quando falta localmente (card
        // chegou por sincronização, mídia ainda não baixada nesse aparelho) — ver "MÍDIA DOS CARDS NO
        // GOOGLE DRIVE". Sem conexão com o Drive, se comporta exatamente como carregarImagemSRS puro.
        tarefas.push(carregarImagemSRSComFallbackDrive(img.getAttribute("data-srs-img-id")).then(blob => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            urls.push(url);
            img.src = url;
        }).catch(() => {}));
    });

    container.querySelectorAll("[data-srs-midia-id]").forEach(span => {
        const tipo = span.getAttribute("data-srs-midia-tipo");
        tarefas.push(carregarImagemSRSComFallbackDrive(span.getAttribute("data-srs-midia-id")).then(blob => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            urls.push(url);
            const elMidia = document.createElement(tipo === "video" ? "video" : "audio");
            elMidia.src = url;
            elMidia.controls = true;
            span.replaceWith(elMidia);
        }).catch(() => {}));
    });

    return Promise.all(tarefas).then(() => urls);
}

// Descobre em que ORDEM os campos aparecem visualmente num template já limpo (qfmt/afmt) — usado pra
// desenhar as caixas por campo na mesma ordem do layout original do Anki. Ignora nomes que não são
// campos de verdade da nota (FrontSide, Tags, Type, Deck, Subdeck, Card) e marca quais vieram de
// {{hint:Campo}} (viram caixa expansível, não caixa normal).
function ordemDosCamposNoTemplate(templateLimpo, nomesCampos) {
    const ordem = [];
    const vistos = new Set();
    const regex = /\{\{([#^\/]?)(?:([\w-]+):)?([^}]+)\}\}/g;
    let m;
    while ((m = regex.exec(templateLimpo)) !== null) {
        if (m[1]) continue; // abertura/fechamento de seção ({{#Campo}}/{{/Campo}}/{{^Campo}}), não um campo pra exibir
        const nome = m[3].trim();
        if (!nomesCampos.includes(nome) || vistos.has(nome)) continue;
        vistos.add(nome);
        ordem.push({ nome, hint: m[2] === "hint" });
    }
    return ordem;
}

// Monta as caixas visuais por campo (camposFrente/camposVerso) na mesma ordem em que apareciam no
// template original do Anki. Campos normais viram uma caixa simples, sem rótulo de nome — o próprio
// Anki também não mostra o nome do campo, só o conteúdo, então um rótulo nosso pareceria menos fiel,
// não mais. Campos que eram {{hint:Campo}} no template viram a mesma caixa expansível "+ Saiba mais"
// usada no resto do pipeline (ver resolverHintsAnki).
function montarCaixasCamposAnki(campos) {
    return campos.map(c => {
        if (c.hint) {
            const nomeLimpo = c.nome.replace(/^[✚+*]\s*/, "");
            return `<details class="srs-hint-anki"><summary>➕ ${escaparHtml(nomeLimpo)}</summary>${c.html}</details>`;
        }
        return `<div class="srs-campo-caixa">${c.html}</div>`;
    }).join("");
}

// NOVO: monta a interface de múltipla escolha (ver detectarCamposOpcaoMultiplaEscolha) — embaralha a
// ordem de exibição (igual ao <script> do próprio deck fazia) e dá feedback imediato ao clicar numa
// opção, tudo em código NOSSO/confiável — o <script> original do deck nunca é executado.
function renderizarOpcoesMultiplaEscolhaSRS(opcoes) {
    const embaralhadas = [...opcoes];
    for (let i = embaralhadas.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [embaralhadas[i], embaralhadas[j]] = [embaralhadas[j], embaralhadas[i]];
    }
    let html = `<div class="srs-mcq-opcoes">`;
    embaralhadas.forEach((opcao, i) => {
        const letra = String.fromCharCode(97 + i);
        html += `<label class="srs-mcq-opcao" data-correta="${opcao.correta}" onclick="selecionarOpcaoMultiplaEscolhaSRS(this)"><input type="radio" name="srs-mcq-opcao" style="pointer-events:none;"><span>${letra}) ${opcao.html}</span></label>`;
    });
    html += `<div class="srs-mcq-feedback"></div></div>`;
    return html;
}
function selecionarOpcaoMultiplaEscolhaSRS(label) {
    const container = label.closest(".srs-mcq-opcoes");
    if (!container) return;
    container.querySelectorAll(".srs-mcq-opcao").forEach(op => op.classList.remove("srs-mcq-certa", "srs-mcq-errada"));
    const input = label.querySelector("input");
    if (input) input.checked = true;
    const correta = label.dataset.correta === "true";
    label.classList.add(correta ? "srs-mcq-certa" : "srs-mcq-errada");
    const feedback = container.querySelector(".srs-mcq-feedback");
    if (feedback) {
        feedback.textContent = correta ? "✅ CORRETO!" : "❌ ERRADO!";
        feedback.style.color = correta ? "var(--secondary-color)" : "var(--danger-color)";
    }
}

// NOVO: detecta o padrão de nota "múltipla escolha genérica" comum em decks de banco de questões
// (ex: templates tipo "Cartão Interativo"/"Questão Universal") — vários campos nomeados
// Opção1/Opção2/.../Alternativa1/... escondidos no template via display:none, com um <script>
// embutido que monta a interface de seleção. A gente NUNCA executa esse script (mesmo motivo de
// sempre — é um app que guarda dados financeiros do usuário no mesmo navegador), então sem essa
// detecção o card virava uma lista de caixas soltas, sem nenhuma organização de múltipla escolha,
// bem diferente do que o Anki mostraria. Retorna os nomes dos campos de opção, em ordem numérica, ou
// null se o modelo não tiver esse padrão (2+ campos batendo o nome).
function detectarCamposOpcaoMultiplaEscolha(nomesCampos) {
    const regexOpcao = /^(op[cç][aã]o|alternativa|option)\s*0*(\d+)$/i;
    const encontrados = [];
    nomesCampos.forEach(nome => {
        const m = nome.match(regexOpcao);
        if (m) encontrados.push({ nome, numero: parseInt(m[2], 10) });
    });
    if (encontrados.length < 2) return null;
    encontrados.sort((a, b) => a.numero - b.numero);
    return encontrados.map(e => e.nome);
}

function converterNotaComTemplateAnki(prep, modelo, flds, tema, zip, nomeParaIndice) {
    const nomesCampos = (modelo.flds || []).map(f => f.name);
    // Extrai mídia/texto de CADA CAMPO isoladamente primeiro (exatamente como já fazíamos pra decks
    // "simples") — só depois eles entram no template. Assim, mídia de verdade (a que vem de um campo
    // da nota) nunca se confunde com mídia "de cano" do próprio template, que já foi removida em
    // limparTemplateAnki.
    return Promise.all(nomesCampos.map((nome, i) => {
        const raw = flds[i] || "";
        return Promise.all([
            extrairMidiaDoCampo(raw, zip, nomeParaIndice),
            extrairCampoAnkiComoHtml(raw, zip, nomeParaIndice)
        ]).then(([r, rico]) => ({ nome, raw, ...r, rico }));
    })).then(resultadosPorCampo => {
        const campos = {};
        resultadosPorCampo.forEach(r => { campos[r.nome] = r; });

        // NOVO: resolve as seções condicionais {{#Campo}}/{{^Campo}} PRA ESSA NOTA especificamente,
        // antes de decidir quais campos "existem" nos lados frente/verso — prep.qfmt/prep.afmt são
        // compartilhados entre TODAS as notas do modelo (cacheados 1x), então um campo só mencionado
        // dentro de uma seção condicional (ex: {{Country}} usado só dentro de
        // {{#Capital}}...{{/Capital}}, pra decidir SE o card de Capital existe) não pode ser tratado
        // como "sempre presente" — cada nota tem seu próprio resultado, dependendo de quais campos
        // dela estão vazios. Sem isso, {{Country}} (sempre preenchido) fazia a frente inteira parecer
        // "com conteúdo" mesmo quando a seção que a envolve estava oculta pra essa nota — gerando
        // cards que o Anki de verdade não geraria (ver detecção de múltiplos templates em
        // converterNotaAnki).
        const qfmtResolvido = resolverSecoesCondicionaisAnki(prep.qfmt, campos);
        const afmtResolvido = resolverSecoesCondicionaisAnki(prep.afmt, campos);
        const camposFrenteNota = camposReferenciadosAnki(qfmtResolvido, nomesCampos);
        const camposVersoNota = camposReferenciadosAnki(afmtResolvido, nomesCampos);

        const hintsFrente = [], hintsVerso = [];
        let frenteHtml = renderizarTemplateAnki(prep.qfmt, campos, hintsFrente);
        let versoHtml = renderizarTemplateAnki(prep.afmt, campos, hintsVerso);
        frenteHtml = converterHtmlParaTextoPlanoProtegido(frenteHtml);
        versoHtml = converterHtmlParaTextoPlanoProtegido(versoHtml);
        frenteHtml = resolverHintsAnki(frenteHtml, hintsFrente);
        versoHtml = resolverHintsAnki(versoHtml, hintsVerso);

        const imagensFrente = [], midiasFrente = [], imagensVerso = [], midiasVerso = [];
        let midiaNaoSuportada = false;
        let frenteTemConteudoRico = false, versoTemConteudoRico = false;
        resultadosPorCampo.forEach(r => {
            if (camposFrenteNota.has(r.nome)) { imagensFrente.push(...r.imagens); midiasFrente.push(...r.midias); if (r.rico.temConteudo) frenteTemConteudoRico = true; }
            if (camposVersoNota.has(r.nome)) { imagensVerso.push(...r.imagens); midiasVerso.push(...r.midias); if (r.rico.temConteudo) versoTemConteudoRico = true; }
            // NOVO: só conta como "mídia não suportada" de verdade quando os DOIS pipelines falham em
            // resolver — o antigo (extrairMidiaDoCampo, ainda usado pro texto achatado/compatibilidade)
            // e o novo (extrairCampoAnkiComoHtml, o que realmente aparece na tela). Ex: imagem
            // hospedada externamente (URL http/https) — o pipeline novo já sabe exibir direto (ver
            // extrairCampoAnkiComoHtml), então não é mais um problema de verdade, mesmo o antigo ainda
            // não sabendo lidar com isso (ele só afeta texto de busca/compatibilidade, não a exibição).
            if (r.midiaNaoSuportada && r.rico.midiaNaoSuportada) midiaNaoSuportada = true;
        });

        // NOVO: um lado pode parecer "vazio" só pro pipeline antigo (texto achatado + mídia extraída
        // só de arquivo dentro do .apkg) e mesmo assim ter conteúdo de verdade pelo pipeline novo — o
        // caso real é um campo cujo ÚNICO conteúdo é uma imagem hospedada externamente (não empacotada
        // no .apkg): o antigo não sabe resolver isso e descarta a imagem da contagem, mas o novo
        // (extrairCampoAnkiComoHtml) já sabe exibir direto pela URL. Um lado que é só uma imagem assim
        // (comum em decks de diagramas/mapas baixados de bancos de questão) não pode ser rejeitado como
        // "sem conteúdo" só por essa limitação do pipeline antigo — mesma lógica já usada pra imagem
        // empacotada normal (ver comentário de aplicarMidiasExtraidasNoCard).
        const frenteVazia = !frenteHtml.trim() && imagensFrente.length === 0 && midiasFrente.length === 0 && !frenteTemConteudoRico;
        // NOVO: o Anki de verdade só exige que a FRENTE (qfmt) tenha conteúdo pra gerar o card — o verso
        // pode ficar vazio (campo de tradução ainda não preenchido, ou um afmt propositalmente sem nada
        // além do que a frente já mostra, comum em cards "divisor"/introdução) e o card mesmo assim
        // existe e aparece na fila do Anki, só com a tela de resposta em branco. Rejeitar esses cards
        // (como fazíamos antes, exigindo os dois lados) descartava silenciosamente cards legítimos do
        // deck. Continua rejeitando quando a FRENTE está vazia — aí sim não haveria nada pra mostrar/
        // revisar, então não existe card de verdade pra importar.
        const versoVazio = !versoHtml.trim() && imagensVerso.length === 0 && midiasVerso.length === 0 && !versoTemConteudoRico;
        if (frenteVazia) throw new Error(`Frente sem nenhum conteúdo depois de renderizar o template do Anki (modelo "${modelo.name || "sem nome"}"). Frente: "${frenteHtml.slice(0, 60)}"`);

        const card = {
            id: Date.now() + Math.floor(Math.random() * 1000000),
            tema: tema, subtema: frenteHtml, resposta: versoHtml, tipo: "normal",
            data_proxima_revisao: hojeISO(), intervalo_atual: 0, fator_facilidade: 2.5
        };
        // Ver comentário em prepararTemplatesAnki — sem {{FrontSide}} no afmt, a resposta é uma tela
        // standalone (não uma continuação da pergunta), então escondemos a pergunta ao revelar (ver
        // revelarRespostaSRS) pra não duplicar conteúdo que o próprio afmt já redeclara.
        if (!prep.usaFrontSide) card.respostaSubstituiPergunta = true;
        aplicarMidiasExtraidasNoCard(card, "Pergunta", { imagens: imagensFrente, midias: midiasFrente });
        aplicarMidiasExtraidasNoCard(card, "Resposta", { imagens: imagensVerso, midias: midiasVerso });
        card._midiaNaoSuportada = midiaNaoSuportada;
        card._versoVazio = versoVazio;

        // NOVO: além do subtema/resposta em texto puro acima (mantidos por compatibilidade — busca,
        // edição de card, lista, backup continuam funcionando igual), monta também um HTML rico por
        // campo (preserva formatação, imagem POSICIONADA no lugar certo, tabelas etc.), na mesma ordem
        // visual do template original — usado pela tela de revisão quando disponível (ver
        // carregarRevisaoSRS/montarCaixasCamposAnki).
        const ordemAfmt = ordemDosCamposNoTemplate(afmtResolvido, nomesCampos);

        // NOVO: se o modelo tem o padrão de múltipla escolha (ver detectarCamposOpcaoMultiplaEscolha),
        // esses campos ganham uma interface própria de seleção (ver renderizarOpcoesMultiplaEscolhaSRS)
        // em vez de virarem caixas soltas sem organização nenhuma. A "resposta certa" é o(s) campo(s)
        // de opção que o próprio afmt referencia — é assim que o template original revela o gabarito
        // (ex: "GABARITO: {{Opcao1}}"), então não precisamos adivinhar nem depender de um nome de
        // campo fixo tipo "Opcao1" — funciona igual pra qualquer convenção de nome/ordem do deck.
        const camposOpcao = detectarCamposOpcaoMultiplaEscolha(nomesCampos);
        const nomesOpcoesCorretas = camposOpcao ? camposOpcao.filter(nome => ordemAfmt.some(o => o.nome === nome)) : [];
        const ehMultiplaEscolha = camposOpcao && nomesOpcoesCorretas.length > 0;
        if (ehMultiplaEscolha) {
            card.opcoesMultiplaEscolha = camposOpcao
                .map(nome => ({ nome, campo: campos[nome] }))
                .filter(c => c.campo && c.campo.rico.temConteudo)
                .map(c => ({ nome: c.nome, html: c.campo.rico.html, correta: nomesOpcoesCorretas.includes(c.nome) }));
        }
        // Campos de opção já viram a interface especial acima — excluídos das caixas genéricas pra não
        // duplicar (uma vez como opção clicável, outra vez como caixa solta).
        const camposParaExcluirDasCaixas = ehMultiplaEscolha ? new Set(camposOpcao) : new Set();

        const camposFrenteRicos = ordemDosCamposNoTemplate(qfmtResolvido, nomesCampos)
            .filter(c => !camposParaExcluirDasCaixas.has(c.nome))
            .map(c => ({ ...c, campo: campos[c.nome] }))
            .filter(c => c.campo && c.campo.rico.temConteudo);
        const camposVersoRicos = ordemAfmt
            .filter(c => !camposParaExcluirDasCaixas.has(c.nome))
            .map(c => ({ ...c, campo: campos[c.nome] }))
            .filter(c => c.campo && c.campo.rico.temConteudo);
        if (camposFrenteRicos.length > 0) card.camposFrente = camposFrenteRicos.map(c => ({ nome: c.nome, html: c.campo.rico.html, hint: c.hint }));
        if (camposVersoRicos.length > 0) card.camposVerso = camposVersoRicos.map(c => ({ nome: c.nome, html: c.campo.rico.html, hint: c.hint }));

        // NOVO: além das caixas genéricas acima (mantidas como fallback — usadas por decks já
        // importados antes dessa mudança, e por cards de múltipla escolha, cujos rótulos ["GABARITO:"
        // etc.] a gente já sintetiza do próprio jeito, ver opcoesMultiplaEscolha acima), monta o HTML
        // rico SUBSTITUINDO cada campo dentro do próprio esqueleto do template — preserva rótulos e
        // estrutura literais que o template original tinha (ex: "CAPITAL"/"FLAG" no deck Ultimate
        // Geography), que as caixas genéricas sempre descartaram por só extraírem o VALOR de cada
        // campo. Pulamos isso pra múltipla escolha de propósito: substituir só o campo da opção (sem
        // mexer no texto ao redor) deixaria um rótulo tipo "GABARITO: " sobrando sem valor nenhum
        // depois, pior do que a caixa sintetizada que já temos.
        if (!ehMultiplaEscolha) {
            const hintsFrenteRico = [], hintsVersoRico = [];
            const qfmtEsqueletoResolvido = resolverSecoesCondicionaisAnki(prep.qfmtEsqueleto, campos);
            const afmtEsqueletoResolvido = resolverSecoesCondicionaisAnki(prep.afmtEsqueleto, campos);
            let frenteRica = renderizarTemplateAnkiComHtmlRico(qfmtEsqueletoResolvido, campos, hintsFrenteRico);
            let versoRica = renderizarTemplateAnkiComHtmlRico(afmtEsqueletoResolvido, campos, hintsVersoRico);
            frenteRica = resolverHintsAnki(frenteRica, hintsFrenteRico);
            versoRica = resolverHintsAnki(versoRica, hintsVersoRico);
            if (htmlRicoTemConteudoReal(frenteRica)) card.frenteTemplateHtml = frenteRica;
            if (htmlRicoTemConteudoReal(versoRica)) card.versoTemplateHtml = versoRica;
        }

        return card;
    });
}

// Um lado do card só é considerado "vazio de verdade" se não tiver NEM texto NEM imagem/mídia —
// cards que são só uma imagem (comuns em baralhos de anatomia, mapas, bandeiras etc.) são válidos.
// A 1ª imagem/mídia extraída de um lado vira o campo "singular" de sempre (compatível com todo o
// resto do app: preview ao editar, backup, etc.); o restante (se houver) vira um array "Extras" —
// só a tela de revisão sabe mostrar essas extras (ver exibirImagensRevisaoAtual).
function aplicarMidiasExtraidasNoCard(card, lado, extraido) {
    if (extraido.imagens.length > 0) {
        card[`imagem${lado}Id`] = extraido.imagens[0];
        if (extraido.imagens.length > 1) card[`imagensExtras${lado}Ids`] = extraido.imagens.slice(1);
    }
    if (extraido.midias.length > 0) {
        card[`midia${lado}Id`] = extraido.midias[0].id;
        card[`midia${lado}Tipo`] = extraido.midias[0].tipo;
        if (extraido.midias.length > 1) card[`midiasExtras${lado}Ids`] = extraido.midias.slice(1);
    }
}

function converterNotaBasicaAnki(campoFrente, campoVerso, tema, zip, nomeParaIndice) {
    return Promise.all([
        extrairMidiaDoCampo(campoFrente, zip, nomeParaIndice),
        extrairMidiaDoCampo(campoVerso, zip, nomeParaIndice)
    ]).then(([frente, verso]) => {
        const frenteVazia = !frente.texto.trim() && frente.imagens.length === 0 && frente.midias.length === 0;
        // NOVO: ver comentário equivalente em converterNotaComTemplateAnki — o Anki só exige a FRENTE
        // preenchida pra gerar o card; verso vazio é aceito (campo de resposta ainda não preenchido, por
        // exemplo), em vez de rejeitar o card inteiro.
        const versoVazio = !verso.texto.trim() && verso.imagens.length === 0 && verso.midias.length === 0;
        if (frenteVazia) throw new Error(`Frente sem nenhum conteúdo (nem texto, nem imagem/mídia). Frente: "${campoFrente.slice(0, 60)}"`);
        const card = {
            id: Date.now() + Math.floor(Math.random() * 1000000),
            tema: tema, subtema: frente.texto, resposta: verso.texto, tipo: "normal",
            data_proxima_revisao: hojeISO(), intervalo_atual: 0, fator_facilidade: 2.5
        };
        aplicarMidiasExtraidasNoCard(card, "Pergunta", frente);
        aplicarMidiasExtraidasNoCard(card, "Resposta", verso);
        card._midiaNaoSuportada = frente.midiaNaoSuportada || verso.midiaNaoSuportada;
        card._versoVazio = versoVazio;
        return card;
    });
}

// idxsCamposCloze: lista de índices de campo (normalmente só 1 — ver encontrarNomesCamposClozeAnki).
// Um add-on conhecido, "Cloze Overlapper", espalha os números de lacuna por campos SEPARADOS (Text1 só
// tem {{c1::...}}, Text2 só {{c2::...}}, etc., referenciados juntos no mesmo qfmt/afmt) — tratando só o
// 1º campo, os números dos outros nunca eram vistos e boa parte dos cards reais da nota nunca era
// gerada. Processa cada campo cloze separadamente e junta os segmentos resultantes (na ordem dos
// campos, com um espaço entre um campo e outro pra não grudar palavras) antes de aplicar a mesma lógica
// de "1 card por número distinto" de sempre — o resto da função não muda.
function converterNotaClozeAnki(modelo, flds, idxsCamposCloze, tema, zip, nomeParaIndice) {
    return Promise.all(idxsCamposCloze.map(idx => extrairMidiaDoCampo(flds[idx] || "", zip, nomeParaIndice))).then(processados => {
        const campoTextoOriginal = flds[idxsCamposCloze[0]] || "";
        const semNada = processados.every(p => !p.texto.trim() && p.imagens.length === 0 && p.midias.length === 0);
        if (semNada) throw new Error(`Nota cloze sem nenhum conteúdo. Campo original: "${campoTextoOriginal.slice(0, 60)}"`);

        let segmentos = [];
        processados.forEach((p, i) => {
            if (i > 0) segmentos.push({ texto: " ", lacuna: false });
            segmentos = segmentos.concat(parsearClozeAnki(p.texto));
        });
        // NOVO: uma nota cloze pode ter mais de um NÚMERO de lacuna distinto (no mesmo campo, ex:
        // "카페{{c1::에}} 가요. 카페{{c2::에서}} 공부해요."; ou espalhado entre campos, ver comentário
        // acima). No Anki de verdade isso gera 1 CARD POR NÚMERO — o card do c1 esconde só "에"
        // (mostrando "에서" revelado normalmente), o card do c2 faz o oposto.
        const numeros = [...new Set(segmentos.filter(s => s.lacuna).map(s => s.numero))].sort((a, b) => Number(a) - Number(b));
        if (numeros.length === 0) throw new Error(`Nota cloze sem nenhuma lacuna válida (esperava {{c1::...}}). Campo: "${campoTextoOriginal.slice(0, 60)}"`);
        const subtemaExibicao = segmentos.map(s => s.texto).join("");

        // NOVO: até aqui só os campos com {{cN::...}} são lidos — os campos irmãos (ex: Embasamento,
        // ✚ Dica, ✚ Saiba mais) eram inteiramente ignorados antes, mesmo quando o template do card cloze
        // os exibia na resposta. Se o afmt do modelo for legível, descobrimos quais campos (fora os de
        // cloze) aparecem nele e em que ordem, extraindo cada um como HTML rico (mesma função do
        // pipeline "com template" — ver converterNotaComTemplateAnki) pra exibir na revisão. Extraído 1x
        // só (não depende do número da lacuna) e reaproveitado em todos os cards gerados pra essa nota.
        const nomesCampos = (modelo.flds || []).map(f => f.name);
        const nomesCamposCloze = idxsCamposCloze.map(idx => nomesCampos[idx]);
        const prep = prepararTemplateAnki(modelo);
        let promessaCamposVerso = Promise.resolve(null);
        if (prep && prep.afmt) {
            const ordemVerso = ordemDosCamposNoTemplate(prep.afmt, nomesCampos).filter(c => !nomesCamposCloze.includes(c.nome));
            if (ordemVerso.length > 0) {
                promessaCamposVerso = Promise.all(ordemVerso.map(c => {
                    const i = nomesCampos.indexOf(c.nome);
                    return extrairCampoAnkiComoHtml(flds[i] || "", zip, nomeParaIndice).then(r => ({ ...c, r }));
                })).then(resultados => {
                    const camposVerso = resultados.filter(x => x.r.temConteudo).map(x => ({ nome: x.nome, html: x.r.html, hint: x.hint }));
                    // NOVO: esses campos irmãos só passam pelo pipeline novo (extrairCampoAnkiComoHtml,
                    // sem equivalente antigo pra comparar) — diferente do caso de converterNotaComTemplateAnki,
                    // aqui não existe um 2º pipeline "sucesso" pra checar antes de avisar, então qualquer
                    // falha real dele (ex: mídia referenciada que não existe no zip nem é URL http/https)
                    // já é motivo suficiente pra somar ao aviso, senão a falha fica muda pro usuário.
                    return { camposVerso: camposVerso.length > 0 ? camposVerso : null, midiaNaoSuportada: resultados.some(x => x.r.midiaNaoSuportada) };
                });
            }
        }

        // Mídia de TODOS os campos cloze juntos (ordem preservada), não só do 1º.
        const imagensCombinadas = processados.flatMap(p => p.imagens);
        const midiasCombinadas = processados.flatMap(p => p.midias);
        const midiaNaoSuportadaCombinada = processados.some(p => p.midiaNaoSuportada);

        return promessaCamposVerso.then(versoExtra => numeros.map((numero, ordem) => {
            // Pra ESTE card (número "numero"): só a(s) lacuna(s) desse número ficam escondidas — as de
            // outro número (ex: c2 quando este card é o do c1) aparecem reveladas normalmente, exatamente
            // como o Anki mostra.
            const clozePartesCard = segmentos.map(s =>
                s.lacuna && s.numero !== numero ? { texto: s.texto, lacuna: false } : { texto: s.texto, lacuna: s.lacuna }
            );
            const resposta = segmentos.filter(s => s.lacuna && s.numero === numero).map(s => s.texto.trim()).filter(Boolean).join(", ");
            const card = {
                id: Date.now() + Math.floor(Math.random() * 1000000) + ordem,
                tema: tema, subtema: subtemaExibicao, resposta: resposta, tipo: "cloze", clozePartes: clozePartesCard,
                data_proxima_revisao: hojeISO(), intervalo_atual: 0, fator_facilidade: 2.5
            };
            aplicarMidiasExtraidasNoCard(card, "Pergunta", { imagens: imagensCombinadas, midias: midiasCombinadas });
            card._midiaNaoSuportada = midiaNaoSuportadaCombinada || !!(versoExtra && versoExtra.midiaNaoSuportada);
            if (versoExtra && versoExtra.camposVerso) card.camposVerso = versoExtra.camposVerso;
            return card;
        }));
    });
}

function parsearClozeAnki(texto) {
    const segmentos = [];
    // NOVO: flag "s" (dotAll) — sem ela, "." não casa quebra de linha, então uma lacuna cuja resposta
    // tem uma quebra de linha no meio (ex: "{{c1::cento<br>e vinte}}", já virou "\n" antes de chegar
    // aqui — ver converterHtmlParaTextoPlano) nunca era encontrada pelo regex, e o card era rejeitado
    // inteiro como "sem nenhuma lacuna válida", mesmo tendo uma de verdade.
    // NOVO: captura também o número "N" de "{{cN::...}}" (ver converterNotaClozeAnki) — necessário pra
    // gerar 1 card por número distinto de lacuna, igual o Anki faz, em vez de tratar {{c1::}}/{{c2::}}
    // como a mesma lacuna de um único card.
    const regex = /\{\{c(\d+)::(.*?)(?:::.*?)?\}\}/gs;
    let ultimoIndice = 0, match;
    while ((match = regex.exec(texto)) !== null) {
        if (match.index > ultimoIndice) segmentos.push({ texto: texto.slice(ultimoIndice, match.index), lacuna: false });
        segmentos.push({ texto: match[2], lacuna: true, numero: match[1] });
        ultimoIndice = regex.lastIndex;
    }
    if (ultimoIndice < texto.length) segmentos.push({ texto: texto.slice(ultimoIndice), lacuna: false });
    // NOVO: uma lacuna "{{c1::}}" (sem nada entre os ::) é uma resposta legítima e proposital no Anki
    // — decks de regência verbal/gramática usam isso pra testar quando a resposta certa é "nada"/"sem
    // preposição" (ex: campo de opções "a / à / (sem nada) / em"). Só descarta segmento vazio quando
    // ele NÃO é lacuna (texto de fora do {{...}} realmente vazio, sem significado nenhum) — descartar
    // TODA lacuna vazia (como antes) fazia esses cards serem rejeitados como "sem nenhuma lacuna
    // válida", mesmo tendo uma de verdade só que com resposta vazia.
    return segmentos.filter(s => s.lacuna || s.texto !== "");
}

// NOVO: converte um trecho de HTML (já sem as imagens/áudios, que foram extraídos à parte) em texto
// plano de verdade — usando o próprio parser HTML do navegador (via uma div nunca inserida na página,
// mesma técnica seguraa já usada em escaparHtml) em vez de regex. Isso decodifica entidades HTML
// corretamente (ex: "&nbsp;" vira espaço de verdade, não fica cru "&nbsp;" no meio do texto — muito
// comum em campos "Example"/"Definição" de decks feitos em editores visuais), além de lidar melhor
// com blocos aninhados do que a versão anterior só com regex.
function converterHtmlParaTextoPlano(html) {
    const comQuebras = (html || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(div|p|li|tr|h[1-6])>/gi, "\n");
    const div = document.createElement("div");
    div.innerHTML = comQuebras;
    // NOVO: além de colapsar linhas em branco em excesso, tira espaço/tab sobrando no início/fim de
    // CADA linha e colapsa espaços internos repetidos — templates com HTML bem aninhado (vários <div>
    // um dentro do outro, cada um virando quebra de linha) deixavam bastante linha "quase vazia" (só
    // espaço) entre o conteúdo de verdade.
    return (div.textContent || "")
        .split("\n").map(l => l.replace(/[ \t]+/g, " ").trim()).join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

// NOVO: extrai TODAS as imagens e TODOS os áudios/vídeos de um campo (antes só pegava o 1º de cada
// tipo) — decks com nota "rica" (várias imagens, ou áudio da frase + áudio da palavra, como o add-on
// Migaku) tinham a maioria da mídia descartada, sobrando só como texto cru tipo "[sound:arquivo.mp3]".
// A ordem de cada lista é preservada (a posição no texto original), mesmo a extração sendo assíncrona.
function extrairMidiaDoCampo(campoHtml, zip, nomeParaIndice) {
    let texto = campoHtml || "";
    const imagensPorPosicao = [];
    const midiasPorPosicao = [];
    let midiaNaoSuportada = false;
    const tarefas = [];

    texto = texto.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (match, src) => {
        const posicao = imagensPorPosicao.length;
        imagensPorPosicao.push(null);
        const indice = nomeParaIndice[src];
        if (indice !== undefined && zip.file(indice)) {
            tarefas.push(
                zip.file(indice).async("blob").then(descomprimirBlobSeZstd).then(blob => corrigirTipoMimeBlob(blob, src)).then(blob => {
                    const novoId = `anki_img_${Date.now()}_${Math.floor(Math.random() * 1000000)}_${posicao}`;
                    return salvarImagemSRS(novoId, blob).then(() => { imagensPorPosicao[posicao] = novoId; });
                }).catch(() => { midiaNaoSuportada = true; })
            );
        } else {
            midiaNaoSuportada = true;
        }
        return "";
    });

    texto = texto.replace(/\[sound:([^\]]+)\]/gi, (match, nomeArquivo) => {
        const posicao = midiasPorPosicao.length;
        midiasPorPosicao.push(null);
        const extensao = (nomeArquivo.split(".").pop() || "").toLowerCase();
        const tipo = ["mp4", "webm", "mov", "ogv"].includes(extensao) ? "video" : "audio";
        const indice = nomeParaIndice[nomeArquivo];
        if (indice !== undefined && zip.file(indice)) {
            tarefas.push(
                zip.file(indice).async("blob").then(descomprimirBlobSeZstd).then(blob => corrigirTipoMimeBlob(blob, nomeArquivo)).then(blob => {
                    const novoId = `anki_midia_${Date.now()}_${Math.floor(Math.random() * 1000000)}_${posicao}`;
                    return salvarImagemSRS(novoId, blob).then(() => { midiasPorPosicao[posicao] = { id: novoId, tipo: tipo }; });
                }).catch(() => { midiaNaoSuportada = true; })
            );
        } else {
            midiaNaoSuportada = true;
        }
        return "";
    });

    texto = converterHtmlParaTextoPlano(texto);

    // NOVO: quando vários campos foram combinados (nota com mais de 2 campos — ver converterNotaAnki),
    // um campo que era só imagem/áudio (ex: "Screenshot") vira um rótulo vazio ("Screenshot:") depois
    // que a imagem/áudio dele já foi extraída acima — essas linhas sem valor são removidas.
    texto = texto.split("\n").map(l => l.trim()).filter(l => l && !/^[^:\n]{1,40}:\s*$/.test(l)).join("\n");

    texto = converterAnotacoesPinyin(texto);

    return Promise.all(tarefas).then(() => ({
        texto,
        imagens: imagensPorPosicao.filter(Boolean),
        midias: midiasPorPosicao.filter(Boolean),
        midiaNaoSuportada
    }));
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
// Marcadores invisíveis (caracteres da área de uso privado do Unicode — nunca aparecem em texto real)
// usados pra "proteger" HTML gerado por nós mesmo (seguro) durante o escape do resto do texto (ver
// escaparComHtmlProtegido). Sem isso, esse HTML viraria texto cru quando a resposta fosse exibida.
// Dois pares distintos (um pro hover de pinyin, outro pra caixa expansível "+ Saiba mais" do Anki, ver
// resolverHintsAnki) — assim um consegue aparecer ANINHADO dentro do outro (ex: um hint com pinyin lá
// dentro) sem os marcadores de um se confundirem com os do outro.
const MARCA_INICIO_PINYIN_HOVER = "";
const MARCA_FIM_PINYIN_HOVER = "";
const MARCA_INICIO_HINT_ANKI = "";
const MARCA_FIM_HINT_ANKI = "";

// Aplica `transformar` só nos trechos do texto que NÃO estão protegidos (fora de qualquer marcador
// acima) — usado tanto pra escapar (escaparComHtmlProtegido) quanto pra converter o resto do template
// em texto puro (converterHtmlParaTextoPlanoProtegido), sem tocar no HTML seguro já gerado.
function aplicarForaDosBlocosProtegidos(texto, transformar) {
    const bruto = texto == null ? "" : String(texto);
    if (bruto.indexOf(MARCA_INICIO_PINYIN_HOVER) === -1 && bruto.indexOf(MARCA_INICIO_HINT_ANKI) === -1) return transformar(bruto);
    const regex = new RegExp(
        `(${MARCA_INICIO_PINYIN_HOVER}[\\s\\S]*?${MARCA_FIM_PINYIN_HOVER}|${MARCA_INICIO_HINT_ANKI}[\\s\\S]*?${MARCA_FIM_HINT_ANKI})`, "g"
    );
    return bruto.split(regex).map(parte =>
        (parte.startsWith(MARCA_INICIO_PINYIN_HOVER) || parte.startsWith(MARCA_INICIO_HINT_ANKI)) ? parte : transformar(parte)
    ).join("");
}

// Mesma ideia de converterHtmlParaTextoPlano, mas preservando trechos já protegidos (spans de hover de
// pinyin ou tokens de hint ainda não resolvidos) — usada ao montar frente/verso a partir do template do
// Anki, que pode ter campos já processados (com HTML seguro embutido) misturados com o HTML "cru" do
// próprio template.
function converterHtmlParaTextoPlanoProtegido(html) {
    return aplicarForaDosBlocosProtegidos(html, converterHtmlParaTextoPlano);
}

function escaparAtributoHtml(texto) {
    return escaparHtml(texto).replace(/"/g, "&quot;");
}

// NOVO: reconhece DOIS formatos de anotação de pinyin/leitura em cima de caracteres chineses/japoneses:
// 1) Sintaxe do add-on Migaku: "caractere[pinyin_com_tom_numerico;classe_gramatical]" — decodifica o
//    tom numérico pra acento (ex: "ta1" -> "tā").
// 2) Sintaxe NATIVA do próprio Anki (furigana, sem add-on nenhum): "caractere[leitura]" — sem ponto e
//    vírgula, usa a leitura exatamente como está escrita.
// Em ambos os casos, gera um span que só mostra a leitura ao passar o mouse (replicando o hover que
// existe no Anki), em vez de deixar sempre visível como antes.
function converterAnotacoesPinyin(texto) {
    if (!texto || texto.indexOf('[') === -1) return texto;
    return texto.replace(/([一-鿿]+?)\[([^\]]*?)\]/g, (match, hanzi, colchete) => {
        let leitura;
        if (colchete.indexOf(';') !== -1) {
            const primeiraLeitura = (colchete.split(';')[0] || '').trim();
            const silabas = primeiraLeitura.match(/\S+?\d/g) || [];
            leitura = silabas.length > 0 ? silabas.map(decodificarSilabaPinyin).join('') : primeiraLeitura;
        } else {
            leitura = colchete.trim();
        }
        if (!leitura) return hanzi;
        return `${MARCA_INICIO_PINYIN_HOVER}<span class="hanzi-hover" data-pinyin="${escaparAtributoHtml(leitura)}">${escaparHtml(hanzi)}</span>${MARCA_FIM_PINYIN_HOVER}`;
    });
}

// NOVO: "pré-visualização" de um card específico a partir do "Deck Completo" — fura a fila de
// revisão só pra mostrar como aquele card é exibido (pergunta e, ao clicar em "mostrar resposta", a
// resposta), SEM nenhuma validade no histórico/agendamento: clicar em Difícil/Bom/Fácil durante a
// pré-visualização não grava nada em dados.srsRevisoesLog nem altera intervalo/data do card (ver
// processarRevisaoSRS) — só volta pra fila normal. Cards que já estavam na fila continuam sendo
// logados normalmente; nada nesse mecanismo toca o caminho de log dos cards reais.
let modoPreviewSRS = false;

function visualizarCardSRS(id) {
    const card = dados.srsItems.find(i => i.id === id);
    if (!card) return;
    limparUrlsImagemRevisao();
    respostaRevelada = false;
    modoPreviewSRS = true;
    cardAtualRevisao = card;
    renderizarCardNaAreaRevisao(card);
    const areaDisplay = document.getElementById("srs-card-display");
    if (areaDisplay) areaDisplay.scrollIntoView({ behavior: "smooth", block: "start" });
}

function sairDoPreviewSRS() {
    modoPreviewSRS = false;
    cardAtualRevisao = null;
    carregarRevisaoSRS();
    atualizarEstatisticasSRS();
}

// Monta o HTML de um card (pergunta + área de resposta) dentro de #srs-card-display — usado tanto
// pela fila normal de revisão (carregarRevisaoSRS) quanto pela pré-visualização (visualizarCardSRS).
function renderizarCardNaAreaRevisao(card) {
    const areaDisplay = document.getElementById("srs-card-display");
    const controls = document.getElementById("srs-controls");
    const feedback = document.getElementById("srs-feedback");
    const btnRevelar = document.getElementById("btn-revelar-resposta");
    if (!areaDisplay) return;

    const ehCloze = card.tipo === "cloze" && card.clozePartes;
    // NOVO: cards de múltipla escolha auto-detectados (ver detectarCamposOpcaoMultiplaEscolha) ganham
    // a interface própria de seleção, junto com as outras caixas normais do lado da pergunta.
    const ehMultiplaEscolha = !!(card.opcoesMultiplaEscolha && card.opcoesMultiplaEscolha.length > 0);
    // NOVO: card.frenteTemplateHtml/versoTemplateHtml (ver converterNotaComTemplateAnki) é a opção
    // preferida quando existe — o campo substituído dentro do próprio esqueleto do template, mantendo
    // rótulos/estrutura literais (ex: "CAPITAL" no deck Ultimate Geography) que camposFrente/
    // camposVerso (caixa solta só com o VALOR de cada campo) sempre descartou. camposFrente/camposVerso
    // continuam calculados e servem de fallback — decks já importados antes dessa mudança (sem o campo
    // novo salvo) e cards de múltipla escolha (que pulam de propósito o HTML rico, ver
    // converterNotaComTemplateAnki) continuam usando as caixas soltas de sempre.
    const perguntaHtml = ehCloze ? renderizarPerguntaCloze(card, false) :
        (card.frenteTemplateHtml ? `<div class="srs-campo-caixa">${card.frenteTemplateHtml}</div>`
            : (card.camposFrente ? montarCaixasCamposAnki(card.camposFrente) : escaparComHtmlProtegido(card.subtema))) +
        (ehMultiplaEscolha ? renderizarOpcoesMultiplaEscolhaSRS(card.opcoesMultiplaEscolha) : "");
    // Cloze só ganha área de resposta separada quando existem campos complementares de verdade
    // (ex: Embasamento, ✚ Saiba mais) — a resposta da lacuna em si já aparece revelada dentro da
    // própria pergunta (ver revelarRespostaSRS), então sem camposVerso o comportamento de sempre
    // (nenhuma área de resposta pro cloze) é mantido.
    const temAreaResposta = ehCloze ? !!(card.camposVerso && card.camposVerso.length > 0) : true;
    // NOVO: pra múltipla escolha, o "gabarito" nunca é só a caixa crua do campo — o template original
    // sempre rotulava ele (ex: "GABARITO: {{Opcao1}}"), texto que se perde na extração por campo (só
    // pegamos o valor do campo referenciado, não o texto ao redor dele no template). Sintetizamos um
    // rótulo próprio ("Resposta correta:") em vez de deixar o valor solto sem contexto nenhum.
    const corpoResposta = ehMultiplaEscolha
        ? `<div class="srs-campo-caixa srs-mcq-gabarito">✅ Resposta correta: <b>${card.opcoesMultiplaEscolha.filter(o => o.correta).map(o => o.html).join(" / ")}</b></div>${card.camposVerso ? montarCaixasCamposAnki(card.camposVerso) : ""}`
        : (card.versoTemplateHtml ? `<div class="srs-campo-caixa">${card.versoTemplateHtml}</div>`
            : (card.camposVerso
                ? montarCaixasCamposAnki(card.camposVerso)
                : (card.resposta ? escaparComHtmlProtegido(card.resposta) : '<em style="color:var(--text-secondary);">(sem resposta cadastrada)</em>')));
    const blocoResposta = temAreaResposta ? `<div id="srs-resposta-area" class="oculto" style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed var(--border-color); font-size: 1em; color: var(--secondary-color);"><div id="srs-imagem-resposta-atual" class="srs-card-imagem oculto"></div><div id="srs-midia-resposta-atual" class="srs-card-midia oculto"></div>${corpoResposta}</div>` : "";
    const avisoPreview = modoPreviewSRS ? `<div class="srs-preview-banner">🔍 Pré-visualização — não conta para o histórico de revisões <button onclick="sairDoPreviewSRS()">Voltar para a fila</button></div>` : "";
    // NOVO: última data de revisão ANTERIOR desse card, discreta ao lado do intervalo atual — omitida
    // por completo quando o card nunca foi revisado (ver dataUltimaRevisaoAnterior).
    const ultimaRevisao = dataUltimaRevisaoAnterior(card.id);
    const textoUltimaRevisao = ultimaRevisao ? ` · Última revisão: ${ultimaRevisao}` : "";
    areaDisplay.innerHTML = `${avisoPreview}<div style="font-size: 0.9em; color: var(--secondary-color); margin-bottom:10px;">${escaparHtml(card.tema)}</div><div id="srs-imagem-pergunta-atual" class="srs-card-imagem oculto"></div><div id="srs-midia-pergunta-atual" class="srs-card-midia oculto"></div><div id="srs-pergunta-atual" style="font-size: 1.4em; font-weight: bold;">${perguntaHtml}</div>${blocoResposta}<div style="margin-top: 15px; font-size: 0.8em; color: #999;">Intervalo atual: ${card.intervalo_atual} dias${textoUltimaRevisao}</div>`;
    controls.classList.add("oculto");
    if (btnRevelar) btnRevelar.classList.remove("oculto");
    feedback.innerText = "Pense na resposta e depois revele.";
    atualizarPreviasBotoesRevisaoSRS(card);
    exibirImagensRevisaoAtual(card);
    // As imagens/mídias embutidas no HTML rico (camposFrente/camposVerso) só têm o id do IndexedDB
    // salvo — a blob URL de exibição precisa ser recriada a cada renderização (ver
    // resolverMidiaInlineNoContainer).
    resolverMidiaInlineNoContainer(document.getElementById("srs-pergunta-atual")).then(urls => urlsImagemRevisaoAtual.push(...urls));
    resolverMidiaInlineNoContainer(document.getElementById("srs-resposta-area")).then(urls => urlsImagemRevisaoAtual.push(...urls));
}

function carregarRevisaoSRS() {
    const areaDisplay = document.getElementById("srs-card-display");
    const controls = document.getElementById("srs-controls");
    const feedback = document.getElementById("srs-feedback");
    const btnRevelar = document.getElementById("btn-revelar-resposta");
    if(!areaDisplay) return;
    // Uma pré-visualização em andamento nunca deve ser interrompida por um refresh vindo de OUTRA
    // parte do app (ex: salvar() disparado por uma sessão de Pomodoro terminando em segundo plano) —
    // ela só termina quando o usuário sai de propósito (ver sairDoPreviewSRS/processarRevisaoSRS).
    if (modoPreviewSRS) return;

    const hojeData = hojeISO();
    const filtroParcial = srsTemasSelecionados.size < srsTemasConhecidos.size;
    const elegiveis = dados.srsItems.filter(item => item.data_proxima_revisao <= hojeData && srsTemasSelecionados.has(item.tema));

    // NOVO: limite diário de cards NUNCA revisados (intervalo_atual === 0 — nenhuma revisão ainda passou
    // por eles) — sem isso, importar um deck grande (ex: 750 cards) jogava tudo de uma vez na fila do
    // mesmo dia. Cards que já tiveram pelo menos 1 revisão (intervalo_atual > 0) nunca são barrados por
    // esse limite, só os novos. A cota é POR TEMA-RAIZ (ver limiteNovosParaTemaRaiz/
    // contarNovosEstudadosHojePorTemaRaiz) — cada deck importado (Fiscal, Inglês, JLPT...) tem sua
    // própria cota independente, igual o Anki de verdade faz por deck, em vez de um limite único
    // compartilhado entre todos os temas.
    const vagasPorTemaRaiz = new Map();
    const novosEstudadosPorTemaRaiz = contarNovosEstudadosHojePorTemaRaiz();
    function vagasRestantesNoTemaRaiz(temaRaiz) {
        if (!vagasPorTemaRaiz.has(temaRaiz)) {
            const limite = limiteNovosParaTemaRaiz(temaRaiz);
            const usados = novosEstudadosPorTemaRaiz.get(temaRaiz) || 0;
            vagasPorTemaRaiz.set(temaRaiz, Math.max(0, limite - usados));
        }
        return vagasPorTemaRaiz.get(temaRaiz);
    }
    let novosBarradosHoje = 0;
    let paraRevisar = elegiveis.filter(item => {
        if (item.intervalo_atual !== 0) return true;
        const temaRaiz = temaRaizSRS(item.tema);
        const vagas = vagasRestantesNoTemaRaiz(temaRaiz);
        if (vagas > 0) { vagasPorTemaRaiz.set(temaRaiz, vagas - 1); return true; }
        novosBarradosHoje++;
        return false;
    });

    // Evita reconstruir o card que já está em revisão (perdendo a resposta revelada ou as lacunas
    // já digitadas) quando um salvar() de OUTRA parte do app — ex: uma sessão de Pomodoro terminando
    // em segundo plano — dispara atualizar()/carregarRevisaoSRS() de novo sem o usuário ter avançado.
    if (cardAtualRevisao && paraRevisar.length > 0 && paraRevisar[0].id === cardAtualRevisao.id) {
        return;
    }

    limparUrlsImagemRevisao();
    respostaRevelada = false;

    if(paraRevisar.length === 0) {
        const avisoNovosBarrados = novosBarradosHoje > 0
            ? `<p style="color: var(--text-secondary); font-size: 0.9em;">Mais ${novosBarradosHoje} card(s) novo(s) esperando — o limite de novos por hoje já foi atingido nos temas correspondentes. Volte amanhã ou ajuste o limite em "⚙️ Limites por tema".</p>`
            : "";
        areaDisplay.innerHTML = `<h3>🎉 Tudo em dia!</h3><p>Você revisou todos os cards${filtroParcial ? " dos temas selecionados" : ""} por hoje.</p>${avisoNovosBarrados}`;
        controls.classList.add("oculto");
        if (btnRevelar) btnRevelar.classList.add("oculto");
        feedback.innerText = "";
        cardAtualRevisao = null;
    } else {
        cardAtualRevisao = paraRevisar[0];
        renderizarCardNaAreaRevisao(cardAtualRevisao);
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
    }
    // NOVO: cloze com campos complementares (ex: Embasamento, ✚ Saiba mais — ver
    // converterNotaClozeAnki) agora TAMBÉM tem #srs-resposta-area no DOM, então revela ela junto —
    // antes só o card não-cloze caía aqui (cloze nunca tinha essa área, `if`/`else` eram excludentes).
    const respostaArea = document.getElementById("srs-resposta-area");
    if (respostaArea) respostaArea.classList.remove("oculto");
    // NOVO: ver comentário de prepararTemplatesAnki/respostaSubstituiPergunta — quando o afmt do card
    // não usa {{FrontSide}}, ele já é uma tela de resposta completa e standalone (redeclara tudo que
    // precisa); manter a pergunta visível junto duplicaria conteúdo (ex: nome do país 2x na tela).
    if (cardAtualRevisao && cardAtualRevisao.respostaSubstituiPergunta) {
        const perguntaEl = document.getElementById("srs-pergunta-atual");
        if (perguntaEl) perguntaEl.classList.add("oculto");
    }
    const btnRevelar = document.getElementById("btn-revelar-resposta");
    if (btnRevelar) btnRevelar.classList.add("oculto");
    document.getElementById("srs-controls").classList.remove("oculto");
    document.getElementById("srs-feedback").innerText = "Como foi sua memória?";
}

// Calcula o intervalo (em dias) que o SM-2 simplificado daria pra um card se ele fosse respondido com
// essa qualidade — extraído de processarRevisaoSRS pra ser usado TAMBÉM na prévia embaixo dos botões
// (ver atualizarPreviasBotoesRevisaoSRS), sem duplicar a fórmula em dois lugares que podiam divergir.
// Não muda nada no card (fator_facilidade de "fácil" só é incrementado de verdade em
// processarRevisaoSRS, depois que o usuário realmente clica) — é só leitura.
function calcularNovoIntervaloSRS(item, qualidade) {
    if (qualidade === 'dificil') return 1;
    if (qualidade === 'bom') return item.intervalo_atual === 0 ? 1 : Math.ceil(item.intervalo_atual * item.fator_facilidade);
    if (qualidade === 'facil') return item.intervalo_atual === 0 ? 4 : Math.ceil(item.intervalo_atual * item.fator_facilidade * 1.3);
    return 0;
}
function calcularDataProximaRevisaoSRS(intervaloDias) {
    const d = new Date();
    d.setDate(d.getDate() + intervaloDias);
    return dataParaIsoLocal(d);
}
function formatarPreviaIntervaloSRS(dias) {
    const rotulo = dias <= 0 ? "hoje" : dias === 1 ? "amanhã" : `em ${dias}d`;
    return `${rotulo} · ${formatarDataBR(calcularDataProximaRevisaoSRS(dias))}`;
}
// NOVO: mostra embaixo de cada botão (Difícil/Bom/Fácil) a data em que o card volta a ser revisado SE
// aquele botão for clicado agora — mesma ideia do Anki, que já mostra o intervalo resultante em cada
// botão antes da escolha, pra dar uma noção real do efeito de cada resposta.
function atualizarPreviasBotoesRevisaoSRS(item) {
    ["dificil", "bom", "facil"].forEach(qualidade => {
        const el = document.getElementById(`srs-previa-${qualidade}`);
        if (el) el.textContent = formatarPreviaIntervaloSRS(calcularNovoIntervaloSRS(item, qualidade));
    });
}

function processarRevisaoSRS(qualidade) {
    if(!cardAtualRevisao) return;
    // Card em pré-visualização (ver visualizarCardSRS): Difícil/Bom/Fácil aqui não tem NENHUMA
    // validade — não grava em dados.srsRevisoesLog, não mexe no intervalo/data do card, não credita
    // pontos. É só um jeito de sair da pré-visualização e voltar pra fila normal.
    if (modoPreviewSRS) { sairDoPreviewSRS(); return; }
    const intervaloAnterior = cardAtualRevisao.intervalo_atual;
    const fatorAnterior = cardAtualRevisao.fator_facilidade;

    const novoIntervalo = calcularNovoIntervaloSRS(cardAtualRevisao, qualidade);
    if (qualidade === 'facil') cardAtualRevisao.fator_facilidade += 0.15;

    cardAtualRevisao.intervalo_atual = novoIntervalo;
    cardAtualRevisao.data_proxima_revisao = calcularDataProximaRevisaoSRS(novoIntervalo);
    dados.pontosAcumulados += 10;
    // NOVO/CORREÇÃO: faltava marcar srsItemsAlterado aqui — sem isso, salvarDados() (logo abaixo)
    // nunca gravava dados.srsItems no IndexedDB depois de uma revisão (só o resto de "dados", que vai
    // pro localStorage, ficava salvo). O card respondido sumia da fila na hora, mas com um reload da
    // página o array de cards era recarregado do IndexedDB com o estado ANTIGO (intervalo/data de
    // antes da revisão) — a revisão "sumia" e o card voltava a aparecer como se nunca tivesse sido
    // respondido. Bug pré-existente (de antes desta sessão), achado por um usuário que recarregou a
    // página logo depois de revisar um card.
    srsItemsAlterado = true;

    // NOVO: registra cada revisão (não só o estado atual do card, que a linha acima já sobrescreve) —
    // é a base de dados necessária pra, no futuro, calibrar um algoritmo de agendamento mais sofisticado
    // (ex: FSRS) com o histórico real de acerto/erro, em vez de só os pesos padrão genéricos. Também é
    // o que permite saber quantos cards NOVOS (intervalo_anterior === 0) já foram estudados hoje, pro
    // limite diário de cards novos (ver contarNovosEstudadosHoje).
    dados.srsRevisoesLog.push({
        cardId: cardAtualRevisao.id,
        data: hojeISO(),
        dataHora: new Date().toISOString(),
        qualidade: qualidade,
        intervalo_anterior: intervaloAnterior,
        intervalo_novo: novoIntervalo,
        fator_facilidade_anterior: fatorAnterior,
        fator_facilidade_novo: cardAtualRevisao.fator_facilidade
    });

    // NOVO: salvar() dispara atualizar(), que reconstrói o app INTEIRO (checklist, biblioteca,
    // finanças com 2 gráficos, RPG com mais 3 gráficos, e a lista completa do deck de SRS) a cada
    // resposta de revisão — era isso que fazia passar pro próximo card demorar vários segundos,
    // principalmente em decks grandes importados do Anki. Aqui só persistimos os dados e atualizamos
    // as partes da tela que realmente mudaram: o próprio card de revisão e as estatísticas do SRS.
    salvarDados();
    carregarRevisaoSRS();
    atualizarEstatisticasSRS();
    // NOVO: só reconstrói o Deck Completo quando o filtro "revisados hoje" está ativo — é o único caso
    // em que o card que acabou de ser respondido pode precisar aparecer/mudar de posição na lista
    // agora mesmo. Fora disso, continua sem chamar renderizarListaSRS() aqui, pelo motivo explicado
    // acima (evita o travamento em decks grandes).
    if (srsListaFiltroRevisadosHoje) renderizarListaSRS();
}

// Quantos cards NUNCA revisados antes (intervalo_anterior === 0 no log) já foram estudados hoje, no
// total — só usado pra estatística geral (ver atualizarEstatisticasSRS); o limite em si (ver
// carregarRevisaoSRS) é calculado POR TEMA-RAIZ, ver contarNovosEstudadosHojePorTemaRaiz logo abaixo.
function contarNovosEstudadosHoje() {
    const hojeData = hojeISO();
    return dados.srsRevisoesLog.filter(r => r.data === hojeData && r.intervalo_anterior === 0).length;
}

// ============================================================
// === LIMITE DE CARDS NOVOS POR DIA — POR TEMA-RAIZ (igual o Anki faz por deck) ===
// ============================================================
// O "tema-raiz" é o primeiro segmento antes do primeiro "::" (ex: "Fiscal::Tributário" -> "Fiscal")
// — cada deck importado do Anki vira uma dessas raízes. dados.srsLimiteNovosPorDia continua existindo
// como o valor PADRÃO usado por qualquer tema-raiz sem uma entrada própria em
// dados.srsLimitesNovosPorTema (assim quem nunca mexeu nessa configuração nova não perde nada — todo
// tema continua usando o mesmo número de sempre, só que agora cada um com sua PRÓPRIA cota, em vez de
// todos dividirem uma cota só).
function temaRaizSRS(tema) {
    return (tema || "").split("::")[0];
}
function limiteNovosParaTemaRaiz(temaRaiz) {
    const limites = dados.srsLimitesNovosPorTema || {};
    const valor = limites[temaRaiz];
    return (typeof valor === "number") ? valor : (dados.srsLimiteNovosPorDia ?? 20);
}
// Mesma ideia de contarNovosEstudadosHoje, mas agrupado por tema-raiz — usa o tema ATUAL do card (via
// dados.srsItems) pra cada entrada do log, então cards já excluídos (cujo log também já foi removido,
// ver removerEntradasLogSRS) simplesmente não aparecem em nenhum grupo.
function contarNovosEstudadosHojePorTemaRaiz() {
    const hojeData = hojeISO();
    const temaRaizPorId = new Map(dados.srsItems.map(i => [i.id, temaRaizSRS(i.tema)]));
    const contagem = new Map();
    dados.srsRevisoesLog.forEach(r => {
        if (r.data !== hojeData || r.intervalo_anterior !== 0) return;
        const temaRaiz = temaRaizPorId.get(r.cardId);
        if (temaRaiz === undefined) return;
        contagem.set(temaRaiz, (contagem.get(temaRaiz) || 0) + 1);
    });
    return contagem;
}
function obterTemasRaizConhecidosSRS() {
    return [...new Set([...srsTemasConhecidos].map(temaRaizSRS))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
function abrirModalLimitesNovosSRS() {
    if (!dados.srsLimitesNovosPorTema) dados.srsLimitesNovosPorTema = {};
    renderizarModalLimitesNovosSRS();
    document.getElementById("srs-limites-novos-modal").classList.remove("modal-oculto");
}
function fecharModalLimitesNovosSRS() {
    document.getElementById("srs-limites-novos-modal").classList.add("modal-oculto");
}
function renderizarModalLimitesNovosSRS() {
    const container = document.getElementById("srs-limites-novos-lista");
    if (!container) return;
    const temasRaiz = obterTemasRaizConhecidosSRS();
    if (temasRaiz.length === 0) { container.innerHTML = "<p class='biblioteca-vazio'>Nenhum tema cadastrado ainda.</p>"; return; }
    const contagemHoje = contarNovosEstudadosHojePorTemaRaiz();
    const overrides = dados.srsLimitesNovosPorTema || {};
    container.innerHTML = temasRaiz.map(temaRaiz => {
        const temOverride = typeof overrides[temaRaiz] === "number";
        const valor = limiteNovosParaTemaRaiz(temaRaiz);
        const hoje = contagemHoje.get(temaRaiz) || 0;
        const nomeAttr = escaparAtributoHtml(temaRaiz);
        return `<div class="srs-limite-tema-linha">
            <span class="srs-limite-tema-nome" title="${nomeAttr}">${escaparHtml(temaRaiz)}</span>
            <span class="srs-limite-tema-contagem">${hoje}/${valor} hoje</span>
            <input type="number" min="0" class="input-mini" value="${valor}" onchange="atualizarLimiteNovosTemaSRS('${nomeAttr}', this.value)">
            ${temOverride ? `<button class="btn-link-pequeno" onclick="restaurarLimitePadraoTemaSRS('${nomeAttr}')">usar padrão</button>` : ""}
        </div>`;
    }).join("");
}
function atualizarLimiteNovosTemaSRS(temaRaiz, valor) {
    const n = parseInt(valor, 10);
    if (!dados.srsLimitesNovosPorTema) dados.srsLimitesNovosPorTema = {};
    dados.srsLimitesNovosPorTema[temaRaiz] = (isNaN(n) || n < 0) ? 0 : n;
    salvar();
    renderizarModalLimitesNovosSRS();
}
function restaurarLimitePadraoTemaSRS(temaRaiz) {
    if (dados.srsLimitesNovosPorTema) delete dados.srsLimitesNovosPorTema[temaRaiz];
    salvar();
    renderizarModalLimitesNovosSRS();
}
function removerCardSRS(id) {
    if (!confirm("Excluir este card do deck?")) return;
    const card = dados.srsItems.find(i => i.id === id);
    Promise.resolve(card ? excluirMidiasDoCardSRS(card) : null).finally(() => {
        dados.srsItems = dados.srsItems.filter(i => i.id !== id);
        removerEntradasLogSRS(new Set([id]));
        srsItemsAlterado = true;
        salvar();
    });
}

// NOVO: cards importados do Anki (pipeline com template, ver converterNotaComTemplateAnki) guardam
// DUAS versões de cada lado — o texto puro (subtema/resposta, mantido "por compatibilidade": busca,
// exportação, ESTA lista) e um HTML rico (frenteTemplateHtml/camposFrente pra pergunta,
// versoTemplateHtml/camposVerso pra resposta) que reproduz o template original e TEM PRIORIDADE na
// tela de revisão de verdade (ver renderizarCardNaAreaRevisao: primeiro tenta *TemplateHtml, depois
// camposFrente/camposVerso, só cai no texto puro se nenhum dos dois existir). Editar só o texto puro
// sem limpar a versão rica fazia a correção aparecer em todo canto que lê subtema/resposta direto
// (esta lista, busca, backup) MENOS na revisão — exatamente onde a pessoa via o conteúdo de verdade,
// então a correção "sumia" ao rever o card. A mídia desse lado não se perde ao limpar a versão rica:
// ela também é espelhada nos campos antigos (imagemRespostaId/midiaRespostaId etc, ver
// aplicarMidiasExtraidasNoCard), que exibirImagensRevisaoAtual volta a usar assim que o HTML rico
// correspondente some.
function limparCampoRicoAnkiAoEditar(item, lado) {
    if (lado === 'frente') { delete item.frenteTemplateHtml; delete item.camposFrente; }
    else if (lado === 'resposta') { delete item.versoTemplateHtml; delete item.camposVerso; }
}

function editarCampoSRS(id, campo, valor) {
    const item = dados.srsItems.find(i => i.id === id);
    if (!item) return;
    const valorLimpo = (valor || "").trim();
    if (campo === 'resposta' && (valorLimpo === '' || valorLimpo === '(sem resposta — clique para adicionar)')) {
        item.resposta = "";
        limparCampoRicoAnkiAoEditar(item, 'resposta');
        srsItemsAlterado = true; salvar(); return;
    }
    if ((campo === 'tema' || campo === 'subtema') && valorLimpo === '') { salvar(); return; } // não permite ficar vazio
    item[campo] = valorLimpo;
    if (campo === 'subtema') limparCampoRicoAnkiAoEditar(item, 'frente');
    if (campo === 'resposta') limparCampoRicoAnkiAoEditar(item, 'resposta');
    srsItemsAlterado = true;
    salvar();
}

function atualizarEstatisticasSRS() {
    const el = document.getElementById("srs-estatisticas");
    if (!el) return;
    const total = dados.srsItems.length;
    const hojeData = hojeISO();
    const paraHoje = dados.srsItems.filter(i => i.data_proxima_revisao <= hojeData).length;
    const dominados = dados.srsItems.filter(i => i.intervalo_atual > 30).length;
    // NOVO: o limite de novos agora é por tema-raiz (ver limiteNovosParaTemaRaiz), então um "X/Y" único
    // não faz mais sentido aqui — cada tema tem seu próprio Y. Essa linha só mostra o total de novos
    // estudados hoje somando todos os temas; o detalhe por tema fica no modal "⚙️ Limites por tema".
    const novosHoje = contarNovosEstudadosHoje();
    // NOVO: duas medidas diferentes sobre dados.srsRevisoesLog — "revisões" conta toda vez que você
    // respondeu Difícil/Bom/Fácil (revisar o mesmo card 5x soma 5), "cards únicos" conta cada card só
    // 1x não importa quantas vezes foi revisado (dedup por cardId via Set). Como o log já perde as
    // entradas de cards excluídos (ver removerEntradasLogSRS), as duas contagens caem junto quando um
    // tema é excluído — comportamento esperado, não um bug.
    const totalRevisoes = dados.srsRevisoesLog.length;
    const cardsUnicosRevisados = new Set(dados.srsRevisoesLog.map(r => r.cardId)).size;
    el.innerText = `${total} card(s) no total · ${paraHoje} para revisar hoje · ${dominados} dominado(s) (intervalo > 30 dias) · ${novosHoje} novo(s) hoje · ${totalRevisoes} revisão(ões) no total · ${cardsUnicosRevisados} card(s) único(s) já revisado(s)`;
}

function atualizarLimiteNovosSRS(valor) {
    const n = parseInt(valor, 10);
    dados.srsLimiteNovosPorDia = (isNaN(n) || n < 0) ? 0 : n;
    salvar(); // salvar() já dispara atualizar() -> carregarRevisaoSRS()/atualizarEstatisticasSRS() com o novo limite padrão
}

// NOVO: com decks grandes (milhares de cards importados do Anki), renderizar a lista "Deck Completo"
// inteira de uma vez só cria tantos elementos DOM que só TROCAR de aba já travava a página por vários
// segundos — a lista fica com display:none enquanto a aba não está ativa, e o navegador precisa
// desenhar/posicionar tudo de uma vez assim que ela fica visível, mesmo sem nenhum JS rodando nesse
// momento (chegava a ~2.3s só nisso com um deck de 4400+ cards). Pagina a exibição (um pedaço por
// vez) pra manter o número de elementos no DOM sob controle, independente do tamanho do deck.
let srsListaPaginaAtual = 1;
const SRS_LISTA_TAMANHO_PAGINA = 100;
function mudarPaginaListaSRS(delta) {
    srsListaPaginaAtual += delta;
    renderizarListaSRS();
    document.getElementById("lista-srs-completa")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// NOVO: ids dos cards revisados HOJE, sem repetir (um card revisado 3x hoje conta 1 vez) — usado pelo
// filtro "Mostrar só revisados hoje" do Deck Completo. Reaproveita dados.srsRevisoesLog, a mesma fonte
// já usada nas estatísticas de total de revisões/cards únicos.
function idsCardsRevisadosHoje() {
    const hojeData = hojeISO();
    return new Set(dados.srsRevisoesLog.filter(r => r.data === hojeData).map(r => r.cardId));
}

// Data (formatada dd/mm/aaaa) da última vez que ESSE card foi revisado antes de agora — null quando
// nunca foi revisado (card novo, ou importado do Anki e ainda não revisado aqui: o histórico de
// revisão de dentro do Anki não é importado, só o que acontece a partir daqui). Usa dataHora (não só
// "data") pra desempatar corretamente revisões feitas no mesmo dia. Preview não grava em
// dados.srsRevisoesLog (ver processarRevisaoSRS/visualizarCardSRS), então nunca altera esse valor.
function dataUltimaRevisaoAnterior(cardId) {
    const revisoes = dados.srsRevisoesLog.filter(r => r.cardId === cardId);
    if (revisoes.length === 0) return null;
    const maisRecente = revisoes.reduce((a, b) => (a.dataHora > b.dataHora ? a : b));
    return new Date(maisRecente.dataHora).toLocaleDateString("pt-BR");
}

let srsListaFiltroRevisadosHoje = false;
function alternarFiltroRevisadosHojeSRS() {
    srsListaFiltroRevisadosHoje = !srsListaFiltroRevisadosHoje;
    srsListaPaginaAtual = 1;
    renderizarListaSRS();
}
function renderizarListaSRS() {
    const lista = document.getElementById("lista-srs-completa");
    if(!lista) return;
    if (elementoEmEdicaoDentroDe("lista-srs-completa")) return; // não reconstrói enquanto edita um card aqui
    dados.srsItems.sort((a,b) => a.tema.localeCompare(b.tema));

    // NOVO: filtro "Mostrar só revisados hoje" — aplica ANTES da paginação, então o resto da função
    // (contagem de páginas, texto "X cards no total") já opera sobre o conjunto filtrado sem precisar
    // saber que o filtro existe.
    const itensBase = srsListaFiltroRevisadosHoje
        ? dados.srsItems.filter(i => idsCardsRevisadosHoje().has(i.id))
        : dados.srsItems;

    const btnFiltro = document.getElementById("btn-filtro-revisados-hoje-srs");
    if (btnFiltro) {
        const qtdHoje = idsCardsRevisadosHoje().size;
        btnFiltro.textContent = srsListaFiltroRevisadosHoje
            ? `✅ Mostrando só revisados hoje (${qtdHoje}) — clique pra ver todos`
            : `👁️ Mostrar só revisados hoje (${qtdHoje})`;
    }

    if (srsListaFiltroRevisadosHoje && itensBase.length === 0) {
        lista.innerHTML = "<p class='biblioteca-vazio'>Nenhum card revisado hoje ainda.</p>";
        return;
    }

    const totalPaginas = Math.max(1, Math.ceil(itensBase.length / SRS_LISTA_TAMANHO_PAGINA));
    if (srsListaPaginaAtual > totalPaginas) srsListaPaginaAtual = totalPaginas;
    if (srsListaPaginaAtual < 1) srsListaPaginaAtual = 1;
    const inicio = (srsListaPaginaAtual - 1) * SRS_LISTA_TAMANHO_PAGINA;
    const itensDaPagina = itensBase.slice(inicio, inicio + SRS_LISTA_TAMANHO_PAGINA);

    // NOVO: monta tudo num array e junta uma vez só no final, em vez de "lista.innerHTML += ..." a
    // cada card — esse padrão é O(n²) (o navegador reserializa/reparseia o HTML acumulado inteiro a
    // cada iteração), e ficava bem perceptível em decks grandes importados do Anki (centenas/milhares
    // de cards).
    const partesHtml = [];
    itensDaPagina.forEach(item => {
        const partesData = item.data_proxima_revisao.split('-');
        const ehCloze = item.tipo === "cloze" && item.clozePartes;
        let corpoHtml;
        if (ehCloze) {
            let fraseHtml = "";
            item.clozePartes.forEach(seg => {
                const texto = obterTextoSegmentoCloze(seg);
                fraseHtml += seg.lacuna ? `<span class="cloze-palavra-lista">${escaparHtml(texto)}</span>` : escaparHtml(texto);
            });
            corpoHtml = `<strong>🕳 ${fraseHtml}</strong><div style="font-size:0.85em; color:var(--text-secondary); margin-top:4px;">Resposta: ${escaparComHtmlProtegido(item.resposta)} <button class="btn-editar-cloze" onclick="carregarCardParaEdicao(${item.id})" title="Editar lacunas">✏️ Editar</button></div>`;
        } else {
            const respostaTxt = item.resposta ? escaparComHtmlProtegido(item.resposta) : '(sem resposta — clique para adicionar)';
            const temImagem = item.imagemPerguntaId || item.imagemRespostaId;
            corpoHtml = `<strong contenteditable="true" onblur="editarCampoSRS(${item.id}, 'subtema', this.innerText)">${escaparComHtmlProtegido(item.subtema)}</strong>${temImagem ? ' <span title="Este card tem imagem">🖼️</span>' : ''}<div style="font-size:0.85em; color:var(--text-secondary); margin-top:4px;" contenteditable="true" onblur="editarCampoSRS(${item.id}, 'resposta', this.innerText)">${respostaTxt}</div>`;
        }
        partesHtml.push(`<div class="srs-item-mini"><div style="flex:1;"><input class="srs-tag-input" list="lista-temas-srs" value="${escaparHtml(item.tema)}" onblur="editarCampoSRS(${item.id}, 'tema', this.value)"><br>${corpoHtml}</div><div style="text-align:right;"><div style="font-size:0.8em; color:var(--text-secondary); white-space:nowrap;">Rev: ${partesData[2]}/${partesData[1]}</div><button class="btn-preview-card-srs" onclick="visualizarCardSRS(${item.id})" title="Pré-visualizar como esse card é exibido (não conta para o histórico)">👁️</button><button onclick="removerCardSRS(${item.id})" style="background:none; color:var(--danger-color); padding:0; font-size:1.2em;">&times;</button></div></div>`);
    });

    if (totalPaginas > 1) {
        partesHtml.push(`<div class="srs-lista-paginacao">
            <button onclick="mudarPaginaListaSRS(-1)" ${srsListaPaginaAtual === 1 ? "disabled" : ""}>◀ Anterior</button>
            <span>Página ${srsListaPaginaAtual} de ${totalPaginas} (${itensBase.length} card(s))</span>
            <button onclick="mudarPaginaListaSRS(1)" ${srsListaPaginaAtual === totalPaginas ? "disabled" : ""}>Próxima ▶</button>
        </div>`);
    }

    lista.innerHTML = partesHtml.join("");
}

/* === BIBLIOTECA DE LIVROS (IndexedDB + PDF.js + epub.js) === */

// --- Camada de armazenamento (IndexedDB guarda os arquivos; localStorage guarda só os metadados) ---
const BIBLIOTECA_DB_NAME = "bibliotecaPDF";
const BIBLIOTECA_DB_VERSION = 1;
const BIBLIOTECA_STORE_NAME = "arquivos";
let dbBibliotecaInstance = null;
let dbBibliotecaPromise = null;

// NOVO: cacheava só a INSTÂNCIA resolvida (dbBibliotecaInstance), não a promise em andamento — várias
// chamadas concorrentes ANTES da 1ª conexão terminar (ex: vários arquivos de livro carregados ao mesmo
// tempo) viam dbBibliotecaInstance ainda nulo e cada uma abria sua PRÓPRIA conexão com indexedDB.open(),
// deixando as conexões extras órfãs (nunca fechadas) por trás da que acabou vencendo a corrida. Cachear
// a promise em si faz qualquer chamada concorrente reaproveitar a MESMA conexão sendo aberta.
function abrirDBBiblioteca() {
    if (dbBibliotecaPromise) return dbBibliotecaPromise;
    dbBibliotecaPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(BIBLIOTECA_DB_NAME, BIBLIOTECA_DB_VERSION);
        request.onupgradeneeded = function(e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(BIBLIOTECA_STORE_NAME)) {
                db.createObjectStore(BIBLIOTECA_STORE_NAME);
            }
        };
        request.onsuccess = function(e) { dbBibliotecaInstance = e.target.result; resolve(dbBibliotecaInstance); };
        request.onerror = function(e) { dbBibliotecaPromise = null; reject(e); }; // permite tentar de novo numa próxima chamada
    });
    return dbBibliotecaPromise;
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
let dbImagensSRSPromise = null;

// NOVO: ver comentário equivalente em abrirDBBiblioteca — cacheia a PROMISE em andamento, não só a
// instância já resolvida, pra chamadas concorrentes (ex: existeImagemLocalSRS rodando em paralelo
// irrestrito sobre milhares de IDs, ver processarMidiasSRSEmLotesComChecagemPrevia) reaproveitarem a
// MESMA conexão em vez de cada uma abrir a sua e deixar o resto órfão.
function abrirDBImagensSRS() {
    if (dbImagensSRSPromise) return dbImagensSRSPromise;
    dbImagensSRSPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(IMAGENS_SRS_DB_NAME, IMAGENS_SRS_DB_VERSION);
        request.onupgradeneeded = function(e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IMAGENS_SRS_STORE_NAME)) {
                db.createObjectStore(IMAGENS_SRS_STORE_NAME);
            }
        };
        request.onsuccess = function(e) { dbImagensSRSInstance = e.target.result; resolve(dbImagensSRSInstance); };
        request.onerror = function(e) { dbImagensSRSPromise = null; reject(e); };
    });
    return dbImagensSRSPromise;
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
// NOVO: getKey() (não get()) — confirma se a chave existe SEM materializar o blob inteiro em memória.
// Usado pra separar "essa mídia existe localmente?" (barato, seguro rodar em paralelo irrestrito) do
// carregamento de verdade (que só vale a pena pra quem realmente existe) — ver
// processarMidiasSRSEmLotesComChecagemPrevia, seção de sincronização com o Drive.
function existeImagemLocalSRS(id) {
    return abrirDBImagensSRS().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(IMAGENS_SRS_STORE_NAME, "readonly");
        const req = tx.objectStore(IMAGENS_SRS_STORE_NAME).getKey(id);
        req.onsuccess = () => resolve(req.result !== undefined);
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

// === CARDS DO SRS (dados.srsItems) — mesmo padrão de armazenamento acima, banco separado ===
// NOVO: dados.srsItems ficava embutido no JSON gigante do localStorage (guardado inteiro em toda
// salvar()) — um deck grande do Anki importado (milhares de cards com HTML rico por campo) já passa
// dos ~5-10MB de cota do localStorage por si só, travando TODO salvar() do app inteiro (RPG,
// finanças etc. também), não só o SRS. Move só esse array pro IndexedDB (cota muito maior), guardado
// como um valor só (o array inteiro, sob uma chave fixa) — não precisa granularidade por card, é a
// mesma forma como ele já vive hoje dentro do JSON grande. dados.srsItems continua sendo, em tempo de
// execução, um array JS comum e totalmente síncrono (ver window.onload, que hidrata ele a partir
// daqui ANTES da primeira atualizar()) — só a persistência em disco muda, nenhum dos vários lugares
// que já leem/filtram/ordenam esse array precisa mudar.
const SRS_CARDS_DB_NAME = "srsCardsDB";
const SRS_CARDS_DB_VERSION = 1;
const SRS_CARDS_STORE_NAME = "cards";
const SRS_CARDS_CHAVE = "todos";
let dbSrsCardsInstance = null;
let dbSrsCardsPromise = null;

// NOVO: ver comentário equivalente em abrirDBBiblioteca/abrirDBImagensSRS.
function abrirDBSrsCards() {
    if (dbSrsCardsPromise) return dbSrsCardsPromise;
    dbSrsCardsPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(SRS_CARDS_DB_NAME, SRS_CARDS_DB_VERSION);
        request.onupgradeneeded = function(e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(SRS_CARDS_STORE_NAME)) {
                db.createObjectStore(SRS_CARDS_STORE_NAME);
            }
        };
        request.onsuccess = function(e) { dbSrsCardsInstance = e.target.result; resolve(dbSrsCardsInstance); };
        request.onerror = function(e) { dbSrsCardsPromise = null; reject(e); };
    });
    return dbSrsCardsPromise;
}
function salvarSrsItemsIndexedDB(itens) {
    return abrirDBSrsCards().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(SRS_CARDS_STORE_NAME, "readwrite");
        tx.objectStore(SRS_CARDS_STORE_NAME).put(itens, SRS_CARDS_CHAVE);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
    }));
}
// Resolve undefined se dados.srsItems nunca foi salvo aqui ainda (instalação nova, ou usuário
// migrando de uma versão anterior a essa mudança — nesse caso window.onload mantém o valor que já
// veio populado do localStorage em vez de sobrescrever com vazio).
function carregarSrsItemsIndexedDB() {
    return abrirDBSrsCards().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(SRS_CARDS_STORE_NAME, "readonly");
        const req = tx.objectStore(SRS_CARDS_STORE_NAME).get(SRS_CARDS_CHAVE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e);
    }));
}
function limparSrsItemsIndexedDB() {
    return abrirDBSrsCards().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(SRS_CARDS_STORE_NAME, "readwrite");
        tx.objectStore(SRS_CARDS_STORE_NAME).delete(SRS_CARDS_CHAVE);
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

// Como escaparHtml() escapa tudo (inclusive quebras de linha, que HTML ignora dentro de uma div comum),
// um texto com "\n" (ex: resposta de um card SRS com vários campos combinados) ficava todo espremido
// numa linha só. Usar isso em vez de escaparHtml() sempre que o texto puder ter mais de uma linha.
function escaparHtmlComQuebras(texto) {
    return escaparHtml(texto).replace(/\n/g, "<br>");
}

// Mesma ideia de escaparHtmlComQuebras, mas preservando os trechos já "protegidos" (spans de hover de
// pinyin, caixas expansíveis de hint do Anki) — escapa normalmente o texto ao redor, sem tocar no HTML
// seguro que a gente mesmo gerou.
function escaparComHtmlProtegido(texto) {
    const bruto = texto == null ? "" : String(texto);
    return aplicarForaDosBlocosProtegidos(bruto, escaparHtml).replace(/\n/g, "<br>");
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
                    inicializarZoomCbz();

                    renderizarPaginaCBZ(leitorPaginaAtual);
                });
        }).catch(err => { console.error(err); alert("Não foi possível abrir este CBZ. Verifique se o arquivo não está corrompido."); });
    });
}

function renderizarPaginaCBZ(numPagina) {
    if (!leitorCbzPaginas.length || leitorRenderizando) return;
    leitorRenderizando = true;
    resetarZoomCbz(); // cada página começa do zero — zoom de uma página não deveria "vazar" pra próxima
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

// ============================================================
// === ZOOM E PAN NA PÁGINA DO CBZ ===
// ============================================================
// A imagem tem max-width:100% pra caber inteira na tela — então o zoom NATIVO do navegador (Ctrl+scroll,
// pinça) reescala a página toda junto, e a imagem "volta a caber" de novo, sem nunca ampliar só um
// trecho. Aqui o zoom é aplicado via CSS transform direto na <img>, independente do layout da página:
// dá pra ampliar um balão de texto pequeno e arrastar (mouse) ou usar pinça (touch) pra navegar nele.
const CBZ_ZOOM_MIN = 1, CBZ_ZOOM_MAX = 4, CBZ_ZOOM_PASSO = 0.5;
let cbzZoomAtual = 1, cbzPanX = 0, cbzPanY = 0;
let cbzPonteirosAtivos = new Map(); // pointerId -> {x, y}, até 2 simultâneos (pinça)
let cbzArrastando = false, cbzArrastoOrigemX = 0, cbzArrastoOrigemY = 0, cbzPanOrigemX = 0, cbzPanOrigemY = 0;
let cbzPincaDistanciaInicial = 0, cbzPincaZoomInicial = 1;

function aplicarTransformCbz() {
    const img = document.getElementById("cbz-imagem");
    if (!img) return;
    img.style.transform = `translate(${cbzPanX}px, ${cbzPanY}px) scale(${cbzZoomAtual})`;
    const nivelEl = document.getElementById("cbz-zoom-nivel");
    if (nivelEl) nivelEl.innerText = Math.round(cbzZoomAtual * 100) + "%";
}

function resetarZoomCbz() {
    cbzZoomAtual = 1;
    cbzPanX = 0;
    cbzPanY = 0;
    aplicarTransformCbz();
}

// Aplica um novo zoom mantendo o ponto (mx, my) — em coordenadas do #cbz-viewer — fixo na tela, pra dar
// de fato pra "ampliar" o trecho embaixo do cursor/dedo em vez de reescalar tudo a partir do canto.
function zoomEmPontoCbz(mx, my, novoZoom) {
    novoZoom = Math.min(CBZ_ZOOM_MAX, Math.max(CBZ_ZOOM_MIN, novoZoom));
    if (novoZoom === cbzZoomAtual) return;
    const fator = novoZoom / cbzZoomAtual;
    cbzPanX = mx - fator * (mx - cbzPanX);
    cbzPanY = my - fator * (my - cbzPanY);
    cbzZoomAtual = novoZoom;
    if (cbzZoomAtual === CBZ_ZOOM_MIN) { cbzPanX = 0; cbzPanY = 0; } // no mínimo, sempre centralizado
    aplicarTransformCbz();
}

function zoomCbzBotao(direcao) {
    const container = document.getElementById("cbz-viewer");
    const rect = container.getBoundingClientRect();
    zoomEmPontoCbz(rect.width / 2, rect.height / 2, cbzZoomAtual + direcao * CBZ_ZOOM_PASSO);
}

function inicializarZoomCbz() {
    const container = document.getElementById("cbz-viewer");
    const img = document.getElementById("cbz-imagem");
    if (!container || !img || container.dataset.zoomInicializado) return;
    container.dataset.zoomInicializado = "1";

    container.addEventListener("wheel", e => {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        zoomEmPontoCbz(mx, my, cbzZoomAtual + (e.deltaY < 0 ? CBZ_ZOOM_PASSO : -CBZ_ZOOM_PASSO));
    }, { passive: false });

    container.addEventListener("dblclick", e => {
        if (e.target.closest(".cbz-zoom-controles")) return;
        const rect = container.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        zoomEmPontoCbz(mx, my, cbzZoomAtual > CBZ_ZOOM_MIN ? CBZ_ZOOM_MIN : 2.5);
    });

    // pointermove/pointerup ficam no window (não em setPointerCapture do container): assim o arraste
    // continua funcionando direito mesmo se o ponteiro sair um pouco da área da imagem no meio do
    // gesto — comportamento normal de mouse/dedo real, sem depender da API de captura de ponteiro.
    container.addEventListener("pointerdown", e => {
        // sem isso, um toque nos botões de +/-/reset (que ficam dentro do mesmo container, por cima da
        // imagem) também é capturado aqui como início de arraste/pinça, e o clique do botão nunca chega
        // a disparar.
        if (e.target.closest(".cbz-zoom-controles")) return;
        e.preventDefault(); // reforça o draggable=false do <img> — sem isso o navegador pode tentar iniciar o arraste nativo da imagem em vez do pan customizado
        cbzPonteirosAtivos.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (cbzPonteirosAtivos.size === 2) {
            const pontos = Array.from(cbzPonteirosAtivos.values());
            cbzPincaDistanciaInicial = Math.hypot(pontos[0].x - pontos[1].x, pontos[0].y - pontos[1].y);
            cbzPincaZoomInicial = cbzZoomAtual;
            cbzArrastando = false;
        } else if (cbzPonteirosAtivos.size === 1 && cbzZoomAtual > CBZ_ZOOM_MIN) {
            cbzArrastando = true;
            cbzArrastoOrigemX = e.clientX; cbzArrastoOrigemY = e.clientY;
            cbzPanOrigemX = cbzPanX; cbzPanOrigemY = cbzPanY;
            img.classList.add("cbz-arrastando");
        }
    });

    window.addEventListener("pointermove", e => {
        if (!cbzPonteirosAtivos.has(e.pointerId)) return;
        cbzPonteirosAtivos.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (cbzPonteirosAtivos.size === 2 && cbzPincaDistanciaInicial > 0) {
            const pontos = Array.from(cbzPonteirosAtivos.values());
            const distanciaAtual = Math.hypot(pontos[0].x - pontos[1].x, pontos[0].y - pontos[1].y);
            const rect = container.getBoundingClientRect();
            const mx = (pontos[0].x + pontos[1].x) / 2 - rect.left;
            const my = (pontos[0].y + pontos[1].y) / 2 - rect.top;
            zoomEmPontoCbz(mx, my, cbzPincaZoomInicial * (distanciaAtual / cbzPincaDistanciaInicial));
        } else if (cbzArrastando) {
            cbzPanX = cbzPanOrigemX + (e.clientX - cbzArrastoOrigemX);
            cbzPanY = cbzPanOrigemY + (e.clientY - cbzArrastoOrigemY);
            aplicarTransformCbz();
        }
    });

    const soltarPonteiroCbz = e => {
        if (!cbzPonteirosAtivos.has(e.pointerId)) return;
        cbzPonteirosAtivos.delete(e.pointerId);
        if (cbzPonteirosAtivos.size < 2) cbzPincaDistanciaInicial = 0;
        if (cbzPonteirosAtivos.size === 0) { cbzArrastando = false; img.classList.remove("cbz-arrastando"); }
    };
    window.addEventListener("pointerup", soltarPonteiroCbz);
    window.addEventListener("pointercancel", soltarPonteiroCbz);
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
        srsItemsAlterado = true;
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

    renderizarChefoes();

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
            let html = `<div class="bloco-categoria"><h3>${escaparHtml(nomeCat)}</h3><table class='tabela-checklist'><thead><tr><th>✔️</th><th>Missão</th><th>Pts / ❤️ Cura</th><th>Atributos</th><th>Recorrência</th><th>Chefão</th><th>Ação</th></tr></thead><tbody>`;
            categoriasAgrupadas[nomeCat].forEach(item => {
                                let pontosEfetivos = calcularPontosEscalonados(item);
                let healAmount = Math.ceil(pontosEfetivos / 2) || 1;
                let diasAtraso = item.diasSeguidosIncompleta || 0;
                // NOVO: enquanto travada, os campos editáveis da linha ficam contenteditable="false" e o
                // select/botão de excluir ficam disabled — feedback visual imediato, sem precisar tentar
                // editar e levar o alerta (que continua existindo como reforço, ver editarCampo etc.).
                const travada = estaMissaoTravada(item);
                let celulaPontos = diasAtraso > 0
                    ? `<span contenteditable="${travada ? "false" : "true"}" onblur="editarCampoNumerico(${item.originalIndex}, 'pontos', this.innerText)">${item.pontos}</span> <strong style="color:var(--danger-color);">(hoje: ${pontosEfetivos} XP)</strong> / +${healAmount} HP`
                    : `<span contenteditable="${travada ? "false" : "true"}" onblur="editarCampoNumerico(${item.originalIndex}, 'pontos', this.innerText)">${item.pontos}</span> XP / +${healAmount} HP`;
                let seloAtraso = diasAtraso > 0 ? `<br><span class="srs-tag" style="background:var(--danger-bg); color:var(--danger-color); margin-top:4px;">🔥 ${diasAtraso}x atrasada</span>` : "";
                let seloTravada = travada ? `<br><span class="srs-tag" style="background:#3a2a00; color:#e0a800; margin-top:4px;">🔒 até ${textoMissaoTravadaAte(item)}</span>` : "";
                let celulaChefao = `<select onchange="editarChefaoDaMissao(${item.originalIndex}, this.value)" ${travada ? "disabled" : ""}>${opcoesChefaoHtml(item.chefaoId)}</select>`;
                let botaoTrava = `<button onclick='travarMissao(${item.originalIndex})' title="${travada ? "Trancada até " + textoMissaoTravadaAte(item) : "Trancar essa missão"}">${travada ? "🔒" : "🔓"}</button>`;
                html += `<tr><td><input type='checkbox' ${item.feito ? 'checked' : ''} onchange='alternarItem(${item.originalIndex}, this.checked)'></td><td contenteditable="${travada ? "false" : "true"}" onblur="editarCampo(${item.originalIndex}, 'descricao', this.innerText)">${escaparHtml(item.descricao)}${seloTravada}</td><td>${celulaPontos}</td><td contenteditable="${travada ? "false" : "true"}" onblur="editarCampo(${item.originalIndex}, 'atributos', this.innerText)">${escaparHtml(item.atributos)}</td><td><span class="srs-tag">${textoRecorrencia(item)}</span>${seloAtraso}</td><td>${celulaChefao}</td><td>${botaoTrava}<button onclick='removerItem(${item.originalIndex})' ${travada ? "disabled" : ""}>🗑️</button></td></tr>`;
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
        else dados.historicoEstudos.forEach(s => areaHistorico.innerHTML += `<tr><td>${s.data}</td><td>${escaparHtml(s.materia || 'Geral')}</td><td>${s.duracao}</td></tr>`);
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
    const amanhaISO = dataParaIsoLocal(amanha);

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
// Garante que a categoria exista na lista (cria se ainda não tiver) e devolve o nome dela — usado pro
// lançamento automático do aporte, que precisa de uma categoria pra aparecer nos gráficos/orçamento.
function garantirCategoriaFinancas(nome) {
    if (!dados.financas.categorias.some(c => c.toLowerCase() === nome.toLowerCase())) {
        dados.financas.categorias.push(nome);
    }
    return nome;
}

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

    const registro = { id: Date.now(), data: hojeISO(), valorTotal: novoValor, aporte: aporte, rendimentoValor: rendimentoValor, rendimentoPercentual: rendimentoPercentual };

    // NOVO: um aporte é dinheiro saindo do seu saldo disponível pra virar investimento — antes isso não
    // gerava nenhum lançamento, então o valor aportado continuava "contando" no saldo geral como se
    // ainda pudesse ser gasto com outra coisa. Agora todo aporte cria uma saída correspondente,
    // vinculada a esse registro do histórico (pra poder desfazer os dois juntos, ver abaixo).
    if (aporte > 0) {
        const categoria = garantirCategoriaFinancas("Investimentos");
        const lancamento = { id: Date.now() + 1, data: hojeISO(), tipo: "saida", categoria: categoria, valor: aporte, descricao: "Aporte em investimentos" };
        dados.financas.lancamentos.unshift(lancamento);
        registro.lancamentoId = lancamento.id;
        verificarOrcamentosEstourados();
    }

    historico.push(registro);
    valorInput.value = "";
    aporteInput.value = "";
    salvar();
}
function removerUltimaAtualizacaoInvestimento() {
    const historico = dados.financas.investimentos.historico;
    if (historico.length === 0) return;
    if (!confirm("Remover a última atualização de investimento registrada? Se ela tiver um aporte vinculado, a saída correspondente no saldo também será removida.")) return;
    const registro = historico.pop();
    if (registro.lancamentoId) {
        dados.financas.lancamentos = dados.financas.lancamentos.filter(l => l.id !== registro.lancamentoId);
    }
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

// NOVO: nível de paralelismo ao processar vários arquivos de uma vez (mídia de card, PDF/EPUB da
// biblioteca, nota de um .apkg) — controla o tamanho do lote usado por processarArquivosBackupEmLotes
// E pelo importador de .apkg (ver TAMANHO_LOTE_IMPORTACAO em processarBancoAnki). Preferência POR
// APARELHO (localStorage direto, nunca dentro de "dados" — não faz sentido sincronizar isso entre
// aparelhos com capacidades diferentes, ex: celular mais potente que o notebook). "conservador" mantém
// o comportamento de sempre (os valores-base de cada função já foram calibrados nesse nível); os
// outros níveis multiplicam esse valor-base, preservando o equilíbrio relativo que cada função já tinha
// entre si (ex: notas de Anki, mais leves, sempre tiveram um lote-base maior que arquivo de backup).
const FATORES_NIVEL_PARALELISMO_ARQUIVOS = { conservador: 1, equilibrado: 3, agressivo: 8 };
function obterFatorParalelismoArquivos() {
    const nivel = localStorage.getItem("spp_nivel_paralelismo_arquivos") || "conservador";
    return FATORES_NIVEL_PARALELISMO_ARQUIVOS[nivel] || 1;
}
function definirNivelParalelismoArquivos(nivel) {
    if (!FATORES_NIVEL_PARALELISMO_ARQUIVOS[nivel]) return;
    localStorage.setItem("spp_nivel_paralelismo_arquivos", nivel);
}
function inicializarSelectNivelParalelismoArquivos() {
    const select = document.getElementById("select-nivel-paralelismo-arquivos");
    if (!select) return; // UI ainda não existe nessa página/versão
    select.value = localStorage.getItem("spp_nivel_paralelismo_arquivos") || "conservador";
}

// Processa uma lista de itens em lotes (em vez de todos de uma vez em paralelo) — evita ter vários
// arquivos grandes (PDFs, imagens de card) na memória ao mesmo tempo, o que trava/congela a aba em
// aparelhos com pouca RAM. Compartilhado entre gerar (export) e restaurar (import) o backup com
// livros, e entre elas e a sincronização de mídia — todas leem/escrevem arquivos potencialmente
// grandes. Tamanho do lote ajustável pelo usuário (ver FATORES_NIVEL_PARALELISMO_ARQUIVOS acima).
const TAMANHO_LOTE_ARQUIVOS_BACKUP_BASE = 3;
function processarArquivosBackupEmLotes(itens, processarItem) {
    const tamanhoLote = TAMANHO_LOTE_ARQUIVOS_BACKUP_BASE * obterFatorParalelismoArquivos();
    let indice = 0;
    function proximoLote() {
        if (indice >= itens.length) return Promise.resolve();
        const lote = itens.slice(indice, indice + tamanhoLote);
        indice += tamanhoLote;
        return Promise.all(lote.map(processarItem)).then(proximoLote);
    }
    return proximoLote();
}

// NOVO: separa a checagem "essa mídia existe localmente?" (existeImagemLocalSRS, via getKey — nunca
// materializa o blob, seguro rodar em paralelo IRRESTRITO sobre a lista inteira) do processamento de
// verdade (que só roda pra quem existe, ainda em lote via processarArquivosBackupEmLotes, protegendo a
// memória contra vários blobs grandes ao mesmo tempo). Sem essa separação, um ID de mídia que nem
// existe localmente ainda (comum num aparelho que baixa só sob demanda — ver
// carregarImagemSRSComFallbackDrive) ficava preso no mesmo limite de lote dos casos que precisam de
// trabalho de verdade, e a maioria das "rodadas" de espera não fazia nada útil. Usado tanto pela
// sincronização de mídia quanto pela parte de imagens do backup com livros — as duas percorrem a MESMA
// lista de IDs (todos os já referenciados pelos cards) e têm a mesma chance de a maioria não estar
// baixada localmente ainda.
function processarMidiasSRSEmLotesComChecagemPrevia(ids, marcarConcluido, processarExistente) {
    return Promise.all(ids.map(id =>
        existeImagemLocalSRS(id).then(existe => {
            if (existe) return id;
            marcarConcluido();
            return null;
        }).catch(() => { marcarConcluido(); return null; })
    )).then(resultados => {
        const existentes = resultados.filter(id => id !== null);
        return processarArquivosBackupEmLotes(existentes, id => processarExistente(id).finally(marcarConcluido));
    });
}

function gerarBackupComLivros(livrosParaIncluirArquivo) {
    // NOVO: também inclui os áudios/vídeos dos cards (e as imagens/mídias "extras" de cards com mais
    // de uma no mesmo lado) — antes só as imagens principais entravam no backup, então áudio se perdia
    // ao restaurar.
    const idsImagens = new Set();
    dados.srsItems.forEach(item => {
        todosIdsMidiaDoCardSRS(item).forEach(id => idsImagens.add(id));
    });

    if (livrosParaIncluirArquivo.length === 0 && idsImagens.size === 0) {
        alert("Não há arquivos de livro nem imagens de cards pra incluir nesse modo — gerando o backup só com os dados.");
        baixarBlobComoArquivo(new Blob([JSON.stringify(dados)], { type: "application/json" }), "backup_rpg_vida.json");
        return;
    }

    const zip = new JSZip();
    zip.file("dados.json", JSON.stringify(dados)); // metadados de TODOS os livros e cards, sempre — só o binário é seletivo
    const pastaLivros = zip.folder("livros");
    const pastaImagens = zip.folder("imagens_srs");

    // Total inclui a etapa final de compactação do zip (pesa como se fosse 1 "item" a mais na barra),
    // já que ela também pode demorar bastante em backups grandes.
    const totalArquivos = livrosParaIncluirArquivo.length + idsImagens.size;
    const totalEtapas = totalArquivos + 1;
    let etapasConcluidas = 0;
    mostrarProgressoOperacao("Gerando backup...", "💾");
    atualizarProgressoOperacao(0, totalEtapas, "💾", "Gerando backup...");
    const marcarEtapaConcluida = () => { etapasConcluidas++; atualizarProgressoOperacao(etapasConcluidas, totalEtapas, "💾", "Gerando backup..."); };

    processarArquivosBackupEmLotes(livrosParaIncluirArquivo, livro =>
        carregarArquivoLivro(livro.id).then(arrayBuffer => {
            if (arrayBuffer) pastaLivros.file(`${livro.id}.bin`, arrayBuffer);
        }).catch(() => {}).finally(marcarEtapaConcluida)
    )
        .then(() => processarMidiasSRSEmLotesComChecagemPrevia([...idsImagens], marcarEtapaConcluida, id =>
            carregarImagemSRS(id).then(blob => {
                if (blob) pastaImagens.file(`${id}.jpg`, blob);
            }).catch(() => {})
        ))
        // streamFiles: reduz o pico de memória do JSZip ao montar o zip final (não precisa saber o
        // tamanho comprimido de cada arquivo de antemão antes de escrevê-lo). onUpdate reporta o
        // progresso da compactação em si (última "etapa" da barra).
        .then(() => zip.generateAsync({ type: "blob", streamFiles: true }, metadata => {
            atualizarProgressoOperacao(totalArquivos + (metadata.percent / 100), totalEtapas, "💾", "Compactando backup...");
        }))
        .then(blob => { esconderProgressoOperacao(); baixarBlobComoArquivo(blob, "backup_rpg.zip"); })
        .catch(err => {
            console.error("Erro ao gerar backup com livros:", err);
            esconderProgressoOperacao();
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
                // NOVO: substituir "dados" inteiro troca dados.srsItems sem passar pelos pontos de
                // mutação normais (push/filter/edição) que marcam srsItemsAlterado — sem isso,
                // salvarDados() achava que os cards de SRS não tinham mudado e pulava a gravação no
                // IndexedDB, deixando o conteúdo ANTIGO (de antes da importação) lá. No reload logo
                // abaixo, esse conteúdo antigo era lido de volta e sobrescrevia silenciosamente os
                // cards recém-importados — o backup parecia "não pegar" pro lado do SRS.
                srsItemsAlterado = true;
                // NOVO: espera a gravação do SRS no IndexedDB terminar de verdade antes de recarregar
                // (ver comentário em salvarDados()) — recarregar cedo demais perdia os cards em silêncio
                // num backup grande, mesmo com o resto (RPG, finanças) intacto (localStorage é síncrono).
                salvar().then(() => location.reload());
            }
        } catch (err) { alert("Erro no arquivo."); }
    };
    r.readAsText(arquivo);
}

function importarBackupComLivros(arquivo) {
    if (!confirm("Substituir dados e restaurar os arquivos deste backup?")) return;

    // NOVO: barra de progresso (mesma infraestrutura do import de .apkg e do export desse mesmo
    // backup, ver gerarBackupComLivros) + restauração em lotes pequenos em vez de todos os livros e
    // imagens em paralelo de uma vez — sem isso, um .zip grande (várias dezenas/centenas de MB de PDF)
    // parecia travado: "dados" já tinha sido trocado na memória (por isso telas que leem direto dele,
    // como os gráficos de estatística, já mostravam o valor novo), mas nada tinha sido salvo de
    // verdade ainda, sem nenhum indício na tela de quanto faltava.
    mostrarProgressoOperacao("Lendo backup...", "📂");
    atualizarProgressoOperacao(0, 1, "📂", "Lendo backup...");

    JSZip.loadAsync(arquivo).then(zip => {
        const arquivoDados = zip.file("dados.json");
        if (!arquivoDados) throw new Error("BACKUP_SEM_DADOS_JSON");

        return arquivoDados.async("string").then(jsonTexto => {
            dados = JSON.parse(jsonTexto);
            // NOVO: mesmo motivo do importarDados() acima — substituir "dados" inteiro não passa
            // pelos pontos de mutação que marcam srsItemsAlterado, então salvarDados() pulava a
            // gravação do SRS no IndexedDB e o conteúdo antigo (de antes do backup) voltava no reload.
            srsItemsAlterado = true;

            const arquivosLivros = Object.keys(zip.files).filter(nome => nome.startsWith("livros/") && nome.toLowerCase().endsWith(".bin"));
            const arquivosImagens = Object.keys(zip.files).filter(nome => nome.startsWith("imagens_srs/") && nome.toLowerCase().endsWith(".jpg"));

            const totalArquivos = arquivosLivros.length + arquivosImagens.length;
            let arquivosConcluidos = 0;
            atualizarProgressoOperacao(0, Math.max(totalArquivos, 1), "📂", "Restaurando arquivos...");
            const marcarArquivoConcluido = () => {
                arquivosConcluidos++;
                atualizarProgressoOperacao(arquivosConcluidos, Math.max(totalArquivos, 1), "📂", "Restaurando arquivos...");
            };

            return processarArquivosBackupEmLotes(arquivosLivros, nomeArquivo => {
                const id = nomeArquivo.slice("livros/".length, -4); // tira o prefixo e a extensão ".bin"
                return zip.files[nomeArquivo].async("arraybuffer").then(buffer => salvarArquivoLivro(id, buffer)).finally(marcarArquivoConcluido);
            }).then(() => processarArquivosBackupEmLotes(arquivosImagens, nomeArquivo => {
                const id = nomeArquivo.slice("imagens_srs/".length, -4); // tira o prefixo e a extensão ".jpg"
                return zip.files[nomeArquivo].async("blob").then(blob => salvarImagemSRS(id, blob)).finally(marcarArquivoConcluido);
            }));
        });
    }).then(() => {
        // NOVO: espera a gravação do SRS no IndexedDB terminar de verdade antes de recarregar (ver
        // comentário em salvarDados()) — era exatamente isso que fazia os cards não aparecerem depois
        // de restaurar um backup grande (as centenas/milhares de cards), mesmo com o resto (RPG,
        // finanças, livros) restaurado corretamente: o reload cortava a gravação do IndexedDB no meio.
        return salvar().then(() => {
            esconderProgressoOperacao();
            alert("Backup restaurado com sucesso!");
            location.reload();
        });
    }).catch(err => {
        esconderProgressoOperacao();
        // NOVO: antes, um .zip sem dados.json dava o alert de "inválido" mas seguia em frente e
        // mostrava "restaurado com sucesso" logo em seguida (o "return" só saía do .then interno, a
        // cadeia inteira continuava) — agora um throw de verdade interrompe tudo e cai só aqui.
        if (err && err.message === "BACKUP_SEM_DADOS_JSON") {
            alert("Este .zip não parece ser um backup válido (falta o dados.json).");
            return;
        }
        console.error("Erro ao importar backup:", err);
        alert("Não foi possível importar este backup. Verifique se o arquivo não está corrompido.");
    });
}

// ============================================================
// === SINCRONIZAÇÃO COM GOOGLE DRIVE (opcional, por aparelho) ===
// ============================================================
// Sincroniza um único arquivo JSON no Drive do usuário (dados + srsItems, exatamente o que
// exportarSoDados() já baixa hoje) entre os aparelhos onde ele conectar a MESMA conta Google.
// Deliberadamente fora disso: PDFs da Biblioteca e imagens dos cards — nunca entram em "dados", não
// tem por que entrar aqui; continuam só no Exportar/Importar Backup manual.
//
// Escopo mínimo (drive.file): o app só acessa o arquivo que ele mesmo cria, nunca o Drive inteiro do
// usuário. O token de acesso fica só em memória (nunca em localStorage, que já guarda dado sensível
// do app) — some ao recarregar a página; tentarReconectarDriveAoCarregar tenta renovar em silêncio
// (sem popup) usando o consentimento já dado antes, e só volta a pedir clique se isso falhar.
const GOOGLE_CLIENT_ID = "117501646661-8eo6c40qfac39r4s8vb9sbr1dsc8n6ue.apps.googleusercontent.com"; // criado no Google Cloud Console ("Google Auth Platform" → Clientes)
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_DRIVE_ARQUIVO_NOME = "spp_sync.json";
const SYNC_DRIVE_DEBOUNCE_MS = 20000; // espera 20s sem nenhuma mudança nova antes de subir pro Drive
// NOVO: verificação periódica enquanto a aba fica aberta e conectada — sem isso, um aparelho parado
// (sem nenhuma edição local) nunca descobre sozinho que outro aparelho sincronizou algo mais novo,
// já que agendarSincronizacaoDrive só dispara em reação a uma mudança local (ver setInterval mais
// abaixo, perto de inicializarAppComSrsItems).
const SYNC_DRIVE_POLL_INTERVAL_MS = 120000; // a cada 2 minutos
// NOVO: prazo máximo que o carregamento da página espera o Drive responder antes de rodar
// resetDiario()/verificarGameOver() — ver aguardarChecagemInicialDoDrive.
const ESPERA_MAXIMA_CHECAGEM_DRIVE_INICIAL_MS = 5000;

let googleTokenClient = null;
let googleAccessToken = null;
let driveConectado = false;
let driveArquivoIdCache = null;
let driveUltimaSincronizacaoEm = null;
let driveSincronizando = false;
let syncDrivePendente = null;
let dadosRemotosPendentesConflito = null;

// Identifica de qual aparelho veio a última mudança (só informativo por enquanto, guardado no próprio
// payload sincronizado) — não é PII, é só um UUID aleatório sem ligação com o usuário.
function obterIdDispositivoSync() {
    let id = localStorage.getItem("spp_dispositivo_id");
    if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem("spp_dispositivo_id", id);
    }
    return id;
}

function inicializarGoogleTokenClient() {
    if (googleTokenClient) return true;
    if (typeof google === "undefined" || !google.accounts || !google.accounts.oauth2) return false;
    googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_DRIVE_SCOPE,
        callback: resposta => {
            if (resposta.error) { onFalhaConexaoDrive(resposta); return; }
            googleAccessToken = resposta.access_token;
            driveConectado = true;
            localStorage.setItem("spp_drive_auto_conectar", "1");
            atualizarUiSincronizacaoDrive();
            sincronizarComDrive();
        }
    });
    return true;
}

function onFalhaConexaoDrive(resposta) {
    driveConectado = false;
    googleAccessToken = null;
    // "interaction_required"/"immediate_failed" na tentativa SILENCIOSA são esperados (usuário nunca
    // conectou antes, ou revogou o acesso) — não é erro de verdade, só não dá pra reconectar sem clique.
    const esperadoNaTentativaSilenciosa = resposta && (resposta.error === "interaction_required" || resposta.error === "immediate_failed");
    if (!esperadoNaTentativaSilenciosa) console.error("Falha ao conectar ao Google Drive:", resposta && resposta.error);
    atualizarUiSincronizacaoDrive();
}

function conectarGoogleDrive(silencioso) {
    if (!inicializarGoogleTokenClient()) {
        if (!silencioso) alert("Não foi possível carregar o login do Google. Verifique sua conexão e tente de novo.");
        return;
    }
    googleTokenClient.requestAccessToken({ prompt: silencioso ? "" : "consent" });
}

function desconectarGoogleDrive() {
    if (googleAccessToken && typeof google !== "undefined" && google.accounts) {
        google.accounts.oauth2.revoke(googleAccessToken, () => {});
    }
    googleAccessToken = null;
    driveConectado = false;
    driveArquivoIdCache = null;
    localStorage.removeItem("spp_drive_auto_conectar");
    atualizarUiSincronizacaoDrive();
}

// Roda 1x no carregamento da página (ver inicializarAppComSrsItems) — só tenta se o usuário já tinha
// conectado antes nesse navegador; fica em silêncio (sem alert) se não conseguir reconectar sozinho.
function tentarReconectarDriveAoCarregar() {
    if (localStorage.getItem("spp_drive_auto_conectar") !== "1") return;
    aguardarGoogleCarregado(() => conectarGoogleDrive(true));
}

// NOVO: dá uma chance CURTA (no máximo "prazoMs") pro Drive reconectar e checar se existe uma versão
// mais nova em outro aparelho, ANTES de resetDiario()/verificarGameOver() rodarem (ver
// inicializarAppComSrsItems/rodarResetDiarioEGameOverUmaVez). O motivo: os dois processam SÓ o que já
// está salvo localmente e terminam chamando salvar(), que carimba _syncMeta.ultimaModificacaoEm = agora
// — se isso acontecesse ANTES de o app sequer ter consultado o Drive (como era antes dessa mudança), um
// aparelho pouco usado (ex: celular, quando o notebook é o principal) processava vários dias de
// dano/game over em cima de dados desatualizados e, ao carimbar esse timestamp "agora", passava a
// GANHAR a comparação de sincronização só por coincidência de horário — sobrescrevendo em silêncio o
// progresso real do outro aparelho no Drive, sem nunca mostrar o aviso de conflito. Resolve (nunca
// rejeita) assim que: (a) não há Drive conectado nesse navegador — retorna na hora, sem esperar nada;
// (b) a 1ª tentativa de reconexão + a sincronizarComDrive() automática que ela dispara já terminaram
// (sucesso, falha ou sem nada de novo); ou (c) o prazo estourou (rede lenta/offline) — nesse caso segue
// com o comportamento de sempre, sem travar o app esperando rede indefinidamente. Não atrasa o resto do
// app (tema, calendário, timer, a 1ª renderização de atualizar() em inicializarAppComSrsItems) — só o
// PAR resetDiario/verificarGameOver espera por essa promise.
function aguardarChecagemInicialDoDrive(prazoMs) {
    if (localStorage.getItem("spp_drive_auto_conectar") !== "1") return Promise.resolve();
    return new Promise(resolve => {
        const prazoFinal = Date.now() + prazoMs;
        let jaConectouUmaVez = false;
        function checar() {
            if (Date.now() >= prazoFinal) { resolve(); return; }
            if (driveConectado) {
                jaConectouUmaVez = true;
                if (!driveSincronizando) { resolve(); return; } // já conectou e a 1ª checagem já terminou
            } else if (jaConectouUmaVez) {
                resolve(); return; // conectou e caiu de novo nesse meio-tempo — não vale mais esperar
            }
            setTimeout(checar, 100);
        }
        tentarReconectarDriveAoCarregar();
        setTimeout(checar, 200); // dá um instante pro requestAccessToken silencioso dar o 1º passo
    });
}

function aguardarGoogleCarregado(callback, tentativas) {
    tentativas = tentativas || 0;
    if (typeof google !== "undefined" && google.accounts && google.accounts.oauth2) { callback(); return; }
    if (tentativas > 20) return; // ~10s tentando (ex: sem internet ainda no primeiro instante) — desiste
    setTimeout(() => aguardarGoogleCarregado(callback, tentativas + 1), 500);
}

// NOVO: o token de acesso do Google expira (~1h) — sem isso, depois de uma aba ficar aberta tempo
// suficiente, TODA chamada à API do Drive passava a responder 401, sincronizarComDrive() só logava o
// erro no console e a sincronização parava de funcionar em silêncio, com a UI continuando a mostrar
// "✅ Conectado" (driveConectado nunca virava false nesse caminho) — só um recarregamento manual da
// página resolvia. Dispara uma renovação silenciosa (reaproveita o token client já inicializado, mesmo
// fluxo de tentarReconectarDriveAoCarregar) e espera até ela terminar (o callback permanente registrado
// em inicializarGoogleTokenClient troca googleAccessToken sozinho) ou um prazo curto passar — não trava
// o app se o Google não responder. Não mexe em googleTokenClient.callback diretamente (ver
// aguardarChecagemInicialDoDrive, mesmo motivo: não é garantido que a lib respeite reatribuir isso).
function renovarTokenDriveEEsperar() {
    return new Promise(resolve => {
        const tokenAntes = googleAccessToken;
        conectarGoogleDrive(true);
        const prazoFinal = Date.now() + 8000;
        (function checar() {
            if (googleAccessToken !== tokenAntes || Date.now() >= prazoFinal) { resolve(); return; }
            setTimeout(checar, 150);
        })();
    });
}

function chamarApiDrive(url, opcoes, jaTentouRenovarToken) {
    // NOVO: cache "no-store" — sem isso, o navegador podia devolver uma resposta antiga guardada em
    // cache pra essa mesma URL (ex: o GET do arquivo de sincronização) em vez de buscar o conteúdo
    // realmente atual no Drive, fazendo o app achar que não tinha nada novo quando na verdade tinha.
    return fetch(url, Object.assign({ cache: "no-store" }, opcoes, {
        headers: Object.assign({ Authorization: `Bearer ${googleAccessToken}` }, (opcoes && opcoes.headers) || {})
    })).then(r => {
        // NOVO: token expirado — tenta renovar 1x (silenciosamente) e refaz a MESMA chamada antes de
        // desistir. Se a renovação falhar de verdade (revogado, sem sessão), onFalhaConexaoDrive (disparado
        // pelo próprio callback do token client) já marca driveConectado = false e atualiza a UI — a 2ª
        // tentativa aqui vai bater 401 de novo e o erro sobe normalmente pro .catch() de quem chamou.
        if (r.status === 401 && !jaTentouRenovarToken) {
            return renovarTokenDriveEEsperar().then(() => chamarApiDrive(url, opcoes, true));
        }
        if (!r.ok) throw new Error(`Drive API respondeu ${r.status}`);
        return r.status === 204 ? null : r.json();
    });
}

function buscarArquivoSyncDrive() {
    if (driveArquivoIdCache) return Promise.resolve(driveArquivoIdCache);
    const query = encodeURIComponent(`name='${GOOGLE_DRIVE_ARQUIVO_NOME}' and trashed=false`);
    return chamarApiDrive(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`).then(j => {
        driveArquivoIdCache = (j.files && j.files[0] && j.files[0].id) || null;
        return driveArquivoIdCache;
    });
}

function baixarConteudoDrive(fileId) {
    return chamarApiDrive(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
}

function enviarParaDrive(fileIdExistente, payload) {
    if (fileIdExistente) {
        return chamarApiDrive(`https://www.googleapis.com/upload/drive/v3/files/${fileIdExistente}?uploadType=media`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }).then(() => fileIdExistente);
    }
    const boundary = `sppsync${Date.now()}`;
    const metadata = { name: GOOGLE_DRIVE_ARQUIVO_NOME, mimeType: "application/json" };
    const corpo =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n--${boundary}--`;
    return chamarApiDrive("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body: corpo
    }).then(j => { driveArquivoIdCache = j.id; return j.id; });
}

// Aplica um payload baixado do Drive (mais novo que o local) — mesmo padrão de importarDados():
// substitui "dados" inteiro (já vem com srsItems dentro, igual o backup manual) e recarrega a página
// em vez de tentar remendar variáveis já cacheadas em memória com o valor novo.
function aplicarDadosRemotosDrive(remoto) {
    dados = remoto;
    srsItemsAlterado = true;
    // NOVO: mesmo cuidado de importarDados/importarBackupComLivros — espera a gravação do SRS no
    // IndexedDB terminar antes de recarregar, senão os cards vindos do Drive podiam se perder no reload.
    salvar().then(() => location.reload());
}

// Ponto central: decide se sobe (local mais novo) ou baixa (remoto mais novo), nunca as duas coisas na
// mesma chamada. Compara pelo timestamp gravado DENTRO do próprio payload (_syncMeta.ultimaModificacaoEm,
// atualizado em TODA salvarDados() — ver lá), não pela data de modificação do arquivo no Drive, pra não
// depender do relógio/latência da API.
function sincronizarComDrive() {
    if (!driveConectado || !googleAccessToken || driveSincronizando) return Promise.resolve();
    driveSincronizando = true;
    return buscarArquivoSyncDrive().then(fileId => {
        if (!fileId) return enviarParaDrive(null, dados);
        return baixarConteudoDrive(fileId).then(remoto => {
            const timestampRemoto = (remoto && remoto._syncMeta && remoto._syncMeta.ultimaModificacaoEm) || 0;
            const timestampLocal = (dados._syncMeta && dados._syncMeta.ultimaModificacaoEm) || 0;
            if (timestampRemoto > timestampLocal) { avisarConflitoSincronizacaoDrive(remoto); return; }
            return enviarParaDrive(fileId, dados);
        });
    }).then(() => {
        driveUltimaSincronizacaoEm = Date.now();
        atualizarUiSincronizacaoDrive();
    }).catch(err => {
        console.error("Sincronização com o Drive falhou:", err);
    }).finally(() => { driveSincronizando = false; });
}

// Chamado em TODA salvarDados() (ver lá) — cancela o agendamento anterior e só sincroniza de verdade
// depois de um período sem nenhuma mudança nova, pra não subir pro Drive a cada tecla/clique.
function agendarSincronizacaoDrive() {
    if (!driveConectado) return;
    clearTimeout(syncDrivePendente);
    syncDrivePendente = setTimeout(sincronizarComDrive, SYNC_DRIVE_DEBOUNCE_MS);
}

// NOVO: barra de progresso (mesma infraestrutura usada no import/export de backup) só aqui, no clique
// manual — as sincronizações automáticas (debounce de 20s, polling periódico, ao voltar pra aba)
// continuam silenciosas de propósito, pra não interromper o uso com um modal toda hora sem o usuário
// ter pedido. sincronizarComDrive() já trata falha internamente (nunca rejeita a promise), então o
// .finally() aqui sempre esconde o modal, sucesso ou erro.
function sincronizarComDriveAgora() {
    if (!driveConectado) { alert("Conecte o Google Drive primeiro."); return; }
    clearTimeout(syncDrivePendente);
    mostrarProgressoOperacao("Sincronizando com o Drive...", "🔄");
    atualizarProgressoOperacao(0, 1, "🔄", "Sincronizando...");
    sincronizarComDrive().finally(() => {
        atualizarProgressoOperacao(1, 1, "🔄", "Sincronizando...");
        esconderProgressoOperacao();
    });
}

// Nunca aplica/recarrega sozinho quando detecta uma versão remota mais nova — só mostra um aviso e
// deixa o usuário decidir (usarVersaoRemotaDrive/manterVersaoLocalDrive), pra não descartar em silêncio
// algo que ele esteja fazendo nessa aba agora.
function avisarConflitoSincronizacaoDrive(remoto) {
    dadosRemotosPendentesConflito = remoto;
    const banner = document.getElementById("drive-conflito-banner");
    if (banner) banner.classList.remove("oculto");
}
function usarVersaoRemotaDrive() {
    if (!dadosRemotosPendentesConflito) return;
    aplicarDadosRemotosDrive(dadosRemotosPendentesConflito);
}
function manterVersaoLocalDrive() {
    dadosRemotosPendentesConflito = null;
    const banner = document.getElementById("drive-conflito-banner");
    if (banner) banner.classList.add("oculto");
    // a versão local "ganha" a partir de agora -- sobrescreve a que estava no Drive com a de cá
    enviarParaDrive(driveArquivoIdCache, dados).catch(err => console.error("Falha ao subir a versão local pro Drive:", err));
    // NOVO: se resetDiario()/verificarGameOver() ficaram represados esperando essa decisão (ver
    // aguardarChecagemInicialDoDrive/inicializarAppComSrsItems), rodam agora que o usuário confirmou de
    // propósito que quer seguir com os dados locais mesmo assim. Não faz nada se já tinham rodado antes
    // (ver rodarResetDiarioEGameOverUmaVez) — ex: um conflito que apareceu bem depois, no meio da sessão.
    rodarResetDiarioEGameOverUmaVez();
}

function atualizarUiSincronizacaoDrive() {
    const status = document.getElementById("drive-sync-status");
    if (!status) return; // UI ainda não existe nessa página/versão
    const btnConectar = document.getElementById("btn-conectar-drive");
    const btnDesconectar = document.getElementById("btn-desconectar-drive");
    const btnSyncAgora = document.getElementById("btn-sincronizar-drive-agora");
    const btnSyncMidia = document.getElementById("btn-sincronizar-midia-drive");
    if (driveConectado) {
        const ultima = driveUltimaSincronizacaoEm ? new Date(driveUltimaSincronizacaoEm).toLocaleTimeString("pt-BR") : "ainda não sincronizou";
        status.textContent = `✅ Conectado — última sincronização: ${ultima}`;
        btnConectar.classList.add("oculto");
        btnDesconectar.classList.remove("oculto");
        btnSyncAgora.classList.remove("oculto");
        btnSyncMidia.classList.remove("oculto");
    } else {
        status.textContent = "🔌 Desconectado";
        btnConectar.classList.remove("oculto");
        btnDesconectar.classList.add("oculto");
        btnSyncAgora.classList.add("oculto");
        btnSyncMidia.classList.add("oculto");
    }
}

// ============================================================
// === MÍDIA DOS CARDS NO GOOGLE DRIVE (upload manual + download sob demanda) ===
// ============================================================
// Continuação da sincronização acima: diferente de dados/srsItems (que sobem sozinhos, debounced), a
// mídia (imagens/áudio dos cards) fica numa pasta própria no Drive e só sobe quando o usuário pede
// explicitamente (botão "Sincronizar mídia agora") — pode ser centenas de MB (áudio de decks de
// idioma, muitas imagens), e subir isso automático a cada mudança seria pesado demais, principalmente
// pelo plano de dados do celular. Download continua sob demanda: só busca a mídia de um card
// específico quando ele aparece na revisão e não existe localmente (ver
// carregarImagemSRSComFallbackDrive) — nunca baixa a biblioteca de mídia inteira de uma vez.
const GOOGLE_DRIVE_PASTA_MIDIA_NOME = "spp_midia_cards";
let driveIdPastaMidiaCache = null;

// Variante de chamarApiDrive pra quando a RESPOSTA é o conteúdo binário em si (?alt=media), não JSON.
function chamarApiDriveBlob(url, opcoes, jaTentouRenovarToken) {
    return fetch(url, Object.assign({ cache: "no-store" }, opcoes, {
        headers: Object.assign({ Authorization: `Bearer ${googleAccessToken}` }, (opcoes && opcoes.headers) || {})
    })).then(r => {
        // NOVO: mesmo tratamento de token expirado que chamarApiDrive — ver renovarTokenDriveEEsperar.
        if (r.status === 401 && !jaTentouRenovarToken) {
            return renovarTokenDriveEEsperar().then(() => chamarApiDriveBlob(url, opcoes, true));
        }
        if (!r.ok) throw new Error(`Drive API respondeu ${r.status}`);
        return r.blob();
    });
}

function obterPastaMidiaDrive() {
    if (driveIdPastaMidiaCache) return Promise.resolve(driveIdPastaMidiaCache);
    const query = encodeURIComponent(`name='${GOOGLE_DRIVE_PASTA_MIDIA_NOME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    return chamarApiDrive(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`).then(j => {
        const pasta = j.files && j.files[0];
        if (pasta) { driveIdPastaMidiaCache = pasta.id; return pasta.id; }
        return chamarApiDrive("https://www.googleapis.com/drive/v3/files?fields=id", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: GOOGLE_DRIVE_PASTA_MIDIA_NOME, mimeType: "application/vnd.google-apps.folder" })
        }).then(j2 => { driveIdPastaMidiaCache = j2.id; return j2.id; });
    });
}

// Cada mídia vira 1 arquivo no Drive, nomeado pelo próprio id (mesmo id usado no IndexedDB local) —
// dá pra achar de volta só pelo nome, sem precisar guardar um mapa id→fileId em lugar nenhum.
function buscarArquivoMidiaDrive(id) {
    return obterPastaMidiaDrive().then(pastaId => {
        const query = encodeURIComponent(`name='${id}' and '${pastaId}' in parents and trashed=false`);
        return chamarApiDrive(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`).then(j => (j.files && j.files[0] && j.files[0].id) || null);
    });
}

function enviarMidiaParaDrive(id, blob) {
    const mimeType = blob.type || "application/octet-stream";
    return obterPastaMidiaDrive().then(pastaId =>
        buscarArquivoMidiaDrive(id).then(fileIdExistente => {
            if (fileIdExistente) {
                return chamarApiDrive(`https://www.googleapis.com/upload/drive/v3/files/${fileIdExistente}?uploadType=media`, {
                    method: "PATCH",
                    headers: { "Content-Type": mimeType },
                    body: blob
                }).then(() => fileIdExistente);
            }
            // Corpo do multipart montado como Blob (não string) — concatenar bytes binários numa
            // string quebraria o conteúdo; Blob preserva os bytes de verdade nas partes que são Blob.
            const boundary = `sppmidia${Date.now()}`;
            const metadata = { name: id, parents: [pastaId], mimeType };
            const corpo = new Blob([
                `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
                `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
                blob,
                `\r\n--${boundary}--`
            ]);
            return chamarApiDrive("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
                method: "POST",
                headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
                body: corpo
            }).then(j => j.id);
        })
    );
}

function baixarMidiaDoDrive(id) {
    return buscarArquivoMidiaDrive(id).then(fileId => {
        if (!fileId) return null;
        return chamarApiDriveBlob(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    });
}

function excluirMidiaDoDrive(id) {
    return buscarArquivoMidiaDrive(id).then(fileId => {
        if (!fileId) return;
        return chamarApiDrive(`https://www.googleapis.com/drive/v3/files/${fileId}`, { method: "DELETE" });
    });
}

// NOVO: quando a imagem/mídia não existe localmente (ex: o card chegou por sincronização de outro
// aparelho, mas a mídia em si nunca foi baixada NESSE aparelho), tenta buscar no Drive antes de
// desistir — só quando conectado. Ao achar, salva localmente (cache) pra não precisar buscar de novo
// da próxima vez que esse card aparecer na revisão.
function carregarImagemSRSComFallbackDrive(id) {
    return carregarImagemSRS(id).then(blob => {
        if (blob) return blob;
        if (!driveConectado || !googleAccessToken) return null;
        return baixarMidiaDoDrive(id).then(blobRemoto => {
            if (!blobRemoto) return null;
            return salvarImagemSRS(id, blobRemoto).then(() => blobRemoto).catch(() => blobRemoto);
        }).catch(() => null);
    });
}

// Sobe pro Drive toda mídia referenciada por algum card que ainda não está no manifesto
// (dados._syncMeta.midiaSincronizada) — chamado só pelo botão "Sincronizar mídia agora", nunca
// automático (ver comentário no topo desta seção). Ids sem blob local (nunca baixados nesse aparelho)
// são pulados silenciosamente — não tem o que subir. Reaproveita a mesma barra de progresso e o mesmo
// processamento em lotes já usados na importação/exportação de backup.
function sincronizarMidiaComDriveAgora() {
    if (!driveConectado) { alert("Conecte o Google Drive primeiro."); return; }
    const todosIds = new Set();
    dados.srsItems.forEach(item => todosIdsMidiaDoCardSRS(item).forEach(id => todosIds.add(id)));
    const jaSincronizados = new Set((dados._syncMeta && dados._syncMeta.midiaSincronizada) || []);
    const pendentes = [...todosIds].filter(id => !jaSincronizados.has(id));

    if (pendentes.length === 0) { alert("Nenhuma mídia nova pra sincronizar."); return; }

    mostrarProgressoOperacao("Sincronizando mídia...", "🖼️");
    atualizarProgressoOperacao(0, pendentes.length, "🖼️", "Sincronizando mídia...");
    let concluidos = 0;
    const enviados = [];
    const marcarConcluido = () => {
        concluidos++;
        atualizarProgressoOperacao(concluidos, pendentes.length, "🖼️", "Sincronizando mídia...");
    };
    // NOVO: a maioria dos IDs pendentes costuma nem existir localmente ainda (mídia baixada só sob
    // demanda, ver carregarImagemSRSComFallbackDrive) — processarMidiasSRSEmLotesComChecagemPrevia
    // descarta esses rapidamente (checagem em paralelo irrestrito) antes de aplicar o lote só a quem
    // realmente precisa subir pro Drive.
    processarMidiasSRSEmLotesComChecagemPrevia(pendentes, marcarConcluido, id =>
        carregarImagemSRS(id).then(blob => {
            if (!blob) return;
            return enviarMidiaParaDrive(id, blob).then(() => { enviados.push(id); });
        }).catch(err => console.error(`Falha ao sincronizar mídia ${id}:`, err))
    ).then(() => {
        if (!dados._syncMeta) dados._syncMeta = {};
        dados._syncMeta.midiaSincronizada = [...jaSincronizados, ...enviados];
        return salvar();
    }).then(() => {
        esconderProgressoOperacao();
        alert(`${enviados.length} de ${pendentes.length} mídia(s) sincronizada(s) com o Drive.`);
    }).catch(err => {
        console.error("Erro ao sincronizar mídia com o Drive:", err);
        esconderProgressoOperacao();
        alert("Não foi possível sincronizar a mídia. Tente novamente.");
    });
}

// ============================================================
// === CALENDÁRIO MINI (sidebar) — lembretes + eventos automáticos por dia ===
// ============================================================
const NOMES_MESES_CALENDARIO = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const NOMES_DIAS_SEMANA_CALENDARIO = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

let calendarioMesExibido = null; // Date do 1º dia do mês exibido no mini-calendário
let calendarioDiaModalAberto = null; // data ISO do dia aberto no modal (pra saber onde adicionar/remover lembrete)

function inicializarCalendario() {
    const hoje = new Date();
    calendarioMesExibido = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    renderizarCalendario();
}

function mudarMesCalendario(delta) {
    calendarioMesExibido.setMonth(calendarioMesExibido.getMonth() + delta);
    renderizarCalendario();
}

// Mesma lógica de hojeISO() (componentes locais, não toISOString()/UTC), só que pra uma data qualquer.
function dataParaIsoLocal(d) {
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
}

// Cada categoria de aviso do calendário tem sua própria cor de bolinha — assim dá pra distinguir, só
// olhando a grade, se um dia tem card de revisão vencendo (verde, como já era) ou outra coisa (conta,
// prazo de objetivo/meta, lembrete livre) sem precisar abrir o dia.
const CATEGORIAS_CALENDARIO = {
    srs: { cor: "#4caf50", label: "Revisão (SRS)" }, // verde — mantido, como já era antes
    conta: { cor: "#9c27b0", label: "Conta fixa" }, // roxo
    objetivo: { cor: "#2196F3", label: "Prazo de objetivo" }, // azul
    meta: { cor: "#ff9800", label: "Prazo de meta" }, // laranja
    lembrete: { cor: "#e53935", label: "Lembrete" }, // vermelho
};

// Junta tudo que já tem data marcada em outras partes do site pro dia informado: conta fixa vencendo,
// prazo de objetivo/meta financeira, cards do SRS que vencem nesse dia. Não inclui missões (são diárias/
// semanais recorrentes, não têm uma data futura específica de calendário). Cada evento carrega sua
// categoria, usada tanto pra colorir a bolinha na grade quanto a borda dele dentro do modal do dia.
function eventosAutomaticosDoDia(dataIso) {
    const eventos = [];
    dados.financas.contasFixas.forEach(c => {
        if (c.proximoVencimento === dataIso) eventos.push({ categoria: "conta", texto: `💰 ${c.nome} vence hoje (${formatarMoeda(c.valor)})` });
    });
    dados.objetivos.forEach(o => {
        if (o.prazo === dataIso && !o.concluido) eventos.push({ categoria: "objetivo", texto: `🚀 Prazo do objetivo: ${o.titulo}` });
    });
    (dados.financas.metas || []).forEach(m => {
        if (m.prazo === dataIso) eventos.push({ categoria: "meta", texto: `🎯 Prazo da meta: ${m.nome}` });
    });
    // No dia de hoje, conta igual à aba de Revisão faz (<=, ou seja, vencidos de dias anteriores entram
    // no total de hoje também — é pra onde eles "acumulam" até serem revisados). Num dia futuro, só os
    // cards que vencem exatamente naquele dia fazem sentido (ainda não é hoje pra eles "acumularem" nada).
    const dataComparacao = dataIso === hojeISO() ? "<=" : "===";
    const cardsVencendo = dados.srsItems.filter(i => dataComparacao === "<=" ? i.data_proxima_revisao <= dataIso : i.data_proxima_revisao === dataIso).length;
    if (cardsVencendo > 0) eventos.push({ categoria: "srs", texto: `🧠 ${cardsVencendo} card(s) de revisão vencendo` });
    return eventos;
}

// Todas as categorias presentes num dia (eventos automáticos + lembretes livres, se houver), pra saber
// quantas bolinhas de quais cores desenhar naquele dia na grade.
function categoriasDoDia(dataIso) {
    const categorias = new Set(eventosAutomaticosDoDia(dataIso).map(e => e.categoria));
    if (dados.lembretes[dataIso] && dados.lembretes[dataIso].length > 0) categorias.add("lembrete");
    return categorias;
}

function renderizarCalendario() {
    if (!calendarioMesExibido) return;
    const ano = calendarioMesExibido.getFullYear(), mes = calendarioMesExibido.getMonth();
    document.getElementById("calendario-mes-ano").innerText = `${NOMES_MESES_CALENDARIO[mes]} ${ano}`;

    const primeiroDiaSemana = new Date(ano, mes, 1).getDay(); // 0 = domingo
    const totalDias = new Date(ano, mes + 1, 0).getDate();
    const hojeIso = hojeISO();

    let html = "";
    for (let i = 0; i < primeiroDiaSemana; i++) html += `<span class="calendario-dia-vazio"></span>`;
    for (let dia = 1; dia <= totalDias; dia++) {
        const dataIso = dataParaIsoLocal(new Date(ano, mes, dia));
        const categorias = categoriasDoDia(dataIso);
        const classes = ["calendario-dia"];
        if (dataIso === hojeIso) classes.push("calendario-dia-hoje");
        const pontos = categorias.size
            ? `<span class="calendario-dia-pontos">${Array.from(categorias).map(cat => `<i style="background:${CATEGORIAS_CALENDARIO[cat].cor}" title="${CATEGORIAS_CALENDARIO[cat].label}"></i>`).join("")}</span>`
            : "";
        html += `<button class="${classes.join(" ")}" onclick="abrirModalDiaCalendario('${dataIso}')"><span class="calendario-dia-numero">${dia}</span>${pontos}</button>`;
    }
    document.getElementById("calendario-grade").innerHTML = html;
}

function abrirModalDiaCalendario(dataIso) {
    calendarioDiaModalAberto = dataIso;
    const d = new Date(dataIso + "T00:00:00");
    document.getElementById("calendario-dia-titulo").innerText = `${NOMES_DIAS_SEMANA_CALENDARIO[d.getDay()]}, ${d.getDate()} de ${NOMES_MESES_CALENDARIO[d.getMonth()].toLowerCase()}`;

    const eventos = eventosAutomaticosDoDia(dataIso);
    document.getElementById("calendario-dia-eventos").innerHTML = eventos.length
        ? eventos.map(e => `<div class="calendario-evento-automatico" style="border-left-color:${CATEGORIAS_CALENDARIO[e.categoria].cor}">${escaparHtml(e.texto)}</div>`).join("")
        : `<p class="texto-vazio">Nenhum evento automático nesse dia.</p>`;

    renderizarListaLembretes(dataIso);
    document.getElementById("input-novo-lembrete").value = "";
    document.getElementById("calendario-dia-modal").classList.remove("modal-oculto");
}

function renderizarListaLembretes(dataIso) {
    const lista = dados.lembretes[dataIso] || [];
    document.getElementById("calendario-dia-lembretes-lista").innerHTML = lista.length
        ? lista.map(l => `<div class="calendario-lembrete-item"><span>${escaparHtml(l.texto)}</span><button onclick="removerLembrete('${dataIso}', ${l.id})" title="Remover">&times;</button></div>`).join("")
        : `<p class="texto-vazio">Nenhum lembrete pra esse dia.</p>`;
}

function adicionarLembrete() {
    const input = document.getElementById("input-novo-lembrete");
    const texto = input.value.trim();
    if (!texto || !calendarioDiaModalAberto) return;
    if (!dados.lembretes[calendarioDiaModalAberto]) dados.lembretes[calendarioDiaModalAberto] = [];
    dados.lembretes[calendarioDiaModalAberto].push({ id: Date.now(), texto: texto });
    salvar();
    input.value = "";
    renderizarListaLembretes(calendarioDiaModalAberto);
    renderizarCalendario(); // atualiza o marcador de "tem evento" na grade
}

function removerLembrete(dataIso, id) {
    dados.lembretes[dataIso] = (dados.lembretes[dataIso] || []).filter(l => l.id !== id);
    if (dados.lembretes[dataIso].length === 0) delete dados.lembretes[dataIso];
    salvar();
    renderizarListaLembretes(dataIso);
    renderizarCalendario();
}

function fecharModalDiaCalendario() {
    calendarioDiaModalAberto = null;
    document.getElementById("calendario-dia-modal").classList.add("modal-oculto");
}

// NOVO: hidrata dados.srsItems a partir do IndexedDB ANTES da primeira atualizar() — o resto do app
// inicializa normalmente só depois disso resolver, pra nenhuma das várias funções que leem
// dados.srsItems de forma síncrona (fluxo de revisão, "Deck Completo", estatísticas, calendário)
// rodar em cima de um array ainda incompleto. Cobre a migração de quem já usava o app antes dessa
// mudança: se o IndexedDB ainda não tem nada salvo (itensSalvos undefined), mantém o valor que já
// veio populado do JSON do localStorage (jeito antigo) em vez de zerar, e marca como "alterado" pra a
// 1ª salvar() da sessão migrar esse valor pro IndexedDB de vez.
function inicializarAppComSrsItems() {
    carregarPreferenciasTimer();
    aplicarTema();
    verificarContasAVencer();
    inicializarSelectNivelParalelismoArquivos();
    atualizar();
    inicializarCalendario();

    // NOVO: resetDiario()/verificarGameOver() são adiados até essa checagem resolver — nunca atrasam o
    // que já rodou acima (tema, calendário, timer, a 1ª atualizar()), só o cálculo de dano/game over em
    // si. Ver aguardarChecagemInicialDoDrive pro motivo (evitar sobrescrever em silêncio o progresso de
    // outro aparelho no Drive) — cobre tanto o caso comum (Drive não conectado ou sem nada mais novo,
    // resolve rápido) quanto o de rede lenta/offline (resolve no máximo em
    // ESPERA_MAXIMA_CHECAGEM_DRIVE_INICIAL_MS, sem travar o app esperando pra sempre).
    aguardarChecagemInicialDoDrive(ESPERA_MAXIMA_CHECAGEM_DRIVE_INICIAL_MS).then(() => {
        // Um conflito apareceu nesse meio-tempo — deixa o usuário decidir primeiro (banner já visível,
        // ver avisarConflitoSincronizacaoDrive). resetDiario()/verificarGameOver() rodam só depois, via
        // manterVersaoLocalDrive() (se ele escolher ficar com o local) ou nunca (se escolher usar a
        // versão remota, que recarrega a página com os dados corretos e roda tudo de novo do zero).
        if (dadosRemotosPendentesConflito) return;
        rodarResetDiarioEGameOverUmaVez();
    });

    // NOVO: checagem periódica do Drive (ver SYNC_DRIVE_POLL_INTERVAL_MS) — sincronizarComDrive() já
    // não faz nada se driveConectado for false, então um setInterval único e incondicional é
    // suficiente (não precisa start/stop ao conectar/desconectar). Cobre o aparelho que fica parado
    // (sem nenhuma edição local) e por isso nunca teria motivo pra checar sozinho — ver comentário na
    // declaração da constante.
    setInterval(() => { if (driveConectado) sincronizarComDrive(); }, SYNC_DRIVE_POLL_INTERVAL_MS);

    // NOVO: checa assim que a aba volta a ficar visível (ex: o usuário trocou de app no celular e
    // voltou) — navegadores móveis costumam pausar/atrasar setTimeout/setInterval de abas em segundo
    // plano, então o agendamento de 20s (agendarSincronizacaoDrive) ou até o polling periódico acima
    // podem simplesmente não ter rodado enquanto a aba estava em background; isso força uma checagem
    // imediata no momento em que ela volta a ficar ativa, em vez de esperar o próximo timer.
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && driveConectado) sincronizarComDrive();
    });

    // NOVO: mantém o contador do Pacto do Tártaro correndo em tempo real enquanto a aba fica aberta —
    // a cada segundo, ou só atualiza o texto dos contadores já na tela, ou (se algum chefão completou
    // o respawn nesse meio tempo) reconstrói a lista de chefões e persiste o estado novo.
    setInterval(() => {
        if (verificarRespawnChefoes()) { renderizarChefoes(); salvarDados(); }
        else atualizarContadoresChefoesSelados();
    }, 1000);
}

window.onload = function() {
    carregarSrsItemsIndexedDB().then(itensSalvos => {
        if (itensSalvos !== undefined) dados.srsItems = itensSalvos; // IndexedDB já é a fonte da verdade
        else if (!Array.isArray(dados.srsItems)) dados.srsItems = [];
        dados.srsItems.forEach(i => { if (i.resposta === undefined) i.resposta = ""; }); // compatibilidade com cards antigos
        dados.srsItems.forEach(i => { if (!i.tipo) i.tipo = "normal"; }); // compatibilidade com cards antigos (antes do modo Cloze)
        srsItemsAlterado = true; // garante que a 1ª salvar() da sessão já persiste no IndexedDB
        inicializarAppComSrsItems();
    }).catch(err => {
        console.error("Falha ao carregar os cards de SRS do IndexedDB:", err);
        if (!Array.isArray(dados.srsItems)) dados.srsItems = [];
        inicializarAppComSrsItems();
    });
};