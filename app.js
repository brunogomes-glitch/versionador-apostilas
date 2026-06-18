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
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let relatorioAtualTexto = "";
let tagVersaoFinal = "1.0.0";

window.addEventListener('DOMContentLoaded', carregarHistorico);

// CORREÇÃO: Busca ultra-compatível que não exige configuração de índices no Firebase
document.getElementById('pdf-antigo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const inputVersao = document.getElementById('versao-base');
    const statusLabel = document.getElementById('status-versao');

    if (!file) return;

    statusLabel.innerText = "Buscando histórico desta apostila no banco...";

    try {
        // Puxa os dados ordenados por tempo. O filtro de nome é feito via código para evitar erros de índice composto.
        const q = query(collection(db, "versoes"), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        
        let versaoEncontrada = null;

        // Varre os registros mais recentes procurando pelo arquivo correto
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (!versaoEncontrada && data.nomeArquivoOriginal === file.name) {
                versaoEncontrada = data.versaoSemver;
            }
        });

        if (versaoEncontrada) {
            inputVersao.value = versaoEncontrada;
            statusLabel.innerHTML = `✓ Último registro encontrado no Firebase: <b style="color: #2b6cb0;">v${versaoEncontrada}</b>. O sistema calculará a próxima a partir desta.`;
        } else {
            inputVersao.value = "1.0.0";
            statusLabel.innerHTML = "ℹ Nenhuma versão anterior encontrada no Firebase. Definido como ponto de partida inicial: <b style="color: #27ae60;">1.0.0</b>";
        }
    } catch (err) {
        console.error("Erro ao rastrear versão base:", err);
        statusLabel.innerText = "Não foi possível checar o histórico online. Mantendo padrão 1.0.0.";
        inputVersao.value = "1.0.0";
    }
});

