// Built-in wording of the generated back-office, per language

/** Every string the generated UI shows. {placeholders} are filled in when generating (or at runtime). */
export interface Strings {
    addNew: string;
    /** {plural} */
    searchPlaceholder: string;
    loading: string;
    /** {plural} */
    loadFailed: string;
    loadOneFailed: string;
    noResults: string;
    /** {plural} */
    empty: string;
    /** {plural} */
    manage: string;
    actions: string;
    view: string;
    edit: string;
    delete: string;
    back: string;
    details: string;
    /** {singular} */
    deleteTitle: string;
    deleteDescription: string;
    /** {action} */
    actionConfirm: string;
    cancel: string;
    confirm: string;
    previous: string;
    next: string;
    /** {page} */
    page: string;
    /** {page} {count} */
    pageOf: string;
    create: string;
    save: string;
    saving: string;
    /** {singular} */
    createTitle: string;
    /** {singular} */
    editTitle: string;
    /** {Singular} */
    created: string;
    /** {Singular} */
    updated: string;
    /** {Singular} */
    deleted: string;
    /** {singular} */
    createFailed: string;
    /** {singular} */
    updateFailed: string;
    /** {singular} */
    deleteFailed: string;
    /** {action} */
    actionDone: string;
    /** {action} */
    actionFailed: string;
    /** {label} */
    required: string;
    /** {label} */
    notANumber: string;
    invalidEmail: string;
    invalidUrl: string;
    /** {label} (lowercase) */
    selectAtLeastOne: string;
    /** {label} (lowercase) */
    addAtLeastOne: string;
    invalidJson: string;
    /** {label} (lowercase) */
    selectPlaceholder: string;
    listPlaceholder: string;
    remove: string;
    yes: string;
    no: string;
    /** Empty choice of a filter */
    filterAll: string;
    clearFilters: string;
    exportCsv: string;
    /** {count} */
    selected: string;
    deleteSelected: string;
    /** {count} */
    deleteManyTitle: string;
    /** {count} */
    deletedMany: string;
    selectAll: string;
    selectRow: string;
    home: string;
    menu: string;
    language: string;
    /** {name} */
    signedInAs: string;
    signIn: string;
    /** {title} */
    signInTitle: string;
    signingIn: string;
    signInFailed: string;
    signOut: string;
    toggleTheme: string;
}

const EN: Strings = {
    addNew: 'Add new',
    searchPlaceholder: 'Search {plural}...',
    loading: 'Loading...',
    loadFailed: 'Failed to load {plural}',
    loadOneFailed: 'Failed to load',
    noResults: 'No results.',
    empty: 'No {plural} yet.',
    manage: 'Manage your {plural}.',
    actions: 'Actions',
    view: 'View',
    edit: 'Edit',
    delete: 'Delete',
    back: 'Back',
    details: 'Details',
    deleteTitle: 'Delete this {singular}?',
    deleteDescription: 'This action cannot be undone.',
    actionConfirm: '{action}?',
    cancel: 'Cancel',
    confirm: 'Confirm',
    previous: 'Previous',
    next: 'Next',
    page: 'Page {page}',
    pageOf: 'Page {page} of {count}',
    create: 'Create',
    save: 'Save',
    saving: 'Saving...',
    createTitle: 'Create {singular}',
    editTitle: 'Edit {singular}',
    created: '{Singular} created',
    updated: '{Singular} updated',
    deleted: '{Singular} deleted',
    createFailed: 'Failed to create {singular}',
    updateFailed: 'Failed to update {singular}',
    deleteFailed: 'Failed to delete {singular}',
    actionDone: '{action}: done',
    actionFailed: '{action} failed',
    required: '{label} is required',
    notANumber: '{label} must be a number',
    invalidEmail: 'Invalid email',
    invalidUrl: 'Invalid URL',
    selectAtLeastOne: 'Select at least one {label}',
    addAtLeastOne: 'Add at least one {label}',
    invalidJson: 'Invalid JSON',
    selectPlaceholder: 'Select {label}',
    listPlaceholder: 'Type and press Enter',
    remove: 'Remove',
    yes: 'Yes',
    no: 'No',
    filterAll: 'All',
    clearFilters: 'Clear filters',
    exportCsv: 'Export CSV',
    selected: '{count} selected',
    deleteSelected: 'Delete selected',
    deleteManyTitle: 'Delete {count} items?',
    deletedMany: '{count} deleted',
    selectAll: 'Select all',
    selectRow: 'Select row',
    home: 'Home',
    menu: 'Menu',
    language: 'Language',
    signedInAs: 'Signed in as {name}',
    signIn: 'Sign in',
    signInTitle: 'Sign in to {title}',
    signingIn: 'Signing in...',
    signInFailed: 'Sign in failed',
    signOut: 'Sign out',
    toggleTheme: 'Toggle dark mode',
};

