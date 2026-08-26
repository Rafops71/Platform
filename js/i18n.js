// Jericho Platform — bilingual support for the participant interface.
//
// Scope: the participant-facing pages only (index.html, register.html,
// app.html). The Operator dashboard stays in English by design and simply
// does not load this file — every helper here degrades to English when it is
// absent, so shared code in utils.js works unchanged on operator.html.
//
// The Spanish is written for commodity trading, not translated word for word.
// Some deliberate choices, so they stay consistent if anyone extends this:
//   listing        -> "publicación"  (not "listado", which reads as a printout)
//   commodity      -> "materia prima"
//   notes          -> "observaciones" (the register a trading document uses)
//   specification  -> "especificación / grado"
//   Incoterm, FOB, CIF, DMTU and the currency codes stay as they are —
//   they are international trade terms and are not translated in Spanish
//   practice either.
//
// Country names and units are translated for display only. Their stored
// values stay in canonical English, so a listing created in Spanish and one
// created in English hold exactly the same data — see localizedOptions().

'use strict';

const I18N_STORAGE_KEY = 'jericho.language';
const I18N_DEFAULT = 'en';
const I18N_LANGUAGES = ['en', 'es'];

const STRINGS = {
  en: {
    'lang.name.en': 'English',
    'lang.name.es': 'Español',
    'lang.switch': 'Language',

    'brand': 'Jericho Platform',
    'common.loading': 'Loading…',
    'common.save': 'Save',
    'common.saving': 'Saving…',
    'common.cancel': 'Cancel',
    'common.send': 'Send',
    'common.edit': 'Edit',
    'common.remove': 'Remove',
    'common.reply': 'Reply',
    'common.apply': 'Apply',
    'common.signout': 'Sign out',
    'common.operator': 'Operator',
    'common.operators': 'Operators',
    'common.email': 'Email',
    'common.password': 'Password',
    'common.message': 'Message',
    'common.unknownError': 'Unknown error',

    // ---- Sign in -------------------------------------------------------
    'login.tagline': 'Private, invitation-only. Sign in to continue.',
    'login.submit': 'Sign In',
    'login.submitting': 'Signing in…',
    'login.noAccount': 'No account? Access is by invitation only — ask an Operator for an invitation link.',
    'login.pending': 'Your registration is awaiting Operator approval. You will be able to sign in once approved.',
    'login.blocked': 'This account is not currently active. Contact an Operator.',
    'login.noProfile': 'Could not load your profile. Contact an Operator.',

    // ---- Registration --------------------------------------------------
    'register.title': 'Complete your registration',
    'register.checking': 'Checking invitation link…',
    'register.invalid': 'This invitation link is invalid, expired, or already used.',
    'register.invalidHelp': 'Ask an Operator to send you a new invitation link.',
    'register.firstName': 'First name',
    'register.lastName': 'Last name',
    'register.company': 'Company (optional)',
    'register.passwordHint': 'At least 6 characters.',
    'register.country': 'Country',
    'register.countryPlaceholder': 'Select a country…',
    'register.phone': 'Phone number',
    'register.submit': 'Register',
    'register.submitting': 'Registering…',
    'register.emailConfirm': 'Account created, but email confirmation is required by the current Supabase settings.',
    'register.inviteNotMarked': 'Contact an Operator — invitation could not be marked as used automatically.',

    // ---- Navigation ----------------------------------------------------
    'nav.myListings': 'My Listings',
    'nav.newListing': 'New Listing',
    'nav.browse': 'Browse',
    'nav.documents': 'Documents',
    'nav.mailbox': 'Mailbox',
    'nav.notifications': 'Notifications',
    'nav.profile': 'Profile',

    // ---- My listings ---------------------------------------------------
    'listings.mine': 'My Listings',
    'listings.new': '+ New Listing',
    'listings.none': 'You have no listings yet.',
    'listings.updated': 'Updated {date}',
    'listings.posted': 'Posted {date}',
    'listings.qtyNa': 'Qty n/a',
    'listings.docsIndicated': '{count} document(s) indicated',
    'listings.noDocsIndicated': 'No documents indicated',
    'listings.documentsIndicated': 'Documents indicated',
    'listings.confirmRemove': 'Remove this listing? This cannot be undone.',
    'listings.removed': 'Listing removed.',
    'listings.saved': 'Listing saved.',
    'listings.loadFailed': 'Could not load listing.',

    // ---- Listing form --------------------------------------------------
    'form.newListing': 'New Listing',
    'form.editListing': 'Edit {ref}',
    'form.type': 'Type',
    'form.sellOffer': 'Sell Offer',
    'form.buyRequest': 'Buy Request',
    'form.commodity': 'Commodity',
    'form.commodityLoading': 'Loading commodities…',
    'form.commoditySelect': 'Select commodity…',
    'form.commodityOther': 'Other (specify)',
    'form.commodityOtherPlaceholder': 'Specify commodity',
    'form.quantity': 'Quantity',
    'form.unit': 'Unit',
    'form.specification': 'Specification / Grade',
    'form.incoterm': 'Incoterm',
    'form.origin': 'Origin',
    'form.destination': 'Destination',
    'form.priceAmount': 'Price amount',
    'form.currency': 'Currency',
    'form.pricePer': 'Price per',
    'form.notes': 'Notes',
    'form.documentsYouHave': 'Documents you have',
    'form.saveListing': 'Save Listing',
    'form.chooseType': 'Choose Sell Offer or Buy Request.',
    'form.chooseCommodity': 'Choose or specify a commodity.',
    'form.existingEntry': '{value} (existing entry)',

    // ---- Document checklist groups -------------------------------------
    'docs.groupMaterial': 'Material / Product Documentation',
    'docs.groupCompany': 'Company / Compliance & Supporting Documentation',
    'docs.certificateOfAnalysis': 'Certificate of Analysis (COA)',
    'docs.assayReport': 'Assay Report',
    'docs.certificateOfOrigin': 'Certificate of Origin',
    'docs.photos': 'Photos',
    'docs.videos': 'Videos',
    'docs.warehouseReceipt': 'Warehouse Receipt, where applicable',
    'docs.billOfLading': 'Bill of Lading / Shipping Documentation, where applicable',
    'docs.packingList': 'Packing List, where applicable',
    'docs.otherMaterial': 'Other relevant product/material documentation',
    'docs.companyRegistration': 'Company Registration / Corporate Documents',
    'docs.kyc': 'KYC Documentation',
    'docs.cis': 'CIS (Customer Information Sheet)',
    'docs.other': 'Other',

    // ---- Browse ---------------------------------------------------------
    'browse.title': 'Browse Listings',
    'browse.anonymous': 'Anonymous — you never see who posted a listing.',
    'browse.allTypes': 'All types',
    'browse.sellOffers': 'Sell Offers',
    'browse.buyRequests': 'Buy Requests',
    'browse.allCommodities': 'All commodities',
    'browse.originDestination': 'Origin / Destination',
    'browse.allStatuses': 'All statuses',
    'browse.noMatch': 'No listings match.',
    'browse.contact': 'Contact',
    'browse.specification': 'Specification / Grade: {value}',
    'browse.price': 'Price: {value}',
    'browse.notes': 'Notes: {value}',
    'browse.originLabel': 'Origin',
    'browse.destinationLabel': 'Destination',
    'browse.na': 'n/a',

    // ---- Document requests ---------------------------------------------
    'docreq.title': 'Document Requests',
    'docreq.intro': 'Operators may ask you to confirm a specific document. No upload is required — confirm whether you have it.',
    'docreq.none': 'No document requests.',
    'docreq.requested': 'Requested {date}',
    'docreq.responded': 'Responded {date}',
    'docreq.haveIt': 'I have this document',
    'docreq.notAvailable': 'Not available',
    'docreq.recorded': 'Response recorded.',

    // ---- Mailbox --------------------------------------------------------
    'mailbox.title': 'Mailbox',
    'mailbox.intro': 'All messages go through the Operators — no direct contact between participants.',
    'mailbox.none': 'No messages yet.',
    'mailbox.fromYou': 'You → Operators',
    'mailbox.toYou': 'Forwarded to you',
    'mailbox.listingFallback': '(listing)',

    // ---- Contact modal --------------------------------------------------
    'contact.title': 'Contact {ref}',
    'contact.intro': 'Your message goes to the Operators, who will forward it anonymously if appropriate.',
    'contact.empty': 'Write a message first.',
    'contact.sent': 'Message sent to Operators.',

    // ---- Notifications ---------------------------------------------------
    'notifications.title': 'Notifications',
    'notifications.none': 'No notifications.',

    // ---- Profile ---------------------------------------------------------
    'profile.title': 'Profile',
    'profile.emailLocked': 'Email cannot be changed here — contact an Operator.',
    'profile.save': 'Save Profile',
    'profile.saved': 'Profile updated.',
    'profile.changePassword': 'Change Password',
    'profile.newPassword': 'New password',
    'profile.updatePassword': 'Update Password',
    'profile.passwordUpdated': 'Password updated.',
    'profile.phone': 'Phone',

    // ---- Statuses --------------------------------------------------------
    'status.available': 'Available',
    'status.under_review': 'Under Review',
    'status.negotiation': 'Negotiation',
    'status.closed': 'Closed',
    'status.archived': 'Archived',
    'status.pending': 'Pending',
    'status.approved': 'Approved',
    'status.rejected': 'Rejected',
    'status.suspended': 'Suspended',
    'status.requested': 'Requested',
    'status.confirmed': 'Confirmed',
    'status.unavailable': 'Unavailable',
    'status.new': 'New',
    'status.reviewed': 'Reviewed',
    'status.dismissed': 'Dismissed',
    'status.pending_review': 'Pending Review',
    'status.forwarded': 'Forwarded',
    'status.replied': 'Replied',
    'status.ignored': 'Ignored',

    // ---- Units ------------------------------------------------------------
    'unit.Grams': 'Grams',
    'unit.Kilograms': 'Kilograms',
    'unit.Metric tons': 'Metric tons',
    'unit.Pounds': 'Pounds',
    'unit.Ounces': 'Ounces',
    'unit.Liters': 'Liters',
    'unit.Cubic meters': 'Cubic meters',
    'unit.Barrels': 'Barrels',
    'unit.Gallons': 'Gallons',
    'unit.Bushels': 'Bushels',
    'unit.Dry Metric Ton Units (DMTU)': 'Dry Metric Ton Units (DMTU)',
  },

  es: {
    'lang.name.en': 'English',
    'lang.name.es': 'Español',
    'lang.switch': 'Idioma',

    'brand': 'Jericho Platform',
    'common.loading': 'Cargando…',
    'common.save': 'Guardar',
    'common.saving': 'Guardando…',
    'common.cancel': 'Cancelar',
    'common.send': 'Enviar',
    'common.edit': 'Editar',
    'common.remove': 'Eliminar',
    'common.reply': 'Responder',
    'common.apply': 'Aplicar',
    'common.signout': 'Cerrar sesión',
    'common.operator': 'Operador',
    'common.operators': 'los Operadores',
    'common.email': 'Correo electrónico',
    'common.password': 'Contraseña',
    'common.message': 'Mensaje',
    'common.unknownError': 'Error desconocido',

    // ---- Sign in -------------------------------------------------------
    'login.tagline': 'Plataforma privada, solo por invitación. Inicie sesión para continuar.',
    'login.submit': 'Iniciar sesión',
    'login.submitting': 'Iniciando sesión…',
    'login.noAccount': '¿No tiene cuenta? El acceso es únicamente por invitación: solicite un enlace de invitación a un Operador.',
    'login.pending': 'Su registro está pendiente de aprobación por parte de un Operador. Podrá iniciar sesión una vez aprobado.',
    'login.blocked': 'Esta cuenta no está activa actualmente. Póngase en contacto con un Operador.',
    'login.noProfile': 'No se ha podido cargar su perfil. Póngase en contacto con un Operador.',

    // ---- Registration --------------------------------------------------
    'register.title': 'Complete su registro',
    'register.checking': 'Verificando el enlace de invitación…',
    'register.invalid': 'Este enlace de invitación no es válido, ha caducado o ya se ha utilizado.',
    'register.invalidHelp': 'Solicite a un Operador que le envíe un nuevo enlace de invitación.',
    'register.firstName': 'Nombre',
    'register.lastName': 'Apellidos',
    'register.company': 'Empresa (opcional)',
    'register.passwordHint': 'Mínimo 6 caracteres.',
    'register.country': 'País',
    'register.countryPlaceholder': 'Seleccione un país…',
    'register.phone': 'Teléfono',
    'register.submit': 'Registrarse',
    'register.submitting': 'Registrando…',
    'register.emailConfirm': 'Cuenta creada, pero la configuración actual de Supabase exige confirmar el correo electrónico.',
    'register.inviteNotMarked': 'Póngase en contacto con un Operador: no se ha podido marcar la invitación como utilizada automáticamente.',

    // ---- Navigation ----------------------------------------------------
    'nav.myListings': 'Mis publicaciones',
    'nav.newListing': 'Nueva publicación',
    'nav.browse': 'Explorar',
    'nav.documents': 'Documentación',
    'nav.mailbox': 'Buzón',
    'nav.notifications': 'Notificaciones',
    'nav.profile': 'Perfil',

    // ---- My listings ---------------------------------------------------
    'listings.mine': 'Mis publicaciones',
    'listings.new': '+ Nueva publicación',
    'listings.none': 'Todavía no tiene ninguna publicación.',
    'listings.updated': 'Actualizada el {date}',
    'listings.posted': 'Publicada el {date}',
    'listings.qtyNa': 'Cantidad no indicada',
    'listings.docsIndicated': '{count} documento(s) indicado(s)',
    'listings.noDocsIndicated': 'Sin documentación indicada',
    'listings.documentsIndicated': 'Documentación indicada',
    'listings.confirmRemove': '¿Eliminar esta publicación? Esta acción no se puede deshacer.',
    'listings.removed': 'Publicación eliminada.',
    'listings.saved': 'Publicación guardada.',
    'listings.loadFailed': 'No se ha podido cargar la publicación.',

    // ---- Listing form --------------------------------------------------
    'form.newListing': 'Nueva publicación',
    'form.editListing': 'Editar {ref}',
    'form.type': 'Tipo',
    'form.sellOffer': 'Oferta de venta',
    'form.buyRequest': 'Solicitud de compra',
    'form.commodity': 'Materia prima',
    'form.commodityLoading': 'Cargando materias primas…',
    'form.commoditySelect': 'Seleccione una materia prima…',
    'form.commodityOther': 'Otra (especificar)',
    'form.commodityOtherPlaceholder': 'Especifique la materia prima',
    'form.quantity': 'Cantidad',
    'form.unit': 'Unidad',
    'form.specification': 'Especificación / Grado',
    'form.incoterm': 'Incoterm',
    'form.origin': 'Origen',
    'form.destination': 'Destino',
    'form.priceAmount': 'Importe del precio',
    'form.currency': 'Moneda',
    'form.pricePer': 'Precio por',
    'form.notes': 'Observaciones',
    'form.documentsYouHave': 'Documentación disponible',
    'form.saveListing': 'Guardar publicación',
    'form.chooseType': 'Seleccione Oferta de venta o Solicitud de compra.',
    'form.chooseCommodity': 'Seleccione o especifique una materia prima.',
    'form.existingEntry': '{value} (valor existente)',

    // ---- Document checklist groups -------------------------------------
    'docs.groupMaterial': 'Documentación del material / producto',
    'docs.groupCompany': 'Documentación societaria, de cumplimiento y de apoyo',
    'docs.certificateOfAnalysis': 'Certificado de análisis (COA)',
    'docs.assayReport': 'Informe de ensayo',
    'docs.certificateOfOrigin': 'Certificado de origen',
    'docs.photos': 'Fotografías',
    'docs.videos': 'Vídeos',
    'docs.warehouseReceipt': 'Resguardo de almacén, cuando proceda',
    'docs.billOfLading': 'Conocimiento de embarque / documentación de transporte, cuando proceda',
    'docs.packingList': 'Lista de empaque, cuando proceda',
    'docs.otherMaterial': 'Otra documentación relevante del producto o material',
    'docs.companyRegistration': 'Registro mercantil / documentación societaria',
    'docs.kyc': 'Documentación KYC',
    'docs.cis': 'CIS (ficha de información del cliente)',
    'docs.other': 'Otros',

    // ---- Browse ---------------------------------------------------------
    'browse.title': 'Explorar publicaciones',
    'browse.anonymous': 'Anónimo: nunca verá quién ha publicado una oferta o solicitud.',
    'browse.allTypes': 'Todos los tipos',
    'browse.sellOffers': 'Ofertas de venta',
    'browse.buyRequests': 'Solicitudes de compra',
    'browse.allCommodities': 'Todas las materias primas',
    'browse.originDestination': 'Origen / Destino',
    'browse.allStatuses': 'Todos los estados',
    'browse.noMatch': 'No hay publicaciones que coincidan.',
    'browse.contact': 'Contactar',
    'browse.specification': 'Especificación / Grado: {value}',
    'browse.price': 'Precio: {value}',
    'browse.notes': 'Observaciones: {value}',
    'browse.originLabel': 'Origen',
    'browse.destinationLabel': 'Destino',
    'browse.na': 'no indicado',

    // ---- Document requests ---------------------------------------------
    'docreq.title': 'Solicitudes de documentación',
    'docreq.intro': 'Los Operadores pueden pedirle que confirme un documento concreto. No es necesario subir ningún archivo: solo confirme si dispone de él.',
    'docreq.none': 'No hay solicitudes de documentación.',
    'docreq.requested': 'Solicitado el {date}',
    'docreq.responded': 'Respondido el {date}',
    'docreq.haveIt': 'Dispongo de este documento',
    'docreq.notAvailable': 'No disponible',
    'docreq.recorded': 'Respuesta registrada.',

    // ---- Mailbox --------------------------------------------------------
    'mailbox.title': 'Buzón',
    'mailbox.intro': 'Toda la correspondencia se canaliza a través de los Operadores: no hay contacto directo entre participantes.',
    'mailbox.none': 'Todavía no hay mensajes.',
    'mailbox.fromYou': 'Usted → Operadores',
    'mailbox.toYou': 'Reenviado a usted',
    'mailbox.listingFallback': '(publicación)',

    // ---- Contact modal --------------------------------------------------
    'contact.title': 'Contactar con {ref}',
    'contact.intro': 'Su mensaje se envía a los Operadores, que lo reenviarán de forma anónima si procede.',
    'contact.empty': 'Escriba un mensaje primero.',
    'contact.sent': 'Mensaje enviado a los Operadores.',

    // ---- Notifications ---------------------------------------------------
    'notifications.title': 'Notificaciones',
    'notifications.none': 'No hay notificaciones.',

    // ---- Profile ---------------------------------------------------------
    'profile.title': 'Perfil',
    'profile.emailLocked': 'El correo electrónico no se puede modificar aquí; póngase en contacto con un Operador.',
    'profile.save': 'Guardar perfil',
    'profile.saved': 'Perfil actualizado.',
    'profile.changePassword': 'Cambiar contraseña',
    'profile.newPassword': 'Nueva contraseña',
    'profile.updatePassword': 'Actualizar contraseña',
    'profile.passwordUpdated': 'Contraseña actualizada.',
    'profile.phone': 'Teléfono',

    // ---- Statuses --------------------------------------------------------
    'status.available': 'Disponible',
    'status.under_review': 'En revisión',
    'status.negotiation': 'En negociación',
    'status.closed': 'Cerrada',
    'status.archived': 'Archivada',
    'status.pending': 'Pendiente',
    'status.approved': 'Aprobado',
    'status.rejected': 'Rechazado',
    'status.suspended': 'Suspendido',
    'status.requested': 'Solicitado',
    'status.confirmed': 'Confirmado',
    'status.unavailable': 'No disponible',
    'status.new': 'Nuevo',
    'status.reviewed': 'Revisado',
    'status.dismissed': 'Descartado',
    'status.pending_review': 'Pendiente de revisión',
    'status.forwarded': 'Reenviado',
    'status.replied': 'Respondido',
    'status.ignored': 'Ignorado',

    // ---- Units ------------------------------------------------------------
    // DMTU keeps its English acronym: it is the term used on Spanish-language
    // ore contracts too.
    'unit.Grams': 'Gramos',
    'unit.Kilograms': 'Kilogramos',
    'unit.Metric tons': 'Toneladas métricas',
    'unit.Pounds': 'Libras',
    'unit.Ounces': 'Onzas',
    'unit.Liters': 'Litros',
    'unit.Cubic meters': 'Metros cúbicos',
    'unit.Barrels': 'Barriles',
    'unit.Gallons': 'Galones',
    'unit.Bushels': 'Bushels',
    'unit.Dry Metric Ton Units (DMTU)': 'Unidades de tonelada métrica seca (DMTU)',
  },
};

