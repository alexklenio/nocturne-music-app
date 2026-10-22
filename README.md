# Nocturne — MVP musical pessoal

Primeira versão de uma biblioteca musical pessoal, com interface escura e foco em iPhone.

## O que já funciona
- Importar múltiplos arquivos de áudio compatíveis com o navegador.
- Guardar arquivos e metadados no IndexedDB do navegador.
- Biblioteca local, busca e favoritos.
- Reprodução, pausa, faixa anterior/próxima e barra de progresso.
- Remover faixas da biblioteca.
- Interface responsiva e manifesto PWA para adicionar à tela inicial.

## Requisitos
- Node.js 20.19+ ou 22.12+ recomendado.
- npm.
- Navegador moderno.

## Executar no computador
```bash
npm install
npm run dev
```
Abra a URL local informada pelo Vite. Para acessar pelo iPhone, computador e iPhone devem estar na mesma rede e você deve abrir o endereço de rede indicado pelo Vite. Para instalação PWA e comportamento confiável no iOS, publique a aplicação em um host com HTTPS.

## Gerar versão de produção
```bash
npm run build
npm run preview
```
O resultado será criado em `dist/`.

## Importante sobre o iPhone
- O armazenamento fica no navegador deste dispositivo e não sincroniza automaticamente entre aparelhos.
- O iOS pode limpar dados de sites em algumas circunstâncias; faça backup dos arquivos originais.
- A reprodução em segundo plano e os controles de tela bloqueada podem variar conforme a versão do iOS e a forma como o app é instalado.
- A primeira versão usa o nome do arquivo como título. Edição de metadados, leitura automática de tags, capas, playlists personalizadas, backup/exportação e testes de formatos serão etapas seguintes.
- Compatibilidade depende do codec e do navegador. MP3 e M4A/AAC costumam ser boas primeiras opções.
- Este projeto não envia os arquivos para um servidor.
