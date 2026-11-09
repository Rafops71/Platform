-- Revert 059: put the old name back in the 12 template rows 059 changed.
--
-- A row goes back only if it still holds EXACTLY the text 059 wrote. A template
-- somebody has edited since is left as it is, with a NOTICE, so this never
-- overwrites a newer wording. Nothing else is touched.

begin;

do $revert$
declare
  r record;
  n integer;
begin
  for r in
    select * from (values
  ($t$invitation$t$, $t$en$t$,
   $t$You have been invited to MyPlatform$t$,
   $t$You have been invited to join MyPlatform.

Use this link to create your account:
{{link}}

The link is valid for 5 days and can only be used once.

Once you register, an operator reviews your application and you will be emailed when it is approved.$t$,
   $t$You have been invited to the Jericho Platform$t$,
   $t$You have been invited to join the Jericho Platform.

Use this link to create your account:
{{link}}

The link is valid for 5 days and can only be used once.

Once you register, an operator reviews your application and you will be emailed when it is approved.$t$),
  ($t$invitation$t$, $t$es$t$,
   $t$Le han invitado a MyPlatform$t$,
   $t$Le han invitado a unirse a MyPlatform.

Utilice este enlace para crear su cuenta:
{{link}}

El enlace es válido durante 5 días y solo puede utilizarse una vez.

Una vez que se registre, un operador revisará su solicitud y recibirá un correo cuando sea aprobada.$t$,
   $t$Le han invitado a la Plataforma Jericho$t$,
   $t$Le han invitado a unirse a la Plataforma Jericho.

Utilice este enlace para crear su cuenta:
{{link}}

El enlace es válido durante 5 días y solo puede utilizarse una vez.

Una vez que se registre, un operador revisará su solicitud y recibirá un correo cuando sea aprobada.$t$),
  ($t$invitation_recommended$t$, $t$en$t$,
   $t$You have been invited to MyPlatform$t$,
   $t$Dear {{candidate_name}},
{{referrer_name}} has recommended you as a prospective member of MyPlatform, a private, invitation-only marketplace for physical commodities. We are pleased to invite you to join.
To register, please use your personal link below. It is valid for five days and can be used once.
{{link}}
Yours sincerely,
The Operator, MyPlatform
Privacy Notice: {{privacy_link}}$t$,
   $t$You have been invited to the Jericho Platform$t$,
   $t$Dear {{candidate_name}},
{{referrer_name}} has recommended you as a prospective member of MyPlatform, a private, invitation-only marketplace for physical commodities. We are pleased to invite you to join.
To register, please use your personal link below. It is valid for five days and can be used once.
{{link}}
Yours sincerely,
The Operator, MyPlatform
Privacy Notice: {{privacy_link}}$t$),
  ($t$invitation_recommended$t$, $t$es$t$,
   $t$Le han invitado a MyPlatform$t$,
   $t$Estimado/a {{candidate_name}},
{{referrer_name}} le ha recomendado como posible miembro de MyPlatform, un mercado privado y solo por invitación para materias primas físicas. Nos complace invitarle a unirse.
Para registrarse, utilice su enlace personal que figura a continuación. Es válido durante cinco días y solo puede utilizarse una vez.
{{link}}
Atentamente,
El Operador, MyPlatform
Aviso de privacidad: {{privacy_link}}$t$,
   $t$Le han invitado a la Plataforma Jericho$t$,
   $t$Estimado/a {{candidate_name}},
{{referrer_name}} le ha recomendado como posible miembro de MyPlatform, un mercado privado y solo por invitación para materias primas físicas. Nos complace invitarle a unirse.
Para registrarse, utilice su enlace personal que figura a continuación. Es válido durante cinco días y solo puede utilizarse una vez.
{{link}}
Atentamente,
El Operador, MyPlatform
Aviso de privacidad: {{privacy_link}}$t$),
  ($t$new_listing$t$, $t$en$t$,
   $t$New {{kind}} — {{commodity}} ({{ref}})$t$,
   $t$A new {{kind}} was posted on MyPlatform.

Reference: {{ref}}
Type: {{kind}}
Commodity: {{commodity}}
Quantity: {{quantity}} {{unit}}
Specification: {{spec}}
Incoterm: {{incoterm}}
{{origin_line}}
Price / Conditions: {{price}}
Notes: {{notes}}
Documents available: {{docs}}

This listing is posted anonymously — sign in to the platform to respond via the mailbox.$t$,
   $t$New {{kind}} — {{commodity}} ({{ref}})$t$,
   $t$A new {{kind}} was posted on the Jericho Platform.

Reference: {{ref}}
Type: {{kind}}
Commodity: {{commodity}}
Quantity: {{quantity}} {{unit}}
Specification: {{spec}}
Incoterm: {{incoterm}}
{{origin_line}}
Price / Conditions: {{price}}
Notes: {{notes}}
Documents available: {{docs}}

This listing is posted anonymously — sign in to the platform to respond via the mailbox.$t$),
  ($t$new_listing$t$, $t$es$t$,
   $t$Nueva {{kind}} — {{commodity}} ({{ref}})$t$,
   $t$Se ha publicado una nueva {{kind}} en MyPlatform.

Referencia: {{ref}}
Tipo: {{kind}}
Materia prima: {{commodity}}
Cantidad: {{quantity}} {{unit}}
Especificación / grado: {{spec}}
Incoterm: {{incoterm}}
{{origin_line}}
Precio / condiciones: {{price}}
Observaciones: {{notes}}
Documentos disponibles: {{docs}}

Esta publicación es anónima: inicie sesión en la plataforma para responder a través del buzón.$t$,
   $t$Nueva {{kind}} — {{commodity}} ({{ref}})$t$,
   $t$Se ha publicado una nueva {{kind}} en la Plataforma Jericho.

Referencia: {{ref}}
Tipo: {{kind}}
Materia prima: {{commodity}}
Cantidad: {{quantity}} {{unit}}
Especificación / grado: {{spec}}
Incoterm: {{incoterm}}
{{origin_line}}
Precio / condiciones: {{price}}
Observaciones: {{notes}}
Documentos disponibles: {{docs}}

Esta publicación es anónima: inicie sesión en la plataforma para responder a través del buzón.$t$),
  ($t$registration_approved$t$, $t$en$t$,
   $t$Your MyPlatform registration has been approved$t$,
   $t$Hello {{first_name}},

Good news — your registration for MyPlatform has been approved.

You can now sign in and start posting and browsing listings.$t$,
   $t$Your Jericho Platform registration has been approved$t$,
   $t$Hello {{first_name}},

Good news — your registration for the Jericho Platform has been approved.

You can now sign in and start posting and browsing listings.$t$),
  ($t$registration_approved$t$, $t$es$t$,
   $t$Su registro en MyPlatform ha sido aprobado$t$,
   $t$Hola {{first_name}}:

Buenas noticias: su registro en MyPlatform ha sido aprobado.

Ya puede iniciar sesión y comenzar a publicar y consultar publicaciones.$t$,
   $t$Su registro en la Plataforma Jericho ha sido aprobado$t$,
   $t$Hola {{first_name}}:

Buenas noticias: su registro en la Plataforma Jericho ha sido aprobado.

Ya puede iniciar sesión y comenzar a publicar y consultar publicaciones.$t$),
  ($t$registration_rejected$t$, $t$en$t$,
   $t$Your MyPlatform registration was not approved$t$,
   $t$Hello {{first_name}},

Thank you for your interest in MyPlatform. After review, your registration has not been approved and your account will not be activated.

If you believe this was a mistake, please reply to the operator who invited you.$t$,
   $t$Your Jericho Platform registration was not approved$t$,
   $t$Hello {{first_name}},

Thank you for your interest in the Jericho Platform. After review, your registration has not been approved and your account will not be activated.

If you believe this was a mistake, please reply to the operator who invited you.$t$),
  ($t$registration_rejected$t$, $t$es$t$,
   $t$Su registro en MyPlatform no ha sido aprobado$t$,
   $t$Hola {{first_name}}:

Gracias por su interés en MyPlatform. Tras la revisión, su registro no ha sido aprobado y su cuenta no será activada.

Si cree que se trata de un error, responda al operador que le invitó.$t$,
   $t$Su registro en la Plataforma Jericho no ha sido aprobado$t$,
   $t$Hola {{first_name}}:

Gracias por su interés en la Plataforma Jericho. Tras la revisión, su registro no ha sido aprobado y su cuenta no será activada.

Si cree que se trata de un error, responda al operador que le invitó.$t$),
  ($t$registration_submitted$t$, $t$en$t$,
   $t$Your MyPlatform registration has been submitted$t$,
   $t$Hello {{first_name}},

Thank you — your registration for MyPlatform has been received and is now awaiting review by an operator.

You will receive another email once a decision has been made. You will not be able to sign in until your account is approved.$t$,
   $t$Your Jericho Platform registration has been submitted$t$,
   $t$Hello {{first_name}},

Thank you — your registration for the Jericho Platform has been received and is now awaiting review by an operator.

You will receive another email once a decision has been made. You will not be able to sign in until your account is approved.$t$),
  ($t$registration_submitted$t$, $t$es$t$,
   $t$Hemos recibido su registro en MyPlatform$t$,
   $t$Hola {{first_name}}:

Gracias. Hemos recibido su registro en MyPlatform y queda pendiente de revisión por un operador.

Recibirá otro correo cuando se haya tomado una decisión. No podrá iniciar sesión hasta que su cuenta sea aprobada.$t$,
   $t$Hemos recibido su registro en la Plataforma Jericho$t$,
   $t$Hola {{first_name}}:

Gracias. Hemos recibido su registro en la Plataforma Jericho y queda pendiente de revisión por un operador.

Recibirá otro correo cuando se haya tomado una decisión. No podrá iniciar sesión hasta que su cuenta sea aprobada.$t$)
    ) as v(template_key, lang, new_subject, new_body, old_subject, old_body)
  loop
    update public.email_templates t
       set subject = r.old_subject, body_text = r.old_body
     where t.template_key = r.template_key and t.lang = r.lang
       and t.subject = r.new_subject and t.body_text = r.new_body;
    get diagnostics n = row_count;
    if n = 0 and exists (select 1 from public.email_templates t
                          where t.template_key = r.template_key and t.lang = r.lang
                            and not (t.subject = r.old_subject and t.body_text = r.old_body)) then
      raise notice 'template %/% was edited after 059 and is left as it is', r.template_key, r.lang;
    end if;
  end loop;
end
$revert$;

commit;
