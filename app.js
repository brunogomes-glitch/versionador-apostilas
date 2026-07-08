// CONFIGURAÇÃO DO SEU FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyD5N8D108XMCnWytT55XlcR6RE728S6qa5M",
    authDomain: "versionador-apostilas.firebaseapp.com",
    projectId: "versionador-apostilas",
    storageBucket: "versionador-apostilas.firebasestorage.app",
    messagingSenderId: "14543972647",
    appId: "1:14543972647:web:1aadf3f86bbcdd1d2833b2",
    measurementId: "G-2LDVJ25K10"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let certificacaoAtiva = "Geral";

window.addEventListener('DOMContentLoaded', () => {
    carregarHistorico();
    configurarMenuLateral();
});

function configurarMenuLateral() {
    const botoes = document.querySelectorAll('.btn-certificacao');
    botoes.forEach(botao => {
        botao.addEventListener('click', () => {
            botoes.forEach(b => b.classList.remove('active'));
            botao.classList.add('active');
            certificacaoAtiva = botao.getAttribute('data-cert');
            carregarHistorico();
        });
    });
}

function atualizarBarraProgresso(texto, porcentagem) {
    const container = document.getElementById('container-progresso');
    const txtElement = document.getElementById('texto-progresso');
    const pctElement = document.getElementById('porcentagem-progresso');
    const fillElement = document.getElementById('progress-bar-fill');
    
    container.style.display = 'block';
    txtElement.innerText = texto;
    pctElement.innerText = `${porcentagem}%`;
    fillElement.style.width = `${porcentagem}%`;
}