const FR: Strings = {
    addNew: 'Ajouter',
    searchPlaceholder: 'Rechercher des {plural}...',
    loading: 'Chargement...',
    loadFailed: 'Impossible de charger les {plural}',
    loadOneFailed: 'Impossible de charger',
    noResults: 'Aucun résultat.',
    empty: 'Aucun élément pour le moment.',
    manage: 'Gérez vos {plural}.',
    actions: 'Actions',
    view: 'Voir',
    edit: 'Modifier',
    delete: 'Supprimer',
    back: 'Retour',
    details: 'Détails',
    deleteTitle: 'Supprimer cet élément ?',
    deleteDescription: 'Cette action est irréversible.',
    actionConfirm: '{action} ?',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    previous: 'Précédent',
    next: 'Suivant',
    page: 'Page {page}',
    pageOf: 'Page {page} sur {count}',
    create: 'Créer',
    save: 'Enregistrer',
    saving: 'Enregistrement...',
    createTitle: 'Créer : {singular}',
    editTitle: 'Modifier : {singular}',
    created: '{Singular} : créé',
    updated: '{Singular} : modifié',
    deleted: '{Singular} : supprimé',
    createFailed: 'Échec de la création',
    updateFailed: 'Échec de la modification',
    deleteFailed: 'Échec de la suppression',
    actionDone: '{action} : effectué',
    actionFailed: '{action} : échec',
    required: '{label} est obligatoire',
    notANumber: '{label} doit être un nombre',
    invalidEmail: 'Adresse e-mail invalide',
    invalidUrl: 'URL invalide',
    selectAtLeastOne: 'Choisissez au moins une option ({label})',
    addAtLeastOne: 'Ajoutez au moins une valeur ({label})',
    invalidJson: 'JSON invalide',
    selectPlaceholder: 'Choisir ({label})',
    listPlaceholder: 'Saisissez puis appuyez sur Entrée',
    remove: 'Retirer',
    yes: 'Oui',
    no: 'Non',
    filterAll: 'Tous',
    clearFilters: 'Effacer les filtres',
    exportCsv: 'Exporter en CSV',
    selected: '{count} sélectionné(s)',
    deleteSelected: 'Supprimer la sélection',
    deleteManyTitle: 'Supprimer {count} élément(s) ?',
    deletedMany: '{count} supprimé(s)',
    selectAll: 'Tout sélectionner',
    selectRow: 'Sélectionner la ligne',
    home: 'Accueil',
    menu: 'Menu',
    language: 'Langue',
    signedInAs: 'Connecté en tant que {name}',
    signIn: 'Se connecter',
    signInTitle: 'Connexion à {title}',
    signingIn: 'Connexion...',
    signInFailed: 'Échec de la connexion',
    signOut: 'Se déconnecter',
    toggleTheme: 'Basculer le thème sombre',
};