// Country names, Spanish display only — the stored value stays the English
// name so records are language-independent. Anything missing here falls back
// to the English name rather than showing a blank option.
const COUNTRY_ES = {
  'Afghanistan': 'Afganistán', 'Albania': 'Albania', 'Algeria': 'Argelia', 'Andorra': 'Andorra',
  'Angola': 'Angola', 'Antigua and Barbuda': 'Antigua y Barbuda', 'Argentina': 'Argentina',
  'Armenia': 'Armenia', 'Australia': 'Australia', 'Austria': 'Austria', 'Azerbaijan': 'Azerbaiyán',
  'Bahamas': 'Bahamas', 'Bahrain': 'Baréin', 'Bangladesh': 'Bangladés', 'Barbados': 'Barbados',
  'Belarus': 'Bielorrusia', 'Belgium': 'Bélgica', 'Belize': 'Belice', 'Benin': 'Benín',
  'Bhutan': 'Bután', 'Bolivia': 'Bolivia', 'Bosnia and Herzegovina': 'Bosnia y Herzegovina',
  'Botswana': 'Botsuana', 'Brazil': 'Brasil', 'Brunei': 'Brunéi', 'Bulgaria': 'Bulgaria',
  'Burkina Faso': 'Burkina Faso', 'Burundi': 'Burundi', 'Cabo Verde': 'Cabo Verde',
  'Cambodia': 'Camboya', 'Cameroon': 'Camerún', 'Canada': 'Canadá',
  'Central African Republic': 'República Centroafricana', 'Chad': 'Chad', 'Chile': 'Chile',
  'China': 'China', 'Colombia': 'Colombia', 'Comoros': 'Comoras',
  'Congo (Republic of the)': 'Congo (República del)',
  'Congo (Democratic Republic of the)': 'Congo (República Democrática del)',
  'Costa Rica': 'Costa Rica', "Cote d'Ivoire": 'Costa de Marfil', 'Croatia': 'Croacia',
  'Cuba': 'Cuba', 'Cyprus': 'Chipre', 'Czechia': 'Chequia', 'Denmark': 'Dinamarca',
  'Djibouti': 'Yibuti', 'Dominica': 'Dominica', 'Dominican Republic': 'República Dominicana',
  'Ecuador': 'Ecuador', 'Egypt': 'Egipto', 'El Salvador': 'El Salvador',
  'Equatorial Guinea': 'Guinea Ecuatorial', 'Eritrea': 'Eritrea', 'Estonia': 'Estonia',
  'Eswatini': 'Esuatini', 'Ethiopia': 'Etiopía', 'Fiji': 'Fiyi', 'Finland': 'Finlandia',
  'France': 'Francia', 'Gabon': 'Gabón', 'Gambia': 'Gambia', 'Georgia': 'Georgia',
  'Germany': 'Alemania', 'Ghana': 'Ghana', 'Greece': 'Grecia', 'Grenada': 'Granada',
  'Guatemala': 'Guatemala', 'Guinea': 'Guinea', 'Guinea-Bissau': 'Guinea-Bisáu',
  'Guyana': 'Guyana', 'Haiti': 'Haití', 'Honduras': 'Honduras', 'Hungary': 'Hungría',
  'Iceland': 'Islandia', 'India': 'India', 'Indonesia': 'Indonesia', 'Iran': 'Irán',
  'Iraq': 'Irak', 'Ireland': 'Irlanda', 'Israel': 'Israel', 'Italy': 'Italia',
  'Jamaica': 'Jamaica', 'Japan': 'Japón', 'Jordan': 'Jordania', 'Kazakhstan': 'Kazajistán',
  'Kenya': 'Kenia', 'Kiribati': 'Kiribati', 'Kosovo': 'Kosovo', 'Kuwait': 'Kuwait',
  'Kyrgyzstan': 'Kirguistán', 'Laos': 'Laos', 'Latvia': 'Letonia', 'Lebanon': 'Líbano',
  'Lesotho': 'Lesoto', 'Liberia': 'Liberia', 'Libya': 'Libia', 'Liechtenstein': 'Liechtenstein',
  'Lithuania': 'Lituania', 'Luxembourg': 'Luxemburgo', 'Madagascar': 'Madagascar',
  'Malawi': 'Malaui', 'Malaysia': 'Malasia', 'Maldives': 'Maldivas', 'Mali': 'Malí',
  'Malta': 'Malta', 'Marshall Islands': 'Islas Marshall', 'Mauritania': 'Mauritania',
  'Mauritius': 'Mauricio', 'Mexico': 'México', 'Micronesia': 'Micronesia', 'Moldova': 'Moldavia',
  'Monaco': 'Mónaco', 'Mongolia': 'Mongolia', 'Montenegro': 'Montenegro', 'Morocco': 'Marruecos',
  'Mozambique': 'Mozambique', 'Myanmar': 'Birmania', 'Namibia': 'Namibia', 'Nauru': 'Nauru',
  'Nepal': 'Nepal', 'Netherlands': 'Países Bajos', 'New Zealand': 'Nueva Zelanda',
  'Nicaragua': 'Nicaragua', 'Niger': 'Níger', 'Nigeria': 'Nigeria', 'North Korea': 'Corea del Norte',
  'North Macedonia': 'Macedonia del Norte', 'Norway': 'Noruega', 'Oman': 'Omán',
  'Pakistan': 'Pakistán', 'Palau': 'Palaos', 'Palestine': 'Palestina', 'Panama': 'Panamá',
  'Papua New Guinea': 'Papúa Nueva Guinea', 'Paraguay': 'Paraguay', 'Peru': 'Perú',
  'Philippines': 'Filipinas', 'Poland': 'Polonia', 'Portugal': 'Portugal', 'Qatar': 'Catar',
  'Romania': 'Rumanía', 'Russia': 'Rusia', 'Rwanda': 'Ruanda',
  'Saint Kitts and Nevis': 'San Cristóbal y Nieves', 'Saint Lucia': 'Santa Lucía',
  'Saint Vincent and the Grenadines': 'San Vicente y las Granadinas', 'Samoa': 'Samoa',
  'San Marino': 'San Marino', 'Sao Tome and Principe': 'Santo Tomé y Príncipe',
  'Saudi Arabia': 'Arabia Saudí', 'Senegal': 'Senegal', 'Serbia': 'Serbia',
  'Seychelles': 'Seychelles', 'Sierra Leone': 'Sierra Leona', 'Singapore': 'Singapur',
  'Slovakia': 'Eslovaquia', 'Slovenia': 'Eslovenia', 'Solomon Islands': 'Islas Salomón',
  'Somalia': 'Somalia', 'South Africa': 'Sudáfrica', 'South Korea': 'Corea del Sur',
  'South Sudan': 'Sudán del Sur', 'Spain': 'España', 'Sri Lanka': 'Sri Lanka', 'Sudan': 'Sudán',
  'Suriname': 'Surinam', 'Sweden': 'Suecia', 'Switzerland': 'Suiza', 'Syria': 'Siria',
  'Taiwan': 'Taiwán', 'Tajikistan': 'Tayikistán', 'Tanzania': 'Tanzania', 'Thailand': 'Tailandia',
  'Timor-Leste': 'Timor Oriental', 'Togo': 'Togo', 'Tonga': 'Tonga',
  'Trinidad and Tobago': 'Trinidad y Tobago', 'Tunisia': 'Túnez', 'Turkey': 'Turquía',
  'Turkmenistan': 'Turkmenistán', 'Tuvalu': 'Tuvalu', 'Uganda': 'Uganda', 'Ukraine': 'Ucrania',
  'United Arab Emirates': 'Emiratos Árabes Unidos', 'United Kingdom': 'Reino Unido',
  'United States': 'Estados Unidos', 'Uruguay': 'Uruguay', 'Uzbekistan': 'Uzbekistán',
  'Vanuatu': 'Vanuatu', 'Vatican City': 'Ciudad del Vaticano', 'Venezuela': 'Venezuela',
  'Vietnam': 'Vietnam', 'Yemen': 'Yemen', 'Zambia': 'Zambia', 'Zimbabwe': 'Zimbabue',
};