document.getElementById('btn-comparar').addEventListener('click', async () => {
    const fileNovo = document.getElementById('pdf-novo').files[0];
    const btn = document.getElementById('btn-comparar');
    const resultadoDiv = document.getElementById('resultado-diff');

    if (!fileNovo) {
        alert('Por favor, selecione o arquivo PDF atualizado para processar.');
        return;
    }

    if (certificacaoAtiva === "Geral") {
        alert('Por favor, selecione o Curso correspondente no menu da direita antes de versionar!');
        return;
    }

    btn.disabled = true;
    btn.innerText = 'Processando...';
    
    atualizarBarraProgresso('Buscando última versão no Firebase...', 15);
    resultadoDiv.innerHTML = 'Conectando ao histórico na nuvem...';

    try {
        const qUltima = query(collection(db, "versoes"), orderBy("timestamp", "desc"));
        const snapshotHistorico = await getDocs(qUltima);
        
        let ultimaVersaoObjeto = null;
        snapshotHistorico.forEach((doc) => {
            const registro = doc.data();
            if (!ultimaVersaoObjeto && registro.certificacao === certificacaoAtiva) {
                ultimaVersaoObjeto = registro;
            }
        });

        let textoAntigoCompleto = "";
        let versaoBaseCalculada = "0.0.0";

        if (ultimaVersaoObjeto) {
            versaoBaseCalculada = ultimaVersaoObjeto.versaoSemver;
            textoAntigoCompleto = ultimaVersaoObjeto.textoEstruturalPuro || "";
            resultadoDiv.innerHTML = `Última versão encontrada: v${versaoBaseCalculada}. Lendo novo PDF...`;
        } else {
            resultadoDiv.innerHTML = `Nenhum histórico encontrado para o curso ${certificacaoAtiva}. Criando Versão Inicial...`;
        }

        atualizarBarraProgresso('Lendo estrutura do novo PDF...', 30);
        const arrayBufferNovo = await fileNovo.arrayBuffer();
        const pdfNovo = await pdfjsLib.getDocument({ data: arrayBufferNovo }).promise;
        const totalPaginasNovo = pdfNovo.numPages;
        
        let textoNovoCompleto = "";
        let listaTopicosMudancas = [];
        let contemAdicao = false;
        let contemRemocao = false;

        // OTIMIZAÇÃO DE MEMÓRIA: Extrai o texto fatiado para não estourar o browser
        for (let i = 1; i <= totalPaginasNovo; i++) {
            const pctCalculado = Math.floor(30 + ((i / totalPaginasNovo) * 45));
            atualizarBarraProgresso(`Processando e Extraindo: Página ${i} de ${totalPaginasNovo}`, pctCalculado);

            const pagina = await pdfNovo.getPage(i);
            const conteudo = await pagina.getTextContent();
            const textoPagina = conteudo.items.map(item => item.str).join(' ');
            textoNovoCompleto += textoPagina + " ";
        }

        let tagVersaoFinal = "1.0.0";
        let mudancaDetectada = "Versão Inicial do Material";

        if (versaoBaseCalculada !== "0.0.0") {
            atualizarBarraProgresso('Mapeando diferenças de conteúdo de forma segura...', 80);
            
            // CORREÇÃO CRUCIAL DO TRAVAMENTO NO 79%: Compara por blocos (linhas/frases) menores em vez de um textão bruto gigante
            const arrayFrasesAntigas = textoAntigoCompleto.split(/[.!?]+/);
            const arrayFrasesNovas = textoNovoCompleto.split(/[.!?]+/);

            // Filtra e limpa espaços vazios
            const antigasLimpas = arrayFrasesAntigas.map(f => f.trim()).filter(f => f.length > 5);
            const novasLimpas = arrayFrasesNovas.map(f => f.trim()).filter(f => f.length > 5);

            let contadorMudancas = 0;

            // Mapeia novas inclusões procurando frases que não existiam no arquivo anterior
            novasLimpas.forEach((frase) => {
                if (!antigasLimpas.includes(frase)) {
                    contemAdicao = true;
                    if (contadorMudancas < 5) {
                        listaTopicosMudancas.push(`Inclusão detectada: "${frase.substring(0, 60)}..."`);
                        contadorMudancas++;
                    }
                }
            });

            // Mapeia remoções procurando o que sumiu do arquivo anterior
            antigasLimpas.forEach((frase) => {
                if (!novasLimpas.includes(frase)) {
                    contemRemocao = true;
                    if (contadorMudancas < 5) {
                        listaTopicosMudancas.push(`Remoção/Alteração: "${frase.substring(0, 60)}..."`);
                        contadorMudancas++;
                    }
                }
            });

            if (contemAdicao) {
                let partes = versaoBaseCalculada.split('.');
                let major = parseInt(partes[0]) || 1;
                let minor = parseInt(partes[1]) || 0;
                minor += 1;
                tagVersaoFinal = `${major}.${minor}.0`;
                mudancaDetectada = "MINOR (Novos conteúdos inclusos)";
            } else if (contemRemocao) {
                let partes = versaoBaseCalculada.split('.');
                let major = parseInt(partes[0]) || 1;
                let minor = parseInt(partes[1]) || 0;
                let patch = parseInt(partes[2]) || 0;
                patch += 1;
                tagVersaoFinal = `${major}.${minor}.${patch}`;
                mudancaDetectada = "PATCH (Revisão ou ajuste de texto)";
            } else {
                mudancaDetectada = "Nenhuma";
                tagVersaoFinal = versaoBaseCalculada;
            }
        }

        if (mudancaDetectada === "Nenhuma") {
            document.getElementById('container-progresso').style.display = 'none';
            resultadoDiv.innerHTML = `
                <p style="margin:0; font-weight:bold; color:#27ae60;">✓ O arquivo é idênticos à versão salva no banco!</p>
                <p style="margin:5px 0 0 0; font-size:14px; color:#555;">Permanecendo na versão estável atual: <b>v${versaoBaseCalculada}</b></p>
            `;
        } else {
            atualizarBarraProgresso('Registrando nova versão na nuvem...', 95);

            if (listaTopicosMudancas.length === 0 && tagVersaoFinal !== "1.0.0") {
                listaTopicosMudancas.push("Pequenas correções ortográficas ou formatações detectadas.");
            } else if (tagVersaoFinal === "1.0.0") {
                listaTopicosMudancas.push("Primeiro registro estável desta apostila no sistema.");
            }

            await addDoc(collection(db, "versoes"), {
                nomeArquivo: fileNovo.name,             
                nomeArquivoOriginal: fileNovo.name,     
                versaoSemver: tagVersaoFinal,
                tipoMudanca: mudancaDetectada,
                certificacao: certificacaoAtiva, 
                topicosMudancas: listaTopicosMudancas, 
                textoEstruturalPuro: textoNovoCompleto, 
                data: new Date().toLocaleString('pt-BR'),
                timestamp: new Date()
            });

            atualizarBarraProgresso('Concluído!', 100);
            
            resultadoDiv.innerHTML = `
                <p style="margin:0; font-size: 14px; color:#7f8c8d;">Curso: <b>${certificacaoAtiva}</b></p>
                <p style="margin:3px 0; font-size: 22px; color:#3498db;"><b>Nova Versão Calculada: <span style="color:#2c3e50;">v${tagVersaoFinal}</span></b></p>
                <p style="margin:3px 0 0 0; font-size: 14px; color:#e67e22;">Tipo de Ajuste: <b>${mudancaDetectada}</b></p>
            `;

            carregarHistorico();
            
            setTimeout(() => {
                document.getElementById('container-progresso').style.display = 'none';
            }, 2000);
        }

    } catch (error) {
        console.error(error);
        document.getElementById('container-progresso').style.display = 'none';
        resultadoDiv.innerHTML = `<span style="color:red;">Erro no processamento: ${error.message}</span>`;
    } finally {
        btn.disabled = false;
        btn.innerText = 'Comparar e Versionar com a Última Versão';
    }
});

