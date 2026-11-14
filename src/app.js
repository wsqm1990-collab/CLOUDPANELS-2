import {createBrowserLibraryStore, clearLegacyBrowserLibrary, parseMetadata, MAX_BACKUP_BYTES} from './store.js';
import {getNativeAccounts} from './native-accounts.js';
import {openAccountGate, showAccountSettings} from './account-gate.js';
import {MegaConnection} from './mega.js';
import {createReaderController} from './reader-ui.js';
import {CoverService} from './covers.js';
import {createCloudSync, syncReadingPositions} from './cloud-sync.js';
import {OfflineLibrary} from './offline.js';
import {streamToCbz,verifyCbz} from './convert.js';
import {clearArchiveListings} from './reader.js';
import {aloudEvents,interruptedListening,noteAloud} from './aloud-log.js';
import {assistantStore,buildLibraryIndex,libraryBrief,libraryTools,collectionTools,systemPrompt,askAssistant,friendlyError,speechInputAvailable,listen,speak,stopSpeaking} from './assistant.js';
import {filterComics, sortComics, formatBytes, statusOf, publicError, catalogAnswer, folderContents, isInsideFolder, comicFolderParts, upNextComics, nextComicInFolder, coverPicks} from './app-helpers.js';
import {collectionItems, nextInCollection, continueInCollection} from './collection-order.js';
import {sagaWheelCard, openSagaWheel} from './saga-wheel-view.js';

