// CONFIGURAÇÃO DO SEU FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyD5N8D108XMCnWytT55XlcR6RE728S6qa5M",
    authDomain: "versionador-apostilas.firebaseapp.com",
    projectId: "versionador-apostilas",
    storageBucket: "versionador-apostilas.firebasestorage.app",
    messagingSenderId: "14543972647",
    appId: "1:14543972647:web:1aadf3f86bbcdd1d2833b2"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Variável para guardar qual certificação está selecionada no menu lateral
let certificacaoAtiva = "Geral";

window.addEventListener('DOMContentLoaded', () => {
    carregarHistorico();
    configurarMenuLateral();
});

// Controla a troca de abas e filtros do menu lateral direito
function configurarMenuLateral() {
    const botoes = document.querySelectorAll('.btn-certificacao');
    botoes.forEach(botao => {
        botao.addEventListener('click', () => {
            // Remove a classe ativa de todos
            botoes.forEach(b => b.classList.remove('active'));
            // Adiciona no botão clicado
            botao.classList.add('active');
            
            // Atualiza a variável global e filtra a lista na hora
            certificacaoAtiva = botao.getAttribute('data-cert');
            carregarHistorico();
        });
    });
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

    btn.disabled = true;
    btn.innerText = 'Processando...';
    resultadoDiv.innerHTML = 'Consultando banco de dados do Firebase...';

    try {
        // 1. Busca a última versão existente para este arquivo no banco
        const qHistorico = query(collection(db, "versoes"), orderBy("timestamp", "desc"));
        const snapshotHistorico = await getDocs(qHistorico);
        let versaoBaseCalculada = "1.0.0"; 

        snapshotHistorico.forEach((doc) => {
            const registro = doc.data();
            if (versaoBaseCalculada === "1.0.0" && registro.nomeArquivoOriginal === fileAntigo.name) {
                versaoBaseCalculada = registro.versaoSemver;
            }
        });

        resultadoDiv.innerHTML = `Lendo e comparando estruturas dos arquivos...`;

        // 2. Extração simplificada de texto apenas para ver o que mudou de tipo
        const arrayBufferAntigo = await fileAntigo.arrayBuffer();
        const arrayBufferNovo = await fileNovo.arrayBuffer();
        
        const pdfAntigo = await pdfjsLib.getDocument({ data: arrayBufferAntigo }).promise;
        const pdfNovo = await pdfjsLib.getDocument({ data: arrayBufferNovo }).promise;

        const totalPaginas = Math.max(pdfAntigo.numPages, pdfNovo.numPages);
        let contemAdicao = false;
        let contemRemocao = false;

        for (let i = 1; i <= totalPaginas; i++) {
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
            
            diferencasPagina.forEach((part) => {
                if (part.added) contemAdicao = true;
                if (part.removed) contemRemocao = true;
            });
        }

        // 3. Regra de Versionamento Semântico
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

        // 4. Renderiza na tela e grava salvando a certificação associada
        if (mudancaDetectada === "Nenhuma") {
            resultadoDiv.innerHTML = `
                <p style="margin:0; font-weight:bold; color:#27ae60;">✓ Os arquivos são idênticos!</p>
                <p style="margin:5px 0 0 0; font-size:14px; color:#555;">Permanecendo na versão atual estável: <b>v${versaoBaseCalculada}</b></p>
            `;
        } else {
            resultadoDiv.innerHTML = `
                <p style="margin:0; font-size: 15px; color:#7f8c8d;">Versão Anterior: v${versaoBaseCalculada}</p>
                <p style="margin:5px 0; font-size: 22px; color:#2c3e50;"><b>Nova Versão: <span style="color:#3498db;">v${tagVersaoFinal}</span></b></p>
                <p style="margin:5px 0; font-size: 14px; color:#e67e22;">Tipo de Incremento: <b>${mudancaDetectada}</b></p>
                <p style="margin:5px 0 0 0; font-size: 13px; color:#4a5568;">Certificação Vinculada: <span class="placeholder" style="color:#2c3e50; font-weight:bold;">${certificacaoAtiva}</span></p>
            `;

            // Grava os dados incluindo o campo 'certificacao'
            await addDoc(collection(db, "versoes"), {
                nomeArquivo: fileNovo.name,             
                nomeArquivoOriginal: fileNovo.name,     
                versaoSemver: tagVersaoFinal,
                tipoMudanca: mudancaDetectada,
                certificacao: certificacaoAtiva, // Vincula a certificação que estava ativa no menu lateral
                data: new Date().toLocaleString('pt-BR'),
                timestamp: new Date()
            });

            carregarHistorico();
        }

    } catch (error) {
        console.error(error);
        resultadoDiv.innerHTML = `<span style="color:red;">Erro no processamento: ${error.message}</span>`;
    } finally {
        btn.disabled = false;
        btn.innerText = 'Versionar Documento';
    }
});

// Carrega o histórico filtrado pela certificação clicada
async function carregarHistorico() {
    const listaDiv = document.getElementById('lista-historico');
    try {
        const q = query(collection(db, "versoes"), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            listaDiv.innerHTML = '<p class="placeholder">Nenhuma versão salva no Firebase ainda.</p>';
            return;
        }

        let totalItensRenderizados = 0;
        listaDiv.innerHTML = '';
        
        querySnapshot.forEach((doc) => {
            const versao = doc.data();
            
            // FILTRO INTELIGENTE VIA CÓDIGO (evita precisar criar novos índices compostos no Firebase)
            if (certificacaoAtiva !== "Geral" && versao.certificacao !== certificacaoAtiva) {
                return; // Pula este registro se não for da certificação selecionada
            }

            totalItensRenderizados++;
            const item = document.createElement('div');
            item.style = "background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 10px; border-left: 4px solid #2c3e50; box-shadow: 0 1px 3px rgba(0,0,0,0.05);";
            
            // Badge da certificação
            const badgeCert = versao.certificacao ? `<span style="background: #e2e8f0; color: #4a5568; padding: 2px 6px; font-size: 11px; font-weight: bold; border-radius: 3px; margin-right: 5px;">${versao.certificacao}</span>` : '';

            item.innerHTML = `
                <span style="background: #2c3e50; color: #fff; padding: 2px 8px; font-size: 13px; font-weight: bold; border-radius: 3px; float: right;">v${versao.versaoSemver}</span>
                <strong>Apostila:</strong> ${versao.nomeArquivo} <br>
                <strong>Tipo:</strong> ${badgeCert} ${versao.tipoMudanca} <br>
                <small style="color:#7f8c8d;">Salvo em: ${versao.data}</small>
            `;
            listaDiv.appendChild(item);
        });

        if (totalItensRenderizados === 0) {
            listaDiv.innerHTML = `<p class="placeholder">Nenhum histórico de versão para a certificação <b>${certificacaoAtiva}</b>.</p>`;
        }
    } catch (e) {
        console.error(e);
        listaDiv.innerHTML = '<p style="color: red;">Erro ao carregar o histórico.</p>';
    }
}