document.getElementById('btn-comparar').addEventListener('click', async () => {
    const fileAntigo = document.getElementById('pdf-antigo').files[0];
    const fileNovo = document.getElementById('pdf-novo').files[0];
    const btn = document.getElementById('btn-comparar');
    const btnDownload = document.getElementById('btn-download-relatorio');
    const resultadoDiv = document.getElementById('resultado-diff');
    const versaoBaseInput = document.getElementById('versao-base').value.trim();

    if (!fileAntigo || !fileNovo) {
        alert('Por favor, selecione os dois arquivos PDF para comparar.');
        return;
    }

    btn.disabled = true;
    btn.innerText = 'Processando...';
    btnDownload.style.display = 'none'; 
    resultadoDiv.innerHTML = 'Analisando arquivos...';
    relatorioAtualTexto = ""; 

    try {
        const arrayBufferAntigo = await fileAntigo.arrayBuffer();
        const arrayBufferNovo = await fileNovo.arrayBuffer();
        
        const pdfAntigo = await pdfjsLib.getDocument({ data: arrayBufferAntigo }).promise;
        const pdfNovo = await pdfjsLib.getDocument({ data: arrayBufferNovo }).promise;

        const totalPaginas = Math.max(pdfAntigo.numPages, pdfNovo.numPages);
        let resultadoHTML = '';
        let resumoAlteracoes = ''; 
        
        let contemAdicao = false;
        let contemRemocao = false;
        let corpoDiferencasMarkdown = "";

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
                resultadoHTML += `<div style="margin-top: 15px; border-bottom: 1px dashed #ccc; padding-bottom: 10px;"><b>[Página ${i}]:</b><br>`;
                resumoAlteracoes += `[Página ${i}]: `;
                corpoDiferencasMarkdown += `### 📄 Página ${i}\n\`\`\`diff\n`;
                
                diferencasPagina.forEach((part) => {
                    if (part.added) {
                        resultadoHTML += `<span class="added">${part.value}</span>`;
                        resumoAlteracoes += `(+) ${part.value} `;
                        corpoDiferencasMarkdown += `+ ${part.value.trim()}\n`;
                        contemAdicao = true;
                    } else if (part.removed) {
                        resultadoHTML += `<span class="removed">${part.value}</span>`;
                        resumoAlteracoes += `(-) ${part.value} `;
                        corpoDiferencasMarkdown += `- ${part.value.trim()}\n`;
                        contemRemocao = true;
                    } else {
                        resultadoHTML += `<span> ${part.value.substring(0, 20)}... </span>`;
                    }
                });
                resultadoHTML += `</div>`;
                resumoAlteracoes += '\n';
                corpoDiferencasMarkdown += `\`\`\`\n\n`;
            }
        }

        if (resultadoHTML === '') {
            resultadoDiv.innerHTML = '<span style="color: #27ae60; font-family: sans-serif; font-weight: bold;">Nenhuma alteração detectada nas páginas! Os arquivos são idênticos.</span>';
        } else {
            tagVersaoFinal = calcularNovaVersao(versaoBaseInput, contemAdicao, contemRemocao);

            relatorioAtualTexto += `# 🚀 Release [v${tagVersaoFinal}]\n\n`;
            relatorioAtualTexto += `* **Data:** ${new Date().toLocaleString('pt-BR')}\n`;
            relatorioAtualTexto += `* **Versão Anterior:** \`${versaoBaseInput}\` ➔ **Nova Versão:** \`${tagVersaoFinal}\`\n`;
            relatorioAtualTexto += `* **Arquivo Atualizado:** \`${fileNovo.name}\`\n\n`;
            relatorioAtualTexto += `## 🛠 Log de Alterações (Diff)\n\n`;
            relatorioAtualTexto += corpoDiferencasMarkdown;

            resultadoDiv.innerHTML = `<p style="font-size: 18px; color: #2c3e50;"><b>Nova versão calculada: <span style="background:#2c3e50; color:#fff; padding: 2px 8px; border-radius:4px;">${tagVersaoFinal}</span></b></p>` + resultadoHTML;

            btnDownload.style.display = 'inline-block';

            resultadoDiv.innerHTML += '<br><p style="color: #3498db;"><b>Gravando registro no Firebase...</b></p>';
            
            await addDoc(collection(db, "versoes"), {
                nomeArquivo: fileNovo.name,             
                nomeArquivoOriginal: fileNovo.name,     
                versaoSemver: tagVersaoFinal,
                data: new Date().toLocaleString('pt-BR'),
                timestamp: new Date(),
                mudancas: resumoAlteracoes
            });

            resultadoDiv.innerHTML += '<p style="color: #27ae60;"><b>✓ Versão ' + tagVersaoFinal + ' gravada com sucesso!</b></p>';
            carregarHistorico();
        }

    } catch (error) {
        console.error(error);
        resultadoDiv.innerHTML = `Erro ao processar: ${error.message}`;
    } finally {
        btn.disabled = false;
        btn.innerText = 'Comparar e Versionar';
    }
});

function calcularNovaVersao(versaoAtual, temAdicao, temRemocao) {
    let partes = versaoAtual.split('.');
    if (partes.length !== 3) partes = [1, 0, 0];
    
    let major = parseInt(partes[0]) || 1;
    let minor = parseInt(partes[1]) || 0;
    let patch = parseInt(partes[2]) || 0;

    if (temAdicao) {
        minor += 1;
        patch = 0;
    } else if (temRemocao) {
        patch += 1;
    }
    
    return `${major}.${minor}.${patch}`;
}

document.getElementById('btn-download-relatorio').addEventListener('click', () => {
    if (!relatorioAtualTexto) return;
    const blob = new Blob([relatorioAtualTexto], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RELEASE_v${tagVersaoFinal}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
});

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
                <span style="background: #2c3e50; color: #fff; padding: 2px 6px; font-size: 12px; font-weight: bold; border-radius: 3px; float: right;">v${versao.versaoSemver || '1.0.0'}</span>
                <strong>Arquivo:</strong> ${versao.nomeArquivo} <br>
                <strong>Modificado em:</strong> ${versao.data} <br>
                <details style="margin-top: 8px;">
                    <summary style="cursor:pointer; color: #2980b9; font-weight: 500;">Ver diff em texto da versão</summary>
                    <pre style="background: #fff; padding: 10px; border: 1px solid #e2e8f0; margin-top: 5px; white-space: pre-wrap; font-family: monospace; font-size: 13px; color: #4a5568;">${versao.mudancas}</pre>
                </details>
            `;
            listaDiv.appendChild(item);
        });
    } catch (e) {
        listaDiv.innerHTML = '<p style="color: red;">Erro ao carregar o histórico.</p>';
    }
}