const ES: Strings = {
    addNew: 'Añadir',
    searchPlaceholder: 'Buscar {plural}...',
    loading: 'Cargando...',
    loadFailed: 'No se pudieron cargar los {plural}',
    loadOneFailed: 'No se pudo cargar',
    noResults: 'Sin resultados.',
    empty: 'Todavía no hay elementos.',
    manage: 'Gestiona tus {plural}.',
    actions: 'Acciones',
    view: 'Ver',
    edit: 'Editar',
    delete: 'Eliminar',
    back: 'Volver',
    details: 'Detalles',
    deleteTitle: '¿Eliminar este elemento?',
    deleteDescription: 'Esta acción no se puede deshacer.',
    actionConfirm: '¿{action}?',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    previous: 'Anterior',
    next: 'Siguiente',
    page: 'Página {page}',
    pageOf: 'Página {page} de {count}',
    create: 'Crear',
    save: 'Guardar',
    saving: 'Guardando...',
    createTitle: 'Crear: {singular}',
    editTitle: 'Editar: {singular}',
    created: '{Singular}: creado',
    updated: '{Singular}: actualizado',
    deleted: '{Singular}: eliminado',
    createFailed: 'Error al crear',
    updateFailed: 'Error al actualizar',
    deleteFailed: 'Error al eliminar',
    actionDone: '{action}: hecho',
    actionFailed: '{action}: error',
    required: '{label} es obligatorio',
    notANumber: '{label} debe ser un número',
    invalidEmail: 'Correo electrónico no válido',
    invalidUrl: 'URL no válida',
    selectAtLeastOne: 'Selecciona al menos una opción ({label})',
    addAtLeastOne: 'Añade al menos un valor ({label})',
    invalidJson: 'JSON no válido',
    selectPlaceholder: 'Seleccionar ({label})',
    listPlaceholder: 'Escribe y pulsa Intro',
    remove: 'Quitar',
    yes: 'Sí',
    no: 'No',
    filterAll: 'Todos',
    clearFilters: 'Borrar filtros',
    exportCsv: 'Exportar CSV',
    selected: '{count} seleccionado(s)',
    deleteSelected: 'Eliminar selección',
    deleteManyTitle: '¿Eliminar {count} elemento(s)?',
    deletedMany: '{count} eliminado(s)',
    selectAll: 'Seleccionar todo',
    selectRow: 'Seleccionar fila',
    home: 'Inicio',
    menu: 'Menú',
    language: 'Idioma',
    signedInAs: 'Sesión iniciada como {name}',
    signIn: 'Iniciar sesión',
    signInTitle: 'Iniciar sesión en {title}',
    signingIn: 'Iniciando sesión...',
    signInFailed: 'Error al iniciar sesión',
    signOut: 'Cerrar sesión',
    toggleTheme: 'Cambiar modo oscuro',
};

