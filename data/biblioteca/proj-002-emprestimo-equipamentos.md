# Empréstimo de Equipamentos

> Documento fictício da Biblioteca de Projetos de demonstração.

## Contexto
Notebooks, projetores e kits de áudio eram emprestados com um caderno de protocolo no balcão de atendimento. A devolução era conferida no olho.

## Problema
Não havia histórico confiável de quem estava com cada equipamento, atrasos só eram percebidos quando outro setor precisava do item e não existia relatório de uso para planejar compras.

## Objetivo
Controlar retirada e devolução de equipamentos com histórico por item e por pessoa, alertas de atraso e visão de disponibilidade.

## Escopo do MVP
- Cadastro de equipamentos com patrimônio, categoria e estado de conservação
- Registro de retirada vinculado à pessoa e ao prazo de devolução
- Registro de devolução com checklist de conferência do estado
- Lista de empréstimos em aberto e atrasados
- Alerta automático de atraso para quem retirou e para o balcão
- Histórico de movimentações por equipamento

## Fora do escopo
- Reserva antecipada de equipamentos
- Leitura por QR Code nesta primeira versão
- Integração com o sistema de compras

## Histórias de usuário

### HU-01 — Registrar retirada
Como atendente do balcão, quero registrar a retirada de um equipamento para uma pessoa com prazo de devolução, para saber com quem cada item está.
- Dado um equipamento disponível, quando eu registro a retirada, então ele passa a constar como emprestado com o prazo informado.

### HU-02 — Alertar atraso
Como responsável pelo acervo, quero ser avisado dos empréstimos atrasados, para cobrar a devolução antes que outro setor precise do item.
- Dado um empréstimo com prazo vencido, quando a rotina diária roda, então quem retirou e o balcão recebem o alerta.

## Integrações
- Cadastro de pessoas do diretório institucional
- E-mail institucional para alertas de atraso

## Riscos e cuidados
- Um item pode ter várias movimentações por dia; o histórico deve ser imutável
- Auditoria central de todas as alterações de estado
- Dados pessoais restritos ao necessário para o empréstimo

## Situação
Homologado e em uso. O modelo de alocação e histórico serve de base para outros controles de ativos.