// ---------------------------------------------------------------- CORE ----

/** The active language. Falls back to English for anything unrecognised, and
 *  survives a storage failure (private windows can throw on access). */
function currentLang() {
  try {
    const stored = localStorage.getItem(I18N_STORAGE_KEY);
    if (stored && I18N_LANGUAGES.includes(stored)) return stored;
  } catch { /* storage unavailable — fall through to the default */ }
  return I18N_DEFAULT;
}

function setLang(lang) {
  if (!I18N_LANGUAGES.includes(lang)) return;
  try { localStorage.setItem(I18N_STORAGE_KEY, lang); } catch { /* not fatal */ }
  document.documentElement.lang = lang;
  applyTranslations();
  // Pages with rendered lists re-render themselves; static pages do not need to.
  if (typeof window.onLanguageChange === 'function') window.onLanguageChange(lang);
}

/** Translate `key`, substituting {name} placeholders from `vars`.
 *  An unknown key returns the key itself, which makes a gap obvious on screen
 *  rather than rendering an empty label. */
function t(key, vars) {
  const lang = currentLang();
  let out = (STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS[I18N_DEFAULT][key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      out = out.split(`{${name}}`).join(String(value));
    }
  }
  return out;
}

/** BCP 47 tag for Intl. en-GB rather than en-US: this platform is European
 *  and en-US would format numbers and dates the American way. */