const DE: Strings = {
    addNew: 'Neu',
    searchPlaceholder: '{plural} suchen...',
    loading: 'Wird geladen...',
    loadFailed: '{plural} konnten nicht geladen werden',
    loadOneFailed: 'Konnte nicht geladen werden',
    noResults: 'Keine Ergebnisse.',
    empty: 'Noch keine Einträge.',
    manage: 'Verwalten Sie Ihre {plural}.',
    actions: 'Aktionen',
    view: 'Ansehen',
    edit: 'Bearbeiten',
    delete: 'Löschen',
    back: 'Zurück',
    details: 'Details',
    deleteTitle: 'Diesen Eintrag löschen?',
    deleteDescription: 'Diese Aktion kann nicht rückgängig gemacht werden.',
    actionConfirm: '{action}?',
    cancel: 'Abbrechen',
    confirm: 'Bestätigen',
    previous: 'Zurück',
    next: 'Weiter',
    page: 'Seite {page}',
    pageOf: 'Seite {page} von {count}',
    create: 'Erstellen',
    save: 'Speichern',
    saving: 'Wird gespeichert...',
    createTitle: '{Singular} erstellen',
    editTitle: '{Singular} bearbeiten',
    created: '{Singular} erstellt',
    updated: '{Singular} aktualisiert',
    deleted: '{Singular} gelöscht',
    createFailed: 'Erstellen fehlgeschlagen',
    updateFailed: 'Aktualisieren fehlgeschlagen',
    deleteFailed: 'Löschen fehlgeschlagen',
    actionDone: '{action}: erledigt',
    actionFailed: '{action} fehlgeschlagen',
    required: '{label} ist erforderlich',
    notANumber: '{label} muss eine Zahl sein',
    invalidEmail: 'Ungültige E-Mail-Adresse',
    invalidUrl: 'Ungültige URL',
    selectAtLeastOne: 'Mindestens eine Option wählen ({label})',
    addAtLeastOne: 'Mindestens einen Wert hinzufügen ({label})',
    invalidJson: 'Ungültiges JSON',
    selectPlaceholder: '{label} wählen',
    listPlaceholder: 'Eingeben und Enter drücken',
    remove: 'Entfernen',
    yes: 'Ja',
    no: 'Nein',
    filterAll: 'Alle',
    clearFilters: 'Filter zurücksetzen',
    exportCsv: 'CSV exportieren',
    selected: '{count} ausgewählt',
    deleteSelected: 'Auswahl löschen',
    deleteManyTitle: '{count} Einträge löschen?',
    deletedMany: '{count} gelöscht',
    selectAll: 'Alle auswählen',
    selectRow: 'Zeile auswählen',
    home: 'Start',
    menu: 'Menü',
    language: 'Sprache',
    signedInAs: 'Angemeldet als {name}',
    signIn: 'Anmelden',
    signInTitle: 'Bei {title} anmelden',
    signingIn: 'Anmeldung...',
    signInFailed: 'Anmeldung fehlgeschlagen',
    signOut: 'Abmelden',
    toggleTheme: 'Dunkelmodus umschalten',
};

const PT: Strings = {
    addNew: 'Adicionar',
    searchPlaceholder: 'Pesquisar {plural}...',
    loading: 'Carregando...',
    loadFailed: 'Não foi possível carregar os {plural}',
    loadOneFailed: 'Não foi possível carregar',
    noResults: 'Nenhum resultado.',
    empty: 'Nenhum item ainda.',
    manage: 'Gerencie seus {plural}.',
    actions: 'Ações',
    view: 'Ver',
    edit: 'Editar',
    delete: 'Excluir',
    back: 'Voltar',
    details: 'Detalhes',
    deleteTitle: 'Excluir este item?',
    deleteDescription: 'Esta ação não pode ser desfeita.',
    actionConfirm: '{action}?',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    previous: 'Anterior',
    next: 'Próxima',
    page: 'Página {page}',
    pageOf: 'Página {page} de {count}',
    create: 'Criar',
    save: 'Salvar',
    saving: 'Salvando...',
    createTitle: 'Criar: {singular}',
    editTitle: 'Editar: {singular}',
    created: '{Singular}: criado',
    updated: '{Singular}: atualizado',
    deleted: '{Singular}: excluído',
    createFailed: 'Falha ao criar',
    updateFailed: 'Falha ao atualizar',
    deleteFailed: 'Falha ao excluir',
    actionDone: '{action}: concluído',
    actionFailed: '{action}: falhou',
    required: '{label} é obrigatório',
    notANumber: '{label} deve ser um número',
    invalidEmail: 'E-mail inválido',
    invalidUrl: 'URL inválida',
    selectAtLeastOne: 'Selecione pelo menos uma opção ({label})',
    addAtLeastOne: 'Adicione pelo menos um valor ({label})',
    invalidJson: 'JSON inválido',
    selectPlaceholder: 'Selecionar ({label})',
    listPlaceholder: 'Digite e pressione Enter',
    remove: 'Remover',
    yes: 'Sim',
    no: 'Não',
    filterAll: 'Todos',
    clearFilters: 'Limpar filtros',
    exportCsv: 'Exportar CSV',
    selected: '{count} selecionado(s)',
    deleteSelected: 'Excluir seleção',
    deleteManyTitle: 'Excluir {count} item(ns)?',
    deletedMany: '{count} excluído(s)',
    selectAll: 'Selecionar tudo',
    selectRow: 'Selecionar linha',
    home: 'Início',
    menu: 'Menu',
    language: 'Idioma',
    signedInAs: 'Conectado como {name}',
    signIn: 'Entrar',
    signInTitle: 'Entrar em {title}',
    signingIn: 'Entrando...',
    signInFailed: 'Falha ao entrar',
    signOut: 'Sair',
    toggleTheme: 'Alternar modo escuro',
};

