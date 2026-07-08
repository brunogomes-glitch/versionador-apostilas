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
    const fileAntigo = document.getElementById('pdf-antigo').files[0];
    const fileNovo = document.getElementById('pdf-novo').files[0];
    const btn = document.getElementById('btn-comparar');
    const resultadoDiv = document.getElementById('resultado-diff');

    if (!fileAntigo || !fileNovo) {
        alert('Por favor, selecione os dois arquivos PDF para processar.');
        return;
    }

    if (certificacaoAtiva === "Geral") {
        alert('Por favor, selecione o Curso correspondente no menu da direita antes de versionar!');
        return;
    }

    btn.disabled = true;
    btn.innerText = 'Processando...';
    
    atualizarBarraProgresso('Consultando histórico anterior...', 10);
    resultadoDiv.innerHTML = 'Consultando histórico de versões anteriores...';

    try {
        const qHistorico = query(collection(db, "versoes"), orderBy("timestamp", "desc"));
        const snapshotHistorico = await getDocs(qHistorico);
        let versaoBaseCalculada = "1.0.0"; 

        snapshotHistorico.forEach((doc) => {
            const registro = doc.data();
            if (versaoBaseCalculada === "1.0.0" && registro.nomeArquivoOriginal === fileAntigo.name) {
                versaoBaseCalculada = registro.versaoSemver;
            }
        });

        atualizarBarraProgresso('Carregando os arquivos PDF...', 20);
        resultadoDiv.innerHTML = `Lendo arquivos...`;

        const arrayBufferAntigo = await fileAntigo.arrayBuffer();
        const arrayBufferNovo = await fileNovo.arrayBuffer();
        
        const pdfAntigo = await pdfjsLib.getDocument({ data: arrayBufferAntigo }).promise;
        const pdfNovo = await pdfjsLib.getDocument({ data: arrayBufferNovo }).promise;

        const totalPaginas = Math.max(pdfAntigo.numPages, pdfNovo.numPages);
        
        let listaTopicosMudancas = [];
        let contemAdicao = false;
        let contemRemocao = false;

        for (let i = 1; i <= totalPaginas; i++) {
            const pctCalculado = Math.floor(20 + ((i / totalPaginas) * 55));
            atualizarBarraProgresso(`Analisando: Página ${i} de ${totalPaginas}`, pctCalculado);

            let textoAntigoPagina = '';
            let textoNovoPagina = '';

            if (i <= pdfAntigo.numPages) {
                const pagina = await pdfAntigo.getPage(i);
                const conteudo = await pagina.getTextContent();
                textoAntigoPagina = conteudo.items.map(item => item.str).join(' ');
            }

            if (i <= pdfNovo.numPages) {
                const pagina = await pdfNovo.getPage(i);
                const conteudo = await pagina.getTextContent();
                textoNovoPagina = conteudo.items.map(item => item.str).join(' ');
            }

            const diferencasPagina = Diff.diffWords(textoAntigoPagina, textoNovoPagina);
            let trechosAdicionados = [];
            let trechosRemovidos = [];

            diferencasPagina.forEach((part) => {
                if (part.added) {
                    contemAdicao = true;
                    if (part.value.trim().length > 3) trechosAdicionados.push(part.value.trim());
                }
                if (part.removed) {
                    contemRemocao = true;
                    if (part.value.trim().length > 3) trechosRemovidos.push(part.value.trim());
                }
            });

            if (trechosRemovidos.length > 0) {
                listaTopicosMudancas.push(`Pág. ${i}: Remoção de "${trechosRemovidos.join(' | ').substring(0, 50)}..."`);
            }
            if (trechosAdicionados.length > 0) {
                listaTopicosMudancas.push(`Pág. ${i}: Inclusão de "${trechosAdicionados.join(' | ').substring(0, 50)}..."`);
            }
        }

        let mudancaDetectada = "Nenhuma";
        let tagVersaoFinal = versaoBaseCalculada;

        if (contemAdicao) {
            let partes = versaoBaseCalculada.split('.');
            let major = parseInt(partes[0]) || 1;
            let minor = parseInt(partes[1]) || 0;
            minor += 1;
            tagVersaoFinal = `${major}.${minor}.0`;
            mudancaDetectada = "MINOR (Conteúdo Adicionado)";
        } else if (contemRemocao) {
            let partes = versaoBaseCalculada.split('.');
            let major = parseInt(partes[0]) || 1;
            let minor = parseInt(partes[1]) || 0;
            let patch = parseInt(partes[2]) || 0;
            patch += 1;
            tagVersaoFinal = `${major}.${minor}.${patch}`;
            mudancaDetectada = "PATCH (Pequenas Correções/Remoções)";
        }

        if (mudancaDetectada === "Nenhuma") {
            document.getElementById('container-progresso').style.display = 'none';
            resultadoDiv.innerHTML = `
                <p style="margin:0; font-weight:bold; color:#27ae60;">✓ Os arquivos são idênticos!</p>
                <p style="margin:5px 0 0 0; font-size:14px; color:#555;">Permanecendo na versão atual estável: <b>v${versaoBaseCalculada}</b></p>
            `;
        } else {
            // NOVA ETAPA: Montando estoque ZIP físico para baixar localmente
            atualizarBarraProgresso('Estocando PDFs em pacote comprimido (ZIP)...', 80);

            if (listaTopicosMudancas.length === 0) listaTopicosMudancas.push("Ajustes gerais na apostila.");

            const zip = new JSZip();
            const pastaCurso = zip.folder(`${certificacaoAtiva}_v${tagVersaoFinal}`);
            
            // Adiciona os arquivos brutos para estocagem
            pastaCurso.file(`1_VERSAO_ANTERIOR_v${versaoBaseCalculada}.pdf`, fileAntigo);
            pastaCurso.file(`2_NOVA_VERSAO_v${tagVersaoFinal}.pdf`, fileNovo);
            
            // Adiciona o relatório em texto descritivo
            let relatorioTexto = `RELATÓRIO DE VERSIONAMENTO - ${certificacaoAtiva}\n`;
            relatorioTexto += `Data: ${new Date().toLocaleString('pt-BR')}\n`;
            relatorioTexto += `Versão Base: v${versaoBaseCalculada} -> Nova Versão: v${tagVersaoFinal}\n`;
            relatorioTexto += `Tipo de Alteração: ${mudancaDetectada}\n\n`;
            relatorioTexto += `TÓPICOS DETECTADOS:\n`;
            listaTopicosMudancas.forEach(t => relatorioTexto += `- ${t}\n`);
            
            pastaCurso.file("resumo_alteracoes.txt", relatorioTexto);

            // Dispara download do ZIP estocado no navegador
            const conteudoZip = await zip.generateAsync({ type: "blob" });
            const linkDownload = document.createElement('a');
            linkDownload.href = URL.createObjectURL(conteudoZip);
            linkDownload.download = `Estoque_${certificacaoAtiva}_v${tagVersaoFinal}.zip`;
            document.body.appendChild(linkDownload);
            linkDownload.click();
            document.body.removeChild(linkDownload);

            // Gravando dados leves na nuvem (Histórico do site)
            atualizarBarraProgresso('Salvando dados históricos na nuvem...', 95);

            await addDoc(collection(db, "versoes"), {
                nomeArquivo: fileNovo.name,             
                nomeArquivoOriginal: fileNovo.name,     
                versaoSemver: tagVersaoFinal,
                tipoMudanca: mudancaDetectada,
                certificacao: certificacaoAtiva, 
                topicosMudancas: listaTopicosMudancas.slice(0, 5), 
                data: new Date().toLocaleString('pt-BR'),
                timestamp: new Date()
            });

            atualizarBarraProgresso('Concluído e Estocado!', 100);
            
            resultadoDiv.innerHTML = `
                <p style="margin:0; font-size: 15px; color:#7f8c8d;">Versão Anterior: v${versaoBaseCalculada}</p>
                <p style="margin:5px 0; font-size: 22px; color:#3498db;"><b>Nova Versão: <span style="color:#2c3e50;">v${tagVersaoFinal}</span></b></p>
                <p style="margin:5px 0; font-size: 14px; color:#e67e22;">Tipo de Incremento: <b>${mudancaDetectada}</b></p>
                <p style="margin:10px 0 0 0; font-size: 13px; color:#27ae60; font-weight:bold;">✓ Pacote ZIP de estocagem baixado automaticamente!</p>
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
        btn.innerText = 'Versionar e Estocar Documento';
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
                <strong>Apostila:</strong> ${versao.nomeArquivo} <br>
                <small style="color:#7f8c8d; font-weight: bold;">📅 Modificado em: ${versao.data}</small>
                
                <div style="margin: 10px 0; padding: 8px; background: #fff; border: 1px solid #edf2f7; border-radius: 4px;">
                    <strong style="font-size: 13px; color:#2d3748;">📋 Resumo das Alterações calculadas:</strong>
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
