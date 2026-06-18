// CONFIGURAÇÃO DO SEU FIREBASE (Chaves oficiais extraídas da imagem)
const firebaseConfig = {
    apiKey: "AIzaSyD5N8D108XMCnWytT55XlcR6RE728S6qa5M",
    authDomain: "versionador-apostilas.firebaseapp.com",
    projectId: "versionador-apostilas",
    storageBucket: "versionador-apostilas.firebasestorage.app",
    messagingSenderId: "14543972647",
    appId: "1:14543972647:web:1aadf3f86bbcdd1d2833b2"
};

// Inicializando Firebase através dos módulos oficiais CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Variável para armazenar o texto do relatório temporariamente para o download
let relatorioAtualTexto = "";
let nomeDoArquivoNovo = "relatorio_mudancas";

// Carrega o histórico de versões salvas assim que a página abre
window.addEventListener('DOMContentLoaded', carregarHistorico);

document.getElementById('btn-comparar').addEventListener('click', async () => {
    const fileAntigo = document.getElementById('pdf-antigo').files[0];
    const fileNovo = document.getElementById('pdf-novo').files[0];
    const btn = document.getElementById('btn-comparar');
    const btnDownload = document.getElementById('btn-download-relatorio');
    const resultadoDiv = document.getElementById('resultado-diff');

    if (!fileAntigo || !fileNovo) {
        alert('Por favor, selecione os dois arquivos PDF para comparar.');
        return;
    }

    btn.disabled = true;
    btn.innerText = 'Processando...';
    btnDownload.style.display = 'none'; // Esconde o botão de baixar relatório no início
    resultadoDiv.innerHTML = 'Iniciando leitura otimizada para arquivos grandes...';
    relatorioAtualTexto = ""; // Limpa relatório anterior
    nomeDoArquivoNovo = fileNovo.name.replace(".pdf", "");

    try {
        const arrayBufferAntigo = await fileAntigo.arrayBuffer();
        const arrayBufferNovo = await fileNovo.arrayBuffer();
        
        const pdfAntigo = await pdfjsLib.getDocument({ data: arrayBufferAntigo }).promise;
        const pdfNovo = await pdfjsLib.getDocument({ data: arrayBufferNovo }).promise;

        const totalPaginas = Math.max(pdfAntigo.numPages, pdfNovo.numPages);
        let resultadoHTML = '';
        let resumoAlteracoes = ''; 

        // Cabeçalho do relatório de texto para download
        relatorioAtualTexto += `==================================================\n`;
        relatorioAtualTexto += `RELATÓRIO DE VERSIONAMENTO - MUDANÇAS ENCONTRADAS\n`;
        relatorioAtualTexto += `Data: ${new Date().toLocaleString('pt-BR')}\n`;
        relatorioAtualTexto += `Arquivo Original Base: ${fileAntigo.name}\n`;
        relatorioAtualTexto += `Arquivo Atualizado: ${fileNovo.name}\n`;
        relatorioAtualTexto += `==================================================\n\n`;

        for (let i = 1; i <= totalPaginas; i++) {
            resultadoDiv.innerHTML = `<b>Processando e Comparando:</b> Página ${i} de ${totalPaginas}...`;

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
            const temMudanca = diferencasPagina.some(part => part.added || part.removed);

            if (temMudanca) {
                resultadoHTML += `<div style="margin-top: 15px; border-bottom: 1px dashed #ccc; padding-bottom: 10px;"><b>[Alterações na Página ${i}]:</b><br>`;
                resumoAlteracoes += `[Página ${i}]: `;
                relatorioAtualTexto += `[ALTERAÇÕES NA PÁGINA ${i}]:\n`;
                
                diferencasPagina.forEach((part) => {
                    if (part.added) {
                        resultadoHTML += `<span class="added">${part.value}</span>`;
                        resumoAlteracoes += `(+) ${part.value} `;
                        relatorioAtualTexto += `   [ADICIONADO]: ${part.value}\n`;
                    } else if (part.removed) {
                        resultadoHTML += `<span class="removed">${part.value}</span>`;
                        resumoAlteracoes += `(-) ${part.value} `;
                        relatorioAtualTexto += `   [REMOVIDO]: ${part.value}\n`;
                    } else {
                        resultadoHTML += `<span> ${part.value.substring(0, 30)}... </span>`;
                    }
                });
                resultadoHTML += `</div>`;
                resumoAlteracoes += '\n';
                relatorioAtualTexto += `--------------------------------------------------\n`;
            }
        }

        if (resultadoHTML === '') {
            resultadoDiv.innerHTML = '<span style="color: #27ae60; font-family: sans-serif; font-weight: bold;">Nenhuma alteração detectada nas páginas! Os arquivos são idênticos.</span>';
        } else {
            resultadoDiv.innerHTML = resultadoHTML;

            // Mostra o botão para baixar o relatório txt
            btnDownload.style.display = 'inline-block';

            // SALVAMENTO NO FIREBASE
            resultadoDiv.innerHTML += '<br><p style="color: #3498db;"><b>Salvando nova versão no Firebase...</b></p>';
            
            await addDoc(collection(db, "versoes"), {
                nomeArquivo: fileNovo.name,
                data: new Date().toLocaleString('pt-BR'),
                timestamp: new Date(),
                mudancas: resumoAlteracoes
            });

            resultadoDiv.innerHTML += '<p style="color: #27ae60;"><b>✓ Versão gravada com sucesso no histórico!</b></p>';
            carregarHistorico();
        }

    } catch (error) {
        console.error("Erro no processamento:", error);
        resultadoDiv.innerHTML = `<span style="color: #c0392b; font-family: sans-serif;"><b>Erro ao processar:</b> ${error.message}</span>`;
    } finally {
        btn.disabled = false;
        btn.innerText = 'Comparar e Versionar';
    }
});

// Ação de clique do botão para fazer o download do arquivo de texto do relatório
document.getElementById('btn-download-relatorio').addEventListener('click', () => {
    if (!relatorioAtualTexto) return;
    
    // Cria um arquivo de texto virtual em memória
    const blob = new Blob([relatorioAtualTexto], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Força o navegador a fazer o download dele
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_mudancas_${nomeDoArquivoNovo}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
});

// Busca os dados armazenados na nuvem do Firebase e monta as caixinhas na tela
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
            item.style = "background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 10px; border-left: 4px solid #3498db; box-shadow: 0 1px 3px rgba(0,0,0,0.05);";
            item.innerHTML = `
                <strong>Arquivo atualizado:</strong> ${versao.nomeArquivo} <br>
                <strong>Modificado em:</strong> ${versao.data} <br>
                <details style="margin-top: 8px;">
                    <summary style="cursor:pointer; color: #2980b9; font-weight: 500;">Ver histórico detalhado das alterações</summary>
                    <pre style="background: #fff; padding: 10px; border: 1px solid #e2e8f0; margin-top: 5px; white-space: pre-wrap; font-family: monospace; font-size: 13px; color: #4a5568;">${versao.mudancas}</pre>
                </details>
            `;
            listaDiv.appendChild(item);
        });
    } catch (e) {
        listaDiv.innerHTML = '<p style="color: red;">Erro ao carregar o histórico de versões do Firebase. Verifique se as Regras de Segurança do Firestore permitem escrita/leitura.</p>';
        console.error(e);
    }
}