const copy = {
  en: {
    yourLibrary:'YOUR LIBRARY',discover:'DISCOVER',library:'Library',continueReading:'Continue reading',continueShort:'Reading',collections:'Collections',assistant:'Comics assistant',assistantShort:'Assistant',settings:'Settings',cloudFirst:'A big library. A little space.',cloudFirstDetail:'Keep your comics in the cloud.',notConnected:'Not connected',connected:'MEGA connected',importFiles:'Import files',connectMega:'Connect MEGA',manageMega:'Manage MEGA',searchPlaceholder:'Search titles, publishers, characters…',universe:'YOUR PERSONAL COMIC UNIVERSE',subtitle:'Every story, right where you left it.',moreStories:'MORE STORIES. LESS STORAGE.',heroTitle:'A whole universe.\nAlways within reach.',heroText:'Connect your MEGA library, choose a comic, and settle into the story. Your place will be waiting when you return.',tryReader:'Try the reader',emptyTitle:'Your next story starts here',emptyText:'Connect a cloud folder or import your first comic.',cloudStorage:'Cloud library',comicsCount:'{count} comics',all:'All stories',unread:'Unread',reading:'In progress',finished:'Read',publisher:'Publisher',series:'Series',character:'Character',allPublishers:'All publishers',allSeries:'All series',allCharacters:'All characters',sort:'Sort',title:'Title',recent:'Recently read',added:'Recently added',issue:'Issue',volume:'Volume',year:'Year',characters:'Characters',tags:'Tags',group:'Group by',noGrouping:'No grouping',unknown:'Unspecified',loadMore:'Show more',noMatches:'No matching stories',changeFilters:'Try another search or change your filters.',clearFilters:'Clear filters',details:'Details',open:'Read',resume:'Resume',page:'Page',metadata:'Comic details',metadataHint:'Make your library your own. These changes stay in CloudPanels.',save:'Save changes',cancel:'Cancel',close:'Close',remove:'Remove from library',related:'Related in your library',noRelated:'Add matching series, publisher or character information to discover related stories.',commaHint:'Separate with commas',status:'Reading status',saved:'Changes saved.',removed:'Removed from your library.',localNotice:'Imported comics are saved on this iPad, so they open again without selecting the file.',selectAgain:'Select the same file again to resume reading.',unsupported:'CloudPanels reads CBZ, CBR, CB7, CBT, PDF, JPG, PNG and WebP.',opening:'Opening your story…',imported:'{count} files added to your library.',failedImport:'Could not import this file.',keepReading:'Pick up where you left off.',noReading:'A good story is waiting',noReadingText:'Start reading a comic and it will appear here with your saved page.',collectionsText:'Make room for your own reading orders, story arcs and favorites.',newCollection:'New collection',emptyCollections:'Your stories, your shelves',emptyCollectionsText:'Build a collection for a character, an event or anything you love.',collectionName:'Collection name',chooseComics:'Choose stories',selected:'{count} selected',selectMatching:'Select matching',clearSelection:'Clear selection',firstResults:'Showing the first {count} matches. Search to narrow the list.',editCollection:'Edit collection',deleteCollection:'Delete collection',noCollectionComics:'This shelf is waiting for stories.',backCollections:'All collections',companionText:'Find your next story with your catalog and reading history.',catalogOnly:'Catalog companion: reading suggestions, metadata search and saved progress. Story summaries and online AI are not part of this web version.',askNext:'What should I read next?',askContinue:'Continue reading',askRead:'What have I already read?',askPlaceholder:'Ask about your library…',send:'Ask',you:'YOU',companionLabel:'CLOUDPANELS COMPANION',recommendationsAnswer:'Here are stories from your library to pick up next:',finishedAnswer:'These stories are marked as read in your library:',continueAnswer:'You can pick up these stories where you left off:',matchesAnswer:'I found these matches in your library:',helpAnswer:'Try a title, publisher or character, or ask what to read next. Suggestions use the metadata and progress saved in this browser.',emptyAnswer:'Your library has no matching stories yet. Connect a folder or add a comic to get started.',settingsText:'Make a little room for a lot of reading.',language:'Language',languageDetail:'English is the main language. Choose the interface you feel at home in.',direction:'Reading direction',directionDetail:'Choose the order used by the reader controls.',ltr:'Left to right',rtl:'Right to left',buffer:'Temporary reading buffer',bufferDetail:'Maximum range buffer in memory. Books are not downloaded into permanent browser storage.',clearBuffer:'Clear temporary buffer',bufferCleared:'Temporary reading buffer cleared.',backup:'Your reading memory',backupDetail:'Your library and reading history stay on this device. In Android accounts, they are encrypted for your profile. Export a backup before clearing app data.',exportBackup:'Export backup',importBackup:'Import backup',backupImported:'Backup merged with your library.',backupError:'Choose a valid CloudPanels backup smaller than 64 MB.',cloudConnection:'Cloud connection',cloudConnectionDetail:'Connect MEGA to browse folders and read supported comics directly.',disconnect:'Disconnect MEGA',disconnected:'MEGA disconnected. Your reading progress is saved.',homeScreen:'At home on your iPad',homeScreenDetail:'Open this site in Safari, tap Share, then Add to Home Screen to keep CloudPanels within reach.',formats:'Reading formats',formatsDetail:'CBZ / ZIP · CBR / RAR · CB7 / 7z · CBT / TAR · PDF · JPG / PNG / WebP. CBR, CB7 and CBT are downloaded to temporary memory before opening (up to 300 MB).',connectTitle:'Connect your MEGA library',connectText:'Choose a folder to index. Comic files stay in MEGA until you read them.',account:'MEGA account',folderLink:'Folder or file link',webBeta:'Your password is never stored. Only the MEGA session is kept on this iPad so you do not have to sign in every time. Use Disconnect to erase it.',email:'MEGA email',password:'MEGA password',mfa:'Two-factor code (if enabled)',signIn:'Connect account',linkLabel:'Complete MEGA link',linkHint:'Copy a file or folder link from MEGA with its decryption key. The link stays in this tab.',connectLink:'Open link',connecting:'Connecting to MEGA…',folderTitle:'Choose a library folder',folderText:'Indexing adds titles and metadata, without downloading your editions.',indexFolder:'Add this folder',addFile:'Add this file',back:'Back',rootFolder:'Cloud Drive',indexing:'Indexing: {count} items scanned…',indexed:'{count} comics added from MEGA.',noFolders:'This folder is empty.',folder:'Folder',chooseFolder:'Choose a folder',connectionError:'Could not connect to MEGA. Please try again.',reconnect:'Reconnect MEGA and add the same folder to read this story.',offline:'You are offline. Reconnect to open cloud comics.',demoTitle:'Try the reader',demoText:'Read an original three-page test comic. It is added to your library only when you choose a format.',demoLabel:'Original reader test',demoCbz:'Try CBZ streaming',demoPdf:'Try PDF reading',demoDescription:'An original three-page sample made for CloudPanels.',demoError:'Could not load the sample. Please try again.',testPublisher:'CloudPanels Originals',tryAgain:'Try again',source:'Source',storageError:'Could not save your library. Export a backup before closing this page.',storageLoadedError:'Your saved library could not be loaded. Import a backup if available.',loading:'Loading…',markRead:'Mark as read',fitPage:'Fit page',guidedView:'Panel view',allClouds:'MEGA · LOCAL FILES',rememberPage:'Your place, remembered.',noPasswordInChat:'Enter credentials here, never in a chat message.'
  },
  'pt-BR': {
    yourLibrary:'SUA BIBLIOTECA',discover:'DESCUBRA',library:'Biblioteca',continueReading:'Continuar lendo',continueShort:'Leitura',collections:'Coleções',assistant:'Assistente de quadrinhos',assistantShort:'Assistente',settings:'Ajustes',cloudFirst:'Muitas histórias. Pouco espaço.',cloudFirstDetail:'Mantenha seus quadrinhos na nuvem.',notConnected:'Desconectado',connected:'MEGA conectado',importFiles:'Importar arquivos',connectMega:'Conectar MEGA',manageMega:'Gerenciar MEGA',searchPlaceholder:'Buscar títulos, editoras, personagens…',universe:'SEU UNIVERSO DE QUADRINHOS',subtitle:'Cada história, exatamente onde você parou.',moreStories:'MAIS HISTÓRIAS. MENOS ARMAZENAMENTO.',heroTitle:'Um universo inteiro.\nSempre ao seu alcance.',heroText:'Conecte sua biblioteca do MEGA, escolha um quadrinho e entre na história. Sua página estará esperando quando você voltar.',tryReader:'Testar o leitor',emptyTitle:'Sua próxima história começa aqui',emptyText:'Conecte uma pasta na nuvem ou importe seu primeiro quadrinho.',cloudStorage:'Biblioteca na nuvem',comicsCount:'{count} quadrinhos',all:'Todas as histórias',unread:'Não lidos',reading:'Em andamento',finished:'Lidos',publisher:'Editora',series:'Série',character:'Personagem',allPublishers:'Todas as editoras',allSeries:'Todas as séries',allCharacters:'Todos os personagens',sort:'Ordenar',title:'Título',recent:'Lidos recentemente',added:'Adicionados recentemente',issue:'Edição',volume:'Volume',year:'Ano',characters:'Personagens',tags:'Etiquetas',group:'Agrupar por',noGrouping:'Sem agrupamento',unknown:'Não informado',loadMore:'Mostrar mais',noMatches:'Nenhuma história encontrada',changeFilters:'Tente outra busca ou altere os filtros.',clearFilters:'Limpar filtros',details:'Detalhes',open:'Ler',resume:'Retomar',page:'Página',metadata:'Detalhes do quadrinho',metadataHint:'Organize do seu jeito. Estas alterações ficam no CloudPanels.',save:'Salvar alterações',cancel:'Cancelar',close:'Fechar',remove:'Remover da biblioteca',related:'Relacionados na sua biblioteca',noRelated:'Preencha série, editora ou personagens para encontrar histórias relacionadas.',commaHint:'Separe com vírgulas',status:'Status de leitura',saved:'Alterações salvas.',removed:'Removido da sua biblioteca.',localNotice:'Os quadrinhos importados ficam salvos neste iPad e abrem de novo sem precisar escolher o arquivo.',selectAgain:'Selecione o mesmo arquivo novamente para retomar a leitura.',unsupported:'O CloudPanels lê CBZ, CBR, CB7, CBT, PDF, JPG, PNG e WebP.',opening:'Abrindo sua história…',imported:'{count} arquivos adicionados à biblioteca.',failedImport:'Não foi possível importar este arquivo.',keepReading:'Continue de onde parou.',noReading:'Uma boa história está esperando',noReadingText:'Comece um quadrinho e ele aparecerá aqui com sua página salva.',collectionsText:'Crie suas próprias ordens de leitura, sagas e favoritos.',newCollection:'Nova coleção',emptyCollections:'Suas histórias, suas estantes',emptyCollectionsText:'Crie uma coleção para um personagem, um evento ou o que você gostar.',collectionName:'Nome da coleção',chooseComics:'Escolha as histórias',selected:'{count} selecionados',selectMatching:'Selecionar resultados',clearSelection:'Limpar seleção',firstResults:'Mostrando os primeiros {count} resultados. Use a busca para filtrar.',editCollection:'Editar coleção',deleteCollection:'Excluir coleção',noCollectionComics:'Esta estante está esperando por histórias.',backCollections:'Todas as coleções',companionText:'Encontre a próxima história com seu catálogo e histórico de leitura.',catalogOnly:'Companheiro de catálogo: sugestões, busca por metadados e progresso salvo. Resumos de histórias e IA online ainda não fazem parte desta versão web.',askNext:'O que devo ler em seguida?',askContinue:'Continuar lendo',askRead:'O que eu já li?',askPlaceholder:'Pergunte sobre sua biblioteca…',send:'Perguntar',you:'VOCÊ',companionLabel:'COMPANHEIRO CLOUDPANELS',recommendationsAnswer:'Estas histórias da sua biblioteca são boas opções para continuar:',finishedAnswer:'Estas histórias estão marcadas como lidas na sua biblioteca:',continueAnswer:'Você pode retomar estas histórias de onde parou:',matchesAnswer:'Encontrei estes resultados na sua biblioteca:',helpAnswer:'Tente um título, editora ou personagem, ou pergunte o que ler em seguida. As sugestões usam os metadados e o progresso salvos neste navegador.',emptyAnswer:'Sua biblioteca ainda não tem histórias correspondentes. Conecte uma pasta ou adicione um quadrinho para começar.',settingsText:'Mais conforto para muitas histórias.',language:'Idioma',languageDetail:'O inglês é o idioma principal. Escolha o idioma da interface.',direction:'Direção de leitura',directionDetail:'Escolha a ordem usada pelos controles do leitor.',ltr:'Esquerda para direita',rtl:'Direita para esquerda',buffer:'Memória temporária de leitura',bufferDetail:'Limite da memória para trechos de arquivos. Os livros não são baixados para armazenamento permanente no navegador.',clearBuffer:'Limpar memória temporária',bufferCleared:'Memória temporária de leitura limpa.',backup:'Sua memória de leitura',backupDetail:'A biblioteca e o histórico ficam salvos neste navegador. Exporte um backup antes de apagar os dados do site.',exportBackup:'Exportar backup',importBackup:'Importar backup',backupImported:'Backup combinado com sua biblioteca.',backupError:'Escolha um backup válido do CloudPanels com menos de 64 MB.',cloudConnection:'Conexão com a nuvem',cloudConnectionDetail:'Conecte o MEGA para navegar pelas pastas e ler os formatos compatíveis.',disconnect:'Desconectar MEGA',disconnected:'MEGA desconectado. Seu progresso continua salvo.',homeScreen:'Sempre por perto no iPad',homeScreenDetail:'Abra este site no Safari, toque em Compartilhar e em Adicionar à Tela de Início.',formats:'Formatos de leitura',formatsDetail:'CBZ / ZIP · CBR / RAR · CB7 / 7z · CBT / TAR · PDF · JPG / PNG / WebP. CBR, CB7 e CBT são baixados para a memória temporária antes de abrir (até 300 MB).',connectTitle:'Conecte sua biblioteca do MEGA',connectText:'Escolha uma pasta para indexar. Os arquivos continuam no MEGA até você ler.',account:'Conta MEGA',folderLink:'Link de pasta ou arquivo',webBeta:'Sua senha não é guardada. Só a sessão do MEGA fica salva neste iPad, para você não precisar entrar de novo a cada vez. Use Desconectar para apagá-la.',email:'E-mail do MEGA',password:'Senha do MEGA',mfa:'Código de autenticação (se ativado)',signIn:'Conectar conta',linkLabel:'Link completo do MEGA',linkHint:'Copie no MEGA um link de pasta ou arquivo com a chave de acesso. O link fica apenas nesta aba.',connectLink:'Abrir link',connecting:'Conectando ao MEGA…',folderTitle:'Escolha a pasta da biblioteca',folderText:'A indexação adiciona títulos e metadados, sem baixar suas edições.',indexFolder:'Adicionar esta pasta',addFile:'Adicionar este arquivo',back:'Voltar',rootFolder:'Arquivos na nuvem',indexing:'Indexando: {count} itens verificados…',indexed:'{count} quadrinhos adicionados do MEGA.',noFolders:'Esta pasta está vazia.',folder:'Pasta',chooseFolder:'Escolha uma pasta',connectionError:'Não foi possível conectar ao MEGA. Tente novamente.',reconnect:'Reconecte o MEGA e adicione a mesma pasta para ler esta história.',offline:'Você está sem internet. Reconecte para abrir quadrinhos na nuvem.',demoTitle:'Teste o leitor',demoText:'Leia um quadrinho de teste original com três páginas. Ele só entra na biblioteca quando você escolhe um formato.',demoLabel:'Teste original do leitor',demoCbz:'Testar leitura CBZ',demoPdf:'Testar leitura PDF',demoDescription:'Uma amostra original de três páginas criada para o CloudPanels.',demoError:'Não foi possível abrir a amostra. Tente novamente.',testPublisher:'CloudPanels Originals',tryAgain:'Tentar novamente',source:'Origem',storageError:'Não foi possível salvar sua biblioteca. Exporte um backup antes de fechar esta página.',storageLoadedError:'Não foi possível carregar a biblioteca salva. Importe um backup, se disponível.',loading:'Carregando…',markRead:'Marcar como lido',fitPage:'Ajustar página',guidedView:'Ver quadros',allClouds:'MEGA · ARQUIVOS LOCAIS',rememberPage:'Sua página, sempre lembrada.',noPasswordInChat:'Digite as credenciais aqui, nunca em uma mensagem de chat.'
  },
  es: {
    yourLibrary:'TU BIBLIOTECA',discover:'DESCUBRE',library:'Biblioteca',continueReading:'Seguir leyendo',continueShort:'Lectura',collections:'Colecciones',assistant:'Asistente de cómics',assistantShort:'Asistente',settings:'Ajustes',cloudFirst:'Muchas historias. Poco espacio.',cloudFirstDetail:'Guarda tus cómics en la nube.',notConnected:'Sin conexión',connected:'MEGA conectado',importFiles:'Importar archivos',connectMega:'Conectar MEGA',manageMega:'Administrar MEGA',searchPlaceholder:'Buscar títulos, editoriales, personajes…',universe:'TU UNIVERSO PERSONAL DE CÓMICS',subtitle:'Cada historia, justo donde la dejaste.',moreStories:'MÁS HISTORIAS. MENOS ALMACENAMIENTO.',heroTitle:'Un universo entero.\nSiempre a tu alcance.',heroText:'Conecta tu biblioteca de MEGA, elige un cómic y entra en la historia. Tu página te estará esperando cuando vuelvas.',tryReader:'Probar el lector',emptyTitle:'Tu próxima historia empieza aquí',emptyText:'Conecta una carpeta en la nube o importa tu primer cómic.',cloudStorage:'Biblioteca en la nube',comicsCount:'{count} cómics',all:'Todas las historias',unread:'Sin leer',reading:'En progreso',finished:'Leídos',publisher:'Editorial',series:'Serie',character:'Personaje',allPublishers:'Todas las editoriales',allSeries:'Todas las series',allCharacters:'Todos los personajes',sort:'Ordenar',title:'Título',recent:'Leídos recientemente',added:'Añadidos recientemente',issue:'Número',volume:'Volumen',year:'Año',characters:'Personajes',tags:'Etiquetas',group:'Agrupar por',noGrouping:'Sin agrupar',unknown:'Sin especificar',loadMore:'Mostrar más',noMatches:'No hay historias coincidentes',changeFilters:'Prueba otra búsqueda o cambia los filtros.',clearFilters:'Borrar filtros',details:'Detalles',open:'Leer',resume:'Continuar',page:'Página',metadata:'Detalles del cómic',metadataHint:'Organiza tu biblioteca a tu manera. Los cambios quedan en CloudPanels.',save:'Guardar cambios',cancel:'Cancelar',close:'Cerrar',remove:'Quitar de la biblioteca',related:'Relacionados en tu biblioteca',noRelated:'Añade serie, editorial o personajes para descubrir historias relacionadas.',commaHint:'Separar con comas',status:'Estado de lectura',saved:'Cambios guardados.',removed:'Quitado de tu biblioteca.',localNotice:'Los cómics importados quedan guardados en este iPad y se vuelven a abrir sin elegir el archivo.',selectAgain:'Elige de nuevo el mismo archivo para seguir leyendo.',unsupported:'CloudPanels lee CBZ, CBR, CB7, CBT, PDF, JPG, PNG y WebP.',opening:'Abriendo tu historia…',imported:'{count} archivos añadidos a tu biblioteca.',failedImport:'No se pudo importar este archivo.',keepReading:'Sigue justo donde lo dejaste.',noReading:'Te espera una buena historia',noReadingText:'Empieza un cómic y aparecerá aquí con tu página guardada.',collectionsText:'Crea tus propios órdenes de lectura, sagas y favoritos.',newCollection:'Nueva colección',emptyCollections:'Tus historias, tus estantes',emptyCollectionsText:'Crea una colección para un personaje, un evento o lo que más te guste.',collectionName:'Nombre de la colección',chooseComics:'Elige historias',selected:'{count} seleccionados',selectMatching:'Seleccionar resultados',clearSelection:'Borrar selección',firstResults:'Mostrando los primeros {count} resultados. Busca para filtrar la lista.',editCollection:'Editar colección',deleteCollection:'Eliminar colección',noCollectionComics:'Este estante espera tus historias.',backCollections:'Todas las colecciones',companionText:'Encuentra tu próxima historia con tu catálogo e historial de lectura.',catalogOnly:'Compañero de catálogo: sugerencias, búsqueda de metadatos y progreso guardado. Los resúmenes y la IA online no forman parte de esta versión web.',askNext:'¿Qué debería leer después?',askContinue:'Seguir leyendo',askRead:'¿Qué he leído ya?',askPlaceholder:'Pregunta sobre tu biblioteca…',send:'Preguntar',you:'TÚ',companionLabel:'COMPAÑERO CLOUDPANELS',recommendationsAnswer:'Estas historias de tu biblioteca son buenas opciones para continuar:',finishedAnswer:'Estas historias están marcadas como leídas en tu biblioteca:',continueAnswer:'Puedes retomar estas historias donde las dejaste:',matchesAnswer:'Encontré estos resultados en tu biblioteca:',helpAnswer:'Prueba un título, editorial o personaje, o pregunta qué leer después. Las sugerencias usan los metadatos y el progreso guardados en este navegador.',emptyAnswer:'Tu biblioteca todavía no tiene historias coincidentes. Conecta una carpeta o añade un cómic para empezar.',settingsText:'Más comodidad para muchas historias.',language:'Idioma',languageDetail:'El inglés es el idioma principal. Elige el idioma de la interfaz.',direction:'Dirección de lectura',directionDetail:'Elige el orden de los controles del lector.',ltr:'Izquierda a derecha',rtl:'Derecha a izquierda',buffer:'Memoria temporal de lectura',bufferDetail:'Límite de memoria para fragmentos de archivos. Los libros no se guardan permanentemente en el navegador.',clearBuffer:'Borrar memoria temporal',bufferCleared:'Memoria temporal borrada.',backup:'Tu memoria de lectura',backupDetail:'La biblioteca y el historial se guardan en este navegador. Exporta una copia antes de borrar los datos del sitio.',exportBackup:'Exportar copia',importBackup:'Importar copia',backupImported:'Copia combinada con tu biblioteca.',backupError:'Elige una copia válida de CloudPanels de menos de 64 MB.',cloudConnection:'Conexión con la nube',cloudConnectionDetail:'Conecta MEGA para explorar carpetas y leer los formatos compatibles.',disconnect:'Desconectar MEGA',disconnected:'MEGA desconectado. Tu progreso sigue guardado.',homeScreen:'Siempre cerca en tu iPad',homeScreenDetail:'Abre este sitio en Safari, pulsa Compartir y Añadir a pantalla de inicio.',formats:'Formatos de lectura',formatsDetail:'CBZ / ZIP · CBR / RAR · CB7 / 7z · CBT / TAR · PDF · JPG / PNG / WebP. CBR, CB7 y CBT se descargan a la memoria temporal antes de abrir (hasta 300 MB).',connectTitle:'Conecta tu biblioteca de MEGA',connectText:'Elige una carpeta para indexar. Los archivos quedan en MEGA hasta que los leas.',account:'Cuenta MEGA',folderLink:'Enlace de carpeta o archivo',webBeta:'Tu contraseña nunca se guarda. Solo la sesión de MEGA queda en este iPad para no tener que entrar cada vez. Usa Desconectar para borrarla.',email:'Correo de MEGA',password:'Contraseña de MEGA',mfa:'Código de autenticación (si está activado)',signIn:'Conectar cuenta',linkLabel:'Enlace completo de MEGA',linkHint:'Copia de MEGA un enlace de carpeta o archivo con su clave. El enlace queda solo en esta pestaña.',connectLink:'Abrir enlace',connecting:'Conectando a MEGA…',folderTitle:'Elige la carpeta de la biblioteca',folderText:'El índice añade títulos y metadatos sin descargar tus números.',indexFolder:'Añadir esta carpeta',addFile:'Añadir este archivo',back:'Volver',rootFolder:'Archivos en la nube',indexing:'Creando índice: {count} elementos revisados…',indexed:'{count} cómics añadidos desde MEGA.',noFolders:'Esta carpeta está vacía.',folder:'Carpeta',chooseFolder:'Elige una carpeta',connectionError:'No se pudo conectar a MEGA. Inténtalo de nuevo.',reconnect:'Conecta MEGA y añade la misma carpeta para leer esta historia.',offline:'Estás sin internet. Conecta para abrir cómics de la nube.',demoTitle:'Prueba el lector',demoText:'Lee un cómic de prueba original de tres páginas. Solo se añade a la biblioteca cuando eliges un formato.',demoLabel:'Prueba original del lector',demoCbz:'Probar lectura CBZ',demoPdf:'Probar lectura PDF',demoDescription:'Una muestra original de tres páginas creada para CloudPanels.',demoError:'No se pudo cargar la muestra. Inténtalo de nuevo.',testPublisher:'CloudPanels Originals',tryAgain:'Intentar de nuevo',source:'Origen',storageError:'No se pudo guardar tu biblioteca. Exporta una copia antes de cerrar esta página.',storageLoadedError:'No se pudo cargar la biblioteca guardada. Importa una copia, si tienes una.',loading:'Cargando…',markRead:'Marcar como leído',fitPage:'Ajustar página',guidedView:'Ver viñetas',allClouds:'MEGA · ARCHIVOS LOCALES',rememberPage:'Tu página, siempre recordada.',noPasswordInChat:'Introduce las credenciales aquí, nunca en un mensaje de chat.'
  }
};
copy.en.limitedStorage='This browser is using limited storage. Export a backup regularly, especially as your library grows.';
copy['pt-BR'].limitedStorage='Este navegador está usando armazenamento limitado. Exporte um backup regularmente, principalmente ao aumentar sua biblioteca.';
copy.es.limitedStorage='Este navegador está usando almacenamiento limitado. Exporta una copia con frecuencia, especialmente al ampliar tu biblioteca.';
Object.assign(copy.en,{folders:'Folders',allStories:'All stories',folderContents:'Your folders, just as you organized them in MEGA.',folderCount:'{count} stories',folderReading:'{count} in progress',continueFolder:'Continue in this folder',folderStories:'Stories in this folder',folderEmpty:'No stories in this folder yet.',upNext:'Up next',upNextHint:'A little inspiration from your reading history.',searchFolder:'Search this folder and its subfolders…',clearCovers:'Clear thumbnails',coversCleared:'Thumbnails cleared.',coversDetail:'Covers and the page thumbnails in the page navigator use a small, bounded cache on this device. Comic pages stay in temporary reading memory.'});
Object.assign(copy['pt-BR'],{folders:'Pastas',allStories:'Todas as histórias',folderContents:'Suas pastas, do jeito que você organizou no MEGA.',folderCount:'{count} histórias',folderReading:'{count} em andamento',continueFolder:'Continuar nesta pasta',folderStories:'Histórias nesta pasta',folderEmpty:'Esta pasta ainda não tem histórias.',upNext:'Sua próxima leitura',upNextHint:'Um pouco de inspiração do seu histórico de leitura.',searchFolder:'Buscar nesta pasta e nas subpastas…',clearCovers:'Limpar miniaturas',coversCleared:'Miniaturas limpas.',coversDetail:'As capas e as miniaturas das páginas do navegador de páginas usam um pequeno cache com limite neste aparelho. As páginas dos quadrinhos ficam na memória temporária de leitura.'});
Object.assign(copy.es,{folders:'Carpetas',allStories:'Todas las historias',folderContents:'Tus carpetas, tal como las organizaste en MEGA.',folderCount:'{count} historias',folderReading:'{count} en progreso',continueFolder:'Continuar en esta carpeta',folderStories:'Historias en esta carpeta',folderEmpty:'Esta carpeta aún no tiene historias.',upNext:'Tu próxima lectura',upNextHint:'Un poco de inspiración de tu historial de lectura.',searchFolder:'Buscar en esta carpeta y sus subcarpetas…',clearCovers:'Borrar miniaturas',coversCleared:'Miniaturas borradas.',coversDetail:'Las portadas y las miniaturas de páginas del navegador usan una caché pequeña con límite en este dispositivo. Las páginas del cómic quedan en la memoria temporal de lectura.'});
Object.assign(copy.en,{favorites:'Favorites',readLater:'Read later',favoriteAction:'Favorite',favoriteActive:'Favorited',laterAction:'Save for later',laterActive:'Saved for later',removeFavorite:'Remove from favorites',removeLater:'Remove from Read later',favoriteAdded:'Added to Favorites.',favoriteRemoved:'Removed from Favorites.',laterAdded:'Saved to Read later.',laterRemoved:'Removed from Read later.',favoritesText:'Your standout stories, all in one place.',readLaterText:'A shelf for stories you want to get to next.',favoritesEmpty:'Keep your favorites close',favoritesEmptyText:'Open a comic’s Details and choose Favorite to add it here.',laterEmpty:'Your next adventure is waiting',laterEmptyText:'Open a comic’s Details and choose Save for later to build your reading list.',browseLibrary:'Browse your library',smartShelves:'Your reading shelves',customCollections:'Your collections'});
Object.assign(copy['pt-BR'],{favorites:'Favoritos',readLater:'Ler depois',favoriteAction:'Favoritar',favoriteActive:'Favoritado',laterAction:'Salvar para depois',laterActive:'Salvo para depois',removeFavorite:'Remover dos favoritos',removeLater:'Remover de Ler depois',favoriteAdded:'Adicionado aos Favoritos.',favoriteRemoved:'Removido dos Favoritos.',laterAdded:'Salvo em Ler depois.',laterRemoved:'Removido de Ler depois.',favoritesText:'Suas histórias favoritas, reunidas em um só lugar.',readLaterText:'Uma estante para as histórias que você quer ler em seguida.',favoritesEmpty:'Seus favoritos sempre por perto',favoritesEmptyText:'Abra os Detalhes de um quadrinho e toque em Favoritar para adicioná-lo aqui.',laterEmpty:'Sua próxima aventura está esperando',laterEmptyText:'Abra os Detalhes de um quadrinho e toque em Salvar para depois para montar sua lista de leitura.',browseLibrary:'Explorar sua biblioteca',smartShelves:'Suas estantes de leitura',customCollections:'Suas coleções'});
Object.assign(copy.es,{favorites:'Favoritos',readLater:'Leer después',favoriteAction:'Favorito',favoriteActive:'Favorito guardado',laterAction:'Guardar para después',laterActive:'Guardado para después',removeFavorite:'Quitar de Favoritos',removeLater:'Quitar de Leer después',favoriteAdded:'Añadido a Favoritos.',favoriteRemoved:'Quitado de Favoritos.',laterAdded:'Guardado en Leer después.',laterRemoved:'Quitado de Leer después.',favoritesText:'Tus historias favoritas, reunidas en un solo lugar.',readLaterText:'Un estante para las historias que quieres leer después.',favoritesEmpty:'Tus favoritos, siempre cerca',favoritesEmptyText:'Abre los Detalles de un cómic y elige Favorito para añadirlo aquí.',laterEmpty:'Tu próxima aventura te espera',laterEmptyText:'Abre los Detalles de un cómic y elige Guardar para después para crear tu lista de lectura.',browseLibrary:'Explorar tu biblioteca',smartShelves:'Tus estantes de lectura',customCollections:'Tus colecciones'});
Object.assign(copy.en,{downloadOffline:'Save for offline reading',downloadingOffline:'Saving to this device… {p}%',removeOffline:'Remove from this device',offlineSaved:'Saved on this device. It opens even without internet.',offlineRemoved:'Removed from this device.',offlineFailed:'Could not save this comic on the device. Check the connection and free space.',onDevice:'On this device',downloadFolder:'Save folder offline',folderQueued:'Saving {count} comics to this device…',folderSaved:'This folder is saved on this device.',offlineStorage:'Saved on this device',offlineStorageDetail:'{count} comics · {size}. They open without internet, even with MEGA disconnected.',clearOffline:'Remove all saved comics',offlineCleared:'Saved comics removed from this device.'});
Object.assign(copy['pt-BR'],{downloadOffline:'Baixar para ler offline',downloadingOffline:'Salvando no aparelho… {p}%',removeOffline:'Remover do aparelho',offlineSaved:'Salvo no aparelho. Abre mesmo sem internet.',offlineRemoved:'Removido do aparelho.',offlineFailed:'Não foi possível salvar este quadrinho no aparelho. Confira a conexão e o espaço livre.',onDevice:'No aparelho',downloadFolder:'Baixar pasta para ler offline',folderQueued:'Salvando {count} quadrinhos no aparelho…',folderSaved:'Esta pasta está salva no aparelho.',offlineStorage:'Salvos no aparelho',offlineStorageDetail:'{count} quadrinhos · {size}. Abrem sem internet, mesmo com o MEGA desconectado.',clearOffline:'Remover todos os quadrinhos salvos',offlineCleared:'Quadrinhos salvos removidos do aparelho.'});
Object.assign(copy.es,{downloadOffline:'Guardar para leer sin conexión',downloadingOffline:'Guardando en el dispositivo… {p}%',removeOffline:'Quitar del dispositivo',offlineSaved:'Guardado en el dispositivo. Se abre incluso sin internet.',offlineRemoved:'Quitado del dispositivo.',offlineFailed:'No se pudo guardar este cómic. Revisa la conexión y el espacio libre.',onDevice:'En el dispositivo',downloadFolder:'Guardar carpeta sin conexión',folderQueued:'Guardando {count} cómics en el dispositivo…',folderSaved:'Esta carpeta está guardada en el dispositivo.',offlineStorage:'Guardados en el dispositivo',offlineStorageDetail:'{count} cómics · {size}. Se abren sin internet, incluso con MEGA desconectado.',clearOffline:'Quitar todos los cómics guardados',offlineCleared:'Cómics guardados quitados del dispositivo.'});
Object.assign(copy.en,{syncTitle:'Sync between devices',syncDetail:'Your library, reading progress and preferences are saved in your MEGA, in a CloudPanels folder. Sign in to the same MEGA on another device to continue where you stopped.',syncNow:'Sync now',syncNever:'Not synced yet.',syncAt:'Last synced at {time}.',syncBusy:'Syncing…',syncFailed:'Could not sync with MEGA. It will try again later.',syncNeedsAccount:'Sign in with your MEGA account (not a link) to sync between devices.',syncDone:'Synced with MEGA.'});
Object.assign(copy['pt-BR'],{syncTitle:'Sincronizar entre aparelhos',syncDetail:'Sua biblioteca, onde você parou e suas preferências ficam salvos no seu MEGA, numa pasta CloudPanels. Entre no mesmo MEGA em outro aparelho para continuar de onde parou.',syncNow:'Sincronizar agora',syncNever:'Ainda não sincronizado.',syncAt:'Última sincronização às {time}.',syncBusy:'Sincronizando…',syncFailed:'Não foi possível sincronizar com o MEGA. Vou tentar de novo mais tarde.',syncNeedsAccount:'Entre com a sua conta do MEGA (não com link) para sincronizar entre aparelhos.',syncDone:'Sincronizado com o MEGA.'});
Object.assign(copy.es,{syncTitle:'Sincronizar entre dispositivos',syncDetail:'Tu biblioteca, tu progreso y tus preferencias se guardan en tu MEGA, en una carpeta CloudPanels. Entra al mismo MEGA en otro dispositivo para seguir donde lo dejaste.',syncNow:'Sincronizar ahora',syncNever:'Aún no sincronizado.',syncAt:'Última sincronización a las {time}.',syncBusy:'Sincronizando…',syncFailed:'No se pudo sincronizar con MEGA. Se intentará más tarde.',syncNeedsAccount:'Entra con tu cuenta de MEGA (no con un enlace) para sincronizar.',syncDone:'Sincronizado con MEGA.'});
Object.assign(copy.en,{convertOne:'Convert to CBZ',convertFolder:'Convert {count} to CBZ',convertTitle:'Convert to CBZ',convertText:'CBZ opens instantly and shows covers quickly. Each comic is downloaded, repackaged without changing its images, checked, and uploaded to the same folder with the same name. Only then does the original go to your MEGA Rubbish Bin, where you can still recover it. Your reading progress, panels, favorites and edits move to the new file. Large comics take a few minutes each: keep CloudPanels open while it works (the screen stays on).',convertStart:'Convert',convertCount:'{count} comics will be converted.',converting:'Converting {done}/{total}: {name}',convertStep:{open:'opening',pages:'pages {a}/{b}',verify:'checking',upload:'uploading'},convertDone:'{count} comics converted to CBZ.',convertFailed:'Could not convert {name}: {reason} The original was kept.',convertTooBig:'{name} is too large to convert on this device (over 250 MB); it was kept as it is.',convertCancel:'Cancel',convertCancelled:'Conversion stopped. Comics already converted stay converted; the rest were not touched.',convertNeedsAccount:'Converting needs your MEGA account login (not a link).'});
Object.assign(copy['pt-BR'],{convertOne:'Converter para CBZ',convertFolder:'Converter {count} para CBZ',convertTitle:'Converter para CBZ',convertText:'O CBZ abre na hora e mostra as capas rápido. Cada quadrinho é baixado, reempacotado sem mexer nas imagens, conferido e enviado para a mesma pasta, com o mesmo nome. Só depois disso o original vai para a lixeira do MEGA, de onde ainda dá para recuperar. Seu progresso, quadros, favoritos e edições passam para o arquivo novo. Quadrinhos grandes levam alguns minutos cada: deixe o CloudPanels aberto enquanto converte (a tela fica ligada).',convertStart:'Converter',convertCount:'{count} quadrinhos serão convertidos.',converting:'Convertendo {done}/{total}: {name}',convertStep:{open:'abrindo',pages:'páginas {a}/{b}',verify:'conferindo',upload:'enviando'},convertDone:'{count} quadrinhos convertidos para CBZ.',convertFailed:'Não foi possível converter {name}: {reason} O original foi mantido.',convertTooBig:'{name} é grande demais para converter neste aparelho (mais de 250 MB) e foi mantido como está.',convertCancel:'Cancelar',convertCancelled:'Conversão interrompida. Os já convertidos continuam convertidos; os outros não foram mexidos.',convertNeedsAccount:'Para converter, entre com a sua conta do MEGA (não com link).'});
copy.es.convertOne=copy.en.convertOne;
Object.assign(copy.en,{libraryCheckedShort:'Checked with MEGA at {time} · {added} new · {moved} moved · {removed} removed',treeLoading:'Loading your folders from MEGA…',treeFresh:'Your MEGA folders as they are right now (loaded at {time} · {items} items · {changes} recent changes from MEGA).',treeBehind:'Loaded at {time}, but MEGA did not send its most recent changes ({reason}), so very recent moves may be missing. Try again in a moment.',treeStale:'Could not reload from MEGA ({reason}). Showing the folders loaded at {time}.'});
Object.assign(copy['pt-BR'],{libraryCheckedShort:'Conferido com o MEGA às {time} · {added} novos · {moved} movidos · {removed} removidos',treeLoading:'Carregando suas pastas do MEGA…',treeFresh:'Suas pastas do MEGA como estão agora (carregadas às {time} · {items} itens · {changes} mudanças recentes vindas do MEGA).',treeBehind:'Carregado às {time}, mas o MEGA não mandou as mudanças mais recentes ({reason}); mudanças muito recentes podem faltar. Tente de novo daqui a pouco.',treeStale:'Não foi possível recarregar do MEGA ({reason}). Mostrando as pastas carregadas às {time}.'});
Object.assign(copy.es,{libraryCheckedShort:'Revisado con MEGA a las {time} · {added} nuevos · {moved} movidos · {removed} quitados',treeLoading:'Cargando tus carpetas de MEGA…',treeFresh:'Tus carpetas de MEGA tal como están ahora (cargadas a las {time} · {items} elementos · {changes} cambios recientes de MEGA).',treeBehind:'Cargado a las {time}, pero MEGA no envió sus cambios más recientes ({reason}); pueden faltar cambios muy recientes. Inténtalo de nuevo en un momento.',treeStale:'No se pudo recargar desde MEGA ({reason}). Mostrando las carpetas cargadas a las {time}.',updatingApp:'Actualizando CloudPanels a la versión más nueva…',appVersion:'Versión de la app',libraryNotChecked:'Todavía no se revisó en esta sesión.',libraryCheckedAt:'Última revisión a las {time}: {found} de {total} carpetas de la biblioteca encontradas en MEGA · {added} nuevos, {moved} movidos, {removed} quitados.',libraryCheckFailed:'La revisión de las {time} falló: {reason}',refreshLibrary:'Actualizar desde MEGA',refreshingLibrary:'Revisando tus carpetas de MEGA…',libraryUpdated:'Biblioteca actualizada desde MEGA: {added} nuevos, {moved} movidos o renombrados, {removed} quitados.',libraryUpToDate:'Tu biblioteca ya coincide con tus carpetas de MEGA.',refreshLibraryDetail:'Las carpetas y cómics que añades, mueves o renombras en MEGA aparecen aquí solos cuando la app se abre o vuelve al frente. También puedes actualizar ahora.'});
Object.assign(copy.en,{updatingApp:'Updating CloudPanels to the newest version…',appVersion:'App version',libraryNotChecked:'Not checked yet in this session.',libraryCheckedAt:'Last checked at {time}: {found} of {total} library folders found in MEGA · {added} new, {moved} moved, {removed} removed.',libraryCheckFailed:'Last check at {time} failed: {reason}',refreshLibrary:'Update from MEGA',refreshingLibrary:'Checking your MEGA folders…',libraryUpdated:'Library updated from MEGA: {added} new, {moved} moved or renamed, {removed} removed.',libraryUpToDate:'Your library already matches your MEGA folders.',refreshLibraryDetail:'Folders and comics you add, move or rename in MEGA appear here automatically when the app opens or comes back to the front. You can also update now.'});
Object.assign(copy['pt-BR'],{updatingApp:'Atualizando o CloudPanels para a versão mais nova…',appVersion:'Versão do app',libraryNotChecked:'Ainda não conferido nesta sessão.',libraryCheckedAt:'Última conferência às {time}: {found} de {total} pastas da biblioteca encontradas no MEGA · {added} novos, {moved} movidos, {removed} removidos.',libraryCheckFailed:'A conferência das {time} falhou: {reason}',refreshLibrary:'Atualizar do MEGA',refreshingLibrary:'Conferindo suas pastas do MEGA…',libraryUpdated:'Biblioteca atualizada do MEGA: {added} novos, {moved} movidos ou renomeados, {removed} removidos.',libraryUpToDate:'Sua biblioteca já está igual às pastas do MEGA.',refreshLibraryDetail:'Pastas e quadrinhos que você adiciona, move ou renomeia no MEGA aparecem aqui sozinhos quando o app abre ou volta para a tela. Você também pode atualizar agora.'});
copy.es.refreshLibrary=copy.en.refreshLibrary;
Object.assign(copy.en,{viewLabel:'View',viewGrid:'Grid',viewRacks:'Shelves',rackContinue:'Continue reading',rackUpNext:'Up next',rackHere:'In this folder',rackOpen:'Open folder',rackSeeAll:'See all',rackFrom:'From {folder}',rackPage:'Page {page} of {count}',rackContinueButton:'Continue',rackSomeRead:'{count} stories · {read} read',rackAllRead:'{count} stories · all read'});
Object.assign(copy['pt-BR'],{viewLabel:'Visualização',viewGrid:'Grade',viewRacks:'Estante',rackContinue:'Continuar lendo',rackUpNext:'Próxima leitura',rackHere:'Nesta pasta',rackOpen:'Abrir pasta',rackSeeAll:'Ver tudo',rackFrom:'De {folder}',rackPage:'Página {page} de {count}',rackContinueButton:'Continuar',rackSomeRead:'{count} histórias · {read} lidas',rackAllRead:'{count} histórias · todas lidas'});
Object.assign(copy.es,{viewLabel:'Vista',viewGrid:'Cuadrícula',viewRacks:'Estantería',rackContinue:'Seguir leyendo',rackUpNext:'Tu próxima lectura',rackHere:'En esta carpeta',rackOpen:'Abrir carpeta',rackSeeAll:'Ver todo',rackFrom:'De {folder}',rackPage:'Página {page} de {count}',rackContinueButton:'Continuar',rackSomeRead:'{count} historias · {read} leídas',rackAllRead:'{count} historias · todas leídas'});
Object.assign(copy.en,{syncPaused:'Sync between devices is paused while it is being fixed. Nothing is written to your MEGA. To move your reading to another device, use Export backup here and Import backup on the other device.',diagTitle:'Diagnostics',diagDetail:'If something fails, copy this report and send it to whoever is fixing the app. It contains error messages only — no passwords, keys or comic files.',diagCopy:'Copy report',diagCopied:'Report copied.',diagEmpty:'No problems recorded.'});
Object.assign(copy['pt-BR'],{syncPaused:'A sincronização entre aparelhos está pausada enquanto é corrigida. Nada é gravado no seu MEGA. Para levar sua leitura para outro aparelho, use Exportar backup aqui e Importar backup no outro.',diagTitle:'Diagnóstico',diagDetail:'Se algo falhar, copie este relatório e envie para quem está corrigindo o app. Ele contém só mensagens de erro — nenhuma senha, chave ou arquivo de quadrinho.',diagCopy:'Copiar relatório',diagCopied:'Relatório copiado.',diagEmpty:'Nenhum problema registrado.'});

