# Chamados de Manutenção Predial

> Documento fictício da Biblioteca de Projetos de demonstração.

## Contexto
Pedidos de manutenção chegavam por telefone, e-mail e mensagens, sem número de protocolo nem prioridade definida.

## Problema
Pedidos perdidos, retrabalho para descobrir o que já tinha sido atendido e nenhum dado sobre tempo de atendimento por tipo de serviço.

## Objetivo
Receber pedidos por um formulário único, triar por prioridade e acompanhar o atendimento até o fechamento.

## Escopo do MVP
- Formulário de abertura com local, tipo de serviço, descrição e foto opcional
- Número de protocolo e acompanhamento do status pelo solicitante
- Triagem com prioridade e responsável pelo atendimento
- Notificação ao solicitante a cada mudança de status
- Painel com chamados abertos, em atendimento e encerrados por tipo

## Fora do escopo
- Controle de estoque de materiais
- Manutenção preventiva programada
- Gestão de contratos de terceiros

## Histórias de usuário

### HU-01 — Abrir chamado
Como servidor, quero abrir um chamado informando local e problema, para que a manutenção registre e priorize o atendimento.
- Dado o formulário preenchido, quando eu envio, então recebo um número de protocolo e o chamado entra na fila de triagem.

### HU-02 — Triar chamado
Como supervisor de manutenção, quero definir prioridade e responsável, para atender primeiro o que é crítico.
- Dado um chamado novo, quando eu defino a prioridade, então o responsável é avisado e o prazo esperado aparece para o solicitante.

## Integrações
- Formulário institucional como porta de entrada
- Canal de mensagens da equipe de manutenção para avisos de novos chamados críticos

## Riscos e cuidados
- Integrações externas não podem bloquear a abertura do chamado; falhas são registradas e reprocessadas
- Definir com a área o que é prioridade crítica antes de automatizar a triagem

## Situação
Homologado e em uso. O fluxo formulário → triagem → acompanhamento é o padrão para novas portas de entrada de demandas.
