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
    'listings.staleNotice': 'You have not updated this listing in {days} days. Is it still available?',
    'listings.stillAvailable': 'Yes, still available',
    'listings.closeIt': 'No, close it',
    'listings.renewed': 'Listing confirmed as current.',
    'listings.closed': 'Listing closed.',
    'export.title': 'Your activity',
    'export.intro': 'Download everything you have done on the platform — your listings, your messages, document requests and answers, and changes to your account — as a spreadsheet file.',
    'export.download': 'Download CSV',
    'export.empty': 'There is nothing to export yet.',
    'export.done': 'Export downloaded.',
    'export.colDate': 'Date',
    'export.colCategory': 'What',
    'export.colReference': 'Listing',
    'export.colDetail': 'Detail',
    'export.colStatus': 'Status',
    'export.cat.listing': 'Listing posted',
    'export.cat.message_sent': 'Message sent',
    'export.cat.message_received': 'Message received',
    'export.cat.document_request': 'Document requested',
    'export.cat.document_response': 'Document answered',
    'export.cat.profile_change': 'Account change',
    'saved.title': 'Saved searches & watchlist',
    'saved.addFromBrowse': 'Save one from Browse',
    'saved.save': 'Save this search',
    'saved.saved': 'Search saved.',
    'saved.removed': 'Search removed.',
    'saved.remove': 'Remove',
    'saved.open': 'Open',
    'saved.none': 'Nothing saved yet. Set the filters you care about on Browse and save them, or save a single commodity to watch it.',
    'saved.everything': 'Every listing',
    'saved.matches': '{count} matching',
    'saved.duplicate': 'You have already saved that search.',
    'profile.title': 'Profile',
    'profile.save': 'Save Profile',
    'profile.saved': 'Profile updated.',
    'profile.phone': 'Phone',
    'profile.jobTitle': 'Job title / position',
    'profile.language': 'Language',
    'profile.languageHint': 'Changes the interface straight away, and the language your notification emails are written in.',
    'profile.role': 'Role',
    'profile.status': 'Status',
    'profile.roleLocked': 'Your role and status are set by an Operator and cannot be changed here.',
    'profile.emailSection': 'Email address',
    'profile.currentEmail': 'Current email',
    'profile.newEmail': 'New email',
    'profile.currentPassword': 'Current password',
    'profile.emailHint': 'You sign in with this address, so changing it needs your current password, and the new address has to confirm the change.',
    'profile.changeEmail': 'Change Email',
    'profile.emailPending': 'Confirmation link sent to the new address. The change takes effect once you follow it; until then you sign in with your current address.',
    'profile.emailUnchanged': 'That is already your email address.',
    'profile.wrongPassword': 'That is not your current password.',
    'profile.changePassword': 'Change Password',
    'profile.newPassword': 'New password',
    'profile.updatePassword': 'Update Password',
    'profile.passwordUpdated': 'Password updated.',
    'profile.passwordSame': 'The new password must be different from the current one.',
    'role.participant': 'Participant',
    'role.operator': 'Operator',

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

    // ---- Terms & Conditions --------------------------------------------
    // Rendered by terms.html. The version string lives in utils.js as
    // TERMS_VERSION; change it there whenever this text changes materially,
    // so that what a participant accepted stays identifiable afterwards.
    //
    // Section 10 is the Privacy Notice and runs to several paragraphs, so it
    // uses terms.s10.p1 … p7 rather than a single terms.s10.body. Which
    // sections do that is declared in TERMS_SECTION_PARAGRAPHS in utils.js.
    'terms.pageTitle': 'Terms & Conditions',
    'terms.heading': 'Terms & Conditions, Disclaimer and Privacy Notice',
    'terms.version': 'Version {version}',
    'terms.intro': 'These Terms & Conditions govern your access to and use of Jericho Platform, and include the Privacy Notice at section 10. By ticking the acceptance box and completing registration, you confirm that you have read, understood, and agree to be bound by them. If you do not agree, do not register and do not use the Platform.',
    'terms.placeholderNotice': 'PLACEHOLDER — THIS DOCUMENT IS NOT YET COMPLETE. The legal details of the operating company, in section 16 and in the Privacy Notice at section 10, are placeholders. They must be completed, and these Terms reviewed by a qualified lawyer, before the Platform is opened to real Participants.',
    'terms.back': 'Back',

    'terms.s1.title': '1. Nature of the Platform',
    'terms.s1.body': 'Jericho Platform is a facilitation service for professional participants in physical commodity markets. It allows Participants to publish anonymous Sell Offers and Buy Requests, and allows Operators to introduce potential counterparties to one another. The Platform is not an exchange, a broker-dealer, a public marketplace, a clearing house, or a payment service. No transaction is executed, matched, cleared, settled, financed, or guaranteed through the Platform, and the Operators are never a party to any contract formed between Participants.',

    'terms.s2.title': '2. A private, invitation-only platform',
    'terms.s2.body': 'Jericho Platform is a private, invitation-only facilitation platform. It is not a public marketplace. Membership is closed: listings are not published to the public, are not indexed or advertised, and no one may join by applying. Access is granted solely at the Operators\' discretion and may be suspended or revoked at any time without notice. Nothing in these Terms gives you a right to be admitted, a right to remain a Participant, or a right to be told the reason for any decision about your access.',

    'terms.s3.title': '3. Access and eligibility',
    'terms.s3.body': 'Access is by invitation only and requires Operator approval. You confirm that you are acting in a professional and business capacity, that you are authorised to act for any company you represent, and that the information you provide is accurate and kept up to date. You are responsible for keeping your credentials secure and for all activity carried out under your account.',

    'terms.s4.title': '4. No verification and no warranty',
    'terms.s4.body': 'The Operators do not verify, endorse, or guarantee any Participant, company, listing, quantity, specification, document, certificate, price, title, or ability to perform. All information on the Platform is supplied by Participants and is provided "as is" and "as available", without warranty of any kind, express or implied, including any implied warranty of accuracy, merchantability, fitness for a particular purpose, or non-infringement. The Operators do not warrant that the Platform will be uninterrupted, secure, or free from error.',

    'terms.s5.title': '5. Your own due diligence',
    'terms.s5.body': 'You are solely responsible for your own due diligence and for every commercial decision you make. This includes verifying the identity, standing, and creditworthiness of any counterparty; inspecting and verifying goods, documents, and certificates; satisfying your own compliance, sanctions, and anti-money-laundering obligations; and obtaining your own independent professional advice. An introduction made by an Operator is not a recommendation and carries no assurance of any kind.',

    'terms.s6.title': '6. No professional advice',
    'terms.s6.body': 'Nothing on the Platform, and nothing communicated by an Operator, constitutes financial, investment, legal, tax, accounting, or trading advice, nor an offer or solicitation to buy or sell anything. Information is provided for general business purposes only and must not be relied upon as a substitute for professional advice.',

    'terms.s7.title': '7. Anonymity and conduct',
    'terms.s7.body': 'Listings are anonymous by design. You must not attempt to identify, or to cause the identification of, any other Participant, whether directly, by inference, by combining information, or by any technical means. All contact between Participants must pass through an Operator; you must not attempt to contact another Participant directly or to circumvent the introduction process. You must not scrape, copy, resell, or redistribute content from the Platform, misrepresent yourself or the goods you offer, or use the Platform for any unlawful purpose.',

    'terms.s8.title': '8. Non-circumvention and commission',
    'terms.s8.body': 'The introductions made through the Platform are the Operators\' work and have commercial value. By accepting these Terms you agree that you will not bypass or circumvent the Operators, and will not attempt to deal directly with any counterparty introduced to you through the Platform, without the Operators\' involvement. This applies to the introduced counterparty and to its affiliates, employees, agents, and related companies, and applies regardless of which side makes the approach. You further agree that the Operators are entitled to the commission agreed between the parties during negotiation; that this commission is payable whenever a transaction results from an introduction made through the Platform, whether that transaction is concluded directly or through any intermediary; and that this obligation continues for twenty-four (24) months from the date the introduction is made. Concluding a transaction outside the Platform does not remove that entitlement.',

    'terms.s9.title': '9. Confidentiality',
    'terms.s9.body': 'Information you obtain through the Platform, including listings and messages, is confidential and is made available solely for the purpose of evaluating a potential transaction. You must not disclose it to any third party, or use it for any other purpose, without the prior written consent of the Operators.',

    'terms.s10.title': '10. Privacy Notice',
    'terms.s10.p1': 'This section explains what personal data the Operators hold about you, why they hold it, and who can see it. It applies to everyone who registers for or uses the Platform, and forms part of these Terms.',
    'terms.s10.p2': 'What is collected. When you accept an invitation and register, the Platform records your first name, last name, company, job title, country, telephone number, email address, your password in securely hashed form, and your language preference. As you use the Platform it records the listings you publish, the messages you send and receive, the document declarations you make about a listing, the searches and commodity watchlists you choose to save, the notifications generated for you, records of the emails the Platform sends you (including the recipient address, the content sent, and whether delivery succeeded), and activity records such as sign-ins, approvals, invitations, and the version and language of the Terms you accepted.',
    'terms.s10.p3': 'Why it is collected. This data is used to operate the Platform and for nothing else: to create and administer your account; to manage invitations and the approval of new Participants; to publish and display listings; to facilitate brokered introductions between Participants through an Operator; to communicate with you about your account and about activity relevant to you; to keep the Platform secure and to detect misuse; and to maintain an audit trail of what was done, by whom, and when.',
    'terms.s10.p4': 'Who can see it. Your identity and contact details are visible only to the Operators. Participants never see one another\'s identity: listings are published anonymously, and every message between Participants passes through an Operator, who decides what is passed on. No other Participant is shown your name, company, country, telephone number, or email address through the Platform. There is one exception, and it only happens with your agreement. Where the Operators consider that two Participants should deal with one another, they will ask each of you separately whether you agree to be introduced. If, and only if, both of you agree, the Operators will disclose each party\'s identity and contact details to the other so that you can deal directly. That introduction is made by email, outside the Platform. You are always asked first and you may decline, and until you agree the anonymity described above continues to apply.',
    'terms.s10.p5': 'Your data is not sold, rented, or traded, and it is not shared with third parties for their own purposes. It is disclosed only to the service providers used to run the Platform itself - hosting, database, and email delivery - which act on the Operators\' instructions, and where the Operators are required to disclose it by law or need to do so to establish, exercise, or defend a legal claim.',
    'terms.s10.p6': 'How long it is kept. Data is retained only for as long as it is needed to operate the Platform and to protect the Operators\' legal position, after which it is deleted or anonymised. Records that exist to evidence what was agreed - your acceptance of these Terms, and the audit trail of introductions made - are kept for as long as a claim arising from them could still be brought.',
    'terms.s10.p7': 'Operator access. The Operators may access all data held on the Platform, including listings, messages, and account details, for the purposes of brokerage and of security. This is inherent in how the Platform works: an Operator cannot introduce two Participants, or keep them anonymous to one another, without seeing what both have published and written.',
    'terms.s10.p8': 'Data controller. The controller responsible for your personal data is [PLACEHOLDER — data controller legal name], of [PLACEHOLDER — data controller registered address]. Questions about your data, and requests to access, correct, or delete it, should be sent to [PLACEHOLDER — data protection contact email address].',
    'terms.s10.p9': 'Complaints. If you believe your personal data has not been handled properly, you may raise it with the Operators using the contact details above, and you may complain to the competent supervisory authority, [PLACEHOLDER — competent data protection supervisory authority], at [PLACEHOLDER — supervisory authority address and contact details].',

    'terms.s11.title': '11. Limitation of liability',
    'terms.s11.body': 'To the fullest extent permitted by law, neither the Platform nor the Operators are liable for any loss or damage of any kind arising out of or in connection with your use of the Platform or with any dealing between Participants. This includes, without limitation, financial loss, loss of profit, loss of opportunity, loss of goodwill, business interruption, loss arising from a transaction that does not complete or completes on unfavourable terms, and loss caused by the act, omission, misrepresentation, default, insolvency, or fraud of any Participant or third party. The Operators are not liable for any indirect or consequential loss. Nothing in these Terms excludes or limits any liability that cannot lawfully be excluded or limited, including liability for fraud or for death or personal injury caused by negligence.',

    'terms.s12.title': '12. Disputes between Participants',
    'terms.s12.body': 'Any dispute between Participants is solely a matter between those Participants. The Operators are not a party to it, are under no obligation to investigate, mediate, arbitrate, or resolve it, and accept no responsibility for its outcome. You release the Operators from all claims arising out of any such dispute.',

    'terms.s13.title': '13. Suspension and withdrawal of access',
    'terms.s13.body': 'The Operators may suspend, restrict, or withdraw your access to the Platform at any time, at their sole discretion, with or without notice and without being required to give reasons, including where they consider that these Terms have been breached or that continued access presents a risk to other Participants. Access to the Platform is a privilege and not a right, and confers no ownership interest or entitlement.',

    'terms.s14.title': '14. Changes to these Terms',
    'terms.s14.body': 'The Operators may amend these Terms from time to time. Where an amendment is material, you will be asked to accept the updated version before continuing to use the Platform. Your continued use of the Platform after an amendment takes effect constitutes acceptance of it.',

    'terms.s15.title': '15. Governing law and jurisdiction',
    'terms.s15.body': 'These Terms, and any dispute or claim arising out of or in connection with them or their subject matter (including non-contractual disputes or claims), are governed by English law. The parties submit to the exclusive jurisdiction of the courts of England and Wales.',

    // Section 16 carries the operating company's identity. Every value in it is
    // a PLACEHOLDER: the company does not exist on paper yet, and a document
    // that chooses English law and claims a commission has to say who is
    // claiming it. The placeholders are written into the rendered text on
    // purpose rather than left blank - a blank reads as finished, and this is
    // not finished. See terms.placeholderNotice, shown above section 1.
    'terms.s16.title': '16. The Operators: company details and notices',
    'terms.s16.p1': 'The Platform is operated by [PLACEHOLDER — operating company legal name] ("the Operators"), a company incorporated in [PLACEHOLDER — country of incorporation] under company registration number [PLACEHOLDER — company registration number].',
    'terms.s16.p2': 'Registered office: [PLACEHOLDER — registered office address].',
    'terms.s16.p3': 'Trading address, where different from the registered office: [PLACEHOLDER — trading address].',
    'terms.s16.p4': 'VAT or tax registration number: [PLACEHOLDER — VAT or tax registration number].',
    'terms.s16.p5': 'Notices under these Terms must be given in writing to [PLACEHOLDER — legal notices email address] and to the registered office above, and take effect on receipt.',
    'terms.s16.p6': 'None of the details in this section has been completed. They are placeholders, and they must be replaced with the actual details of the operating company — and these Terms, including the non-circumvention clause at section 8 and the choice of English law at section 15, reviewed by a qualified lawyer — before the Platform is used with real Participants.',

    // ---- Acceptance at registration -------------------------------------
    'register.terms.accept': 'I have read and accept the',
    'register.terms.link': 'Terms & Conditions',
    'register.terms.suffix': '.',
    'register.terms.required': 'You must read and accept the Terms & Conditions before registering.',
    'app.footer.terms': 'Terms & Conditions',
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
    'listings.staleNotice': 'Hace {days} días que no actualiza esta publicación. ¿Sigue disponible?',
    'listings.stillAvailable': 'Sí, sigue disponible',
    'listings.closeIt': 'No, ciérrela',
    'listings.renewed': 'Publicación confirmada como vigente.',
    'listings.closed': 'Publicación cerrada.',
    'export.title': 'Su actividad',
    'export.intro': 'Descargue todo lo que ha hecho en la Plataforma —sus publicaciones, sus mensajes, las solicitudes de documentos y sus respuestas, y los cambios en su cuenta— en un archivo de hoja de cálculo.',
    'export.download': 'Descargar CSV',
    'export.empty': 'Todavía no hay nada que exportar.',
    'export.done': 'Exportación descargada.',
    'export.colDate': 'Fecha',
    'export.colCategory': 'Qué',
    'export.colReference': 'Publicación',
    'export.colDetail': 'Detalle',
    'export.colStatus': 'Estado',
    'export.cat.listing': 'Publicación creada',
    'export.cat.message_sent': 'Mensaje enviado',
    'export.cat.message_received': 'Mensaje recibido',
    'export.cat.document_request': 'Documento solicitado',
    'export.cat.document_response': 'Documento respondido',
    'export.cat.profile_change': 'Cambio en la cuenta',
    'saved.title': 'Búsquedas guardadas y seguimiento',
    'saved.addFromBrowse': 'Guardar una desde Explorar',
    'saved.save': 'Guardar esta búsqueda',
    'saved.saved': 'Búsqueda guardada.',
    'saved.removed': 'Búsqueda eliminada.',
    'saved.remove': 'Eliminar',
    'saved.open': 'Abrir',
    'saved.none': 'Todavía no hay nada guardado. Ajuste en Explorar los filtros que le interesen y guárdelos, o guarde una sola materia prima para hacerle seguimiento.',
    'saved.everything': 'Todas las publicaciones',
    'saved.matches': '{count} coincidencias',
    'saved.duplicate': 'Ya tiene guardada esa búsqueda.',
    'profile.title': 'Perfil',
    'profile.save': 'Guardar perfil',
    'profile.saved': 'Perfil actualizado.',
    'profile.phone': 'Teléfono',
    'profile.jobTitle': 'Cargo o puesto',
    'profile.language': 'Idioma',
    'profile.languageHint': 'Cambia la interfaz de inmediato, así como el idioma de sus correos de notificación.',
    'profile.role': 'Rol',
    'profile.status': 'Estado',
    'profile.roleLocked': 'Su rol y su estado los establece un Operador y no pueden modificarse aquí.',
    'profile.emailSection': 'Correo electrónico',
    'profile.currentEmail': 'Correo actual',
    'profile.newEmail': 'Nuevo correo electrónico',
    'profile.currentPassword': 'Contraseña actual',
    'profile.emailHint': 'Con esta dirección inicia sesión: para cambiarla necesita su contraseña actual, y la nueva dirección debe confirmar el cambio.',
    'profile.changeEmail': 'Cambiar correo',
    'profile.emailPending': 'Se ha enviado un enlace de confirmación a la nueva dirección. El cambio se aplica cuando lo siga; hasta entonces, inicie sesión con su dirección actual.',
    'profile.emailUnchanged': 'Esa ya es su dirección de correo electrónico.',
    'profile.wrongPassword': 'Esa no es su contraseña actual.',
    'profile.changePassword': 'Cambiar contraseña',
    'profile.newPassword': 'Nueva contraseña',
    'profile.updatePassword': 'Actualizar contraseña',
    'profile.passwordUpdated': 'Contraseña actualizada.',
    'profile.passwordSame': 'La nueva contraseña debe ser distinta de la actual.',
    'role.participant': 'Participante',
    'role.operator': 'Operador',

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

    // ---- Términos y Condiciones -----------------------------------------
    // Redactado en español jurídico-comercial, no traducido palabra por
    // palabra. «Publicación» para listing, «diligencia debida» para due
    // diligence, «contraparte» para counterparty, «presentación» para la
    // introduction que realiza un Operador.
    'terms.pageTitle': 'Términos y Condiciones',
    'terms.heading': 'Términos y Condiciones, Exención de Responsabilidad y Aviso de Privacidad',
    'terms.version': 'Versión {version}',
    'terms.intro': 'Estos Términos y Condiciones regulan su acceso y uso de Jericho Platform, e incluyen el Aviso de Privacidad recogido en el apartado 10. Al marcar la casilla de aceptación y completar el registro, usted confirma que los ha leído, los ha comprendido y acepta quedar vinculado por ellos. Si no está de acuerdo, no se registre ni utilice la Plataforma.',
    'terms.placeholderNotice': 'PLACEHOLDER — ESTE DOCUMENTO AÚN NO ESTÁ COMPLETO. Los datos legales de la empresa operadora, recogidos en el apartado 16 y en el Aviso de Privacidad del apartado 10, son PLACEHOLDER. Deben completarse, y estos Términos ser revisados por un abogado, antes de abrir la Plataforma a Participantes reales.',
    'terms.back': 'Volver',

    'terms.s1.title': '1. Naturaleza de la Plataforma',
    'terms.s1.body': 'Jericho Platform es un servicio de facilitación dirigido a profesionales del mercado físico de materias primas. Permite a los Participantes publicar Ofertas de Venta y Solicitudes de Compra anónimas, y permite a los Operadores poner en contacto a posibles contrapartes. La Plataforma no es un mercado organizado, una sociedad de valores, un mercado público, una cámara de compensación ni un servicio de pagos. A través de la Plataforma no se ejecuta, casa, compensa, liquida, financia ni garantiza ninguna operación, y los Operadores no son en ningún caso parte de los contratos que se celebren entre Participantes.',

    'terms.s2.title': '2. Plataforma privada y de acceso exclusivo por invitación',
    'terms.s2.body': 'Jericho Platform es una plataforma privada de facilitación, de acceso exclusivo por invitación. No es un mercado público. El acceso se concede exclusivamente a discreción de los Operadores y podrá suspenderse o revocarse en cualquier momento sin previo aviso. El acceso es cerrado: las publicaciones no se difunden al público ni se indexan o publicitan, y no es posible incorporarse a la Plataforma mediante solicitud. Nada en estos Términos le confiere derecho a ser admitido, a permanecer como Participante ni a conocer los motivos de cualquier decisión relativa a su acceso.',

    'terms.s3.title': '3. Acceso y requisitos',
    'terms.s3.body': 'El acceso se realiza únicamente por invitación y requiere la aprobación de un Operador. Usted confirma que actúa en calidad profesional y empresarial, que está autorizado para actuar en nombre de la empresa que represente y que la información que facilita es veraz y se mantiene actualizada. Usted es responsable de la custodia de sus credenciales y de toda actividad realizada desde su cuenta.',

    'terms.s4.title': '4. Ausencia de verificación y de garantía',
    'terms.s4.body': 'Los Operadores no verifican, avalan ni garantizan a ningún Participante, empresa, publicación, cantidad, especificación, documento, certificado, precio, titularidad ni capacidad de cumplimiento. Toda la información de la Plataforma procede de los Participantes y se ofrece «tal cual» y «según disponibilidad», sin garantía de ningún tipo, expresa o implícita, incluidas las garantías implícitas de exactitud, comerciabilidad, idoneidad para un fin determinado o no infracción. Los Operadores no garantizan que la Plataforma funcione de forma ininterrumpida, segura o libre de errores.',

    'terms.s5.title': '5. Diligencia debida propia',
    'terms.s5.body': 'Usted es el único responsable de su propia diligencia debida y de cada decisión comercial que adopte. Ello incluye verificar la identidad, la solvencia y la reputación de cualquier contraparte; inspeccionar y comprobar la mercancía, los documentos y los certificados; cumplir sus propias obligaciones en materia de cumplimiento normativo, sanciones y prevención del blanqueo de capitales; y obtener asesoramiento profesional independiente. La presentación realizada por un Operador no constituye una recomendación ni comporta garantía alguna.',

    'terms.s6.title': '6. Ausencia de asesoramiento profesional',
    'terms.s6.body': 'Nada de lo contenido en la Plataforma, ni ninguna comunicación de un Operador, constituye asesoramiento financiero, de inversión, jurídico, fiscal, contable o de negociación, ni una oferta o invitación a comprar o vender. La información se facilita con fines empresariales generales y no debe utilizarse como sustituto del asesoramiento profesional.',

    'terms.s7.title': '7. Anonimato y conducta',
    'terms.s7.body': 'Las publicaciones son anónimas por diseño. Usted no debe intentar identificar, ni provocar la identificación, de ningún otro Participante, ya sea de forma directa, por inferencia, mediante la combinación de información o por cualquier medio técnico. Todo contacto entre Participantes debe canalizarse a través de un Operador; usted no debe intentar contactar directamente con otro Participante ni eludir el proceso de presentación. Tampoco debe extraer, copiar, revender ni redistribuir contenidos de la Plataforma, falsear su identidad o la mercancía que ofrece, ni utilizar la Plataforma con fines ilícitos.',

    'terms.s8.title': '8. No elusión y comisión',
    'terms.s8.body': 'Las presentaciones realizadas a través de la Plataforma son fruto del trabajo de los Operadores y tienen valor comercial. Al aceptar estos Términos, usted se compromete a no eludir ni prescindir de los Operadores, y a no intentar negociar directamente con ninguna contraparte que le haya sido presentada a través de la Plataforma, sin la intervención de los Operadores. Esta obligación alcanza tanto a la contraparte presentada como a sus filiales, empleados, agentes y sociedades vinculadas, y se aplica con independencia de cuál de las partes tome la iniciativa del contacto. Asimismo, usted reconoce que los Operadores tienen derecho a la comisión acordada entre las partes durante la negociación; que dicha comisión será exigible siempre que una operación resulte de una presentación realizada a través de la Plataforma, ya se cierre de forma directa o por medio de cualquier intermediario; y que esta obligación se mantiene durante veinticuatro (24) meses desde la fecha en que se realice la presentación. Cerrar una operación al margen de la Plataforma no extingue ese derecho.',

    'terms.s9.title': '9. Confidencialidad',
    'terms.s9.body': 'La información que obtenga a través de la Plataforma, incluidas las publicaciones y los mensajes, tiene carácter confidencial y se facilita con el único fin de evaluar una posible operación. Usted no debe revelarla a terceros ni utilizarla para ningún otro fin sin el consentimiento previo y por escrito de los Operadores.',

    'terms.s10.title': '10. Aviso de Privacidad',
    'terms.s10.p1': 'Este apartado explica qué datos personales tratan los Operadores, con qué finalidad y quién puede acceder a ellos. Se aplica a toda persona que se registre en la Plataforma o la utilice, y forma parte integrante de estos Términos.',
    'terms.s10.p2': 'Datos que se recogen. Al aceptar una invitación y registrarse, la Plataforma recoge su nombre, sus apellidos, su empresa, su cargo, su país, su teléfono, su correo electrónico, su contraseña almacenada de forma cifrada e irreversible (hash) y su preferencia de idioma. Durante el uso de la Plataforma se registran, además, las publicaciones que difunde, los mensajes que envía y recibe, las declaraciones documentales que realiza sobre cada publicación, las búsquedas y listas de seguimiento de materias primas que decida guardar, las notificaciones que se generan para usted, el registro de los correos que la Plataforma le envía (incluidos la dirección de destino, el contenido remitido y si la entrega se produjo) y los registros de actividad, como inicios de sesión, aprobaciones, invitaciones y la versión y el idioma de los Términos que aceptó.',
    'terms.s10.p3': 'Finalidad. Estos datos se utilizan para operar la Plataforma y para nada más: crear y administrar su cuenta; gestionar las invitaciones y la aprobación de nuevos Participantes; publicar y mostrar las publicaciones; facilitar las presentaciones intermediadas entre Participantes a través de un Operador; comunicarse con usted en relación con su cuenta y con la actividad que le afecte; preservar la seguridad de la Plataforma y detectar usos indebidos; y mantener una traza de auditoría de qué se hizo, quién lo hizo y cuándo.',
    'terms.s10.p4': 'Quién puede verlos. Su identidad y sus datos de contacto solo son visibles para los Operadores. Los Participantes nunca conocen la identidad de los demás: las publicaciones se difunden de forma anónima y todo mensaje entre Participantes pasa por un Operador, que decide qué se traslada. Ningún otro Participante ve su nombre, su empresa, su país, su teléfono ni su correo electrónico a través de la Plataforma. Existe una única excepción, y solo se produce con su consentimiento. Cuando los Operadores consideren que dos Participantes deben tratar entre sí, preguntarán a cada uno por separado si acepta ser presentado. Si, y solo si, ambos aceptan, los Operadores comunicarán a cada parte la identidad y los datos de contacto de la otra para que puedan tratar directamente. Esa presentación se realiza por correo electrónico, fuera de la Plataforma. Siempre se le pregunta antes y usted puede negarse; hasta que lo acepte, sigue rigiendo el anonimato descrito más arriba.',
    'terms.s10.p5': 'Sus datos no se venden, alquilan ni ceden con fines comerciales, ni se comparten con terceros para finalidades propias de estos. Únicamente se comunican a los proveedores necesarios para el funcionamiento de la propia Plataforma —alojamiento, base de datos y envío de correo—, que actúan siguiendo las instrucciones de los Operadores, así como cuando exista obligación legal de comunicarlos o resulte necesario para formular, ejercer o defender reclamaciones.',
    'terms.s10.p6': 'Plazo de conservación. Los datos se conservan únicamente durante el tiempo necesario para operar la Plataforma y proteger la posición jurídica de los Operadores, transcurrido el cual se suprimen o se anonimizan. Los registros que acreditan lo acordado —su aceptación de estos Términos y la traza de las presentaciones realizadas— se conservan mientras pueda ejercitarse una reclamación derivada de ellos.',
    'terms.s10.p7': 'Acceso de los Operadores. Los Operadores podrán acceder a todos los datos alojados en la Plataforma, incluidas las publicaciones, los mensajes y los datos de cuenta, con fines de intermediación y de seguridad. Ello es inherente al funcionamiento de la Plataforma: un Operador no puede poner en contacto a dos Participantes, ni mantener su anonimato recíproco, sin conocer lo que ambos han publicado y escrito.',
    'terms.s10.p8': 'Responsable del tratamiento. El responsable del tratamiento de sus datos personales es [PLACEHOLDER — razón social del responsable del tratamiento], con domicilio en [PLACEHOLDER — domicilio del responsable del tratamiento]. Las consultas sobre sus datos, así como las solicitudes de acceso, rectificación o supresión, deben dirigirse a [PLACEHOLDER — dirección de correo electrónico de protección de datos].',
    'terms.s10.p9': 'Reclamaciones. Si considera que sus datos personales no han sido tratados correctamente, puede comunicarlo a los Operadores en la dirección indicada más arriba y presentar una reclamación ante la autoridad de control competente, [PLACEHOLDER — autoridad de control de protección de datos competente], en [PLACEHOLDER — dirección y datos de contacto de la autoridad de control].',

    'terms.s11.title': '11. Limitación de responsabilidad',
    'terms.s11.body': 'En la máxima medida permitida por la ley, ni la Plataforma ni los Operadores responderán por pérdidas o daños de cualquier naturaleza derivados del uso de la Plataforma o de cualquier relación entre Participantes. Ello incluye, sin carácter limitativo, pérdidas económicas, lucro cesante, pérdida de oportunidad, daño reputacional, interrupción de la actividad, pérdidas derivadas de operaciones que no lleguen a perfeccionarse o que se cierren en condiciones desfavorables, y pérdidas causadas por actos, omisiones, declaraciones inexactas, incumplimiento, insolvencia o fraude de cualquier Participante o tercero. Los Operadores no responderán por daños indirectos o consecuenciales. Nada en estos Términos excluye ni limita la responsabilidad que no pueda excluirse o limitarse legalmente, incluida la derivada de dolo o de fallecimiento o daños personales causados por negligencia.',

    'terms.s12.title': '12. Controversias entre Participantes',
    'terms.s12.body': 'Cualquier controversia entre Participantes concierne exclusivamente a estos. Los Operadores no son parte en ella, no están obligados a investigarla, mediar, arbitrar ni resolverla, y no asumen responsabilidad alguna por su resultado. Usted exonera a los Operadores de toda reclamación derivada de dichas controversias.',

    'terms.s13.title': '13. Suspensión y retirada del acceso',
    'terms.s13.body': 'Los Operadores podrán suspender, restringir o retirar su acceso a la Plataforma en cualquier momento, a su exclusiva discreción, con o sin preaviso y sin necesidad de motivación, incluso cuando consideren que se han incumplido estos Términos o que el mantenimiento del acceso supone un riesgo para otros Participantes. El acceso a la Plataforma es una facultad concedida y no un derecho adquirido, y no confiere titularidad ni derecho alguno.',

    'terms.s14.title': '14. Modificación de estos Términos',
    'terms.s14.body': 'Los Operadores podrán modificar estos Términos en cualquier momento. Cuando la modificación sea sustancial, se le solicitará que acepte la versión actualizada antes de continuar utilizando la Plataforma. El uso continuado de la Plataforma tras la entrada en vigor de una modificación implica su aceptación.',

    'terms.s15.title': '15. Legislación aplicable y jurisdicción',
    'terms.s15.body': 'Estos Términos, así como cualquier controversia o reclamación derivada de ellos o de su objeto, incluidas las de naturaleza extracontractual, se rigen por el Derecho inglés. Las partes se someten a la jurisdicción exclusiva de los tribunales de Inglaterra y Gales.',

    // Igual que en inglés: todos los valores del apartado 16 son PLACEHOLDER.
    'terms.s16.title': '16. Los Operadores: datos de la sociedad y notificaciones',
    'terms.s16.p1': 'La Plataforma está operada por [PLACEHOLDER — razón social de la empresa operadora] («los Operadores»), sociedad constituida en [PLACEHOLDER — país de constitución] con número de registro mercantil [PLACEHOLDER — número de registro mercantil].',
    'terms.s16.p2': 'Domicilio social: [PLACEHOLDER — domicilio social].',
    'terms.s16.p3': 'Domicilio de actividad, si difiere del domicilio social: [PLACEHOLDER — domicilio de actividad].',
    'terms.s16.p4': 'Número de identificación fiscal o de IVA: [PLACEHOLDER — número de identificación fiscal o de IVA].',
    'terms.s16.p5': 'Las notificaciones previstas en estos Términos deberán realizarse por escrito a [PLACEHOLDER — dirección de correo electrónico para notificaciones legales] y al domicilio social indicado, y surtirán efecto en el momento de su recepción.',
    'terms.s16.p6': 'Ninguno de los datos de este apartado ha sido completado. Son PLACEHOLDER y deben sustituirse por los datos reales de la empresa operadora —y estos Términos, incluidas la cláusula de no elusión del apartado 8 y la elección del Derecho inglés del apartado 15, ser revisados por un abogado— antes de utilizar la Plataforma con Participantes reales.',

    // ---- Aceptación en el registro --------------------------------------
    'register.terms.accept': 'He leído y acepto los',
    'register.terms.link': 'Términos y Condiciones',
    'register.terms.suffix': '.',
    'register.terms.required': 'Debe leer y aceptar los Términos y Condiciones antes de registrarse.',
    'app.footer.terms': 'Términos y Condiciones',
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