Object.assign(copy.en,{megaConnecting:'Connecting to MEGA… the story opens in a moment.',resumeListening:'The phone closed CloudPanels while it was reading aloud. This is the same page: tap Listen to go on.'});
Object.assign(copy['pt-BR'],{megaConnecting:'Conectando ao MEGA… a história abre em instantes.',resumeListening:'O celular fechou o CloudPanels enquanto ele lia em voz alta. Esta é a mesma página: toque em Ouvir para continuar.'});
Object.assign(copy.es,{megaConnecting:'Conectando con MEGA… la historia se abre enseguida.',resumeListening:'El teléfono cerró CloudPanels mientras leía en voz alta. Esta es la misma página: toca Escuchar para seguir.'});
// Reading-order collections (made with the comics assistant).
Object.assign(copy.en,{orderCount:'{count} stories in reading order',orderMissing:'{count} not in your library',notInLibrary:'Not in your library',orderStart:'Start · #{n} {title}',orderContinue:'Continue · #{n} {title}',orderDone:'Everything here is read ✓',orderHint:'Opened from here, each comic goes on to the next one in this collection.',orderEyebrow:'Reading order'});
Object.assign(copy['pt-BR'],{orderCount:'{count} histórias na ordem de leitura',orderMissing:'{count} fora da sua biblioteca',notInLibrary:'Não está na sua biblioteca',orderStart:'Começar · #{n} {title}',orderContinue:'Continuar · #{n} {title}',orderDone:'Tudo daqui já foi lido ✓',orderHint:'Abrindo daqui, cada quadrinho segue para o próximo desta coleção.',orderEyebrow:'Ordem de leitura'});
Object.assign(copy.es,{orderCount:'{count} historias en orden de lectura',orderMissing:'{count} fuera de tu biblioteca',notInLibrary:'No está en tu biblioteca',orderStart:'Empezar · #{n} {title}',orderContinue:'Seguir · #{n} {title}',orderDone:'Todo lo de aquí ya está leído ✓',orderHint:'Abriendo desde aquí, cada cómic sigue con el siguiente de esta colección.',orderEyebrow:'Orden de lectura'});
// ---- Diagnostics: a small local log of errors the user can copy and send ----
const DIAG_KEY='cloudpanels-diagnostics-v1';
function scrub(text,limit=600){return String(text||'').replace(/sk-ant-[A-Za-z0-9_\-]+/g,'[key]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/https?:\/\/[^\s"')]+/g,u=>u.split('?')[0].replace(/\/[^/]{24,}/g,'/[id]')).slice(0,limit);}
function diag(where,error,extra){
  try{const list=JSON.parse(localStorage.getItem(DIAG_KEY)||'[]');
    list.push({at:new Date().toISOString(),where,message:scrub(error?.message||error),code:error?.code||error?.status||'',name:error?.name||'',stack:scrub(String(error?.stack||'').split('\n').slice(0,4).join(' | ')),extra:extra?scrub(JSON.stringify(extra),2400):undefined,version:document.querySelector('.sidebar-version span')?.textContent||''});
    localStorage.setItem(DIAG_KEY,JSON.stringify(list.slice(-80)));}catch{}
}
// ---- Speed report (Settings → Diagnostics → Copy report): what kept this
// device busy and for how long. Only timings and counts: no comic names,
// e-mail addresses, passwords or keys.
const perf=globalThis.__cpPerf={marks:[],work:[],long:[],stalls:[],counts:{},active:new Set(),extra:()=>[],
  count(name){this.counts[name]=(this.counts[name]||0)+1;},
  total(name,ms){this.counts[name]=(this.counts[name]||0)+1;this.counts[name+'Ms']=Math.round((this.counts[name+'Ms']||0)+ms);this.counts[name+'MaxMs']=Math.max(this.counts[name+'MaxMs']||0,Math.round(ms));},
  mark(name){if(this.marks.length<160)this.marks.push([name,Math.round(performance.now())]);},
  begin(name){if(!this.active.has(name)){this.active.add(name);this.mark(name+'>');}},
  end(name){if(this.active.delete(name))this.mark(name+'<');},
  done(name,start){const ms=performance.now()-start;if(ms>=40){if(this.work.length>=300)this.work.shift();this.work.push([name,Math.round(start),Math.round(ms)]);}},
  labels(){try{return [...this.active,...this.extra()].join('+');}catch{return [...this.active].join('+');}}};
