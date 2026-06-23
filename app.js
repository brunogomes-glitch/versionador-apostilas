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

window.addEventListener('DOMContentLoaded', carregarHistorico);

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

        // 3. Regra de Negócio de incremento SemVer pura
        let mudancaDetectada = "Nenhuma";
        let tagVersaoFinal = versaoBaseCalculada;

        if (contemAdicao) {
            // Textos novos adicionados significam uma atualização MINOR (ex: 1.0.0 -> 1.1.0)
            let partes = versaoBaseCalculada.split('.');
            let major = parseInt(partes[0]) || 1;
            let minor = parseInt(partes[1]) || 0;
            
            minor += 1;
            tagVersaoFinal = `${major}.${minor}.0`;
            mudancaDetectada = "MINOR (Conteúdo Adicionado)";
        } else if (contemRemocao) {
            // Apenas exclusões ou correções geram um PATCH (ex: 1.0.0 -> 1.0.1)
            let partes = versaoBaseCalculada.split('.');
            let major = parseInt(partes[0]) || 1;
            let minor = parseInt(partes[1]) || 0;
            let patch = parseInt(partes[2]) || 0;
            
            patch += 1;
            tagVersaoFinal = `${major}.${minor}.${patch}`;
            mudancaDetectada = "PATCH (Pequenas Correções/Remoções)";
        }

        // 4. Renderiza na tela de forma limpa e objetiva
        if (mudancaDetectada === "Nenhuma") {
            resultadoDiv.innerHTML = `
                <p style="margin:0; font-weight:bold; color:#27ae60;">✓ Os arquivos são idênticos!</p>
                <p style="margin:5px 0 0 0; font-size:14px; color:#555;">Permanecendo na versão atual estável: <b>v${versaoBaseCalculada}</b></p>
            `;
        } else {
            resultadoDiv.innerHTML = `
                <p style="margin:0; font-size: 15px; color:#7f8c8d;">Versão Anterior: v${versaoBaseCalculada}</p>
                <p style="margin:5px 0; font-size: 22px; color:#2c3e50;"><b>Nova Versão: <span style="color:#3498db;">v${tagVersaoFinal}</span></b></p>
                <p style="margin:5px 0 0 0; font-size: 14px; color:#e67e22;">Tipo de Incremento: <b>${mudancaDetectada}</b></p>
            `;

            // Grava os dados limpos no Firebase Firestore
            await addDoc(collection(db, "versoes"), {
                nomeArquivo: fileNovo.name,             
                nomeArquivoOriginal: fileNovo.name,     
                versaoSemver: tagVersaoFinal,
                tipoMudanca: mudancaDetectada,
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

// Carrega a lista limpa na parte inferior do painel
async function carregarHistorico() {
    const listaDiv = document.getElementById('lista-historico');
    try {
        const q = query(collection(db, "versoes"), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            listaDiv.innerHTML = '<p class="placeholder">Nenhuma versão salva no Firebase ainda.</p>';
            return;
        }

        listaDiv.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const versao = doc.data();
            const item = document.createElement('div');
            item.style = "background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 10px; border-left: 4px solid #2c3e50; box-shadow: 0 1px 3px rgba(0,0,0,0.05);";
            item.innerHTML = `
                <span style="background: #2c3e50; color: #fff; padding: 2px 8px; font-size: 13px; font-weight: bold; border-radius: 3px; float: right;">v${versao.versaoSemver}</span>
                <strong>Apostila:</strong> ${versao.nomeArquivo} <br>
                <strong>Tipo:</strong> ${versao.tipoMudanca} <br>
                <small style="color:#7f8c8d;">Salvo em: ${versao.data}</small>
            `;
            listaDiv.appendChild(item);
        });
    } catch (e) {
        listaDiv.innerHTML = '<p style="color: red;">Erro ao carregar o histórico.</p>';
    }
}
