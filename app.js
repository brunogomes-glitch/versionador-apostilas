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

// Função matemática rápida (djb2) para transformar o texto pesado de uma página em um código único de 8 letras
function gerarAssinaturaTexto(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}

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
    
    atualizarBarraProgresso('Buscando última assinatura no Firebase...', 15);
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

        let mapaAssinaturasAntigas = [];
        let versaoBaseCalculada = "0.0.0";

        if (ultimaVersaoObjeto) {
            versaoBaseCalculada = ultimaVersaoObjeto.versaoSemver;
            mapaAssinaturasAntigas = ultimaVersaoObjeto.mapaAssinaturas || [];
            resultadoDiv.innerHTML = `Última versão encontrada: v${versaoBaseCalculada}. Mapeando novo PDF...`;
        } else {
            resultadoDiv.innerHTML = `Nenhum histórico encontrado para ${certificacaoAtiva}. Criando Versão Inicial...`;
        }

        atualizarBarraProgresso('Lendo estrutura do novo PDF...', 30);
        const arrayBufferNovo = await fileNovo.arrayBuffer();
        const pdfNovo = await pdfjsLib.getDocument({ data: arrayBufferNovo }).promise;
        const totalPaginasNovo = pdfNovo.numPages;
        
        let mapaAssinaturasNovas = [];
        let listaTopicosMudancas = [];
        let contemAdicao = false;
        let contemRemocao = false;

        for (let i = 1; i <= totalPaginasNovo; i++) {
            const pctCalculado = Math.floor(30 + ((i / totalPaginasNovo) * 55));
            atualizarBarraProgresso(`Processando DNA: Página ${i} de ${totalPaginasNovo}`, pctCalculado);

            const pagina = await pdfNovo.getPage(i);
            const conteudo = await pagina.getTextContent();
            const textoPagina = conteudo.items.map(item => item.str).join(' ');
            
            const hashDaPagina = gerarAssinaturaTexto(textoPagina);
            mapaAssinaturasNovas.push(hashDaPagina);
        }

        let tagVersaoFinal = "1.0.0";
        let mudancaDetectada = "Versão Inicial do Material";

        if (versaoBaseCalculada !== "0.0.0") {
            atualizarBarraProgresso('Cruzando dados das assinaturas...', 90);
            
            let maxPaginas = Math.max(mapaAssinaturasAntigas.length, mapaAssinaturasNovas.length);
            let contadorMudancas = 0;

            for (let i = 0; i < maxPaginas; i++) {
                const hashAntigo = mapaAssinaturasAntigas[i];
                const hashNovo = mapaAssinaturasNovas[i];

                if (!hashAntigo && hashNovo) {
                    contemAdicao = true;
                    if (contadorMudancas < 8) {
                        listaTopicosMudancas.push(`Página ${i + 1} adicionada ao final do documento.`);
                        contadorMudancas++;
                    }
                } else if (hashAntigo && !hashNovo) {
                    contemRemocao = true;
                    if (contadorMudancas < 8) {
                        listaTopicosMudancas.push(`Página ${i + 1} antiga foi excluída do material.`);
                        contadorMudancas++;
                    }
                } else if (hashAntigo !== hashNovo) {
                    contemRemocao = true; 
                    if (contadorMudancas < 8) {
                        listaTopicosMudancas.push(`Conteúdo alterado/revisado na Página ${i + 1}.`);
                        contadorMudancas++;
                    }
                }
            }

            if (contemAdicao) {
                let partes = versaoBaseCalculada.split('.');
                let major = parseInt(partes[0]) || 1;
                let minor = parseInt(partes[1]) || 0;
                minor += 1;
                tagVersaoFinal = `${major}.${minor}.0`;
                mudancaDetectada = "MINOR (Inclusão de novos conteúdos)";
            } else if (contemRemocao) {
                let partes = versaoBaseCalculada.split('.');
                let major = parseInt(partes[0]) || 1;
                let minor = parseInt(partes[1]) || 0;
                let patch = parseInt(partes[2]) || 0;
                patch += 1;
                tagVersaoFinal = `${major}.${minor}.${patch}`;
                mudancaDetectada = "PATCH (Ajustes e correções pontuais)";
            } else {
                mudancaDetectada = "Nenhuma";
                tagVersaoFinal = versaoBaseCalculada;
            }
        }

        if (mudancaDetectada === "Nenhuma") {
            document.getElementById('container-progresso').style.display = 'none';
            resultadoDiv.innerHTML = `
                <p style="margin:0; font-weight:bold; color:#27ae60;">✓ O arquivo atual é idêntico à versão salva anteriormente!</p>
                <p style="margin:5px 0 0 0; font-size:14px; color:#555;">Permanecendo na versão: <b>v${versaoBaseCalculada}</b></p>
            `;
        } else {
            atualizarBarraProgresso('Registrando nova assinatura...', 95);

            if (listaTopicosMudancas.length === 0 && tagVersaoFinal !== "1.0.0") {
                listaTopicosMudancas.push("Modificações gerais de formatação.");
            } else if (tagVersaoFinal === "1.0.0") {
                listaTopicosMudancas.push("Primeiro registro estável desta apostila no sistema.");
            }

            // Captura a data e hora atualizada no formato do Brasil
            const dataHoraAtual = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

            await addDoc(collection(db, "versoes"), {
                nomeArquivo: fileNovo.name,             
                nomeArquivoOriginal: fileNovo.name,     
                versaoSemver: tagVersaoFinal,
                tipoMudanca: mudancaDetectada,
                certificacao: certificacaoAtiva, 
                topicosMudancas: listaTopicosMudancas, 
                mapaAssinaturas: mapaAssinaturasNovas, 
                data: dataHoraAtual, // Garante que a data está salva como string legível
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
            
            // Renderiza de forma rica os tópicos de alterações salvos
            let topicosHTML = '<ul style="margin: 5px 0 0 0; padding-left: 20px; font-size: 13px; color:#4a5568; line-height: 1.5;">';
            if (versao.topicosMudancas && Array.isArray(versao.topicosMudancas)) {
                versao.topicosMudancas.forEach(t => {
                    topicosHTML += `<li style="margin-bottom:3px;">${t}</li>`;
                });
            } else {
                topicosHTML += `<li>Ajustes gerais na apostila.</li>`;
            }
            topicosHTML += '</ul>';

            // Exibe explicitamente o arquivo, a data salva e os tópicos mapeados
            item.innerHTML = `
                <span style="background: #2c3e50; color: #fff; padding: 2px 8px; font-size: 13px; font-weight: bold; border-radius: 3px; float: right;">v${versao.versaoSemver}</span>
                <span style="background: #e2e8f0; color: #4a5568; padding: 2px 6px; font-size: 11px; font-weight: bold; border-radius: 3px; margin-right: 5px;">${versao.certificacao || 'Geral'}</span>
                <strong>Arquivo:</strong> ${versao.nomeArquivo} <br>
                <small style="color:#e67e22; font-weight: bold; display: block; margin-top: 4px;">📅 Processado em: ${versao.data || new Date(versao.timestamp?.seconds * 1000).toLocaleString('pt-BR')}</small>
                
                <div style="margin-top: 10px; padding: 10px; background: #fff; border: 1px solid #edf2f7; border-radius: 4px;">
                    <strong style="font-size: 13px; color:#2d3748;">📋 Mudanças mapeadas em relação à versão anterior:</strong>
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
            listaDiv.innerHTML = `<p class="placeholder">Nenhum histórico de versão encontrado para o curso <b>${certificacaoAtiva}</b>.</p>';
        }
    } catch (e) {
        console.error(e);
        listaDiv.innerHTML = '<p style="color: red;">Erro ao carregar o histórico.</p>';
    }
}