function i18nLocale() {
  return currentLang() === 'es' ? 'es-ES' : 'en-GB';
}

function countryLabel(name) {
  return currentLang() === 'es' ? (COUNTRY_ES[name] || name) : name;
}

function unitLabel(name) {
  return t(`unit.${name}`) === `unit.${name}` ? name : t(`unit.${name}`);
}

/** {value, label} pairs for a <select>: the value stored in the database stays
 *  canonical English, only the visible label changes with the language. */
function localizedOptions(values, labelFn) {
  return values.map(v => ({ value: v, label: labelFn ? labelFn(v) : v }));
}

// ------------------------------------------------------------ RENDERING ----

/** Apply every data-i18n* attribute under `root`.
 *    data-i18n             -> textContent
 *    data-i18n-placeholder -> placeholder attribute
 *    data-i18n-title       -> title attribute
 *    data-i18n-html        -> innerHTML (only for text this file controls) */
function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
  document.documentElement.lang = currentLang();
}

/** Language toggle for the participant header. Rendered from script so the
 *  three participant pages stay in step without duplicating markup. */
function renderLanguageToggle(container) {
  const host = typeof container === 'string' ? document.getElementById(container) : container;
  if (!host) return;

  host.innerHTML = '';
  host.className = 'lang-toggle';
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', t('lang.switch'));

  I18N_LANGUAGES.forEach(lang => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lang-btn' + (lang === currentLang() ? ' lang-btn-active' : '');
    btn.textContent = lang.toUpperCase();
    btn.title = STRINGS[lang]['lang.name.' + lang];
    btn.setAttribute('aria-pressed', String(lang === currentLang()));
    btn.addEventListener('click', () => {
      if (lang === currentLang()) return;
      setLang(lang);
      renderLanguageToggle(host);
    });
    host.appendChild(btn);
  });
}

// Set <html lang> as early as possible so the browser and assistive tech know
// the document language before anything renders.
document.documentElement.lang = currentLang();
