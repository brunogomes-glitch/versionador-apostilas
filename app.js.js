// Configura o worker do PDF.js obrigatório para a biblioteca funcionar
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

    // Altera o estado do botão para o usuário saber que está processando
    btn.disabled = true;
    btn.innerText = 'Processando e Comparando...';
    resultadoDiv.innerHTML = 'Extraindo textos dos PDFs...';

    try {
        // 1. Extrai o texto de ambos os PDFs
        const textoAntigo = await extrairTextoPDF(fileAntigo);
        resultadoDiv.innerHTML = 'Texto antigo extraído. Extraindo novo texto...';
        
        const textoNovo = await extrairTextoPDF(fileNovo);
        resultadoDiv.innerHTML = 'Comparando as versões...';

        // 2. Faz a comparação palavra por palavra usando a biblioteca jsdiff
        const diferencas = Diff.diffWords(textoAntigo, textoNovo);

        // 3. Renderiza o resultado na tela com as cores corretas
        resultadoDiv.innerHTML = ''; // Limpa o carregando
        
        if (diferencas.length === 1 && !diferencas[0].added && !diferencas[0].removed) {
            resultadoDiv.innerHTML = '<span style="color: #27ae60; font-family: sans-serif;">Nenhuma alteração encontrada! Os PDFs são idênticos em texto.</span>';
        } else {
            diferencas.forEach((part) => {
                // Cria um elemento span para cada pedaço de texto
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
        console.error(error);
        resultadoDiv.innerHTML = '<span style="color: #c0392b;">Ocorreu um erro ao processar os arquivos. Certifique-se de que não são PDFs protegidos ou apenas imagens.</span>';
    } finally {
        // Restaura o botão
        btn.disabled = false;
        btn.innerText = 'Comparar Versões';
    }
});

// Função auxiliar para ler o PDF e juntar o texto de todas as páginas
async function extrairTextoPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let textoCompleto = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const pagina = await pdf.getPage(i);
        const conteudoTexto = await pagina.getTextContent();
        
        // Junta os itens de texto da página com espaços
        const textoPagina = conteudoTexto.items.map(item => item.str).join(' ');
        textoCompleto += textoPagina + '\n'; // Adiciona quebra de linha entre páginas
    }

    return textoCompleto;
}