try{new PerformanceObserver(list=>{for(const entry of list.getEntries()){if(perf.long.length>=300)perf.long.shift();perf.long.push([Math.round(entry.startTime),Math.round(entry.duration),perf.labels()]);}}).observe({type:'longtask',buffered:true});}catch{}
// Where long tasks are not reported (iPad), a late timer shows the same stall.
(()=>{let last=performance.now(),until=last+180000,timer=null;
  const tick=()=>{const now=performance.now(),late=now-last-100;if(late>150){if(perf.stalls.length>=300)perf.stalls.shift();perf.stalls.push([Math.round(last+100),Math.round(late),perf.labels()]);}last=now;timer=now<until&&document.visibilityState!=='hidden'?setTimeout(tick,100):null;};
  timer=setTimeout(tick,100);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')return;perf.mark('back');last=performance.now();until=last+120000;if(!timer)timer=setTimeout(tick,100);});})();
perf.mark('app-start');
window.addEventListener('error',event=>diag('window',event.error||event.message));
window.addEventListener('unhandledrejection',event=>diag('promise',event.reason));
window.addEventListener('cloudpanels-error',event=>diag(event.detail?.where||'reader',event.detail?.error,event.detail?.extra));
function diagnosticsEntries(){try{const list=JSON.parse(localStorage.getItem(DIAG_KEY)||'[]');return Array.isArray(list)?list:[];}catch{return [];}}
// Problems recorded (newest first), what read aloud did (newest first) and
// the speed report of this session (timings and counts only). Short enough to
// paste into a chat: the newest parts come first and the oldest are left out.
function diagnosticsReport(limit=14000){
  const speed={};
  try{
    const nav=performance.getEntriesByType?.('navigation')?.[0],state=store?.state||{},connection=navigator.connection;
    Object.assign(speed,{uptime:Math.round(performance.now()),cpu:navigator.hardwareConcurrency||null,memoryGB:navigator.deviceMemory||null,
      network:connection?{type:connection.effectiveType||'',rtt:connection.rtt??null,mbps:connection.downlink??null,saveData:Boolean(connection.saveData)}:null,
      page:nav?{type:nav.type||'',responseStart:Math.round(nav.responseStart),responseEnd:Math.round(nav.responseEnd),interactive:Math.round(nav.domInteractive),loaded:Math.round(nav.domContentLoadedEventEnd),fromWorker:nav.workerStart>0}:null,
      discarded:Boolean(document.wasDiscarded),
      files:(performance.getEntriesByType?.('resource')||[]).filter(entry=>/\/(app\.js|styles\.css|thumb-worker\.js|chunk-[\w-]+\.js)$/.test(entry.name)).map(entry=>[entry.name.split('/').pop(),Math.round(entry.startTime),Math.round(entry.duration),entry.transferSize??null]),
      library:{comics:state.comics?.length||0,positions:Object.keys(state.progress||{}).length,panels:Object.keys(state.panels||{}).length,bookmarks:state.bookmarks?.length||0,retired:Object.keys(state.retired||{}).length,offline:offline?.ids?.size||0,mega:mega?.connected||false,sync:cloud?.signedIn||false},
      counts:perf.counts,marks:perf.marks,work:perf.work,long:perf.long,stalls:perf.stalls});
  }catch(error){speed.error=String(error?.message||error).slice(0,200);}
  // The many "library checked" notes say little: only the latest three stay.
  let checks=0;
  const entries=diagnosticsEntries().slice().reverse().filter(entry=>entry?.where!=='library-check'||++checks<=3)
    .map(entry=>({...entry,stack:entry?.stack?String(entry.stack).split(' | ').slice(0,2).join(' | '):undefined}));
  const report={app:'CloudPanels',version:document.querySelector('.sidebar-version span')?.textContent||'',ua:navigator.userAgent,aloud:aloudEvents().slice().reverse(),entries,speed};
  let text=JSON.stringify(report);
  // Too long: first the speed details and the error details are shortened,
  // then the oldest problems and diary lines are left out.
  const shorten=[()=>{for(const key of ['work','long','stalls','marks','files'])if(Array.isArray(speed[key]))speed[key]=speed[key].slice(-12);},
    ()=>{for(const entry of report.entries){delete entry.stack;if(entry.extra)entry.extra=String(entry.extra).slice(0,300);}}];
  for(let round=0;text.length>limit&&round<80;round++){
    if(round<shorten.length)shorten[round]();
    else if(round%2&&report.entries.length>8)report.entries=report.entries.slice(0,Math.max(8,Math.floor(report.entries.length*.8)));
    else if(report.aloud.length>20)report.aloud=report.aloud.slice(0,Math.max(20,Math.floor(report.aloud.length*.8)));
    else{for(const key of ['marks','work','long','stalls','files'])delete speed[key];if(report.entries.length>4)report.entries.pop();else if(report.aloud.length>4)report.aloud.pop();else break;}
    text=JSON.stringify(report);
  }
  return text;
}
let appReady=false,persistenceErrorPending=false;
const accounts = getNativeAccounts();
let accountProfile = await openAccountGate({client:accounts});perf.mark('gate');
let store;
let startupNotice;
if (accounts) {
  startupNotice = document.createElement('div'); startupNotice.className = 'account-gate';
  const card = document.createElement('section'); card.className = 'account-card';
  const title = document.createElement('h2'); title.textContent = 'Opening your library…'; card.append(title); startupNotice.append(card); document.body.append(startupNotice);
}
perf.begin('store-load');
try {
  store = await createBrowserLibraryStore({
    ...(accounts ? {metadataStore:accounts.createMetadataStore(),strictPersistence:true,fallbackStorage:null} : {}),
    onPersistenceError:()=>{persistenceErrorPending=true;if(appReady)toast(t('storageError'));}
  });
  if (accounts && await accounts.canImportLegacyLibrary()) {
    const legacy = await createBrowserLibraryStore();
    try {
      if (legacy.lastError) throw new Error('Legacy library unavailable.');
      store.importBackup(legacy.exportBackup());
      if (!await store.flush()) throw new Error('Library migration could not be saved.');
    } finally { legacy.close?.(); }
    await accounts.finishLegacyMigration();
    await clearLegacyBrowserLibrary();
    const legacyCovers=new CoverService();try{await legacyCovers.clear();}finally{await legacyCovers.close();}
  }
} catch {
  if (!startupNotice) { startupNotice = document.createElement('div'); startupNotice.className = 'account-gate'; document.body.append(startupNotice); }
  startupNotice.replaceChildren();
  const card = document.createElement('section'); card.className = 'account-card';
  const message = document.createElement('p'); message.textContent = 'Your saved library could not be unlocked. Your saved data has not been changed.';
  const retry = document.createElement('button'); retry.className = 'button primary'; retry.textContent = 'Try again'; retry.onclick = () => location.reload();
  card.append(message,retry); startupNotice.append(card);
  throw new Error('Library startup could not complete.');
}
perf.end('store-load');
const mega = new MegaConnection();
// Remember the MEGA session on this iPad (never the password), so reopening the
// app does not ask for a new login. "Disconnect" forgets it.
const SESSION_KEY='cloudpanels-mega-session-v1';
const sessionVault = accounts || {
  async saveSession(record){try{localStorage.setItem(SESSION_KEY,JSON.stringify(record));}catch{}},
  async loadSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{return null;}},
  async clearSession(){try{localStorage.removeItem(SESSION_KEY);}catch{}},
};
perf.begin('offline');const offline = await new OfflineLibrary().init();perf.end('offline');
// Writing to MEGA (sync, shared covers, CBZ conversion) is paused until it is
// confirmed to work reliably on real accounts. Reading comics is unaffected.
const MEGA_WRITES_ENABLED=false;
const sync={busy:false,lastText:null,lastAt:0,lastPull:0,failed:false,timer:null};
// Sync between devices through the CloudPanels sync account (see cloud-sync.js).
const cloud=createCloudSync();
const cloudState={busy:false,lastAt:0,failed:'',dirty:false,timer:null,seen:{revision:null,data:null,skipped:null}};
let readingComicId=null;
const localFiles = new Map();
const demoFiles = new Map();
const readable = new Set(['cbz','zip','pdf','jpg','jpeg','png','webp','cbr','rar','cb7','7z','cbt','tar']);
const main = document.querySelector('#main');
const modal = document.querySelector('#modal');
const modalContent = document.querySelector('#modal-content');
let view = 'library', selectedCollection = null, visibleCount = 60, searchTimer;
let libraryMode='folders',folderPath=[],mainDirty=false,refreshQueued=false,refreshAfterReading=false;
const VIEW_KEY='cloudpanels-library-view';
let libraryView=(()=>{try{return localStorage.getItem(VIEW_KEY)==='rack'?'rack':'grid';}catch{return 'grid';}})();
let selectionMode=false,selectionCandidates=[];
const selectedComicIds=new Set();
let filters = {status:'all',publisher:'',series:'',character:'',sort:'title',group:''};
let modalGeneration = 0, modalAbort = null, toastTimer, opening = false, pendingLocalId = null;
const conversation = [];
// Room for several thousand covers on the device (each about 30-60 KB).
const covers = new CoverService({getSource:comic=>resolveSource(comic), maxConcurrent:2, maxMemoryBytes:24*1024*1024, maxDiskBytes:192*1024*1024, allowFull:comic=>offline.has(comic.id)&&['cbr','rar','cb7','7z','cbt','tar'].includes(String(comic.format).toLowerCase()), ...(accounts ? {disk:null} : {})});
perf.extra=()=>[covers.running?'covers':null,document.querySelector('#reader')?.open?'reader':null].filter(Boolean);
let rememberedConnection = null, restoringConnection = null;
let coverObserver=null,coverEpoch=0;
const coverRequests=new Map(),coverTargets=new Map(),coverURLs=new Set();
const reader = createReaderController({
  store,
  onNextComic:async current=>{
    // Opened from a collection in its own reading order: the next one of that
    // collection (none after its last). Otherwise the next in its folder, as always.
    const order=readingCollectionId&&store.state.collections.find(c=>c.id===readingCollectionId&&c.ordered&&c.comicIds.includes(current?.id));
    const comic=order?nextInCollection(order,current.id,new Map(store.state.comics.map(c=>[c.id,c])),c=>readable.has(c.format)):nextComicInFolder(store.state.comics,current);
    if(!comic)return null;
    const source=await resolveSource(comic);
    return {comic,source};
  },
  onChange:()=>{mainDirty=true;queueMainRefresh();scheduleSync();cloudState.dirty=true;scheduleCloudSync();},
  onActivity:({busy,open})=>{
    covers.setForegroundBusy(Boolean(busy||open));
    // The library is fully covered by an open comic: it is not drawn meanwhile.
    document.documentElement.classList.toggle('cp-reading',Boolean(open));
    if(open){mainDirty=true;pauseCoverRequests();}
    else{
      queueMainRefresh();
      // Only once the reader is really closed (not while switching comics).
      const closed=!document.querySelector('#reader').open;
      if(closed){readingComicId=null;scheduleCloudSync(1500);}
      if(reloadForUpdate&&closed)reloadWithUpdate();
      else if(refreshAfterReading&&closed){refreshAfterReading=false;setTimeout(()=>{if(!document.querySelector('#reader').open)void refreshLibrary();},800);}
    }
  },
  onCoverFirstPage:(comic,pageBlob,thumbnail)=>{
    void covers.seed(comic,pageBlob,{thumbnail}).then(blob=>{
      if(!blob||document.querySelector('#reader').open)return;
      for(const [cover,value]of coverTargets)if(value.id===comic.id&&cover.isConnected)paintCover(cover,value,blob);
    }).catch(()=>{});
  }
});
for (const [language, values] of Object.entries({
  en: {markUnread: 'Mark as unread', readSaved: 'Marked as read. Your place is saved.', unreadSaved: 'Marked as unread.'},
  'pt-BR': {markUnread: 'Marcar como não lido', readSaved: 'Marcado como lido. Sua posição está salva.', unreadSaved: 'Marcado como não lido.'},
  es: {markUnread: 'Marcar como no leído', readSaved: 'Marcado como leído. Tu posición está guardada.', unreadSaved: 'Marcado como no leído.'}
})) Object.assign(copy[language], values);
for (const [language, values] of Object.entries({
  en: {navigationButtons: 'Navigation buttons', navigationButtonsDetail: 'Hide Previous and Next automatically while reading. Tap the center to bring back the controls.', navigationOff: 'Off', navigation3: 'Hide after 3 seconds', navigation5: 'Hide after 5 seconds', navigation8: 'Hide after 8 seconds'},
  'pt-BR': {navigationButtons: 'Botões de navegação', navigationButtonsDetail: 'Oculte Anterior e Próxima automaticamente durante a leitura. Toque no centro para trazer os controles de volta.', navigationOff: 'Desativados', navigation3: 'Ocultar após 3 segundos', navigation5: 'Ocultar após 5 segundos', navigation8: 'Ocultar após 8 segundos'},
  es: {navigationButtons: 'Botones de navegación', navigationButtonsDetail: 'Oculta Anterior y Siguiente automáticamente al leer. Toca el centro para volver a ver los controles.', navigationOff: 'Desactivados', navigation3: 'Ocultar tras 3 segundos', navigation5: 'Ocultar tras 5 segundos', navigation8: 'Ocultar tras 8 segundos'}
})) Object.assign(copy[language], values);
for (const [language, values] of Object.entries({
  en: {swipeResistance: 'Page-turn resistance', swipeResistanceDetail: 'Choose how far to swipe. Higher levels require a longer movement.', swipeLevel1: 'Very light', swipeLevel2: 'Light', swipeLevel3: 'Balanced', swipeLevel4: 'Firm', swipeLevel5: 'Very firm'},
  'pt-BR': {swipeResistance: 'Resistência para trocar de página', swipeResistanceDetail: 'Escolha a distância do deslize. Níveis maiores exigem um movimento mais longo.', swipeLevel1: 'Muito leve', swipeLevel2: 'Leve', swipeLevel3: 'Equilibrada', swipeLevel4: 'Firme', swipeLevel5: 'Muito firme'},
  es: {swipeResistance: 'Resistencia al pasar página', swipeResistanceDetail: 'Elige cuánto deslizar. Los niveles altos requieren un movimiento más largo.', swipeLevel1: 'Muy ligera', swipeLevel2: 'Ligera', swipeLevel3: 'Equilibrada', swipeLevel4: 'Firme', swipeLevel5: 'Muy firme'}
})) Object.assign(copy[language], values);
for(const [lang,values] of Object.entries({en:{homeScreen:'Install on your iPad',homeScreenDetail:'In Safari, tap Share → Add to Home Screen. CloudPanels then opens full screen, without Safari\'s bars, and starts even offline. Export a backup before changing devices.'},'pt-BR':{homeScreen:'Instalar no iPad',homeScreenDetail:'No Safari, toque em Compartilhar → Adicionar à Tela de Início. O CloudPanels passa a abrir em tela cheia, sem as barras do Safari, e funciona até sem internet. Exporte um backup antes de trocar de aparelho.'},es:{homeScreen:'Instalar en el iPad',homeScreenDetail:'En Safari, toca Compartir → Añadir a pantalla de inicio. CloudPanels se abrirá a pantalla completa, sin las barras de Safari. Exporta una copia antes de cambiar de dispositivo.'}}))Object.assign(copy[lang],values);
for (const [language, values] of Object.entries({
  en: {selectComics:'Select',cancelSelection:'Cancel selection',selectedStories:'{count} selected',selectMatchingStories:'Select all matching ({count})',clearStorySelection:'Clear selection',selectStory:'Select {title}',batchRead:'Mark as read',batchUnread:'Mark as unread',batchReadSaved:'{count} stories marked as read.',batchUnreadSaved:'{count} stories marked as unread.',batchUnchanged:'These stories already have that reading status.',folderRead:'Folder read',folderReadProgress:'{read} / {count} read',markFolderRead:'Mark folder as read',markFolderUnread:'Mark folder as unread',selectionHint:'Select covers, then choose a reading status. All matching includes results beyond this page.'},
  'pt-BR': {selectComics:'Selecionar',cancelSelection:'Cancelar seleção',selectedStories:'{count} selecionados',selectMatchingStories:'Selecionar todos os resultados ({count})',clearStorySelection:'Limpar seleção',selectStory:'Selecionar {title}',batchRead:'Marcar como lidos',batchUnread:'Marcar como não lidos',batchReadSaved:'{count} histórias marcadas como lidas.',batchUnreadSaved:'{count} histórias marcadas como não lidas.',batchUnchanged:'Estas histórias já estão com esse status de leitura.',folderRead:'Pasta lida',folderReadProgress:'{read} / {count} lidos',markFolderRead:'Marcar pasta como lida',markFolderUnread:'Marcar pasta como não lida',selectionHint:'Selecione as capas e escolha o status de leitura. Selecionar todos inclui resultados além desta página.'},
  es: {selectComics:'Seleccionar',cancelSelection:'Cancelar selección',selectedStories:'{count} seleccionados',selectMatchingStories:'Seleccionar todos los resultados ({count})',clearStorySelection:'Limpiar selección',selectStory:'Seleccionar {title}',batchRead:'Marcar como leídos',batchUnread:'Marcar como no leídos',batchReadSaved:'{count} historias marcadas como leídas.',batchUnreadSaved:'{count} historias marcadas como no leídas.',batchUnchanged:'Estas historias ya tienen ese estado de lectura.',folderRead:'Carpeta leída',folderReadProgress:'{read} / {count} leídos',markFolderRead:'Marcar carpeta como leída',markFolderUnread:'Marcar carpeta como no leída',selectionHint:'Selecciona portadas y elige el estado de lectura. Seleccionar todos incluye resultados más allá de esta página.'}
})) Object.assign(copy[language], values);
for (const [language, values] of Object.entries({
  en: {turnMode: 'Turn pages by', turnModeDetail: 'Swipe like a printed comic, tap the right or left side, or both. The Previous and Next buttons always work.', turnBoth: 'Swipe and tap', turnSwipe: 'Swipe only', turnTap: 'Tap only'},
  'pt-BR': {turnMode: 'Virar a página com', turnModeDetail: 'Deslize o dedo como numa revista de verdade, toque no canto direito ou esquerdo, ou os dois. Os botões Anterior e Próxima sempre funcionam.', turnBoth: 'Deslizar e tocar', turnSwipe: 'Só deslizar', turnTap: 'Só tocar'},
  es: {turnMode: 'Pasar la página con', turnModeDetail: 'Desliza como en un cómic impreso, toca el lado derecho o izquierdo, o ambos. Los botones Anterior y Siguiente siempre funcionan.', turnBoth: 'Deslizar y tocar', turnSwipe: 'Solo deslizar', turnTap: 'Solo tocar'},
})) Object.assign(copy[language], values);
const t = (key, vars = {}) => {
  let value = copy[store.state.settings.language]?.[key] || copy.en[key] || key;
  for (const [name, text] of Object.entries(vars)) value = value.replaceAll('{' + name + '}', String(text));
  return value;
};
function element(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value') node.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'required' || key === 'multiple') node[key] = Boolean(value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  children.flat(Infinity).forEach(child => { if (child !== null && child !== undefined && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child))); });
  return node;
}
const text = (value, className = 'muted') => element('p',{class:className,text:value});
const action = (label, fn, className = 'button secondary', attrs = {}) => element('button',{type:'button',class:className,onclick:fn,...attrs},label);
function toast(message) {
  if (!message) return;
  const target = document.querySelector('#toast');
  clearTimeout(toastTimer); target.textContent = message; target.hidden = false;
  toastTimer = setTimeout(()=>{target.hidden=true;},5000);
}
function changed() { render(); if (store.lastError) toast(t('storageError')); scheduleSync(); }
function queueMainRefresh(){
  if(refreshQueued)return;refreshQueued=true;
  queueMicrotask(()=>{refreshQueued=false;if(!document.querySelector('#reader').open&&mainDirty){mainDirty=false;render();}});
}
function pauseCoverRequests(){
  coverObserver?.disconnect();
  coverRequests.forEach(controller=>controller.abort());coverRequests.clear();
}
function releaseCoverView(){
  pauseCoverRequests();coverObserver=null;coverEpoch++;
  coverTargets.clear();coverURLs.forEach(url=>URL.revokeObjectURL(url));coverURLs.clear();
}
function queueCover(cover,comic){
  coverTargets.set(cover,comic);
  if('IntersectionObserver' in window){
    if(!coverObserver)coverObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;coverObserver.unobserve(entry.target);const value=coverTargets.get(entry.target);if(value)void loadCover(entry.target,value,coverEpoch);}},{rootMargin:'120px 0px',threshold:.01});
    coverObserver.observe(cover);
  }else setTimeout(()=>{if(cover.isConnected)void loadCover(cover,comic,coverEpoch);},0);
}
async function loadCover(cover,comic,epoch){
  if(document.querySelector('#reader').open||epoch!==coverEpoch)return;
  const controller=new AbortController();coverRequests.set(cover,controller);
  try{
    const blob=await covers.get(comic,{signal:controller.signal,priority:'visible'});
    if(!blob||controller.signal.aborted||epoch!==coverEpoch||!cover.isConnected)return;
    paintCover(cover,comic,blob);
  }catch{/* A missing thumbnail never blocks a story or reveals account errors. */}
  finally{if(coverRequests.get(cover)===controller)coverRequests.delete(cover);}
}
function paintCover(cover,comic,blob){
  if(cover.querySelector('.comic-cover-image'))return;
  const url=URL.createObjectURL(blob);coverURLs.add(url);
  const image=element('img',{class:'comic-cover-image',src:url,alt:comic.metadata.title||comic.name,loading:'lazy',decoding:'async'});
  cover.prepend(image);cover.classList.add('has-cover');
}
function heading(title, subtitle, ...actions) {
  return element('div',{class:'page-heading'},element('div',{},element('p',{class:'eyebrow',text:t('universe')}),element('h1',{text:title}),text(subtitle)),actions.length ? element('div',{class:'page-heading-actions row'},actions) : null);
}
function resetFilters() { clearComicSelection(); filters = {status:'all',publisher:'',series:'',character:'',sort:'title',group:''};document.querySelector('#search').value='';visibleCount=60;render(); }
function changeView(next) { clearComicSelection(true); view=next;selectedCollection=null;visibleCount=60;render();window.scrollTo({top:0,behavior:'auto'}); }
function applyLanguage() {
  document.documentElement.lang = store.state.settings.language;
  document.querySelectorAll('[data-i18n]').forEach(node=>{const key=node.dataset.i18n;if(copy.en[key])node.textContent=t(key);});
  document.querySelector('#search').placeholder=view==='library'&&libraryMode==='folders'&&folderPath.length?t('searchFolder'):t('searchPlaceholder');
  document.querySelector('#search').setAttribute('aria-label',t('searchPlaceholder'));
}
function refreshHeader() {
  applyLanguage();
  document.querySelectorAll('[data-view]').forEach(node=>{
    node.classList.toggle('active',node.dataset.view===view);
    if(node.dataset.view===view)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');
  });
  const status = document.querySelector('#connection-status');
  status.classList.toggle('connected',mega.connected);
  status.replaceChildren(element('span',{class:'status-dot','aria-hidden':'true'}),element('span',{text:mega.connected?t('connected'):t('notConnected')}));
  const connectLabel=document.querySelector('#connect-button span');if(connectLabel)connectLabel.textContent=mega.connected?t('manageMega'):t('connectMega');
}
function render() {
  const started=performance.now();
  releaseCoverView();refreshHeader();main.replaceChildren();
  if(view==='collections')renderCollections();
  else if(view==='assistant')renderAssistant();
  else if(view==='settings')renderSettings();
  else renderLibrary();
  perf.done('render:'+view,started);
}
function hero() {
  const art=element('div',{class:'hero-illustration','aria-hidden':'true'},
    element('div',{class:'orbit orbit-one'}),element('div',{class:'orbit orbit-two'}),
    element('div',{class:'illustrated-book illustrated-book-back'},element('div',{class:'book-moon'}),element('div',{class:'book-hill'})),
    element('div',{class:'illustrated-book illustrated-book-front'},element('span',{class:'book-star'}),element('div',{class:'book-panel panel-one'}),element('div',{class:'book-panel panel-two'}),element('div',{class:'book-panel panel-three'}),element('div',{class:'book-line'})),
    element('span',{class:'illustration-spark spark-one',text:'✦'}),element('span',{class:'illustration-spark spark-two',text:'✧'}));
  const title=element('h2');t('heroTitle').split('\n').forEach((line,index)=>{if(index)title.append(element('br'));title.append(document.createTextNode(line));});
  return element('section',{class:'hero'},element('div',{class:'hero-copy'},
    element('span',{class:'eyebrow',text:t('moreStories')}),title,text(t('heroText')),
    element('div',{class:'row'},action(t('connectMega'),openConnection,'button primary'),action(t('tryReader'),openDemo,'button secondary')),
    element('div',{class:'format-list',style:'margin-top:17px'},['CBZ','CBR','PDF','JPG'].map(format=>element('span',{text:format})))),art);
}
function empty(title, description, buttons = []) { return element('div',{class:'empty-state'},element('div',{class:'empty-icon','aria-hidden':'true',text:'＋'}),element('h3',{text:title}),text(description),element('div',{class:'row'},buttons)); }
// A long list (thousands of series) is filled in when it is opened: laying out
// every entry each time the library was drawn took seconds on a phone.
const LONG_SELECT=150;
function selectControl(label, options, current, callback, className='') {
  const select=element('select',{'aria-label':label,class:className});
  const fill=list=>list.forEach(([value,name])=>select.append(element('option',{value,text:name})));
  if(options.length>LONG_SELECT){
    fill(options.filter(([value],index)=>index===0||value===current));
    select.dataset.longest=String(options.reduce((longest,[,name])=>Math.max(longest,String(name).length),0));
    let filled=false;
    const all=()=>{if(filled)return;filled=true;const keep=select.value;select.replaceChildren();fill(options);select.value=keep;};
    for(const type of ['pointerdown','mousedown','touchstart','focus','keydown'])select.addEventListener(type,all,{once:true,passive:true});
  }else fill(options);
  select.value=current;
  select.addEventListener('change',()=>callback(select.value));
  return select;
}
const facetOrder=new Intl.Collator(undefined,{numeric:true}); // the order of localeCompare, set up once
function facetOptions(comics, key, first) {
  const values=new Set();comics.forEach(c=>{const value=c.metadata[key];if(Array.isArray(value))value.forEach(v=>values.add(v));else if(value)values.add(value);});
  return [['',first],...[...values].sort(facetOrder.compare).map(value=>[value,value])];
}
function filterToolbar(comics) {
  const changes=(key,value)=>{clearComicSelection();filters[key]=value;visibleCount=60;render();};
  const chips=element('div',{class:'chips'});
  ['all','unread','reading','finished'].forEach(status=>chips.append(action(t(status),()=>changes('status',status),'chip'+(filters.status===status?' active':''),{'aria-pressed':filters.status===status})));
  const fields=element('div',{class:'toolbar',style:'margin-bottom:25px'},
    selectControl(t('publisher'),facetOptions(comics,'publisher',t('allPublishers')),filters.publisher,v=>changes('publisher',v),'input'),
    selectControl(t('series'),facetOptions(comics,'series',t('allSeries')),filters.series,v=>changes('series',v),'input'),
    selectControl(t('character'),facetOptions(comics,'characters',t('allCharacters')),filters.character,v=>changes('character',v),'input'),
    selectControl(t('sort'),[['title',t('title')],['issue',t('issue')],['recent',t('recent')],['added',t('added')]],filters.sort,v=>changes('sort',v),'input'),
    selectControl(t('group'),[['',t('noGrouping')],['publisher',t('publisher')],['series',t('series')],['characters',t('character')]],filters.group,v=>changes('group',v),'input'));
  // A long list shows only its first entry until opened: give it the width its longest entry would.
  fields.querySelectorAll('select').forEach(node=>{node.style.width=node.dataset.longest?`calc(${(Math.min(Number(node.dataset.longest),110)*.85).toFixed(1)}ch + 34px)`:'auto';node.style.maxWidth='100%';node.style.minHeight='36px';node.style.fontSize='10px';node.style.padding='8px 10px';});
  return [chips,fields];
}
function renderLibrary() {
  const continuing=view==='continue';
  let comics=store.state.comics;
  if(continuing)comics=comics.filter(c=>statusOf(c,store.state.progress)==='reading');
  const smart=!continuing&&['favorites','readLater'].includes(libraryMode);
  if(smart){const ids=new Set(store.state[libraryMode]||[]);comics=comics.filter(comic=>ids.has(comic.id));}
  const folderMode=!continuing&&libraryMode==='folders',contents=folderContents(comics,folderPath,store.state.progress);
  const query=document.querySelector('#search').value;
  const racks=folderMode&&libraryView==='rack'&&!selectionMode&&!query.trim()&&store.state.comics.length>0;
  const selectButton=!racks&&(comics.length||selectionMode)?action(t(selectionMode?'cancelSelection':'selectComics'),()=>{selectionMode=!selectionMode;selectedComicIds.clear();render();},'button secondary compact',{'data-bulk-select':'toggle','aria-pressed':String(selectionMode)}):null;
  const refreshButton=mega.connected&&!selectionMode&&store.state.comics.some(c=>c.source==='mega')?action('↻ '+t('refreshLibrary'),()=>void refreshLibrary({announce:true}),'button secondary compact',{'data-refresh-library':'1',disabled:Boolean(libraryRefresh)}):null;
  main.append(heading(continuing?t('continueReading'):(smart?t(libraryMode):(folderMode&&folderPath.length?folderPath.at(-1):t('library'))),continuing?t('keepReading'):(smart?t(libraryMode==='favorites'?'favoritesText':'readLaterText'):(folderMode?t('folderContents'):t('subtitle'))),...[refreshButton,selectButton].filter(Boolean)));
  if(refreshButton&&!continuing)main.append(element('p',{class:'muted library-check-line','data-library-check-short':'1',text:libraryCheckText(true)}));
  if(!continuing){main.append(libraryModeSwitch());if(folderMode&&store.state.comics.length)main.append(element('div',{class:'library-path-row'},folderBreadcrumbs(),libraryViewSwitch()));}
  if(!store.state.comics.length&&!continuing&&!smart)main.append(hero());
  if(!comics.length) {
    clearComicSelection();
    if(smart){main.append(empty(t(libraryMode==='favorites'?'favoritesEmpty':'laterEmpty'),t(libraryMode==='favorites'?'favoritesEmptyText':'laterEmptyText'),[action(t('browseLibrary'),()=>switchLibraryMode('folders'),'button primary')]));return;}
    main.append(empty(continuing?t('noReading'):t('emptyTitle'),continuing?t('noReadingText'):t('emptyText'),
      [action(t('connectMega'),openConnection,'button primary'),action(t('tryReader'),openDemo,'button secondary')]));
    return;
  }
  if(racks){renderRacks(contents);if(comics.some(c=>c.source==='local'))main.append(element('div',{class:'notice info',style:'margin-top:28px',text:t('localNotice')}));return;}
  const scoped=folderMode?contents.descendants:comics;
  if(!continuing)main.append(...filterToolbar(scoped));
  const searching=Boolean(selectionMode||query.trim()||filters.status!=='all'||filters.publisher||filters.series||filters.character||filters.group);
  if(folderMode&&!selectionMode&&folderPath.length&&contents.count)main.append(folderSummary(contents));
  if(folderMode&&!searching&&contents.folders.length)main.append(folderGrid(contents.folders));
  if(!continuing&&!searching)appendUpNext(scoped);
  const candidates=folderMode&&!searching?contents.comics:scoped;
  const visible=sortComics(filterComics(candidates,store.state.progress,{...filters,status:continuing?'all':filters.status,query}),store.state.progress,continuing?'recent':filters.sort);
  if(selectionMode){
    selectionCandidates=visible.map(comic=>comic.id);
    const available=new Set(selectionCandidates);for(const id of selectedComicIds)if(!available.has(id))selectedComicIds.delete(id);
    main.append(storySelectionToolbar());
  }
  if(visible.length||!folderMode||searching||!contents.folders.length)appendComicList(visible);
  if(scoped.some(c=>c.source==='local'))main.append(element('div',{class:'notice info',style:'margin-top:28px',text:t('localNotice')}));
}
function switchLibraryMode(mode){clearComicSelection(true);libraryMode=mode;view='library';selectedCollection=null;visibleCount=60;render();}
function libraryModeSwitch(){
  return element('div',{class:'library-mode-switch chips'},[
    ['folders',t('folders'),null],['shelf',t('allStories'),store.state.comics.length],
    ['favorites',t('favorites'),(store.state.favorites||[]).length],['readLater',t('readLater'),(store.state.readLater||[]).length]
  ].map(([mode,label,count])=>{
    const button=action('',()=>switchLibraryMode(mode),'chip'+(libraryMode===mode?' active':''),{'aria-pressed':libraryMode===mode,'data-library-mode':mode});
    if(mode==='favorites'||mode==='readLater')button.append(shelfIcon(mode));
    button.append(element('span',{text:label}));if(count!==null)button.append(element('span',{class:'shelf-count',text:String(count)}));return button;
  }));
}
function folderBreadcrumbs(){
  const nav=element('nav',{class:'library-breadcrumbs breadcrumb','aria-label':t('folders')},action(t('library'),()=>{clearComicSelection(true);folderPath=[];visibleCount=60;render();void saveRememberedConnection().catch(()=>{});},'text-button'));
  folderPath.forEach((name,index)=>nav.append(element('span',{'aria-hidden':'true',text:'/'}),action(name,()=>{clearComicSelection(true);folderPath=folderPath.slice(0,index+1);visibleCount=60;render();void saveRememberedConnection().catch(()=>{});},'text-button')));
  return nav;
}
function folderIcon(){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z');svg.append(path);return svg;
}
function openFolder(folder){clearComicSelection(true);folderPath=folder.path.slice();visibleCount=60;render();void saveRememberedConnection().catch(()=>{});window.scrollTo({top:0,behavior:'auto'});}
function folderGrid(folders){
  return element('section',{class:'folder-grid'},folders.map(folder=>{
    const open=action('',()=>openFolder(folder),'folder-open',{'aria-label':folder.name});
    open.append(...[folderStack(folder),element('h3',{class:'folder-name',text:folder.name}),element('span',{class:'folder-count',text:t('folderCount',{count:folder.count})}),folder.readingCount?element('span',{class:'folder-progress',text:t('folderReading',{count:folder.readingCount})}):null].filter(Boolean));
    const progress=folderReadingStatus(folder);
    return element('article',{class:'folder-card'+(folder.allRead?' folder-all-read':'')},open,progress,
      folder.continueComic?action(t('continueFolder'),()=>openComic(folder.continueComic),'folder-continue text-button'):null,
      folderReadActions(folder.comics,folder));
  }));
}
// ---- Folder covers and newsstand shelves ---------------------------------------
function setLibraryView(value){libraryView=value==='rack'?'rack':'grid';try{localStorage.setItem(VIEW_KEY,libraryView);}catch{}clearComicSelection(true);visibleCount=60;render();}
function strokeIcon(paths){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [name,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(name,value);
  for(const d of paths){const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);svg.append(path);}
  return svg;
}
const VIEW_ICONS={grid:['M4 4h7v7H4z','M13 4h7v7h-7z','M4 13h7v7H4z','M13 13h7v7h-7z'],rack:['M3 20h18','M3 11h18','M5 11V4.5h3V11','M9.5 11V6h3v5','M14.5 20v-6h3v6','M5.5 20v-5h3v5']};
function libraryViewSwitch(){
  return element('div',{class:'view-switch',role:'group','aria-label':t('viewLabel')},[['grid',t('viewGrid')],['rack',t('viewRacks')]].map(([value,label])=>{
    const button=action('',()=>{if(libraryView!==value)setLibraryView(value);},'',{'aria-pressed':String(libraryView===value),'data-library-view':value});
    button.append(strokeIcon(VIEW_ICONS[value]),element('span',{text:label}));return button;
  }));
}
const STACK_SHADES=['#1e2b3b','#243245','#1b2838','#26364a'];
function stackCover(comic,className=''){
  let hash=0;for(const char of String(comic.id))hash=(hash*31+char.charCodeAt(0))>>>0;
  const cover=element('span',{class:'stack-cover'+(className?' '+className:''),style:'background:'+STACK_SHADES[hash%STACK_SHADES.length]},element('span',{class:'stack-cover-title',text:comic.metadata?.series||comic.metadata?.title||comic.name}));
  queueCover(cover,comic);return cover;
}
// The comic being read in the folder in front, the next ones behind it.
function folderStack(folder){
  const picks=coverPicks(folder.comics,store.state.progress,3,folder.continueComic);
  if(!picks.length)return element('span',{class:'folder-icon'},folderIcon());
  const [front,...back]=picks,stack=element('span',{class:'folder-stack','aria-hidden':'true'});
  back.forEach((comic,index)=>stack.append(stackCover(comic,index?'stack-right':'stack-left')));
  stack.append(stackCover(front,'stack-front'));
  return stack;
}
function rackMeta(group){
  if(group.allRead)return t('rackAllRead',{count:group.count});
  return group.readCount?t('rackSomeRead',{count:group.count,read:group.readCount}):t('folderCount',{count:group.count});
}
function rackShelf(title,meta,comics,open,openLabel){
  const covers=element('div',{class:'rack-covers'},comics.map((comic,index)=>{
    const name=comic.metadata?.title||comic.name,reading=statusOf(comic,store.state.progress)==='reading';
    const button=action('',()=>openComic(comic),'rack-cover',{'aria-label':(reading?t('resume'):t('open'))+' '+name,title:name,style:'z-index:'+(index+1)});
    button.append(stackCover(comic));return button;
  }));
  const label=element('div',{class:'rack-label'},element('span',{class:'rack-plate',text:title}),meta?element('span',{class:'rack-meta',text:meta}):null);
  const button=open?action('',open,'rack-open text-button'):null;
  if(button)button.append(element('span',{text:openLabel||t('rackOpen')}),strokeIcon(['m9 6 6 6-6 6']));
  return element('section',{class:'rack','aria-label':title},covers,element('div',{class:'rack-rail'},label,button));
}
function featuredRack(comic){
  const progress=store.state.progress[comic.id]||{},count=Math.max(1,Number(progress.pageCount)||1),page=Math.min(count,(Number(progress.page)||0)+1),fraction=Math.min(100,Math.round(page/count*100));
  const name=comic.metadata?.title||comic.name,where=comicFolderParts(comic)[folderPath.length]||'';
  const cover=action('',()=>openComic(comic),'rack-featured-cover',{'aria-label':t('resume')+' '+name});cover.append(stackCover(comic));
  return element('section',{class:'rack-featured','aria-label':t('rackContinue')},
    element('div',{class:'rack-stand'},cover,element('span',{class:'rack-stand-base','aria-hidden':'true'})),
    element('div',{class:'rack-featured-info'},
      element('span',{class:'rack-plate',text:t('rackContinue')}),
      element('h2',{class:'rack-featured-title',text:name}),
      where?element('p',{class:'rack-featured-from',text:t('rackFrom',{folder:where})}):null,
      element('div',{class:'progress-track','aria-hidden':'true'},element('span',{style:'width:'+fraction+'%'})),
      element('p',{class:'rack-featured-page',text:t('rackPage',{page,count})}),
      element('div',{class:'row'},action(t('rackContinueButton'),()=>openComic(comic),'button primary'),action(t('details'),()=>openDetails(comic.id),'button secondary rack-details'))));
}
// Newsstand shelves: what is being read in front, then "Up next", then one shelf
// per folder here. Only covers on screen are loaded, as in the grid.
function renderRacks(contents){
  const progress=store.state.progress,queued=new Set(store.state.readLater||[]);let current=null;
  for(const comic of contents.descendants)if(statusOf(comic,progress)==='reading'&&(!current||(progress[comic.id]?.updatedAt||'')>(progress[current.id]?.updatedAt||'')))current=comic;
  if(current)main.append(featuredRack(current));
  const shelves=element('div',{class:'rack-shelves'});
  if(contents.descendants.some(comic=>statusOf(comic,progress)!=='unread'||queued.has(comic.id))){
    const next=upNextComics(contents.descendants,progress,13,store.state.readLater||[]).filter(comic=>comic!==current).slice(0,12);
    if(next.length)shelves.append(rackShelf(t('rackUpNext'),'',next,null));
  }
  for(const folder of contents.folders)shelves.append(rackShelf(folder.name,rackMeta(folder),coverPicks(folder.comics,progress,12,folder.continueComic),()=>openFolder(folder)));
  if(contents.comics.length){
    const readCount=contents.comics.filter(comic=>statusOf(comic,progress)==='finished').length;
    shelves.append(rackShelf(t('rackHere'),rackMeta({count:contents.comics.length,readCount,allRead:readCount===contents.comics.length}),coverPicks(contents.comics,progress,12),()=>setLibraryView('grid'),t('rackSeeAll')));
  }
  if(shelves.childElementCount)main.append(shelves);
}
function clearComicSelection(exit=false){selectedComicIds.clear();selectionCandidates=[];if(exit)selectionMode=false;}
function toggleComicSelection(id,enabled=!selectedComicIds.has(id)){
  if(!selectionMode||!selectionCandidates.includes(id))return;
  if(enabled)selectedComicIds.add(id);else selectedComicIds.delete(id);updateComicSelection();
}
function updateComicSelection(){
  for(const card of main.querySelectorAll('.comic-card[data-comic-id]')){
    const selected=selectedComicIds.has(card.dataset.comicId);card.classList.toggle('is-selected',selected);
    const checkbox=card.querySelector('.comic-selection-control input');if(checkbox)checkbox.checked=selected;
    const cover=card.querySelector('.comic-cover-select');if(cover)cover.setAttribute('aria-pressed',String(selected));
  }
  const count=main.querySelector('[data-bulk-count]');if(count)count.textContent=t('selectedStories',{count:selectedComicIds.size});
  for(const button of main.querySelectorAll('[data-bulk-action]'))button.disabled=selectedComicIds.size===0;
}
function markStories(ids,finished){
  try{
    const count=store.setReadStatusBatch(ids,finished?'finished':'unread');clearComicSelection(true);changed();
    if(!store.lastError)toast(count?t(finished?'batchReadSaved':'batchUnreadSaved',{count}):t('batchUnchanged'));
  }catch(error){toast(publicError(error,t('storageError')));}
}
function storySelectionToolbar(){
  const count=element('strong',{'data-bulk-count':'',text:t('selectedStories',{count:selectedComicIds.size})});
  const selectAll=action(t('selectMatchingStories',{count:selectionCandidates.length}),()=>{selectionCandidates.forEach(id=>selectedComicIds.add(id));updateComicSelection();},'button secondary compact',{disabled:!selectionCandidates.length,'data-bulk-all':'matching'});
  const clear=action(t('clearStorySelection'),()=>{selectedComicIds.clear();updateComicSelection();},'button ghost compact');
  const actions=element('div',{class:'row'},selectAll,clear,
    action(t('batchRead'),()=>markStories([...selectedComicIds],true),'button primary compact',{'data-bulk-action':'read',disabled:!selectedComicIds.size}),
    action(t('batchUnread'),()=>markStories([...selectedComicIds],false),'button secondary compact',{'data-bulk-action':'unread',disabled:!selectedComicIds.size}));
  return element('section',{class:'story-selection-toolbar','aria-label':t('selectComics')},count,text(t('selectionHint')),actions);
}
function folderReadingStatus(folder){
  const fraction=folder.count?Math.round(folder.readCount/folder.count*100):0;
  return element('div',{class:'folder-reading-status'},
    folder.allRead?element('span',{class:'folder-read-badge',text:'✓ '+t('folderRead')}):null,
    element('span',{class:'folder-read-count',text:t('folderReadProgress',{read:folder.readCount,count:folder.count})}),
    element('div',{class:'progress-track','aria-hidden':'true'},element('span',{style:'width:'+fraction+'%'})));
}
function folderReadActions(comics,folder){
  const ids=comics.map(comic=>comic.id);
  return element('div',{class:'folder-read-actions row'},
    !folder.allRead?action(t('markFolderRead'),()=>markStories(ids,true),'text-button',{'data-folder-read':'read'}):null,
    folder.readCount||folder.readingCount?action(t('markFolderUnread'),()=>markStories(ids,false),'text-button',{'data-folder-read':'unread'}):null,
    comics.some(c=>c.source!=='demo')?action(comics.every(c=>offline.has(c.id))?'✓ '+t('onDevice'):'⤓ '+t('downloadFolder'),()=>saveFolderOffline(comics),'text-button',{'data-folder-offline':'1'}):null,
    comics.some(convertible)?action('⇄ '+t('convertFolder',{count:comics.filter(convertible).length}),()=>askConvert(comics.filter(convertible)),'text-button'):null);
}
function convertible(comic){return MEGA_WRITES_ENABLED&&comic?.source==='mega'&&['cbr','rar','cb7','7z','cbt','tar'].includes(String(comic.format).toLowerCase());}
let conversion=null;
function askConvert(list){
  if(!list.length)return;
  if(!mega.connected){toast(t('reconnect'));openConnection();return;}
  if(mega.mode!=='account'){toast(t('convertNeedsAccount'));return;}
  const {body}=openModal(t('convertTitle'));
  body.append(text(t('convertText')),text(t('convertCount',{count:list.length})),
    element('div',{class:'form-actions'},action(t('cancel'),closeModal,'button ghost'),action(t('convertStart'),()=>{closeModal();startConversion(list);},'button primary')));
}
function conversionPanel(){
  let panel=document.querySelector('#conversion-panel');
  if(!panel){panel=element('div',{id:'conversion-panel',class:'conversion-panel',role:'status'},element('span',{class:'conversion-text'}),element('div',{class:'conversion-bar'},element('span')),action(t('convertCancel'),()=>conversion?.controller.abort(),'text-button'));document.body.append(panel);}
  return panel;
}
async function startConversion(list){
  if(conversion){const ids=new Set(conversion.queue.map(c=>c.id));conversion.queue.push(...list.filter(c=>!ids.has(c.id)));conversion.total=conversion.queue.length+conversion.done;return;}
  conversion={queue:list.slice(),done:0,total:list.length,converted:0,controller:new AbortController()};
  let wakeLock=null;try{wakeLock=await navigator.wakeLock?.request('screen');}catch{}
  const panel=conversionPanel(),label=panel.querySelector('.conversion-text'),bar=panel.querySelector('.conversion-bar span');
  const show=(comic,step,fraction)=>{label.textContent=t('converting',{done:conversion.done+1,total:conversion.total,name:comic.metadata?.title||comic.name})+(step?' · '+step:'');bar.style.width=Math.round(((conversion.done+(fraction||0))/conversion.total)*100)+'%';};
  const steps=t('convertStep');const stepText=(key,vars={})=>(typeof steps==='object'&&steps[key]?String(steps[key]).replace(/\{(\w+)\}/g,(_,k)=>vars[k]??''):key);
  try{
    while(conversion.queue.length){
      const signal=conversion.controller.signal;signal.throwIfAborted();
      const original=conversion.queue.shift();const comic=store.state.comics.find(c=>c.id===original.id);
      if(!comic||!convertible(comic)){conversion.done++;continue;}
      try{
        show(comic,stepText('open'),0);
        const source=mega.getSource(comic);
        const result=await streamToCbz(source,{signal,createUpload:size=>mega.startCbzUpload(comic.id,size,{signal}),
          onProgress:p=>{if(p.phase==='pages')show(comic,stepText('pages',{a:p.done,b:p.total}),.05+.85*p.done/p.total);else if(p.phase==='upload')show(comic,stepText('upload'),.92);}});
        const descriptor=result.result;
        show(comic,stepText('verify'),.96);
        try{await verifyCbz(mega.getSource(descriptor),{pageCount:result.pageCount,checks:result.checks,signal});}
        catch(error){await mega.moveToRubbishBin(descriptor.id).catch(()=>{});throw error;}
        await mega.moveToRubbishBin(comic.id);
        const path=String(comic.path||comic.name).replace(/[^/]+$/,descriptor.name);
        store.replaceComic(comic.id,{...descriptor,path,format:'cbz'});
        if(offline.has(comic.id))await offline.remove(comic.id).catch(()=>{});
        conversion.converted++;mainDirty=true;queueMainRefresh();scheduleSync();
      }catch(error){
        if(signal.aborted)throw error;
        diag('convert',error,{size:comic.size});
        toast(t('convertFailed',{name:comic.metadata?.title||comic.name,reason:(publicError(error,'')||error?.message||'').replace(/\.?$/,'.')}));
      }
      conversion.done++;
    }
    toast(t('convertDone',{count:conversion.converted}));
  }catch{toast(t('convertCancelled'));}
  finally{conversion=null;panel.remove();try{await wakeLock?.release();}catch{}mainDirty=true;queueMainRefresh();}
}
function offlineLabel(id){
  const job=offline.downloading(id);
  if(job)return t('downloadingOffline',{p:Math.floor(job.loaded/Math.max(1,job.total)*100)});
  return offline.has(id)?'✓ '+t('onDevice'):'';
}
offline.onChange(id=>{
  for(const node of document.querySelectorAll('[data-offline-status]'))if(node.dataset.offlineStatus===id){const label=offlineLabel(id);node.textContent=label;node.hidden=!label;}
});
const offlineQueue=[];let offlineRunning=false;
async function runOfflineQueue(){
  if(offlineRunning)return;offlineRunning=true;
  try{
    while(offlineQueue.length){
      const comic=offlineQueue.shift();if(offline.has(comic.id))continue;
      try{
        if(comic.source==='mega'&&!mega.connected)throw new Error(t('reconnect'));
        const source=comic.source==='local'&&localFiles.has(comic.id)?await fileSource(localFiles.get(comic.id)):await resolveSource(comic);
        await offline.download(comic.id,source,comic.name);
        if(!offlineQueue.length)toast(t('offlineSaved'));
      }catch(error){if(error?.name!=='AbortError'){toast(publicError(error,t('offlineFailed'))||t('offlineFailed'));offlineQueue.length=0;}}
    }
  }finally{offlineRunning=false;if(!document.querySelector('#reader').open){mainDirty=true;queueMainRefresh();}}
}
function toggleOffline(comic){
  if(offline.has(comic.id)){offline.remove(comic.id).then(()=>{toast(t('offlineRemoved'));mainDirty=true;queueMainRefresh();}).catch(()=>toast(t('storageError')));return;}
  if(comic.source==='mega'&&!mega.connected){void megaReady().then(ready=>{if(!ready){toast(t('reconnect'));openConnection();return;}offlineQueue.push(comic);void runOfflineQueue();});return;}
  offlineQueue.push(comic);void runOfflineQueue();
}
function saveFolderOffline(comics){
  const pending=comics.filter(c=>c.source!=='demo'&&!offline.has(c.id)&&!offline.downloading(c.id)&&!offlineQueue.includes(c));
  if(!pending.length){toast(t('folderSaved'));return;}
  if(pending.some(c=>c.source==='mega')&&!mega.connected){toast(t('reconnect'));openConnection();return;}
  offlineQueue.push(...pending);toast(t('folderQueued',{count:pending.length}));void runOfflineQueue();
}
function folderSummary(contents){return element('section',{class:'folder-summary'},folderReadingStatus(contents),folderReadActions(contents.descendants,contents));}
function appendUpNext(comics){
  const queued=new Set(store.state.readLater||[]);
  if(!comics.some(c=>statusOf(c,store.state.progress)!=='unread'||queued.has(c.id)))return;
  const next=upNextComics(comics,store.state.progress,6,store.state.readLater||[]);if(!next.length)return;
  const header=element('div',{class:'section-heading'},element('div',{},element('h2',{text:t('upNext')}),text(t('upNextHint'))));
  const rail=element('div',{class:'up-next-rail'},next.map(comic=>comicCard(comic)));
  main.append(element('section',{class:'up-next-section section'},header,rail));
}
function appendComicList(comics) {
  main.append(element('div',{class:'section-heading'},element('h2',{text:t('comicsCount',{count:comics.length})}),element('span',{class:'subtle',style:'font-size:9px;letter-spacing:1px',text:t('allClouds')})));
  if(!comics.length){main.append(empty(t('noMatches'),t('changeFilters'),[action(t('clearFilters'),resetFilters)]));return;}
  const shown=comics.slice(0,visibleCount);
  if(filters.group) {
    const groups=new Map();
    shown.forEach(c=>{const value=c.metadata[filters.group];const keys=Array.isArray(value)?(value.length?value:[t('unknown')]):[value||t('unknown')];keys.forEach(key=>{if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);});});
    [...groups].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([name,items])=>main.append(element('section',{class:'section'},element('div',{class:'section-heading'},element('h3',{text:name})),comicGrid(items))));
  } else main.append(comicGrid(shown));
  if(comics.length>shown.length)main.append(element('div',{style:'display:flex;justify-content:center;margin-top:30px'},action(t('loadMore')+' · '+shown.length+' / '+comics.length,()=>{visibleCount+=60;render();})));
}
function comicGrid(comics) { return element('div',{class:'library-grid'},comics.map(comic=>comicCard(comic))); }
function comicCard(comic,{position}={}) {
  const metadata=comic.metadata,progress=store.state.progress[comic.id],status=statusOf(comic,store.state.progress);
  const palettes=['linear-gradient(145deg,#31434e,#172537)','linear-gradient(145deg,#3e4933,#202f2b)','linear-gradient(145deg,#493b4a,#252438)','linear-gradient(145deg,#514635,#272937)'];
  let hash=0;for(const char of comic.id)hash=(hash*31+char.charCodeAt(0))>>>0;
  const cover=element('div',{class:'comic-cover',style:'background:'+palettes[hash%palettes.length]},
    element('span',{class:'cover-publisher',text:metadata.publisher||comic.source.toUpperCase()}),
    element('span',{class:'cover-title',text:metadata.series||metadata.title||comic.name}),
    element('span',{class:'cover-bottom',text:[metadata.volume?'VOL. '+metadata.volume:'',metadata.issue?'#'+metadata.issue:'',metadata.year].filter(Boolean).join(' · ')}),
    element('span',{class:'format-badge',text:comic.format.toUpperCase()}),status==='finished'?element('span',{class:'read-badge',text:'✓ '+t('finished')}):null,
    position?element('span',{class:'order-badge','aria-label':'#'+position,text:String(position)}):null);
  const selected=selectedComicIds.has(comic.id);
  const open=action('',()=>selectionMode?toggleComicSelection(comic.id):openComic(comic),selectionMode?'comic-cover-select':'',
    {'aria-label':selectionMode?t('selectStory',{title:metadata.title||comic.name}):(status==='reading'?t('resume'):t('open'))+' '+metadata.title,...(selectionMode?{'aria-pressed':String(selected)}:{})});open.append(cover);
  const title=element('h3',{class:'comic-title',text:metadata.title||comic.name});
  const caption=[metadata.publisher,metadata.issue?'#'+metadata.issue:''].filter(Boolean).join(' · ')||formatBytes(comic.size);
  const info=element('div',{class:'comic-info'},title,element('p',{class:'comic-meta',text:caption}));
  const flags=element('div',{class:'comic-flags'});
  if((store.state.favorites||[]).includes(comic.id))flags.append(element('span',{class:'comic-flag',title:t('favorites'),'aria-label':t('favorites')},shelfIcon('favorites')));
  if((store.state.readLater||[]).includes(comic.id))flags.append(element('span',{class:'comic-flag',title:t('readLater'),'aria-label':t('readLater')},shelfIcon('readLater')));
  if(flags.childElementCount)info.append(flags);
  info.append(element('span',{class:'comic-source'},sourceIcon(comic.source),element('span',{text:comic.source==='mega'?'MEGA':comic.source==='demo'?'CloudPanels':t('importFiles')})));
  info.append(element('span',{class:'comic-offline','data-offline-status':comic.id,text:offlineLabel(comic.id),hidden:!offlineLabel(comic.id)}));
  if(progress&&status!=='unread'){const fraction=progress.status==='finished'?100:Math.min(100,Math.round((progress.page+1)/progress.pageCount*100));info.append(element('div',{class:'progress-track'},element('span',{style:'width:'+fraction+'%'})),element('div',{class:'progress-caption'},element('span',{text:t(status)}),element('span',{text:t('page')+' '+(progress.page+1)+' / '+progress.pageCount})));}
  if(!selectionMode)info.append(element('div',{class:'comic-actions'},
    action(t('details'),()=>openDetails(comic.id),'text-button'),
    action(t(status==='finished'?'finished':'markRead'),()=>setComicRead(comic.id,true),'text-button comic-read-action',
      {'data-read-action':comic.id,'aria-pressed':String(status==='finished'),disabled:status==='finished','aria-label':t('markRead')+' · '+(metadata.title||comic.name)}),
    status!=='unread'?action(t('markUnread'),()=>setComicRead(comic.id,false),'text-button comic-read-action',
      {'data-unread-action':comic.id,'aria-label':t('markUnread')+' · '+(metadata.title||comic.name)}):null));
  queueCover(cover,comic);
  let selectionControl=null;
  if(selectionMode){
    const input=element('input',{type:'checkbox',checked:selected,'aria-label':t('selectStory',{title:metadata.title||comic.name})});
    input.addEventListener('change',()=>toggleComicSelection(comic.id,input.checked));
    selectionControl=element('label',{class:'comic-selection-control'},input);
  }
  return element('article',{class:'comic-card'+(selectionMode?' is-selectable':'')+(selectionMode&&selected?' is-selected':''),'data-comic-id':comic.id},open,selectionControl,info);
}
function setComicRead(id, finished) {
  const previous=store.state.progress[id];
  try {
    const result=finished?store.setProgress(id,{page:previous?.page||0,panel:previous?.panel||0,
      pageCount:previous?.pageCount||1,status:'finished'}):store.markUnread(id);
    changed();if(!store.lastError)toast(t(finished?'readSaved':'unreadSaved'));return result;
  }catch(error){toast(publicError(error,t('storageError')));return null;}
}
function sourceIcon(source){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',source==='mega'?'M7.2 18.5a5.2 5.2 0 1 1 .7-10.3 6 6 0 0 1 11.4 2 4.2 4.2 0 0 1-.5 8.3H7.2Z':'M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6');svg.append(path);return svg;
}
function shelfIcon(mode){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',mode==='favorites'?'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z':'M6 3h12v18l-6-4-6 4V3Z');svg.append(path);return svg;
}
async function fileSource(file) {
  return {size:file.size,name:file.name||'reader-demo.cbz',blob:file,read:async(start,end,{signal}={})=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>file.size)throw new Error('Invalid file range.');const bytes=new Uint8Array(await file.slice(start,end).arrayBuffer());if(signal?.aborted)throw new DOMException('Cancelled','AbortError');return bytes;}};
}
async function demoSource(format) {
  if(!['cbz','pdf'].includes(format))throw new Error(t('demoError'));
  if(!demoFiles.has(format)){const response=await fetch('samples/reader-demo.'+format,{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error(t('demoError'));const blob=await response.blob();if(blob.size>24*1024*1024)throw new Error(t('demoError'));demoFiles.set(format,new File([blob],'reader-demo.'+format,{type:format==='pdf'?'application/pdf':'application/zip'}));}
  return fileSource(demoFiles.get(format));
}
async function resolveSource(comic){
  if(offline.has(comic.id)){const saved=await offline.source(comic.id,comic.name);if(saved)return saved;}
  if(comic.source==='mega'){if(!mega.connected)throw new Error(t('reconnect'));return mega.getSource(comic);}
  if(comic.source==='local'){const file=localFiles.get(comic.id);if(!file)throw new Error(t('selectAgain'));return fileSource(file);}
  if(comic.id==='demo:reader-balloons:v1')throw new Error(store.state.settings.language==='pt-BR'?'Esta demonstração foi removida. Abra a demonstração atual em CBZ ou PDF.':store.state.settings.language==='es'?'Esta demostración fue retirada. Abre la demostración actual en CBZ o PDF.':'This demo has been retired. Open the current CBZ or PDF demo.');
  return demoSource(comic.format);
}
// The reading-order collection a comic was opened from ('' = the library or a folder).
let readingCollectionId='';
const orderedCollectionShown=()=>view==='collections'&&selectedCollection?store.state.collections.find(c=>c.id===selectedCollection&&c.ordered)||null:null;
async function openComic(comic) {
  if(opening)return;
  const from=orderedCollectionShown(),fromCollection=from&&from.comicIds.includes(comic?.id)?from.id:'';
  if(!readable.has(comic.format)){toast(t('unsupported'));return;}
  opening=true;
  covers.setForegroundBusy(true);pauseCoverRequests();
  try{
    if(comic.source==='mega'&&!mega.connected&&!offline.has(comic.id)&&!(await megaReady())){toast(t('reconnect'));openConnection();return;}
    if(comic.source==='local'&&!localFiles.has(comic.id)&&!offline.has(comic.id)){pendingLocalId=comic.id;toast(t('selectAgain'));document.querySelector('#file-input').click();return;}
    const source=await resolveSource(comic);
    if(modal.open)closeModal();
    readingComicId=comic.id;readingCollectionId=fromCollection;
    await reader.open(store.state.comics.find(c=>c.id===comic.id)||comic,source);
  }catch(error){diag('open-comic',error,{format:comic?.format,size:comic?.size});const message=publicError(error,t('connectionError'));if(message)toast(message);}
  finally{opening=false;refreshHeader();if(!document.querySelector('#reader').open){covers.setForegroundBusy(false);mainDirty=true;queueMainRefresh();}}
}
async function importFiles(files) {
  let count=0, matching=null;
  for(const file of files){
    const format=file.name.split('.').pop().toLowerCase();
    if(!['cbz','zip','pdf','jpg','jpeg','png','webp','cbr','rar','cb7','7z','cbt','tar'].includes(format)){toast(t('unsupported'));continue;}
    if(file.size<=0){toast(t('failedImport'));continue;}
    const seed=new TextEncoder().encode(file.name+'\0'+file.size+'\0'+file.lastModified);
    const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',seed));
    const id='local:'+Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
    localFiles.set(id,file);store.upsertComics([{id,name:file.name,size:file.size,format,source:'local',path:file.name}]);count++;
    // Imported files stay on the iPad, so they never need to be selected again.
    if(!offline.has(id))offline.put(id,file,file.name).catch(()=>{});
    if(id===pendingLocalId)matching=id;
  }
  pendingLocalId=null;view='library';visibleCount=60;changed();if(count)toast(t('imported',{count}));
  if(matching)await openComic(store.state.comics.find(c=>c.id===matching));
}
function openModal(title, subtitle='') {
  modalAbort?.abort();modalAbort=null;modalGeneration++;
  const session=modalGeneration;
  const body=element('div',{class:'stack',style:'gap:17px'});
  modalContent.replaceChildren(element('div',{class:'modal-header'},element('div',{},element('h2',{text:title}),subtitle?text(subtitle):null),action('×',closeModal,'button ghost icon-button',{'aria-label':t('close')})),body);
  if(!modal.open)modal.showModal();
  return {body,session,current:()=>modal.open&&session===modalGeneration};
}
function closeModal() {modalAbort?.abort();modalAbort=null;modalGeneration++;if(modal.open)modal.close();}
modal.addEventListener('cancel',()=>{modalAbort?.abort();modalAbort=null;modalGeneration++;});
modal.addEventListener('click',event=>{if(event.target===modal){const box=modal.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeModal();}});
function inputField(label, options={}) {
  const control=element(options.multiline?'textarea':'input',{type:options.type||'text',value:options.value||'',placeholder:options.placeholder||'',autocomplete:options.autocomplete||'off',...options.attrs});
  const labelNode=element('label',{style:'display:grid;gap:7px'},element('span',{text:label}),control,options.help?element('small',{text:options.help}):null);
  return {control,node:element('div',{class:'field'+(options.full?' full':'')},labelNode)};
}
function openDetails(id) {
  const comic=store.state.comics.find(c=>c.id===id);if(!comic)return;
  const {body}=openModal(t('metadata'),t('metadataHint'));
  const favorite=action('',()=>toggleShelf('favorites'),'button secondary',{'data-shelf-toggle':'favorite'});
  const later=action('',()=>toggleShelf('readLater'),'button secondary',{'data-shelf-toggle':'readLater'});
  function updateShelfActions(){
    for(const [mode,button]of [['favorites',favorite],['readLater',later]]){
      const active=(store.state[mode]||[]).includes(id);
      button.setAttribute('aria-pressed',String(active));button.classList.toggle('is-active',active);
      const key=mode==='favorites'?(active?'favoriteActive':'favoriteAction'):(active?'laterActive':'laterAction');
      button.replaceChildren(shelfIcon(mode),element('span',{text:t(key)}));
      button.setAttribute('aria-label',active?t(mode==='favorites'?'removeFavorite':'removeLater'):t(key));
    }
  }
  function toggleShelf(mode){
    const next=!(store.state[mode]||[]).includes(id);
    try{
      if(mode==='favorites')store.setFavorite(id,next);else store.setReadLater(id,next);
      updateShelfActions();changed();if(!store.lastError)toast(t(mode==='favorites'?(next?'favoriteAdded':'favoriteRemoved'):(next?'laterAdded':'laterRemoved')));
    }catch(error){toast(publicError(error,t('storageError')));}
  }
  updateShelfActions();
  const saveButton=comic.source==='demo'?null:action('',()=>toggleOffline(comic),'button secondary',{'data-offline-toggle':id});
  const refreshSave=()=>{if(!saveButton)return;const job=offline.downloading(id);saveButton.disabled=Boolean(job);saveButton.textContent=job?t('downloadingOffline',{p:Math.floor(job.loaded/Math.max(1,job.total)*100)}):offline.has(id)?'✓ '+t('removeOffline'):'⤓ '+t('downloadOffline');saveButton.classList.toggle('is-active',offline.has(id));};
  refreshSave();const stopWatching=offline.onChange(changedId=>{if(changedId!==id)return;if(!saveButton.isConnected){stopWatching();return;}refreshSave();});
  body.append(element('div',{class:'shelf-actions'},favorite,later,saveButton,convertible(comic)?action('⇄ '+t('convertOne'),()=>{closeModal();askConvert([comic]);},'button secondary'):null));
  const form=element('form'),grid=element('div',{class:'form-grid'}),fields={};
  ['title','publisher','series','volume','issue','year','characters','tags'].forEach(key=>{
    const field=inputField(t(key),{value:Array.isArray(comic.metadata[key])?comic.metadata[key].join(', '):comic.metadata[key],full:['title','characters','tags'].includes(key),help:['characters','tags'].includes(key)?t('commaHint'):null,attrs:{maxlength:['title','series'].includes(key)?512:(!['characters','tags'].includes(key)?160:4096)}});
    fields[key]=field.control;grid.append(field.node);
  });
  const status=selectControl(t('status'),['unread','reading','finished'].map(s=>[s,t(s)]),statusOf(comic,store.state.progress),()=>{},'input');
  const markReadButton=action(t('markRead'),()=>changeReadStatus(true),'button secondary compact',{'data-detail-read-action':id});
  const markUnreadButton=action(t('markUnread'),()=>changeReadStatus(false),'button secondary compact',{'data-detail-unread-action':id});
  function refreshReadActions(){const saved=statusOf(comic,store.state.progress);markReadButton.disabled=saved==='finished';markUnreadButton.disabled=saved==='unread';}
  function changeReadStatus(finished){const saved=setComicRead(id,finished);if(saved){status.value=saved.status;refreshReadActions();}}
  refreshReadActions();
  grid.append(element('div',{class:'field full'},element('label',{},element('span',{text:t('status')}),status),element('div',{class:'row'},markReadButton,markUnreadButton)));
  form.append(grid,element('div',{class:'form-actions'},action(t('open'),()=>openComic(comic),'button secondary'),action(t('cancel'),closeModal,'button ghost'),element('button',{type:'submit',class:'button primary',text:t('save')})));
  form.addEventListener('submit',event=>{event.preventDefault();const patch={};for(const[key,control]of Object.entries(fields))patch[key]=['characters','tags'].includes(key)?control.value.split(',').map(v=>v.trim()).filter(Boolean):control.value;store.updateComic(id,patch);const previous=store.state.progress[id]||{page:0,panel:0,pageCount:1};store.setProgress(id,{...previous,status:status.value,...(status.value==='unread'?{page:0,panel:0}:{})});closeModal();changed();toast(t('saved'));});
  body.append(form);
  const related=store.related(id,6);
  body.append(element('div',{class:'separator'}),element('h3',{text:t('related')}),related.length?element('div',{class:'stack small-gap'},related.map(item=>action(item.metadata.title,()=>openDetails(item.id),'folder-row'))):text(t('noRelated')));
  body.append(action(t('remove'),()=>{store.removeComic(id);localFiles.delete(id);offline.remove(id).catch(()=>{});closeModal();changed();toast(t('removed'));},'button danger'));
}
function renderCollections() {
  const collection=store.state.collections.find(c=>c.id===selectedCollection);
  if(collection?.ordered){renderOrderedCollection(collection);return;}
  if(collection){
    main.append(action('← '+t('backCollections'),()=>{selectedCollection=null;visibleCount=60;render();},'back-button'),heading(collection.name,t('comicsCount',{count:collection.comicIds.length}),action(t('editCollection'),()=>editCollection(collection.id))));
    const ids=new Set(collection.comicIds),comics=sortComics(filterComics(store.state.comics.filter(c=>ids.has(c.id)),store.state.progress,{query:document.querySelector('#search').value}),store.state.progress,filters.sort);
    if(comics.length)appendComicList(comics);else main.append(empty(collection.name,t('noCollectionComics'),[action(t('chooseComics'),()=>editCollection(collection.id),'button primary')]));return;
  }
  main.append(heading(t('collections'),t('collectionsText'),action('+ '+t('newCollection'),()=>editCollection(),'button primary')));
  const smart=element('section',{class:'smart-shelves','aria-label':t('smartShelves')});
  for(const mode of ['favorites','readLater']){
    const card=action('',()=>switchLibraryMode(mode),'smart-shelf-card',{'data-smart-shelf':mode});
    card.append(element('span',{class:'smart-shelf-icon'},shelfIcon(mode)),element('span',{class:'smart-shelf-copy'},element('strong',{text:t(mode)}),element('span',{class:'muted',text:t('comicsCount',{count:(store.state[mode]||[]).length})})),element('span',{class:'smart-shelf-arrow','aria-hidden':'true',text:'↗'}));
    smart.append(card);
  }
  main.append(smart);
  if(!store.state.collections.length){main.append(empty(t('emptyCollections'),t('emptyCollectionsText'),[action(t('newCollection'),()=>editCollection(),'button primary')]));return;}
  main.append(element('div',{class:'section-heading'},element('h2',{text:t('customCollections')})));
  const grid=element('div',{class:'grid'});
  store.state.collections.forEach(collection=>{const button=action('',()=>{selectedCollection=collection.id;visibleCount=60;render();},'collection-card',{'aria-label':collection.name});button.style.textAlign='left';button.append(element('span',{class:'eyebrow',text:collection.ordered?t('orderEyebrow'):t('collections')}),element('h3',{text:collection.name}),text(t('comicsCount',{count:collection.comicIds.length})));grid.append(button);});main.append(grid);
}
// A collection in its own reading order: numbered, with the issues not in the
// library in their places, and a button to go on where the reading stopped.
function renderOrderedCollection(collection){
  const comicsById=new Map(store.state.comics.map(c=>[c.id,c])),items=collectionItems(collection,comicsById);
  const comicCount=items.filter(item=>item.type==='comic').length,missingCount=items.length-comicCount;
  main.append(action('← '+t('backCollections'),()=>{selectedCollection=null;visibleCount=60;render();},'back-button'),
    heading(collection.name,[t('orderCount',{count:comicCount}),missingCount?t('orderMissing',{count:missingCount}):''].filter(Boolean).join(' · '),action(t('editCollection'),()=>editCollection(collection.id))));
  if(!comicCount){main.append(empty(collection.name,t('noCollectionComics'),[action(t('chooseComics'),()=>editCollection(collection.id),'button primary')]));return;}
  const next=continueInCollection(collection,comicsById,store.state.progress);
  main.append(element('section',{class:'order-continue'},
    next?action('▶ '+t(next.started?'orderContinue':'orderStart',{n:next.position,title:next.comic.metadata.title||next.comic.name}),()=>openComic(next.comic),'button primary',{'data-order-continue':next.comic.id}):element('strong',{text:t('orderDone')}),
    text(t('orderHint'))));
  // A search narrows the list; the numbers stay those of the order.
  const query=document.querySelector('#search').value.trim();
  const matching=query?new Set(filterComics(items.filter(item=>item.type==='comic').map(item=>item.comic),store.state.progress,{query}).map(c=>c.id)):null;
  const shown=matching?items.filter(item=>item.type==='comic'&&matching.has(item.comic.id)):items,visible=shown.slice(0,visibleCount);
  if(!shown.length){main.append(empty(t('noMatches'),t('changeFilters'),[action(t('clearFilters'),resetFilters)]));return;}
  main.append(element('div',{class:'library-grid order-grid'},visible.map(item=>item.type==='comic'?comicCard(item.comic,{position:item.position}):missingCard(item))));
  if(shown.length>visible.length)main.append(element('div',{style:'display:flex;justify-content:center;margin-top:30px'},action(t('loadMore')+' · '+visible.length+' / '+shown.length,()=>{visibleCount+=60;render();})));
}
function missingCard(item){
  return element('article',{class:'comic-card order-missing','data-order-missing':String(item.position)},
    element('div',{class:'comic-cover order-missing-cover','aria-hidden':'true'},element('span',{class:'order-missing-mark',text:'?'}),element('span',{class:'order-badge',text:String(item.position)})),
    element('div',{class:'comic-info'},element('h3',{class:'comic-title',text:item.title}),element('p',{class:'comic-meta',text:t('notInLibrary')})));
}
function editCollection(id) {
  const collection=store.state.collections.find(c=>c.id===id);
  const {body}=openModal(collection?t('editCollection'):t('newCollection'));
  const name=inputField(t('collectionName'),{value:collection?.name||'',attrs:{required:true,maxlength:160}});
  const search=inputField(t('chooseComics'),{type:'search',placeholder:t('searchPlaceholder')});
  const form=element('form'),selected=new Set(collection?.comicIds||[]),summary=text('', 'muted'),list=element('div',{class:'folder-list'}),helper=element('small',{class:'muted'});
  function candidates(){return filterComics(store.state.comics,store.state.progress,{query:search.control.value});}
  function draw(){
    summary.textContent=t('selected',{count:selected.size});list.replaceChildren();const matches=candidates();
    matches.slice(0,200).forEach(comic=>{const checkbox=element('input',{type:'checkbox',checked:selected.has(comic.id),onchange:()=>{if(checkbox.checked)selected.add(comic.id);else selected.delete(comic.id);summary.textContent=t('selected',{count:selected.size});}});list.append(element('label',{class:'folder-row'},checkbox,element('span',{class:'folder-name',text:comic.metadata.title})));});
    helper.textContent=matches.length>200?t('firstResults',{count:200}):t('comicsCount',{count:matches.length});
  }
  search.control.addEventListener('input',draw);
  form.append(name.node,element('div',{style:'height:16px'}),search.node,element('div',{class:'row between',style:'margin-top:10px'},summary,element('div',{class:'row'},action(t('selectMatching'),()=>{candidates().forEach(c=>selected.add(c.id));draw();},'text-button'),action(t('clearSelection'),()=>{selected.clear();draw();},'text-button'))),list,helper,element('div',{class:'form-actions'},action(t('cancel'),closeModal,'button ghost'),element('button',{type:'submit',class:'button primary',text:t('save')})));
  form.addEventListener('submit',event=>{event.preventDefault();if(!name.control.value.trim()){name.control.focus();return;}try{let actual=id;if(!actual)actual=store.createCollection(name.control.value).id;else {const entry=store.state.collections.find(c=>c.id===actual);entry.name=name.control.value.trim();store.save();}store.setCollectionComics(actual,[...selected]);selectedCollection=actual;closeModal();changed();collectionsChanged();toast(t('saved'));}catch(error){toast(publicError(error,t('storageError')));}});
  body.append(form);if(collection)body.append(action(t('deleteCollection'),()=>{store.deleteCollection(id);selectedCollection=null;closeModal();changed();collectionsChanged();},'button danger'));draw();
}
const AI_TEXT={
  'pt-BR':{title:'Assistente de quadrinhos',subtitle:'Pergunte o que ler, ordens de leitura, o que falta na sua coleção ou a opinião dele sobre uma série.',setupTitle:'Ligue o seu assistente',setupText:'O assistente usa a IA Claude, da Anthropic. Você cria uma chave uma vez e ela fica guardada só neste aparelho. O uso é cobrado pela Anthropic, normalmente alguns centavos por conversa.',steps:['Abra console.anthropic.com e crie sua conta (pode entrar com o Google).','Em Billing (Cobrança), adicione um pouco de crédito — US$ 5 duram bastante.','Em API Keys, toque em Create Key, dê um nome (ex.: CloudPanels) e copie a chave.','Cole a chave aqui embaixo e toque em Salvar.'],keyLabel:'Chave da IA (começa com sk-ant-)',save:'Salvar chave',keyInvalid:'Essa chave não parece certa. Ela começa com sk-ant-.',placeholder:'Pergunte qualquer coisa sobre quadrinhos…',send:'Enviar',listening:'Ouvindo…',mic:'Falar',voice:'Responder em voz alta',web:'Pesquisar na internet',newChat:'Nova conversa',changeKey:'Trocar chave',you:'VOCÊ',bot:'ASSISTENTE',thinking:'Pensando…',searching:'Pesquisando na internet…',library:'Olhando sua biblioteca…',hello:'Olá! Eu conheço sua biblioteca e o que você já leu. Posso indicar a próxima leitura, montar a ordem de um arco, criar uma coleção na ordem de leitura (você confirma antes), mostrar o que falta nas suas coleções ou dar minha opinião sobre uma série. Por onde começamos?',chips:['O que eu leio agora?','O que está faltando nas minhas coleções?','Me indique algo parecido com o que estou lendo','Qual a ordem de leitura de um arco?','Crie uma coleção na ordem de leitura'],keySaved:'Chave salva. Pode perguntar!',stop:'Parar'},
  en:{title:'Comics assistant',subtitle:'Ask what to read, reading orders, what is missing from your collection or its opinion on a series.',setupTitle:'Turn on your assistant',setupText:'The assistant uses Claude AI by Anthropic. You create a key once and it stays only on this device. Usage is billed by Anthropic, usually a few cents per conversation.',steps:['Open console.anthropic.com and create an account.','In Billing, add a little credit — US$5 lasts a long time.','In API Keys, tap Create Key, name it (e.g. CloudPanels) and copy the key.','Paste the key below and tap Save.'],keyLabel:'AI key (starts with sk-ant-)',save:'Save key',keyInvalid:'That key does not look right. It starts with sk-ant-.',placeholder:'Ask anything about comics…',send:'Send',listening:'Listening…',mic:'Speak',voice:'Read answers aloud',web:'Search the web',newChat:'New conversation',changeKey:'Change key',you:'YOU',bot:'ASSISTANT',thinking:'Thinking…',searching:'Searching the web…',library:'Looking through your library…',hello:'Hi! I know your library and what you have read. I can suggest your next read, build a reading order, make a collection in reading order (you confirm it first), show what is missing from your collections or give my opinion on a series. Where shall we start?',chips:['What should I read now?','What is missing from my collections?','Suggest something like what I am reading','What is the reading order of an arc?','Make a collection in reading order'],keySaved:'Key saved. Ask away!',stop:'Stop'},
};
// Collections the assistant proposes (a card the user confirms).
Object.assign(AI_TEXT['pt-BR'],{newEyebrow:'Nova coleção',updateEyebrow:'Mudança numa coleção',create:'Criar coleção',update:'Atualizar coleção',cancelProposal:'Cancelar',created:'✓ Coleção criada',updated:'✓ Coleção atualizada',notCreated:'Não criada',notChanged:'Não alterada',openCollection:'Abrir coleção',inOrder:'{count} quadrinhos na ordem de leitura',missingCount:'{count} fora da sua biblioteca',replaces:'substitui “{name}”',seeOrder:'Ver a ordem inteira ({count})',notInLibrary:'fora da sua biblioteca',gone:'Esses quadrinhos não estão mais na sua biblioteca.',collectionReady:'Pronto: confira a ordem no cartão e confirme.',createdToast:'Coleção criada.',updatedToast:'Coleção atualizada.'});
Object.assign(AI_TEXT.en,{newEyebrow:'New collection',updateEyebrow:'Change to a collection',create:'Create collection',update:'Update collection',cancelProposal:'Cancel',created:'✓ Collection created',updated:'✓ Collection updated',notCreated:'Not created',notChanged:'Not changed',openCollection:'Open collection',inOrder:'{count} comics in reading order',missingCount:'{count} not in your library',replaces:'replaces “{name}”',seeOrder:'See the whole order ({count})',notInLibrary:'not in your library',gone:'These comics are no longer in your library.',collectionReady:'Here it is: check the order in the card and confirm.',createdToast:'Collection created.',updatedToast:'Collection updated.'});
AI_TEXT.es=AI_TEXT.en;
const aiText=()=>AI_TEXT[store.state.settings.language]||AI_TEXT.en;
let aiChat=null,aiBusy=null,aiStopListening=null;
function richText(textValue,byRef){
  const box=element('div',{class:'ai-rich'});let list=null;
  const inline=(line)=>{
    const parts=[];const re=/(\[\[c\d+\]\])|\*\*([^*]+)\*\*/g;let last=0,m;
    while((m=re.exec(line))){
      if(m.index>last)parts.push(document.createTextNode(line.slice(last,m.index)));
      if(m[1]){const id=byRef?.get(m[1].slice(2,-2));const comic=id&&store.state.comics.find(c=>c.id===id);
        parts.push(comic?action('📖 '+(comic.metadata.title||comic.name),()=>openComic(comic),'ai-comic-link'):document.createTextNode(''));}
      else parts.push(element('strong',{text:m[2]}));
      last=re.lastIndex;
    }
    if(last<line.length)parts.push(document.createTextNode(line.slice(last)));
    return parts;
  };
  for(const raw of String(textValue).split('\n')){
    const line=raw.replace(/^#{1,4}\s*/,'');
    const bullet=line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
    if(bullet){if(!list){list=element(/^\s*\d/.test(line)?'ol':'ul');box.append(list);}list.append(element('li',{},inline(bullet[1])));continue;}
    list=null;
    if(line.trim())box.append(element('p',{},inline(line)));
  }
  return box;
}
// The lucky wheel picks the next saga (see saga-wheel-view.js); it needs no AI key.
function openWheel(){
  openSagaWheel({store,t,element,action,openModal,openComic,toast,showFolder,
    loadCover:(comic,signal)=>covers.get(comic,{signal,priority:'visible'})});
}
function showFolder(path){
  closeModal();clearComicSelection(true);view='library';libraryMode='folders';selectedCollection=null;
  folderPath=path.slice();visibleCount=60;document.querySelector('#search').value='';render();
  void saveRememberedConnection().catch(()=>{});window.scrollTo({top:0,behavior:'auto'});
}
function renderAssistant() {
  const L=aiText();
  main.append(heading(L.title,L.subtitle),sagaWheelCard({store,element,action,onOpen:openWheel}));
  if(!assistantStore.key){
    const input=element('input',{class:'input',type:'password',autocomplete:'off',placeholder:'sk-ant-…','aria-label':L.keyLabel});
    const error=element('p',{class:'form-error',hidden:true});
    const card=element('section',{class:'card section ai-setup'},element('h3',{text:L.setupTitle}),text(L.setupText),
      element('ol',{class:'ai-steps'},L.steps.map(step=>element('li',{text:step}))),
      element('label',{style:'display:grid;gap:7px;margin-top:10px'},element('span',{text:L.keyLabel}),input),error,
      element('div',{class:'row',style:'margin-top:12px'},action(L.save,()=>{const value=input.value.trim();if(!/^sk-ant-[A-Za-z0-9_\-]{20,}$/.test(value)){error.textContent=L.keyInvalid;error.hidden=false;return;}assistantStore.key=value;toast(L.keySaved);renderAssistantOnly();},'button primary')));
    main.append(card);return;
  }
  if(!aiChat)aiChat=assistantStore.loadChat();
  // The assistant sees a short overview and looks up any folder, series or
  // comic itself with library tools, so a big collection is never cut off.
  const libraryIndex=buildLibraryIndex(store.state,{folderOf:c=>{try{return comicFolderParts(c).join(' / ');}catch{return '';}}});
  const context={text:libraryBrief(libraryIndex),byRef:libraryIndex.byRef,tools:libraryTools(libraryIndex)};
  const messages=element('div',{class:'ai-messages'});
  const bubble=(role,content)=>element('div',{class:'message '+role},element('span',{class:'message-label',text:role==='user'?L.you:L.bot}),content);
  messages.append(bubble('assistant',richText(L.hello,context.byRef)));
  for(const m of aiChat)messages.append(bubble(m.role,m.role==='user'?element('div',{text:m.text}):element('div',{},richText(m.text,context.byRef),...proposalCards(m))));
  const chips=element('div',{class:'assistant-prompts'},L.chips.map(chip=>action(chip,()=>send(chip),'chip')));
  const input=element('textarea',{class:'input',placeholder:L.placeholder,rows:2,maxlength:4000,'aria-label':L.placeholder});
  const sendButton=element('button',{type:'submit',class:'button primary',text:L.send});
  const mic=speechInputAvailable()?action('🎤',()=>toggleMic(),'button secondary ai-mic',{'aria-label':L.mic,title:L.mic}):null;
  const form=element('form',{class:'assistant-composer ai-composer'},input,mic,sendButton);
  const options=assistantStore.options;
  const toggle=(name,label)=>{const box=element('input',{type:'checkbox',checked:options[name]});box.addEventListener('change',()=>{assistantStore.setOption(name,box.checked);if(name==='voice'&&!box.checked)stopSpeaking();});return element('label',{class:'ai-toggle'},box,element('span',{text:label}));};
  const footer=element('div',{class:'row ai-footer'},toggle('voice',L.voice),toggle('web',L.web),
    action(L.newChat,()=>{aiBusy?.abort();aiChat=[];assistantStore.clearChat();stopSpeaking();renderAssistantOnly();},'text-button'),
    action(L.changeKey,()=>{assistantStore.key='';renderAssistantOnly();},'text-button'));
  main.append(messages,chips,form,footer);
  requestAnimationFrame(()=>messages.lastElementChild?.scrollIntoView({block:'end'}));
  function toggleMic(){
    if(aiStopListening){aiStopListening();aiStopListening=null;return;}
    stopSpeaking();mic.classList.add('is-active');input.placeholder=L.listening;
    aiStopListening=listen({language:store.state.settings.language==='en'?'en-US':store.state.settings.language,onText:(value,final)=>{input.value=value;if(final&&value.trim()){aiStopListening=null;send(value.trim());}},onEnd:()=>{aiStopListening=null;mic?.classList.remove('is-active');input.placeholder=L.placeholder;}});
  }
  form.addEventListener('submit',event=>{event.preventDefault();if(aiBusy){aiBusy.abort();return;}const value=input.value.trim();if(value)send(value);});
  async function send(question){
    if(aiBusy)return;
    stopSpeaking();input.value='';chips.remove();
    aiChat.push({role:'user',text:question.slice(0,4000)});
    messages.append(bubble('user',element('div',{text:question})));
    const answerBox=element('div',{class:'ai-pending',text:L.thinking});const node=bubble('assistant',answerBox);messages.append(node);node.scrollIntoView({block:'end',behavior:'smooth'});
    const controller=new AbortController();aiBusy=controller;sendButton.textContent=L.stop;
    let frame=0,latest='';
    // Collections it proposes in this answer (shown as cards to confirm).
    const proposals=[],tools={...context.tools,...collectionTools(libraryIndex,{collections:()=>store.state.collections,proposals})};
    try{
      let reply;
      try{reply=await askAssistant({key:assistantStore.key,messages:aiChat.map(forHistory),system:systemPrompt(context.text,store.state.settings.language),signal:controller.signal,web:assistantStore.options.web,tools,
        onText:(value,info)=>{latest=value;if(!value&&(info?.searching||info?.library)){answerBox.textContent=info.library?L.library:L.searching;answerBox.className='ai-pending';return;}if(frame)return;frame=requestAnimationFrame(()=>{frame=0;answerBox.replaceChildren(richText(latest,context.byRef));answerBox.className='';node.scrollIntoView({block:'end'});});}});}
      catch(error){if(error?.type==='empty_answer'&&proposals.length)reply=L.collectionReady;else throw error;}
      if(frame)cancelAnimationFrame(frame);
      const answer={role:'assistant',text:reply,...(proposals.length?{proposals:proposals.map(p=>({...p,state:'pending'}))}:{})},cards=proposalCards(answer);
      aiChat.push(answer);assistantStore.saveChat(aiChat);
      answerBox.replaceChildren(richText(reply,context.byRef),...cards);answerBox.className='';
      if(assistantStore.options.voice)speak(reply,store.state.settings.language==='en'?'en-US':'pt-BR');
    }catch(error){
      if(error?.name!=='AbortError')diag('assistant',error,{status:error?.status,type:error?.type});
      aiChat.pop();const message=friendlyError(error,store.state.settings.language);
      if(message){answerBox.textContent=message;answerBox.className='form-error';}else node.remove();
      if(error?.status===401){assistantStore.key='';}
    }finally{if(aiBusy===controller)aiBusy=null;sendButton.textContent=L.send;node.scrollIntoView({block:'end'});}
  }
}
// What became of the collections it proposed, for the assistant to know in the next questions.
function forHistory(message){
  if(message.role!=='assistant'||!message.proposals?.length)return message;
  const state={pending:'esperando a confirmação dele',created:'ele criou',updated:'ele confirmou a mudança',cancelled:'ele cancelou'};
  return {...message,text:message.text+'\n\n'+message.proposals.map(p=>`[Cartão de coleção: "${p.name}", ${p.comicIds.length} revistas${p.missing.length?`, ${p.missing.length} faltando`:''} — ${state[p.state]||state.pending}]`).join('\n')};
}
// A proposed collection: its order, and the buttons to create it (or not).
function proposalCards(message){return (message.proposals||[]).map(proposal=>proposalCard(message,proposal));}
function proposalCard(message,proposal){
  const L=aiText(),comicsById=new Map(store.state.comics.map(c=>[c.id,c]));
  const items=collectionItems({comicIds:proposal.comicIds,missing:proposal.missing},comicsById);
  const comicCount=items.filter(item=>item.type==='comic').length,missingCount=items.length-comicCount;
  const target=proposal.replaceId?store.state.collections.find(c=>c.id===proposal.replaceId):null,updating=Boolean(target);
  const row=item=>element('li',{class:item.type==='missing'?'is-missing':''},element('span',{class:'ai-collection-n',text:String(item.position)}),
    element('span',{class:'ai-collection-name',text:item.type==='comic'?(item.comic.metadata.title||item.comic.name):item.title}),item.type==='missing'?element('em',{text:L.notInLibrary}):null);
  const list=element('ol',{class:'ai-collection-list'},items.slice(0,5).map(row));
  const more=items.length>5?action(L.seeOrder.replace('{count}',items.length),()=>{list.replaceChildren(...items.map(row));more.remove();},'text-button ai-collection-more'):null;
  const actions=element('div',{class:'ai-collection-actions row'});
  const card=element('section',{class:'ai-collection-card','data-collection-proposal':proposal.name},
    element('p',{class:'eyebrow',text:updating||proposal.state==='updated'?L.updateEyebrow:L.newEyebrow}),element('h4',{text:proposal.name}),
    text([L.inOrder.replace('{count}',comicCount),missingCount?L.missingCount.replace('{count}',missingCount):'',updating?L.replaces.replace('{name}',target.name):''].filter(Boolean).join(' · ')),
    list,more,actions);
  function settle(state,collectionId=''){proposal.state=state;if(collectionId)proposal.collectionId=collectionId;assistantStore.saveChat(aiChat);draw();}
  function confirm(){
    try{
      const saved=store.saveOrderedCollection({id:target?target.id:'',name:proposal.name,comicIds:proposal.comicIds,missing:proposal.missing});
      if(store.lastError){toast(t('storageError'));return;}
      settle(target?'updated':'created',saved.id);scheduleSync();collectionsChanged();toast(target?L.updatedToast:L.createdToast);
    }catch(error){toast(publicError(error,t('storageError')));}
  }
  function draw(){
    const open=()=>openCollection(proposal.collectionId);
    if(proposal.state==='created'||proposal.state==='updated'){
      const exists=store.state.collections.some(c=>c.id===proposal.collectionId);
      actions.replaceChildren(element('span',{class:'ai-collection-done',text:proposal.state==='updated'?L.updated:L.created}),exists?action(L.openCollection,open,'button secondary compact'):null);
    }else if(proposal.state==='cancelled')actions.replaceChildren(element('span',{class:'muted',text:proposal.replaceId?L.notChanged:L.notCreated}));
    else if(!comicCount)actions.replaceChildren(element('span',{class:'muted',text:L.gone}));
    else actions.replaceChildren(action(updating?L.update:L.create,confirm,'button primary compact',{'data-collection-confirm':''}),action(L.cancelProposal,()=>settle('cancelled'),'button ghost compact'));
  }
  draw();return card;
}
function openCollection(id){
  if(!store.state.collections.some(c=>c.id===id))return;
  clearComicSelection(true);view='collections';selectedCollection=id;visibleCount=60;document.querySelector('#search').value='';render();window.scrollTo({top:0,behavior:'auto'});
}
function renderAssistantOnly(){if(view==='assistant'){main.replaceChildren();renderAssistant();main.querySelector('textarea')?.focus();}}
function settingRow(title,description,control) {return element('div',{class:'settings-row'},element('div',{},element('h3',{text:title}),text(description)),control);}
function swipeResistanceControl(){
  const level=store.state.settings.readerSwipeResistance??3;
  const output=element('output',{text:level+' / 5 · '+t('swipeLevel'+level)});
  const slider=element('input',{type:'range',min:1,max:5,step:1,value:String(level),'aria-label':t('swipeResistance'),'aria-valuetext':t('swipeLevel'+level),id:'settings-swipe-resistance',style:'width:100%;min-height:44px'});
  slider.addEventListener('input',()=>{const current=Number(slider.value);output.textContent=current+' / 5 · '+t('swipeLevel'+current);slider.setAttribute('aria-valuetext',t('swipeLevel'+current));});
  slider.addEventListener('change',()=>{store.setSettings({readerSwipeResistance:Number(slider.value)});if(store.lastError)toast(t('storageError'));});
  return element('div',{class:'swipe-resistance-setting',style:'display:grid;gap:4px;width:230px;max-width:100%;font-size:12px'},output,slider);
}
function renderSettings() {
  main.append(heading(t('settings'),t('settingsText')));
  if (accounts && accountProfile) {
    const labels = store.state.settings.language === 'pt-BR' ? {title:'Sua conta',local:'Conta local · neste aparelho',manage:'Gerenciar conta / biometria'} : store.state.settings.language === 'es' ? {title:'Tu cuenta',local:'Cuenta local · en este dispositivo',manage:'Administrar cuenta / biometría'} : {title:'Your account',local:'Local account · on this device',manage:'Manage account / biometrics'};
    main.append(element('section',{class:'card section'},element('h3',{text:labels.title}),text(accountProfile.name+' · '+labels.local),action(labels.manage,()=>showAccountSettings({client:accounts,profile:accountProfile,language:store.state.settings.language,onProfileChange:value=>{accountProfile=value;},onLock:lockAccount}),'button secondary',{id:'account-button'})));
  }
  if(store.persistence==='localStorage'&&store.persistenceNotice)main.append(element('div',{class:'notice info',style:'margin-bottom:22px',text:t('limitedStorage')}));
  const settings=element('section',{class:'card stack',style:'gap:0'});
  settings.append(
    settingRow(t('language'),t('languageDetail'),selectControl(t('language'),[['en','English'],['pt-BR','Português (Brasil)'],['es','Español']],store.state.settings.language,value=>{store.setSettings({language:value});changed();},'input')),
    settingRow(t('direction'),t('directionDetail'),selectControl(t('direction'),[['ltr',t('ltr')],['rtl',t('rtl')]],store.state.settings.readingDirection,value=>{store.setSettings({readingDirection:value});changed();},'input')),
    settingRow(t('turnMode'),t('turnModeDetail'),selectControl(t('turnMode'),[['both',t('turnBoth')],['swipe',t('turnSwipe')],['tap',t('turnTap')]],['both','swipe','tap'].includes(store.state.settings.readerTurnMode)?store.state.settings.readerTurnMode:'both',value=>{store.setSettings({readerTurnMode:value});changed();},'input')),
    settingRow(t('navigationButtons'),t('navigationButtonsDetail'),selectControl(t('navigationButtons'),[0,3,5,8].map(seconds=>[String(seconds),t(seconds?'navigation'+seconds:'navigationOff')]),String(store.state.settings.readerNavigationSeconds??3),value=>{store.setSettings({readerNavigationSeconds:Number(value)});changed();},'input')),
    settingRow(t('swipeResistance'),t('swipeResistanceDetail'),swipeResistanceControl()),
    settingRow(t('buffer'),t('bufferDetail'),selectControl(t('buffer'),[16,32,64,128,256].map(n=>[String(n),n+' MB']),String(store.state.settings.cacheMiB),value=>{store.setSettings({cacheMiB:Number(value)});changed();},'input')),
    mega.connected?element('div',{class:'settings-row'},element('div',{},element('h3',{text:t('refreshLibrary')}),text(t('refreshLibraryDetail')),element('p',{class:'muted','data-library-check':'1',text:libraryCheckText(),style:'margin-top:6px;color:var(--lime,#c5ef62)'})),action(t('refreshLibrary'),()=>{void refreshLibrary({announce:true});renderSettingsCheck();},'button secondary compact',{'data-refresh-library':'1'})):'',
    settingRow(t('appVersion'),(document.querySelector('.sidebar-version span')?.textContent||'').replace(/^IPAD · /,'CloudPanels '),null),
    settingRow(t('clearBuffer'),formatBytes(reader.bufferedBytes||0),action(t('clearBuffer'),()=>{reader.clearBuffer();demoFiles.clear();clearArchiveListings();toast(t('bufferCleared'));render();},'button secondary compact')),
    settingRow(t('clearCovers'),t('coversDetail'),action(t('clearCovers'),async()=>{releaseCoverView();await covers.clear();await reader.clearThumbnails?.();toast(t('coversCleared'));render();},'button secondary compact')),
    cloud.configured?cloudSyncRow():element('div',{class:'settings-row'},element('div',{},element('h3',{text:t('syncTitle')}),text(t('syncDetail')),element('p',{class:'muted','data-sync-status':'1',text:syncStatusText(),style:'margin-top:6px;color:var(--lime,#c5ef62)'})),action(t('syncNow'),()=>{if(!mega.canSync){toast(t('syncNeedsAccount'));return;}void syncWithMega({pull:true,announce:true});},'button secondary compact')),
    settingRow(t('diagTitle'),diagnosticsEntries().length||aloudEvents().length?t('diagDetail'):t('diagEmpty'),action(t('diagCopy'),async()=>{const report=diagnosticsReport();try{await navigator.clipboard.writeText(report);toast(t('diagCopied'));}catch{const {body}=openModal(t('diagTitle'));const area=element('textarea',{class:'input',rows:12,readonly:true});area.value=report;body.append(area);area.select();}},'button secondary compact')),
    offline.available?settingRow(t('offlineStorage'),t('offlineStorageDetail',{count:offline.ids.size,size:formatBytes(offline.totalBytes)}),action(t('clearOffline'),async()=>{for(const id of [...offline.ids.keys()])await offline.remove(id).catch(()=>{});toast(t('offlineCleared'));render();},'button secondary compact',{disabled:!offline.ids.size})):'');
  main.append(settings,element('section',{class:'card section'},element('h3',{text:t('backup')}),text(t('backupDetail')),element('div',{class:'row',style:'margin-top:17px'},action(t('exportBackup'),exportBackup),action(t('importBackup'),importBackup))),
    element('section',{class:'card section'},element('h3',{text:t('cloudConnection')}),text(t('cloudConnectionDetail')),element('div',{class:'row',style:'margin-top:17px'},action(mega.connected?t('manageMega'):t('connectMega'),openConnection,'button primary'),mega.connected?action(t('disconnect'),disconnect,'button secondary'):null)),
    element('div',{class:'grid section'},window.Capacitor?.isNativePlatform?.()?null:element('section',{class:'card'},element('h3',{text:t('homeScreen')}),text(t('homeScreenDetail'))),element('section',{class:'card'},element('h3',{text:t('formats')}),text(t('formatsDetail')),action(t('tryReader'),openDemo,'button secondary compact',{style:'margin-top:14px'}))));
}
function exportBackup() {
  try{const blob=new Blob([store.exportBackup()],{type:'application/json'}),url=URL.createObjectURL(blob),link=element('a',{href:url,download:'CloudPanels-backup-'+new Date().toISOString().slice(0,10)+'.json'});document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}catch(error){toast(publicError(error,t('storageError')));}
}
function importBackup() {
  const input=element('input',{type:'file',accept:'.json,application/json',hidden:true});document.body.append(input);
  input.addEventListener('change',async()=>{try{const file=input.files?.[0];if(!file)return;if(file.size>MAX_BACKUP_BYTES)throw new Error(t('backupError'));store.importBackup(await file.text());changed();toast(t('backupImported'));}catch(error){toast(publicError(error,t('backupError')));}finally{input.remove();}},{once:true});
  input.addEventListener('cancel',()=>input.remove(),{once:true});input.click();
}
async function saveRememberedConnection() {
  if (!mega.connected) return;
  const connection = mega.exportRememberedSession();
  if (!connection) return;
  const record = {version:1,connection,folder:rememberedConnection?.folder || null,browsePath:folderPath.slice(0,64)};
  await sessionVault.saveSession(record); rememberedConnection=record;
}
async function restoreRememberedConnection() {
  if (restoringConnection) return restoringConnection;
  restoringConnection=(async()=>{
    try {
      const saved=await sessionVault.loadSession();
      if(!saved?.connection)return;
      rememberedConnection=saved;
      perf.begin('mega-restore');
      await mega.restoreRememberedSession(saved.connection);
      if(saved.folder?.id){try{await mega.children(saved.folder.id);}catch{rememberedConnection.folder=null;}}
      if(Array.isArray(saved.browsePath)&&saved.browsePath.length<=64&&saved.browsePath.every(part=>typeof part==='string'&&part.length<=512))folderPath=saved.browsePath.slice();
      restoreAttempts=0;
      libraryMode='folders';refreshHeader();mainDirty=true;queueMainRefresh();
      void syncWithMega({pull:true});
      // The tree was just loaded fresh: bring the library up to date with it.
      void refreshLibrary({reloadTree:false});
    }catch(error){
      diag('mega-restore',error);
      if(['LOGIN','ACCESS','SESSION_INPUT'].includes(error?.code)){try{await sessionVault.clearSession();}catch{}rememberedConnection=null;toast(t('reconnect'));}
      // No connection for a moment (a weak signal, a phone just woken up): tried again quietly.
      else if(!(['NETWORK','TREE'].includes(error?.code)&&restoreAgainLater()))toast(t('reconnect'));
    }finally{restoringConnection=null;perf.end('mega-restore');}
  })();
  return restoringConnection;
}
// MEGA could not be reached when the app opened: it is tried again a few
// times, and opening a story waits for it instead of asking to reconnect.
let restoreAttempts=0,restoreTimer=null;
function restoreAgainLater(){
  if(restoreTimer||restoreAttempts>=4)return false;
  const delay=[3000,8000,20000,45000][restoreAttempts++];
  restoreTimer=setTimeout(()=>{restoreTimer=null;void restoreRememberedConnection();},delay);
  return true;
}
function restoreNow(){
  if(mega.connected||restoringConnection||!rememberedConnection)return restoringConnection;
  clearTimeout(restoreTimer);restoreTimer=null;
  return restoreRememberedConnection();
}
async function megaReady(){
  if(mega.connected)return true;
  if(!restoringConnection&&restoreTimer)void restoreNow();
  if(!restoringConnection)return false;
  toast(t('megaConnecting'));
  await restoringConnection;
  // It failed once more and another try is waiting: that try now.
  if(!mega.connected&&restoreTimer)await restoreNow();
  return mega.connected;
}
async function lockAccount() {
  reader.close();
  if(!await store.flush())throw new Error('Changes could not be saved.');
  await saveRememberedConnection();
  await covers.close();await mega.suspend();store.close?.();await accounts.logout();location.reload();
}
async function disconnect() {reader.close();await sessionVault.clearSession();rememberedConnection=null;await mega.disconnect();refreshHeader();render();toast(t('disconnected'));}
function openConnection() {
  if(mega.connected){showFolders();return;}
  const {body,current}=openModal(t('connectTitle'),t('connectText'));
  let tab='account';
  const tabs=element('div',{class:'tabs'}),formArea=element('div');
  body.append(element('div',{class:'notice info',text:t('webBeta')}),tabs,formArea);
  function draw(){
    tabs.replaceChildren(action(t('account'),()=>{tab='account';draw();},tab==='account'?'active':''),action(t('folderLink'),()=>{tab='link';draw();},tab==='link'?'active':''));
    formArea.replaceChildren();
    const form=element('form'),grid=element('div',{class:'stack',style:'gap:15px'}),status=text('','form-error');status.setAttribute('role','status');
    let email,password,mfa,link;
    if(tab==='account'){
      email=inputField(t('email'),{type:'email',autocomplete:'username',attrs:{required:true,maxlength:254,inputmode:'email',autocapitalize:'none',spellcheck:'false'}});
      password=inputField(t('password'),{type:'password',autocomplete:'current-password',attrs:{required:true,maxlength:1024}});
      mfa=inputField(t('mfa'),{attrs:{inputmode:'numeric',pattern:'[0-9]{6}',maxlength:6},autocomplete:'one-time-code'});
      grid.append(email.node,password.node,mfa.node);
    }else{link=inputField(t('linkLabel'),{type:'url',help:t('linkHint'),attrs:{required:true,spellcheck:'false',autocapitalize:'none',maxlength:2048},placeholder:'https://mega.nz/folder/…#…'});grid.append(link.node);}
    const submit=element('button',{type:'submit',class:'button primary',text:tab==='account'?t('signIn'):t('connectLink')});
    form.append(grid,text(t('noPasswordInChat'),'subtle'),status,element('div',{class:'form-actions'},action(t('cancel'),closeModal,'button ghost'),submit));
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(!current())return;const selectedTab=tab;
      const credentials=selectedTab==='account'?{email:email.control.value,password:password.control.value,secondFactorCode:mfa.control.value}:null;
      const url=link?.control.value;
      for(const control of [email?.control,password?.control,mfa?.control,link?.control])if(control)control.value='';
      modalAbort?.abort();const controller=new AbortController();modalAbort=controller;
      submit.disabled=true;tabs.querySelectorAll('button').forEach(button=>button.disabled=true);status.className='loading';status.textContent=t('connecting');
      try{
        if(selectedTab==='account')await mega.login(credentials,{signal:controller.signal});else await mega.connectLink(url,{signal:controller.signal});
        rememberedConnection=null;await saveRememberedConnection();
        void syncWithMega({pull:true});
        // A fresh sign-in also brings an existing library up to date.
        if(store.state.comics.some(c=>c.source==='mega'))void refreshLibrary({reloadTree:false});
        if(current()&&!controller.signal.aborted){modalAbort=null;refreshHeader();showFolders();}
      }catch(error){diag('mega-login',error);if(current()&&!controller.signal.aborted){status.className='form-error';status.textContent=publicError(error,t('connectionError'));submit.disabled=false;tabs.querySelectorAll('button').forEach(button=>button.disabled=false);}}
      finally{if(credentials){credentials.email='';credentials.password='';credentials.secondFactorCode='';}}
    });
    formArea.append(form);
  }
  draw();
}
function showFolders() {
  const {body,current}=openModal(t('folderTitle'),t('folderText'));
  const breadcrumbs=element('div',{class:'breadcrumb'}),list=element('div',{class:'folder-list'}),status=text('','muted'),freshness=element('p',{class:'muted folder-freshness'}),actions=element('div',{class:'form-actions'});
  const stack=[];let navigation=0;
  body.append(breadcrumbs,list,freshness,status,actions);
  async function draw(folder=null,push=false){
    if(!current())return;if(push&&folder)stack.push(folder);
    const localGeneration=modalGeneration,request=++navigation;list.replaceChildren(text(t('loading')));actions.replaceChildren(action(t('cancel'),closeModal,'button ghost'));status.textContent='';
    let items;
    try{items=folder?await mega.children(folder.id):mega.roots();}
    catch(error){if(current())status.textContent=publicError(error,t('connectionError'));return;}
    if(!current()||localGeneration!==modalGeneration||request!==navigation)return;
    breadcrumbs.replaceChildren(action(t('rootFolder'),()=>{stack.length=0;draw();},'text-button'));
    stack.forEach((entry,index)=>breadcrumbs.append(element('span',{text:' / '}),action(entry.name,()=>{stack.splice(index+1);draw(entry);},'text-button')));
    list.replaceChildren();
    if(!items.length)list.append(text(t('noFolders')));
    for(const item of items){const row=action('',()=>item.directory?draw(item,true):index(item),'folder-row');row.append(element('span',{'aria-hidden':'true',text:item.directory?'▱':'▧',style:'font-size:22px;color:var(--lime)'}),element('span',{class:'folder-name',text:item.name}),element('span',{class:'muted',text:item.directory?t('folder'):item.format.toUpperCase()}));list.append(row);}
    actions.replaceChildren(...[stack.length?action(t('back'),()=>{stack.pop();draw(stack.at(-1)||null);},'button ghost'):null,action(t('cancel'),closeModal,'button ghost'),folder?action(t('indexFolder'),()=>index(folder),'button primary'):null].filter(Boolean));
    if(!folder&&items.length===1&&items[0].directory)actions.append(action(t('indexFolder'),()=>index(items[0]),'button primary'));
  }
  async function index(folder){
    if(!current())return;modalAbort?.abort();const controller=new AbortController();modalAbort=controller;const buttons=[...body.querySelectorAll('button')];buttons.forEach(button=>button.disabled=true);
    const cancel=action(t('cancel'),closeModal,'button ghost');actions.replaceChildren(cancel);status.className='loading';status.textContent=t('indexing',{count:0});
    try{
      const comics=await mega.listComics(folder.id,{signal:controller.signal,onProgress:progress=>{if(current()&&!controller.signal.aborted)status.textContent=t('indexing',{count:progress.scanned});}});
      if(!current()||controller.signal.aborted)return;
      store.upsertComics(comics);modalAbort=null;closeModal();view='library';selectedCollection=null;visibleCount=60;libraryMode='folders';
      const firstParents=comics.length?comicFolderParts(comics[0]):[];
      folderPath=firstParents[0]===folder.name?[folder.name]:[];
      rememberedConnection={...(rememberedConnection||{}),folder:{id:folder.id,name:folder.name}};await saveRememberedConnection();
      changed();toast(t('indexed',{count:comics.length}));
    }catch(error){if(current()&&!controller.signal.aborted){status.className='form-error';status.textContent=publicError(error,t('connectionError'));buttons.forEach(button=>button.disabled=false);actions.replaceChildren(action(t('cancel'),closeModal,'button ghost'),action(t('tryAgain'),()=>index(folder),'button primary'));}}
  }
  // Show MEGA exactly as it is now (folders moved in the MEGA app included),
  // and say when that list came from MEGA.
  list.replaceChildren(text(t('loading')));freshness.textContent=t('treeLoading');
  void Promise.resolve(mega.refreshTree())
    .then(()=>{
      const catchUp=mega.lastCatchUp,time=clockTime(mega.treeLoadedAt,true);
      freshness.textContent=catchUp&&!catchUp.upToDate&&catchUp.error?t('treeBehind',{time,reason:catchUp.error}):t('treeFresh',{time,items:Number(mega.treeSize||0).toLocaleString(store.state.settings.language==='en'?'en-US':store.state.settings.language),changes:catchUp?.changes||0});
    })
    .catch(error=>{diag('mega-tree',error);freshness.textContent=t('treeStale',{reason:publicError(error,t('connectionError')),time:clockTime(mega.treeLoadedAt,true)});})
    .finally(()=>{if(current())draw();});
}
function openDemo() {
  const {body,current}=openModal(t('demoTitle'),t('demoText'));
  const status=text('','muted'),buttons=element('div',{class:'row'},['cbz','pdf'].map(format=>action(t(format==='cbz'?'demoCbz':'demoPdf'),async()=>{
    const all=buttons.querySelectorAll('button');all.forEach(button=>button.disabled=true);status.textContent=t('loading');
    try{
      const source=await demoSource(format);if(!current())return;
      const comic={id:'demo:reader-'+format+':v1',name:'CloudPanels Reader Demo.'+format,size:source.size,source:'demo',format,path:'Original sample',metadata:{...parseMetadata('CloudPanels Reader Demo.'+format),title:t('demoLabel')+' · '+format.toUpperCase(),series:'CloudPanels Reader Demo',publisher:t('testPublisher'),volume:'1',issue:'1',characters:[],tags:['Original sample']}};
      store.upsertComics([comic]);closeModal();changed();await openComic(store.state.comics.find(c=>c.id===comic.id));
    }catch(error){if(current()){status.textContent=publicError(error,t('demoError'));all.forEach(button=>button.disabled=false);}}
  },format==='cbz'?'button primary':'button secondary')));
  body.append(element('div',{class:'notice',text:t('demoDescription')}),buttons,status);
}

document.querySelectorAll('[data-view]').forEach(node=>node.addEventListener('click',()=>changeView(node.dataset.view)));
document.querySelector('#connect-button').addEventListener('click',openConnection);
document.querySelector('#connection-status').addEventListener('click',openConnection);
document.querySelector('#import-button').addEventListener('click',()=>document.querySelector('#file-input').click());
document.querySelector('#file-input').addEventListener('change',async event=>{const files=[...event.target.files];event.target.value='';try{await importFiles(files);}catch(error){toast(publicError(error,t('failedImport')));}});
document.querySelector('#file-input').addEventListener('cancel',()=>{pendingLocalId=null;});
document.querySelector('#search').addEventListener('input',()=>{clearComicSelection();clearTimeout(searchTimer);searchTimer=setTimeout(()=>{visibleCount=60;if(view==='settings'||view==='assistant')view='library';render();},140);});
document.addEventListener('keydown',event=>{if(event.key==='/'&&!modal.open&&!document.querySelector('#reader').open&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)){event.preventDefault();document.querySelector('#search').focus();}});
window.addEventListener('offline',()=>toast(t('offline')));
window.addEventListener('pagehide',()=>{try{store.flush?.();}catch{}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')store.flush?.();});
if('serviceWorker' in navigator && location.protocol==='https:'){ // Lets the installed iPad app start without a connection.
  const registerWorker=()=>{navigator.serviceWorker.register('sw.js').catch(()=>{});};
  if(document.readyState==='complete')registerWorker();else window.addEventListener('load',registerWorker,{once:true});
}
appReady=true;
render();perf.mark('first-render');
startupNotice?.remove();document.body.classList.remove('account-starting');
// ---- Sync between devices through the CloudPanels sync account ----------------
// Only reading positions (read / in progress / unread, page and panel) travel.
// Nothing happens until the reader signs in on this device.
const CLOUD_TEXT={
  en:{detail:'Read, in-progress and unread comics, the page where you stopped and your collections show on all your devices signed in to your sync account. Comics themselves are never uploaded.',signIn:'Sign in',signOut:'Sign out',syncNow:'Sync now',title:'Sign in to sync',email:'E-mail',password:'Password',passwordNote:'Type the password only here, never in a chat message. Only a session is kept on this device.',signedOutStatus:'Not signed in on this device.',signedIn:'Signed in as {email}',syncing:'Syncing…',syncedAt:'Synced at {time}',notYet:'Not synced yet',failed:'Could not sync: {reason}',wrong:'E-mail or password is not right.',offline:'No connection to the sync service. Try again in a moment.',busy:'The sync service is busy. Try again in a moment.',signedOut:'Signed out on this device. Your reading stays saved here.',done:'Synced. {count} comics updated from your other devices.',doneOne:'Synced. 1 comic updated from your other devices.',doneNone:'Synced.',collectionsDone:'Collections updated: {count}.',expired:'Sign in again to keep syncing.',connecting:'Signing in…'},
  'pt-BR':{detail:'Revistas lidas, em andamento e não lidas, a página onde você parou e as suas coleções aparecem em todos os seus aparelhos conectados à sua conta de sincronização. As revistas em si nunca são enviadas.',signIn:'Entrar',signOut:'Sair',syncNow:'Sincronizar agora',title:'Entrar para sincronizar',email:'E-mail',password:'Senha',passwordNote:'Digite a senha só aqui, nunca numa mensagem de chat. Só uma sessão fica guardada neste aparelho.',signedOutStatus:'Não conectado neste aparelho.',signedIn:'Conectado como {email}',syncing:'Sincronizando…',syncedAt:'Sincronizado às {time}',notYet:'Ainda não sincronizado',failed:'Não foi possível sincronizar: {reason}',wrong:'E-mail ou senha incorretos.',offline:'Sem conexão com o serviço de sincronização. Tente de novo daqui a pouco.',busy:'O serviço de sincronização está ocupado. Tente de novo daqui a pouco.',signedOut:'Desconectado neste aparelho. Sua leitura continua salva aqui.',done:'Sincronizado. {count} revistas atualizadas pelos seus outros aparelhos.',doneOne:'Sincronizado. 1 revista atualizada pelos seus outros aparelhos.',doneNone:'Sincronizado.',collectionsDone:'Coleções atualizadas: {count}.',expired:'Entre de novo para continuar sincronizando.',connecting:'Entrando…'},
  es:{detail:'Los cómics leídos, en curso y sin leer, la página donde te quedaste y tus colecciones aparecen en todos tus dispositivos conectados a tu cuenta de sincronización. Los cómics nunca se suben.',signIn:'Entrar',signOut:'Salir',syncNow:'Sincronizar ahora',title:'Entrar para sincronizar',email:'Correo',password:'Contraseña',passwordNote:'Escribe la contraseña solo aquí, nunca en un mensaje de chat. Solo se guarda una sesión en este dispositivo.',signedOutStatus:'No conectado en este dispositivo.',signedIn:'Conectado como {email}',syncing:'Sincronizando…',syncedAt:'Sincronizado a las {time}',notYet:'Aún no sincronizado',failed:'No se pudo sincronizar: {reason}',wrong:'Correo o contraseña incorrectos.',offline:'Sin conexión con el servicio de sincronización. Inténtalo de nuevo en un momento.',busy:'El servicio de sincronización está ocupado. Inténtalo de nuevo en un momento.',signedOut:'Desconectado en este dispositivo. Tu lectura sigue guardada aquí.',done:'Sincronizado. {count} cómics actualizados desde tus otros dispositivos.',doneOne:'Sincronizado. 1 cómic actualizado desde tus otros dispositivos.',doneNone:'Sincronizado.',collectionsDone:'Colecciones actualizadas: {count}.',expired:'Entra de nuevo para seguir sincronizando.',connecting:'Entrando…'},
};
function ct(key,values={}){const table=CLOUD_TEXT[store.state.settings.language]||CLOUD_TEXT.en;return String(table[key]??CLOUD_TEXT.en[key]??key).replace(/\{(\w+)\}/g,(_,name)=>values[name]??'');}
function cloudReason(error){return error?.code==='LOGIN'?ct('wrong'):error?.code==='BUSY'?ct('busy'):error?.code==='SIGNED_OUT'?ct('expired'):ct('offline');}
function cloudStatusText(){
  if(!cloud.signedIn)return ct('signedOutStatus');
  const when=cloudState.busy?ct('syncing'):cloudState.failed?ct('failed',{reason:cloudState.failed}):cloudState.lastAt?ct('syncedAt',{time:new Date(cloudState.lastAt).toLocaleTimeString(store.state.settings.language==='en'?'en-US':store.state.settings.language,{hour:'2-digit',minute:'2-digit'})}):ct('notYet');
  return ct('signedIn',{email:cloud.email})+' · '+when;
}
async function cloudSyncNow({announce=false}={}){
  if(!cloud.configured||!cloud.signedIn)return false;
  if(cloudState.busy){scheduleCloudSync(5000);return false;}
  clearTimeout(cloudState.timer);cloudState.timer=null;
  cloudState.busy=true;const dirty=cloudState.dirty;cloudState.dirty=false;refreshSyncStatus();perf.begin('sync');
  try{
    // The comic open in the reader keeps the place it is at on this device.
    const {applied,collections=0}=await syncReadingPositions({cloud,store,skip:document.querySelector('#reader').open?readingComicId:null,seen:cloudState.seen,changes:dirty});
    if(applied||collections){mainDirty=true;queueMainRefresh();void store.flush?.();}
    cloudState.lastAt=Date.now();cloudState.failed='';
    if(announce)toast((applied===1?ct('doneOne'):applied?ct('done',{count:applied}):ct('doneNone'))+(collections?' '+ct('collectionsDone',{count:collections}):''));
    return true;
  }catch(error){
    cloudState.dirty=cloudState.dirty||dirty;cloudState.failed=cloudReason(error);diag('cloud-sync',error);
    if(announce||error?.code==='SIGNED_OUT')toast(cloudState.failed);
    if(error?.code==='SIGNED_OUT'&&view==='settings')render();
    return false;
  }finally{cloudState.busy=false;refreshSyncStatus();perf.end('sync');}
}
// A collection made, changed or deleted here goes to the other devices too (soon, not at once: a few edits travel together).
function collectionsChanged(){cloudState.dirty=true;scheduleCloudSync(8000);}
// Changes are sent 20 seconds after one is made (never while a comic is open),
// when a comic is closed, and when the app goes to the background.
function scheduleCloudSync(delay=20000){
  if(!cloud.configured||!cloud.signedIn)return;
  // A sync already due sooner (a comic was just closed) is never put off.
  const due=Date.now()+delay;
  if(cloudState.timer&&cloudState.due<=due)return;
  clearTimeout(cloudState.timer);cloudState.due=due;
  // Not while a comic is open: closing it (or leaving the app) sends the place.
  cloudState.timer=setTimeout(()=>{cloudState.timer=null;if(!document.querySelector('#reader').open)void cloudSyncNow();},delay);
}
function cloudSyncRow(){
  const status=element('p',{class:'muted','data-sync-status':'1',text:cloudStatusText(),style:'margin-top:6px;color:var(--lime,#c5ef62)'});
  const controls=cloud.signedIn
    ?element('div',{class:'row'},action(ct('syncNow'),()=>void cloudSyncNow({announce:true}),'button secondary compact'),action(ct('signOut'),async()=>{await cloud.signOut();cloudState.lastAt=0;cloudState.failed='';cloudState.seen={revision:null,data:null,skipped:null};toast(ct('signedOut'));render();},'button ghost compact'))
    :action(ct('signIn'),openCloudSignIn,'button primary compact');
  return element('div',{class:'settings-row',id:'cloud-sync-row'},element('div',{},element('h3',{text:t('syncTitle')}),text(ct('detail')),status),controls);
}
function openCloudSignIn(){
  const {body,current}=openModal(ct('title'));
  const form=element('form'),status=text('','form-error');status.setAttribute('role','status');
  const email=inputField(ct('email'),{type:'email',autocomplete:'username',attrs:{required:true,maxlength:254,inputmode:'email',autocapitalize:'none',spellcheck:'false'}});
  const password=inputField(ct('password'),{type:'password',autocomplete:'current-password',attrs:{required:true,maxlength:1024}});
  const submit=element('button',{type:'submit',class:'button primary',text:ct('signIn')});
  form.append(element('div',{class:'stack',style:'gap:15px'},email.node,password.node),text(ct('passwordNote'),'subtle'),status,element('div',{class:'form-actions'},action(t('cancel'),closeModal,'button ghost'),submit));
  body.append(form);
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!current())return;
    const address=email.control.value,secret=password.control.value;password.control.value='';
    submit.disabled=true;status.className='loading';status.textContent=ct('connecting');
    try{
      await cloud.signIn(address,secret);
      if(!current())return;
      closeModal();cloudState.dirty=true;cloudState.seen={revision:null,data:null,skipped:null};if(view==='settings')render();
      await cloudSyncNow({announce:true});
    }catch(error){if(!current())return;status.className='form-error';status.textContent=cloudReason(error);submit.disabled=false;}
  });
  // Never pull focus away from a field the person is already typing in.
  setTimeout(()=>{if(current()&&!form.contains(document.activeElement))email.control.focus();},50);
}
if(cloud.configured){
  if(cloud.signedIn)setTimeout(()=>void cloudSyncNow(),4000);
  setInterval(()=>{if(document.visibilityState==='visible'&&cloudState.dirty&&!document.querySelector('#reader').open)void cloudSyncNow();},120000);
  let cloudHiddenAt=0;
  document.addEventListener('visibilitychange',()=>{
    if(!cloud.signedIn)return;
    if(document.visibilityState==='hidden'){cloudHiddenAt=Date.now();if(cloudState.dirty)void cloudSyncNow();}
    else if(Date.now()-Math.max(cloudState.lastAt,cloudHiddenAt)>60000||Date.now()-cloudState.lastAt>10*60000)void cloudSyncNow();
  });
}
// ---- Sync through the user's MEGA --------------------------------------------
function syncPayload(){
  const state=JSON.parse(store.exportBackup());
  const keep=new Set(state.comics.filter(c=>c.source==='mega').map(c=>c.id));
  state.comics=state.comics.filter(c=>keep.has(c.id));
  for(const key of ['progress','panels'])for(const id of Object.keys(state[key]||{}))if(!keep.has(id))delete state[key][id];
  state.favorites=(state.favorites||[]).filter(id=>keep.has(id));state.readLater=(state.readLater||[]).filter(id=>keep.has(id));
  state.bookmarks=(state.bookmarks||[]).filter(b=>keep.has(b.comicId));
  return JSON.stringify(state);
}
async function syncWithMega({pull=true,announce=false}={}){
  if(!MEGA_WRITES_ENABLED){if(announce)toast(t('syncPaused'));return false;}
  if(sync.busy||!mega.canSync)return false;
  sync.busy=true;refreshSyncStatus();
  try{
    if(pull){
      if(Date.now()-sync.lastPull>60000&&sync.lastPull)await mega.refreshTree();
      const remote=await mega.readSyncFile();
      sync.lastPull=Date.now();
      if(remote){const before=store.exportBackup();store.importBackup(remote);if(store.exportBackup()!==before){mainDirty=true;queueMainRefresh();}}
      void pullSharedCovers();
    }
    const text=syncPayload();
    if(text!==sync.lastText){await mega.writeSyncFile(text);sync.lastText=text;}
    if(covers.fresh.size&&(Date.now()-(sync.coversAt||0)>10*60000||document.visibilityState==='hidden'||announce))await pushSharedCovers();
    sync.lastAt=Date.now();sync.failed=false;if(announce)toast(t('syncDone'));return true;
  }catch(error){diag('sync',error);sync.failed=true;if(announce)toast(t('syncFailed'));return false;}
  finally{sync.busy=false;refreshSyncStatus();}
}
// Covers are shared through MEGA too, so each cover is made only once for all devices.
let coversPulled=false;
async function pullSharedCovers(){
  if(!MEGA_WRITES_ENABLED)return;
  if(coversPulled||!mega.canSync)return;coversPulled=true;
  try{const text=await mega.readSyncFile({name:'cloudpanels-capas.json'});if(!text)return;const data=JSON.parse(text);if(data?.v!==1)return;
    const added=await covers.importShared(data.covers);if(added){mainDirty=true;queueMainRefresh();}}catch{coversPulled=false;}
}
async function pushSharedCovers(){
  if(!MEGA_WRITES_ENABLED)return;
  if(!mega.canSync||!covers.fresh.size)return;
  const fresh=await covers.takeFresh();const keys=Object.keys(fresh);if(!keys.length)return;
  let shared={};try{const text=await mega.readSyncFile({name:'cloudpanels-capas.json'});const data=text&&JSON.parse(text);if(data?.v===1&&data.covers)shared=data.covers;}catch{}
  for(const key of keys){delete shared[key];shared[key]=fresh[key];}
  let entries=Object.entries(shared);let size=entries.reduce((n,[k,v])=>n+k.length+v.length,0);
  while(entries.length&&(entries.length>1500||size>14*1024*1024)){const [k,v]=entries.shift();size-=k.length+v.length;}
  await mega.writeSyncFile(JSON.stringify({v:1,covers:Object.fromEntries(entries)}),{name:'cloudpanels-capas.json'});
  covers.clearFresh(keys);sync.coversAt=Date.now();
}
function scheduleSync(delay=20000){if(!MEGA_WRITES_ENABLED)return;clearTimeout(sync.timer);sync.timer=setTimeout(()=>{if(mega.canSync&&syncPayload()!==sync.lastText)void syncWithMega({pull:false});},delay);}
setInterval(()=>{if(document.visibilityState==='visible'&&mega.canSync&&!sync.busy&&(syncPayload()!==sync.lastText||covers.fresh.size))void syncWithMega({pull:false});},120000);
document.addEventListener('visibilitychange',()=>{
  if(!mega.canSync)return;
  if(document.visibilityState==='hidden'){if(syncPayload()!==sync.lastText||covers.fresh.size)void syncWithMega({pull:false});}
  else if(Date.now()-sync.lastPull>10*60000)void syncWithMega({pull:true});
});
// ---- Use the newest version: an app left open in the background reloads
// itself when a new version is published (never in the middle of reading).
const RUNNING_VERSION=(document.querySelector('.sidebar-version span')?.textContent||'').match(/\d+\.\d+\.\d+/)?.[0]||'';
let versionCheckedAt=0,reloadForUpdate=false;
async function checkForNewVersion(){
  if(location.protocol!=='https:'||window.Capacitor?.isNativePlatform?.()||!RUNNING_VERSION||Date.now()-versionCheckedAt<60000)return;
  versionCheckedAt=Date.now();
  try{
    const response=await fetch('index.html?version-check='+Date.now(),{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)return;
    const latest=(await response.text()).match(/IPAD · (\d+\.\d+\.\d+)/)?.[1];
    if(!latest||latest===RUNNING_VERSION)return;
    reloadForUpdate=true;
    if(!document.querySelector('#reader').open)reloadWithUpdate();
  }catch{}
}
function reloadWithUpdate(){toast(t('updatingApp'));setTimeout(()=>location.reload(),900);}
setTimeout(()=>void checkForNewVersion(),4000);
// ---- Keep the library in step with MEGA (read only: nothing is written) ----
let libraryRefresh=null,lastLibraryRefresh=0,libraryCheck=null;
function clockTime(at,seconds=false){
  if(!at)return '—';
  try{return new Date(at).toLocaleTimeString(store.state.settings.language==='en'?'en-US':store.state.settings.language,seconds?{hour:'2-digit',minute:'2-digit',second:'2-digit'}:{hour:'2-digit',minute:'2-digit'});}
  catch{return new Date(at).toISOString().slice(11,seconds?19:16);}
}
function libraryCheckText(short=false){
  if(libraryRefresh)return t('refreshingLibrary');
  if(!libraryCheck)return short?'':t('libraryNotChecked');
  const time=clockTime(libraryCheck.at);
  if(libraryCheck.error)return t('libraryCheckFailed',{time,reason:libraryCheck.error});
  const values={time,added:libraryCheck.added,moved:libraryCheck.moved,removed:libraryCheck.removed,found:libraryCheck.folders,total:libraryCheck.of};
  return t(short?'libraryCheckedShort':'libraryCheckedAt',values);
}
function renderSettingsCheck(){
  for(const node of document.querySelectorAll('[data-library-check]'))node.textContent=libraryCheckText();
  for(const node of document.querySelectorAll('[data-library-check-short]'))node.textContent=libraryCheckText(true);
}
function libraryRoots(){
  const roots=new Map();
  for(const comic of store.state.comics){
    if(comic.source!=='mega')continue;
    const parts=String(comic.path||'').split('/');if(parts.length<2)continue;
    if(!roots.has(parts[0]))roots.set(parts[0],{name:parts[0],samples:[]});
    const root=roots.get(parts[0]);if(root.samples.length<60)root.samples.push({id:comic.id,depth:parts.length-1});
  }
  return [...roots.values()];
}
function refreshLibrary({announce=false,reloadTree=true}={}){
  if(!mega.connected){if(announce){toast(t('reconnect'));openConnection();}return Promise.resolve(false);}
  if(libraryRefresh)return libraryRefresh;
  const busyButtons=()=>document.querySelectorAll('[data-refresh-library]').forEach(button=>{button.disabled=Boolean(libraryRefresh);});
  const run=(async()=>{
    // Start on the next tick: a check with nothing to wait for must still
    // finish after it is marked as running, or it would look busy forever.
    await null;
    perf.begin('mega-check');
    try{
      if(announce)toast(t('refreshingLibrary'));
      if(reloadTree){const treeAt=performance.now();await mega.refreshTree();perf.done('mega-tree',treeAt);}
      // List every indexed folder first, then update the library in one go, so
      // a folder moved from one indexed folder to another keeps its history.
      const roots=libraryRoots(),listings=[],found=[];
      for(const root of roots){
        const hint=rememberedConnection?.folder?.name===root.name?rememberedConnection.folder.id:null;
        const folderId=mega.findLibraryFolder({name:root.name,samples:root.samples,hintId:hint});
        if(!folderId){found.push(`${root.name} → not found`);continue;}
        const comics=await mega.listComics(folderId);
        listings.push({prefix:root.name,comics});found.push(`${root.name} → ${mega.folderPath(folderId)} (${comics.length})`);
      }
      const reconcileAt=performance.now();
      const {added,moved,removed}=store.reconcileLibrary(listings);
      perf.done('reconcile',reconcileAt);
      lastLibraryRefresh=Date.now();
      libraryCheck={at:lastLibraryRefresh,added,moved,removed,folders:listings.length,of:roots.length};
      diag('library-check',`ok: ${listings.length}/${roots.length} folders found in MEGA; ${added} new, ${moved} moved, ${removed} removed; MEGA list from ${clockTime(mega.treeLoadedAt,true)} (${mega.treeSize} items, ${mega.lastCatchUp?.changes??'?'} recent changes from MEGA${mega.lastCatchUp&&!mega.lastCatchUp.upToDate?`, not up to date: ${mega.lastCatchUp.error}`:''}); ${found.join('; ')}`);
      if(added||moved||removed){mainDirty=true;queueMainRefresh();scheduleSync();toast(t('libraryUpdated',{added,moved,removed}));}
      else if(announce)toast(t('libraryUpToDate'));
      return true;
    }catch(error){libraryCheck={at:Date.now(),error:publicError(error,t('connectionError'))};diag('library-refresh',error);if(announce)toast(publicError(error,t('connectionError')));return false;}
    finally{perf.end('mega-check');if(libraryRefresh===run)libraryRefresh=null;busyButtons();renderSettingsCheck();}
  })();
  libraryRefresh=run;
  busyButtons();renderSettingsCheck();
  return run;
}
// Coming back to the app after a while (for example after organising folders
// in the MEGA app) quietly brings the library up to date.
let hiddenSince=0;
function cameBack(){
  if(!mega.connected&&rememberedConnection&&!restoringConnection){restoreAttempts=0;void restoreNow();}
  // Back from another app (for example after moving folders in the MEGA app):
  // check MEGA again, unless the library was checked just a moment ago.
  // While a comic is open this waits until it is closed: reloading MEGA's list
  // keeps the iPad busy for a few seconds, which made reading stutter.
  if(mega.connected&&!restoringConnection&&hiddenSince&&Date.now()-hiddenSince>2000&&Date.now()-lastLibraryRefresh>8000){
    if(document.querySelector('#reader').open)refreshAfterReading=true;else void refreshLibrary();
  }
  void checkForNewVersion();
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){hiddenSince=Date.now();return;}
  cameBack();
});
window.addEventListener('pagehide',()=>{hiddenSince=Date.now();});
window.addEventListener('pageshow',event=>{if(event.persisted)cameBack();});
function syncStatusText(){
  if(cloud.configured)return cloudStatusText();
  if(!MEGA_WRITES_ENABLED)return t('syncPaused');
  if(!mega.connected||!mega.canSync)return t('syncNeedsAccount');
  if(sync.busy)return t('syncBusy');
  if(sync.failed)return t('syncFailed');
  return sync.lastAt?t('syncAt',{time:new Date(sync.lastAt).toLocaleTimeString(store.state.settings.language==='en'?'en-US':store.state.settings.language,{hour:'2-digit',minute:'2-digit'})}):t('syncNever');
}
function refreshSyncStatus(){for(const node of document.querySelectorAll('[data-sync-status]'))node.textContent=syncStatusText();}
if(navigator.onLine===false)window.addEventListener('online',()=>{if(!mega.connected)void restoreRememberedConnection();},{once:true});else void restoreRememberedConnection();
window.addEventListener('online',()=>{if(!mega.connected&&rememberedConnection&&!restoringConnection){restoreAttempts=0;void restoreNow();}});
// The phone closed the app while it was reading aloud: noted for Diagnostics;
// if the screen was off, the same comic opens again at its page (once MEGA is
// there), so listening goes on with one tap.
const interrupted=interruptedListening();
if(interrupted){
  noteAloud('app was closed while reading aloud',{minutesAgo:Math.round((Date.now()-interrupted.at)/60000),page:interrupted.page,screenOff:Boolean(interrupted.hidden),discarded:Boolean(document.wasDiscarded),start:performance.getEntriesByType?.('navigation')?.[0]?.type||''});
  if(interrupted.hidden&&Date.now()-interrupted.at<2*3600000)void resumeInterrupted(interrupted);
}
async function resumeInterrupted(beat){
  const comic=store.state.comics.find(item=>item.id===beat.id);
  // Only comics that open without asking anything (MEGA, or saved on this device).
  if(!comic||!(comic.source==='mega'||comic.source==='demo'||offline.has(comic.id))||document.querySelector('#reader').open||modal.open)return;
  if(comic.source==='mega'&&!offline.has(comic.id)){
    for(let tries=0;tries<50&&!restoringConnection&&!mega.connected;tries++)await new Promise(resolve=>setTimeout(resolve,100));
    if(!(await megaReady()))return;
  }
  if(document.querySelector('#reader').open||modal.open)return;
  await openComic(comic);
  if(document.querySelector('#reader').open)reader.notice?.(t('resumeListening'),15000);
}
if(store.lastError||persistenceErrorPending)toast(t('storageLoadedError'));
