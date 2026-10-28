# Cálculo de Repasses a Parceiros

> Documento fictício da Biblioteca de Projetos de demonstração.

## Contexto
O setor financeiro calculava repasses a parceiros de cursos em planilhas com fórmulas diferentes por contrato. Cada fechamento mensal exigia conferência linha a linha.

## Problema
Regras de cálculo espalhadas em planilhas, risco de erro em fórmulas copiadas, nenhuma trilha de quem alterou um valor e retrabalho a cada mudança de contrato.

## Objetivo
Parametrizar as regras de cálculo por contrato, gerar o demonstrativo do mês e manter trilha de auditoria de cada ajuste.

## Escopo do MVP
- Cadastro de contratos com regra de cálculo parametrizada (percentual, valor fixo ou faixa)
- Importação das receitas do mês a partir de arquivo padronizado
- Cálculo do repasse por contrato com memória de cálculo
- Conferência e aprovação do fechamento pelo responsável financeiro
- Exportação do demonstrativo em PDF e planilha
- Trilha de auditoria de ajustes manuais com justificativa obrigatória

## Fora do escopo
- Pagamento automático ao parceiro
- Integração direta com o ERP contábil nesta fase
- Simulação de cenários futuros

## Histórias de usuário

### HU-01 — Calcular fechamento
Como analista financeiro, quero calcular os repasses do mês a partir das receitas importadas, para não depender de fórmulas manuais.
- Dado contratos com regra cadastrada e receitas importadas, quando eu calculo o fechamento, então cada contrato mostra o valor e a memória de cálculo.

### HU-02 — Ajustar com justificativa
Como analista financeiro, quero ajustar um valor informando o motivo, para corrigir exceções sem perder a rastreabilidade.
- Dado um repasse calculado, quando eu altero o valor, então a justificativa é obrigatória e o ajuste fica registrado na auditoria.

## Integrações
- Arquivo de receitas exportado pelo sistema acadêmico
- Armazenamento de documentos para guardar os demonstrativos

## Riscos e cuidados
- Regra de negócio de cálculo precisa de testes com casos reais anonimizados antes da homologação
- Arredondamento definido por escrito com o financeiro
- Leitura dos sistemas de origem somente por consulta, sem escrita

## Situação
Homologado. O padrão de regra parametrizada com memória de cálculo é referência para outros cálculos financeiros.
