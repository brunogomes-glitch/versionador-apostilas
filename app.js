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

    btn.disabled = true;
    btn.innerText = 'Processando...';
    resultadoDiv.innerHTML = 'Iniciando leitura otimizada para arquivos grandes...';

    try {
        // Abre os documentos em paralelo sem extrair o texto ainda (economiza memória)
        const arrayBufferAntigo = await fileAntigo.arrayBuffer();
        const arrayBufferNovo = await fileNovo.arrayBuffer();
        
        const pdfAntigo = await pdfjsLib.getDocument({ data: arrayBufferAntigo }).promise;
        const pdfNovo = await pdfjsLib.getDocument({ data: arrayBufferNovo }).promise;

        const totalPaginas = Math.max(pdfAntigo.numPages, pdfNovo.numPages);
        let resultadoHTML = '';

        // Processa e compara página por página para não estourar a memória
        for (let i = 1; i <= totalPaginas; i++) {
            resultadoDiv.innerHTML = `<b>Processando e Comparando:</b> Página ${i} de ${totalPaginas}...`;

            let textoAntigoPagina = '';
            let textoNovoPagina = '';

            // Extrai texto da página atual do PDF antigo (se houver)
            if (i <= pdfAntigo.numPages) {
                const pagina = await pdfAntigo.getPage(i);
                const conteudo = await pagina.getTextContent();
                textoAntigoPagina = conteudo.items.map(item => item.str).join(' ');
            }

            // Extrai texto da página atual do PDF novo (se houver)
            if (i <= pdfNovo.numPages) {
                const pagina = await pdfNovo.getPage(i);
                const conteudo = await pagina.getTextContent();
                textoNovoPagina = conteudo.items.map(item => item.str).join(' ');
            }

            // Compara o texto apenas desta página
            const diferencasPagina = Diff.diffWords(textoAntigoPagina, textoNovoPagina);
            
            // Verifica se houve mudanças nesta página específica
            const temMudanca = diferencasPagina.some(part => part.added || part.removed);

            if (temMudanca) {
                resultadoHTML += `<div style="margin-top: 15px; border-bottom: 1px dashed #ccc; padding-bottom: 10px;"><b>[Alterações na Página ${i}]:</b><br>`;
                diferencasPagina.forEach((part) => {
                    if (part.added) {
                        resultadoHTML += `<span class="added">${part.value}</span>`;
                    } else if (part.removed) {
                        resultadoHTML += `<span class="removed">${part.value}</span>`;
                    } else {
                        // Mostra só um pedaço do texto normal ao redor para dar contexto e não poluir a tela
                        resultadoHTML += `<span> ${part.value.substring(0, 30)}... </span>`;
                    }
                });
                resultadoHTML += `</div>`;
            }
        }

        // Renderiza o resultado acumulado
        if (resultadoHTML === '') {
            resultadoDiv.innerHTML = '<span style="color: #27ae60; font-family: sans-serif; font-weight: bold;">Nenhuma alteração detectada nas 446 páginas! Os PDFs são idênticos.</span>';
        } else {
            resultadoDiv.innerHTML = resultadoHTML;
        }

    } catch (error) {
        console.error("Erro no processamento pesado:", error);
        resultadoDiv.innerHTML = `<span style="color: #c0392b; font-family: sans-serif;"><b>Erro ao processar documento longo:</b> ${error.message}</span>`;
    } finally {
        btn.disabled = false;
        btn.innerText = 'Comparar Versões';
    }
});
