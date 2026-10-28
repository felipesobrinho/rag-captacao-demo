# Emissão de Certificados Digitais

> Documento fictício da Biblioteca de Projetos de demonstração.

## Contexto
Certificados de cursos de extensão eram montados um a um num editor de texto, a partir da lista de presença, e enviados por e-mail.

## Problema
Demora na entrega, erros de digitação em nomes e cargas horárias e nenhuma forma de terceiros verificarem se um certificado é autêntico.

## Objetivo
Emitir certificados em lote a partir da frequência registrada, com código de verificação público.

## Escopo do MVP
- Cadastro do evento ou curso com carga horária e frequência mínima
- Importação da lista de participantes e da frequência
- Geração em lote dos certificados em PDF a partir de um modelo
- Código de verificação único por certificado
- Página pública de verificação de autenticidade
- Envio do link do certificado para o participante

## Fora do escopo
- Assinatura digital com certificado ICP
- Emissão de declarações parciais
- Personalização visual por participante

## Histórias de usuário

### HU-01 — Emitir em lote
Como coordenador de extensão, quero emitir os certificados de todos os participantes aptos de uma vez, para entregar no mesmo dia do encerramento.
- Dado participantes com frequência igual ou acima do mínimo, quando eu emito o lote, então cada um recebe um certificado com código único.

### HU-02 — Verificar autenticidade
Como pessoa externa, quero validar um certificado pelo código, para confirmar que ele é verdadeiro.
- Dado um código válido, quando eu consulto a página pública, então vejo o nome do curso, a carga horária e a data de emissão.

## Integrações
- Lista de presença exportada da plataforma de cursos
- E-mail institucional para envio do link

## Riscos e cuidados
- Página pública não pode expor dados além do necessário para a verificação
- Modelo de certificado versionado para não alterar documentos já emitidos

## Situação
Homologado e em uso. Reaproveitável para qualquer documento emitido em lote com verificação pública.
