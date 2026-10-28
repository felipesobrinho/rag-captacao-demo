# Pesquisa de Satisfação de Eventos

> Documento fictício da Biblioteca de Projetos de demonstração.

## Contexto
Ao fim de cada evento, a equipe montava um formulário novo, enviava manualmente e consolidava as respostas numa planilha.

## Problema
Perguntas diferentes a cada evento impediam comparar resultados, e a consolidação manual atrasava o retorno para os organizadores.

## Objetivo
Padronizar a pesquisa de satisfação, enviar automaticamente após o evento e apresentar os resultados num painel.

## Escopo do MVP
- Questionário padrão com perguntas fixas e uma pergunta aberta
- Envio automático para os participantes no dia seguinte ao evento
- Painel com nota média, distribuição das respostas e comentários
- Comparação entre eventos do mesmo tipo

## Fora do escopo
- Questionários personalizados por evento
- Análise automática de sentimento dos comentários

## Histórias de usuário

### HU-01 — Receber pesquisa
Como participante, quero receber a pesquisa logo após o evento, para avaliar enquanto a experiência está recente.
- Dado um evento encerrado, quando a rotina do dia seguinte roda, então cada participante recebe o link da pesquisa.

### HU-02 — Ver resultado
Como organizador, quero ver o resultado consolidado do meu evento, para planejar melhorias na próxima edição.
- Dado respostas recebidas, quando eu abro o painel, então vejo a nota média e os comentários do evento.

## Integrações
- Lista de participantes do sistema de inscrições
- Ferramenta de formulários institucional

## Riscos e cuidados
- Respostas anônimas por padrão
- Baixa taxa de resposta se o envio atrasar

## Situação
Homologado. Base para outras coletas recorrentes com painel de resultados.
