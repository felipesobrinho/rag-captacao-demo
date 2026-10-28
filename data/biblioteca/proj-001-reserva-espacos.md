# Reserva de Espaços Compartilhados

> Documento fictício da Biblioteca de Projetos de demonstração.

## Contexto
As salas de reunião e o auditório do Instituto Exemplo eram reservados por uma planilha compartilhada e por e-mail. Cada setor anotava o pedido de um jeito e a equipe administrativa confirmava manualmente.

## Problema
Reservas duplicadas no mesmo horário, pedidos sem aprovação registrada e nenhuma visão consolidada da ocupação dos espaços. Quando um evento era cancelado, o espaço continuava bloqueado na planilha.

## Objetivo
Centralizar as reservas de espaços com aprovação, controle de conflito de horário e aviso automático às equipes de apoio.

## Escopo do MVP
- Cadastro de espaços com capacidade e recursos disponíveis
- Solicitação de reserva com data, horário de início e de fim e finalidade
- Bloqueio automático de conflito de horário no mesmo espaço
- Fluxo de aprovação com estados: solicitada, aprovada, recusada e cancelada
- Aviso para a equipe de apoio quando a reserva é aprovada
- Agenda semanal de ocupação por espaço

## Fora do escopo
- Cobrança de uso por parte de público externo
- Reserva recorrente para o semestre inteiro
- Aplicativo móvel nativo

## Histórias de usuário

### HU-01 — Solicitar reserva
Como servidor de um setor, quero solicitar a reserva de um espaço informando data, horário e finalidade, para garantir o local da minha atividade.
- Dado que o espaço está livre no horário, quando eu envio a solicitação, então a reserva fica com status solicitada.
- Dado que já existe reserva aprovada no mesmo horário, quando eu tento reservar, então o sistema bloqueia e mostra os horários livres.

### HU-02 — Aprovar reserva
Como responsável pelos espaços, quero aprovar ou recusar solicitações com justificativa, para manter a agenda organizada.
- Dado uma solicitação pendente, quando eu aprovo, então a equipe de apoio recebe o aviso e a agenda é atualizada.

## Integrações
- Calendário institucional para publicar as reservas aprovadas
- Canal da equipe de apoio para avisos de montagem do espaço
- Login institucional (SSO) para identificar o solicitante

## Riscos e cuidados
- Conflito de horário precisa ser validado no banco, não só na tela
- Ciclo de vida da reserva modelado como máquina de estados para evitar transições inválidas
- Auditoria de quem aprovou, recusou ou cancelou cada reserva

## Situação
Homologado e em uso. Reaproveitável para qualquer recurso que precise de agenda com aprovação.
