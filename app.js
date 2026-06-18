// Worker atualizado e configurado corretamente
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

document.getElementById('btn-comparar').addEventListener('click', async () => {
    const fileAntigo = document.getElementById('pdf-antigo').files[0];
    const fileNovo = document.getElementById('pdf-novo').files[0];
    const btn = document.getElementById('btn-comparar');
    const resultadoDiv = document.getElementById('resultado-diff');

    if (!fileAntigo || !fileNovo) {
        alert('Por favor, selecione os dois arquivos PDF para comparar.');
        return;
    }

    // Desativa o botão para evitar cliques duplos
    btn.disabled = true;
    btn.innerText = 'Processando e Comparando...';
    resultadoDiv.innerHTML = 'Lendo o primeiro PDF (Versão Antiga)...';

    try {
        // 1. Extrai o texto do primeiro PDF
        const textoAntigo = await extrairTextoPDF(fileAntigo);
        
        // Atualiza o status
        resultadoDiv.innerHTML = 'Primeiro PDF lido com sucesso! Lendo o segundo PDF (Versão Nova)...';
        
        // 2. Extrai o texto do segundo PDF
        const textoNovo = await extrairTextoPDF(fileNovo);
        
        // Atualiza o status
        resultadoDiv.innerHTML = 'Comparando as diferenças nos textos...';

        // 3. Faz a comparação palavra por palavra
        const diferencas = Diff.diffWords(textoAntigo, textoNovo);

        // 4. Renderiza o resultado
        resultadoDiv.innerHTML = ''; 
        
        if (diferencas.length === 1 && !diferencas[0].added && !diferencas[0].removed) {
            resultadoDiv.innerHTML = '<span style="color: #27ae60; font-family: sans-serif; font-weight: bold;">Nenhuma alteração encontrada! Os textos são 100% idênticos.</span>';
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
        console.error("Erro detalhado:", error);
        resultadoDiv.innerHTML = `<span style="color: #c0392b; font-family: sans-serif; font-weight: bold;">
            Ih, travou! Erro ao processar: ${error.message}. <br><br>
            Certifique-se de que o segundo PDF não é apenas uma imagem digitalizada ou está protegido por senha.
        </span>`;
    } finally {
        // Libera o botão novamente
        btn.disabled = false;
        btn.innerText = 'Comparar Versões';
    }
});

// Função de extração otimizada com tratamento de erro por página
async function extrairTextoPDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let textoCompleto = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            try {
                const pagina = await pdf.getPage(i);
                const conteudoTexto = await pagina.getTextContent();
                const textoPagina = conteudoTexto.items.map(item => item.str).join(' ');
                textoCompleto += textoPagina + '\n';
            } catch (pageError) {
                console.warn(`Erro na página ${i}, pulando para a próxima...`, pageError);
                // Se uma página falhar (por causa de um gráfico corrompido, ex), o sistema pula ela e não trava tudo
                continue;
            }
        }
        return textoCompleto;
    } catch (err) {
        throw new Error(`Falha ao abrir o arquivo "${file.name}" (${err.message})`);
    }
}
