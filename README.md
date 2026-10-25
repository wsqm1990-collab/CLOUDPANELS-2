# CloudPanels — iPad

Leitor de quadrinhos para iPad que lê sua coleção direto do MEGA.

**Abrir / instalar:** https://wsqm1990-collab.github.io/CLOUDPANELS-2/
No iPad, abra no Safari → Compartilhar → **Adicionar à Tela de Início**. O app abre em tela cheia, sem as barras do Safari.

## O que tem
- CBZ, **CBR**, CB7, CBT, PDF, JPG/PNG/WebP (um ".cbr" que na verdade é ZIP é lido página por página)
- Leitura por quadro; com o iPad deitado, a página inteira preenche a largura da tela
- Página dupla na horizontal (pode desligar em "Enquadramento da página")
- Toque duplo para zoom, gestos de deslizar, teclado
- Baixar quadrinhos ou pastas inteiras para ler offline; arquivos importados ficam salvos no iPad
- A sessão do MEGA fica lembrada no aparelho (a senha nunca é salva)
- Assistente de quadrinhos com IA (Claude): recomendações, ordem de leitura, edições faltando, voz
- Histórico, onde você parou e preferências sincronizam pelo seu MEGA (pasta CloudPanels), para continuar em outro aparelho

## Para desenvolvedores
Código web em `src/`, testes em `test/` (`npm test`), build com `node scripts/build.mjs` (gera `dist/`).
A versão publicada fica no branch `gh-pages`.
Baseado no CloudPanels Android 0.7.2. Decodificação de RAR/7z por libarchive.js (WebAssembly).
