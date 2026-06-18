// Configuração do motor (worker) usando a mesma versão da biblioteca principal
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

document.getElementById('btn-comparar').addEventListener('click', async () => {
    const fileAntigo = document.getElementById('pdf-antigo').files[0];
    const fileNovo = document.getElementById('pdf-novo').files[0];
    const btn = document.getElementById('btn-comparar');
    const resultadoDiv = document.getElementById('resultado-diff');

    if (!fileAntigo || !fileNovo) {
        alert('Por favor, selecione os dois arquivos PDF para comparar.');
        return;
    }

    // Bloqueia botão e inicia processamento
    btn.disabled = true;
    btn.innerText = 'Processando...';
    resultadoDiv.innerHTML = 'Carregando arquivo base...';

    try {
        // 1. Extração do PDF antigo com feedback visual
        const textoAntigo = await extrairTextoDoPDF(fileAntigo, (pAtual, pTotal) => {
            resultadoDiv.innerHTML = `<b>Lendo PDF Antigo:</b> Página ${pAtual} de ${pTotal}...`;
        });
        
        // 2. Extração do PDF novo com feedback visual
        resultadoDiv.innerHTML = 'Carregando arquivo novo...';
        const textoNovo = await extrairTextoDoPDF(fileNovo, (pAtual, pTotal) => {
            resultadoDiv.innerHTML = `<b>Lendo PDF Novo (Atualizado):</b> Página ${pAtual} de ${pTotal}...`;
        });
        
        // 3. Comparação de textos
        resultadoDiv.innerHTML = 'Cruzando informações e gerando histórico...';
        const diferencas = Diff.diffWords(textoAntigo, textoNovo);

        // 4. Renderização do resultado final
        resultadoDiv.innerHTML = ''; 
        
        if (diferencas.length === 1 && !diferencas[0].added && !diferencas[0].removed) {
            resultadoDiv.innerHTML = '<span style="color: #27ae60; font-family: sans-serif; font-weight: bold;">Nenhuma alteração detectada! Os PDFs são idênticos em texto.</span>';
        } else {
            diferencas.forEach((part) => {
                const span = document.createElement('span');
                span.textContent = part.value;

                if (part.added) {
                    span.className = 'added';
                } else if (part.removed) {
                    span.className = 'removed';
                }
                resultadoDiv.appendChild(span);
            });
        }

    } catch (error) {
        console.error("Erro capturado:", error);
        resultadoDiv.innerHTML = `<span style="color: #c0392b; font-family: sans-serif;"><b>Erro no processamento:</b> ${error.message}<br><br>Verifique se os arquivos não estão corrompidos ou protegidos por senha.</span>`;
    } finally {
        // Devolve o controle ao botão
        btn.disabled = false;
        btn.innerText = 'Comparar Versões';
    }
});

// Função otimizada para ler arquivos binários de PDF página por página
async function extrairTextoDoPDF(file, progressoCallback) {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let textoAcumulado = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        progressoCallback(i, pdf.numPages); // Envia o número da página atual para a tela
        const pagina = await pdf.getPage(i);
        const conteudoTexto = await pagina.getTextContent();
        const textoPagina = conteudoTexto.items.map(item => item.str).join(' ');
        textoAcumulado += textoPagina + '\n';
    }
    return textoAcumulado;
}