const IT: Strings = {
    addNew: 'Aggiungi',
    searchPlaceholder: 'Cerca {plural}...',
    loading: 'Caricamento...',
    loadFailed: 'Impossibile caricare {plural}',
    loadOneFailed: 'Impossibile caricare',
    noResults: 'Nessun risultato.',
    empty: 'Ancora nessun elemento.',
    manage: 'Gestisci i tuoi {plural}.',
    actions: 'Azioni',
    view: 'Vedi',
    edit: 'Modifica',
    delete: 'Elimina',
    back: 'Indietro',
    details: 'Dettagli',
    deleteTitle: 'Eliminare questo elemento?',
    deleteDescription: 'Questa azione non può essere annullata.',
    actionConfirm: '{action}?',
    cancel: 'Annulla',
    confirm: 'Conferma',
    previous: 'Precedente',
    next: 'Successiva',
    page: 'Pagina {page}',
    pageOf: 'Pagina {page} di {count}',
    create: 'Crea',
    save: 'Salva',
    saving: 'Salvataggio...',
    createTitle: 'Crea: {singular}',
    editTitle: 'Modifica: {singular}',
    created: '{Singular}: creato',
    updated: '{Singular}: aggiornato',
    deleted: '{Singular}: eliminato',
    createFailed: 'Creazione non riuscita',
    updateFailed: 'Aggiornamento non riuscito',
    deleteFailed: 'Eliminazione non riuscita',
    actionDone: '{action}: fatto',
    actionFailed: '{action}: non riuscito',
    required: '{label} è obbligatorio',
    notANumber: '{label} deve essere un numero',
    invalidEmail: 'Email non valida',
    invalidUrl: 'URL non valido',
    selectAtLeastOne: 'Seleziona almeno un\'opzione ({label})',
    addAtLeastOne: 'Aggiungi almeno un valore ({label})',
    invalidJson: 'JSON non valido',
    selectPlaceholder: 'Seleziona ({label})',
    listPlaceholder: 'Scrivi e premi Invio',
    remove: 'Rimuovi',
    yes: 'Sì',
    no: 'No',
    filterAll: 'Tutti',
    clearFilters: 'Cancella filtri',
    exportCsv: 'Esporta CSV',
    selected: '{count} selezionato/i',
    deleteSelected: 'Elimina selezionati',
    deleteManyTitle: 'Eliminare {count} elemento/i?',
    deletedMany: '{count} eliminato/i',
    selectAll: 'Seleziona tutto',
    selectRow: 'Seleziona riga',
    home: 'Home',
    menu: 'Menu',
    language: 'Lingua',
    signedInAs: 'Accesso come {name}',
    signIn: 'Accedi',
    signInTitle: 'Accedi a {title}',
    signingIn: 'Accesso...',
    signInFailed: 'Accesso non riuscito',
    signOut: 'Esci',
    toggleTheme: 'Attiva/disattiva tema scuro',
};

export const LOCALES = { en: EN, fr: FR, es: ES, de: DE, pt: PT, it: IT } as const;
export type Locale = keyof typeof LOCALES;

/** Names shown in the language switcher */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch', pt: 'Português', it: 'Italiano' };