async function carregarHistorico() {
    const listaDiv = document.getElementById('lista-historico');
    try {
        const q = query(collection(db, "versoes"), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        
        const ultimasVersoesMapeadas = {
            "CPA": "1.0.0", "C-Pro R": "1.0.0", "C-Pro I": "1.0.0", "CFG": "1.0.0",
            "CGA": "1.0.0", "CGE": "1.0.0", "CNPI Tec": "1.0.0", "CNPI Bra": "1.0.0",
            "CNPI Gl": "1.0.0", "Ancord": "1.0.0"
        };

        Object.keys(ultimasVersoesMapeadas).forEach(curso => {
            const idFormatado = `tag-${curso.replace(/\s+/g, '-')}`;
            const elementoTag = document.getElementById(idFormatado);
            if (elementoTag) elementoTag.innerText = "v1.0.0";
        });

        if (querySnapshot.empty) {
            listaDiv.innerHTML = '<p class="placeholder">Nenhuma versão salva no Firebase ainda.</p>';
            return;
        }

        let totalItensRenderizados = 0;
        listaDiv.innerHTML = '';
        
        querySnapshot.forEach((doc) => {
            const versao = doc.data();
            
            if (versao.certificacao && ultimasVersoesMapeadas[versao.certificacao] === "1.0.0") {
                ultimasVersoesMapeadas[versao.certificacao] = versao.versaoSemver;
            }

            if (certificacaoAtiva !== "Geral" && versao.certificacao !== certificacaoAtiva) {
                return; 
            }

            totalItensRenderizados++;
            const item = document.createElement('div');
            item.style = "background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 12px; border-left: 4px solid #2c3e50; box-shadow: 0 1px 3px rgba(0,0,0,0.05);";
            
            let topicosHTML = '<ul style="margin: 5px 0 0 0; padding-left: 20px; font-size: 13px; color:#4a5568;">';
            if (versao.topicosMudancas && Array.isArray(versao.topicosMudancas)) {
                versao.topicosMudancas.forEach(t => {
                    topicosHTML += `<li style="margin-bottom:2px;">${t}</li>`;
                });
            } else {
                topicosHTML += `<li>Ajustes gerais na apostila.</li>`;
            }
            topicosHTML += '</ul>';

            item.innerHTML = `
                <span style="background: #2c3e50; color: #fff; padding: 2px 8px; font-size: 13px; font-weight: bold; border-radius: 3px; float: right;">v${versao.versaoSemver}</span>
                <span style="background: #e2e8f0; color: #4a5568; padding: 2px 6px; font-size: 11px; font-weight: bold; border-radius: 3px; margin-right: 5px;">${versao.certificacao || 'Geral'}</span>
                <strong>Arquivo:</strong> ${versao.nomeArquivo} <br>
                <small style="color:#7f8c8d; font-weight: bold;">📅 Processado em: ${versao.data}</small>
                
                <div style="margin: 10px 0; padding: 8px; background: #fff; border: 1px solid #edf2f7; border-radius: 4px;">
                    <strong style="font-size: 13px; color:#2d3748;">📋 Mudanças em relação à versão anterior:</strong>
                    ${topicosHTML}
                </div>
            `;
            listaDiv.appendChild(item);
        });

        Object.keys(ultimasVersoesMapeadas).forEach(curso => {
            const idFormatado = `tag-${curso.replace(/\s+/g, '-')}`;
            const elementoTag = document.getElementById(idFormatado);
            if (elementoTag) {
                elementoTag.innerText = `v${ultimasVersoesMapeadas[curso]}`;
            }
        });

        if (totalItensRenderizados === 0) {
            listaDiv.innerHTML = `<p class="placeholder">Nenhum histórico de versão encontrado para o curso <b>${certificacaoAtiva}</b>.</p>`;
        }
    } catch (e) {
        console.error(e);
        listaDiv.innerHTML = '<p style="color: red;">Erro ao carregar o histórico.</p>';
    }
}
