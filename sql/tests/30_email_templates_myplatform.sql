-- 30_email_templates_myplatform.sql
--
-- Proves sql/059 and its revert (owner's decision 2026-11-09: the stored email
-- templates say "MyPlatform", not "Jericho"):
--   * after the migration no template, in any language, carries the old name;
--   * the 12 rows that carried it hold exactly the agreed new text;
--   * the revert puts back exactly the old text (so the change is only the name);
--   * every other template row, and the one body that never carried the name, is
--     byte-for-byte the same before and after;
--   * applying the migration again changes nothing (idempotent), and the revert
--     leaves a row edited since alone.
-- The revert and the migration are run from their own files (\i), not from a copy.
-- The file ends with the migration applied, as the rest of the suite expects.

\set QUIET on
\pset pager off

\echo
\echo '=========== EMAIL TEMPLATES SAY MYPLATFORM ==========='

create temp table t30_old(template_key text, lang text, subject text, body_text text);
insert into t30_old values
  ($t$invitation$t$, $t$en$t$, $t$You have been invited to the Jericho Platform$t$, $t$You have been invited to join the Jericho Platform.

Use this link to create your account:
{{link}}

The link is valid for 5 days and can only be used once.

Once you register, an operator reviews your application and you will be emailed when it is approved.$t$),
  ($t$invitation$t$, $t$es$t$, $t$Le han invitado a la Plataforma Jericho$t$, $t$Le han invitado a unirse a la Plataforma Jericho.

Utilice este enlace para crear su cuenta:
{{link}}

El enlace es válido durante 5 días y solo puede utilizarse una vez.

Una vez que se registre, un operador revisará su solicitud y recibirá un correo cuando sea aprobada.$t$),
  ($t$invitation_recommended$t$, $t$en$t$, $t$You have been invited to the Jericho Platform$t$, $t$Dear {{candidate_name}},
{{referrer_name}} has recommended you as a prospective member of MyPlatform, a private, invitation-only marketplace for physical commodities. We are pleased to invite you to join.
To register, please use your personal link below. It is valid for five days and can be used once.
{{link}}
Yours sincerely,
The Operator, MyPlatform
Privacy Notice: {{privacy_link}}$t$),
  ($t$invitation_recommended$t$, $t$es$t$, $t$Le han invitado a la Plataforma Jericho$t$, $t$Estimado/a {{candidate_name}},
{{referrer_name}} le ha recomendado como posible miembro de MyPlatform, un mercado privado y solo por invitación para materias primas físicas. Nos complace invitarle a unirse.
Para registrarse, utilice su enlace personal que figura a continuación. Es válido durante cinco días y solo puede utilizarse una vez.
{{link}}
Atentamente,
El Operador, MyPlatform
Aviso de privacidad: {{privacy_link}}$t$),
  ($t$new_listing$t$, $t$en$t$, $t$New {{kind}} — {{commodity}} ({{ref}})$t$, $t$A new {{kind}} was posted on the Jericho Platform.

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
  ($t$new_listing$t$, $t$es$t$, $t$Nueva {{kind}} — {{commodity}} ({{ref}})$t$, $t$Se ha publicado una nueva {{kind}} en la Plataforma Jericho.

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
  ($t$registration_approved$t$, $t$en$t$, $t$Your Jericho Platform registration has been approved$t$, $t$Hello {{first_name}},

Good news — your registration for the Jericho Platform has been approved.

You can now sign in and start posting and browsing listings.$t$),
  ($t$registration_approved$t$, $t$es$t$, $t$Su registro en la Plataforma Jericho ha sido aprobado$t$, $t$Hola {{first_name}}:

Buenas noticias: su registro en la Plataforma Jericho ha sido aprobado.

Ya puede iniciar sesión y comenzar a publicar y consultar publicaciones.$t$),
  ($t$registration_rejected$t$, $t$en$t$, $t$Your Jericho Platform registration was not approved$t$, $t$Hello {{first_name}},

Thank you for your interest in the Jericho Platform. After review, your registration has not been approved and your account will not be activated.

If you believe this was a mistake, please reply to the operator who invited you.$t$),
  ($t$registration_rejected$t$, $t$es$t$, $t$Su registro en la Plataforma Jericho no ha sido aprobado$t$, $t$Hola {{first_name}}:

Gracias por su interés en la Plataforma Jericho. Tras la revisión, su registro no ha sido aprobado y su cuenta no será activada.

Si cree que se trata de un error, responda al operador que le invitó.$t$),
  ($t$registration_submitted$t$, $t$en$t$, $t$Your Jericho Platform registration has been submitted$t$, $t$Hello {{first_name}},

Thank you — your registration for the Jericho Platform has been received and is now awaiting review by an operator.

You will receive another email once a decision has been made. You will not be able to sign in until your account is approved.$t$),
  ($t$registration_submitted$t$, $t$es$t$, $t$Hemos recibido su registro en la Plataforma Jericho$t$, $t$Hola {{first_name}}:

Gracias. Hemos recibido su registro en la Plataforma Jericho y queda pendiente de revisión por un operador.

Recibirá otro correo cuando se haya tomado una decisión. No podrá iniciar sesión hasta que su cuenta sea aprobada.$t$);

create temp table t30_new(template_key text, lang text, subject text, body_text text);
insert into t30_new values
  ($t$invitation$t$, $t$en$t$, $t$You have been invited to MyPlatform$t$, $t$You have been invited to join MyPlatform.

Use this link to create your account:
{{link}}

The link is valid for 5 days and can only be used once.

Once you register, an operator reviews your application and you will be emailed when it is approved.$t$),
  ($t$invitation$t$, $t$es$t$, $t$Le han invitado a MyPlatform$t$, $t$Le han invitado a unirse a MyPlatform.

Utilice este enlace para crear su cuenta:
{{link}}

El enlace es válido durante 5 días y solo puede utilizarse una vez.

Una vez que se registre, un operador revisará su solicitud y recibirá un correo cuando sea aprobada.$t$),
  ($t$invitation_recommended$t$, $t$en$t$, $t$You have been invited to MyPlatform$t$, $t$Dear {{candidate_name}},
{{referrer_name}} has recommended you as a prospective member of MyPlatform, a private, invitation-only marketplace for physical commodities. We are pleased to invite you to join.
To register, please use your personal link below. It is valid for five days and can be used once.
{{link}}
Yours sincerely,
The Operator, MyPlatform
Privacy Notice: {{privacy_link}}$t$),
  ($t$invitation_recommended$t$, $t$es$t$, $t$Le han invitado a MyPlatform$t$, $t$Estimado/a {{candidate_name}},
{{referrer_name}} le ha recomendado como posible miembro de MyPlatform, un mercado privado y solo por invitación para materias primas físicas. Nos complace invitarle a unirse.
Para registrarse, utilice su enlace personal que figura a continuación. Es válido durante cinco días y solo puede utilizarse una vez.
{{link}}
Atentamente,
El Operador, MyPlatform
Aviso de privacidad: {{privacy_link}}$t$),
  ($t$new_listing$t$, $t$en$t$, $t$New {{kind}} — {{commodity}} ({{ref}})$t$, $t$A new {{kind}} was posted on MyPlatform.

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
  ($t$new_listing$t$, $t$es$t$, $t$Nueva {{kind}} — {{commodity}} ({{ref}})$t$, $t$Se ha publicado una nueva {{kind}} en MyPlatform.

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
  ($t$registration_approved$t$, $t$en$t$, $t$Your MyPlatform registration has been approved$t$, $t$Hello {{first_name}},

Good news — your registration for MyPlatform has been approved.

You can now sign in and start posting and browsing listings.$t$),
  ($t$registration_approved$t$, $t$es$t$, $t$Su registro en MyPlatform ha sido aprobado$t$, $t$Hola {{first_name}}:

Buenas noticias: su registro en MyPlatform ha sido aprobado.

Ya puede iniciar sesión y comenzar a publicar y consultar publicaciones.$t$),
  ($t$registration_rejected$t$, $t$en$t$, $t$Your MyPlatform registration was not approved$t$, $t$Hello {{first_name}},

Thank you for your interest in MyPlatform. After review, your registration has not been approved and your account will not be activated.

If you believe this was a mistake, please reply to the operator who invited you.$t$),
  ($t$registration_rejected$t$, $t$es$t$, $t$Su registro en MyPlatform no ha sido aprobado$t$, $t$Hola {{first_name}}:

Gracias por su interés en MyPlatform. Tras la revisión, su registro no ha sido aprobado y su cuenta no será activada.

Si cree que se trata de un error, responda al operador que le invitó.$t$),
  ($t$registration_submitted$t$, $t$en$t$, $t$Your MyPlatform registration has been submitted$t$, $t$Hello {{first_name}},

Thank you — your registration for MyPlatform has been received and is now awaiting review by an operator.

You will receive another email once a decision has been made. You will not be able to sign in until your account is approved.$t$),
  ($t$registration_submitted$t$, $t$es$t$, $t$Hemos recibido su registro en MyPlatform$t$, $t$Hola {{first_name}}:

Gracias. Hemos recibido su registro en MyPlatform y queda pendiente de revisión por un operador.

Recibirá otro correo cuando se haya tomado una decisión. No podrá iniciar sesión hasta que su cuenta sea aprobada.$t$);

-- The state the migration produced (the harness has already applied it).
create temp table t30_after as select * from public.email_templates;

select case when count(*) = 0 then 'PASS' else 'FAIL got ' || count(*) end
  as "T1 after 059 no email template, in any language, carries the name Jericho"
from public.email_templates where subject ~* 'jericho' or body_text ~* 'jericho';

select case when count(*) = 12 and bool_and(e.subject = n.subject and e.body_text = n.body_text)
            then 'PASS' else 'FAIL got ' || count(*) end
  as "T2 after 059 the 12 changed rows hold exactly the agreed new text, English and Spanish"
from t30_new n join public.email_templates e using (template_key, lang);

-- Revert, from its own file.
\i sql/revert/059_email_templates_myplatform_revert.sql

select case when count(*) = 12 and bool_and(e.subject = o.subject and e.body_text = o.body_text)
            then 'PASS' else 'FAIL got ' || count(*) end
  as "T3 after the revert the 12 rows hold exactly their old text again"
from t30_old o join public.email_templates e using (template_key, lang);

select case when count(*) = 0 then 'PASS' else 'FAIL ' || count(*) || ' row(s) differ' end
  as "T4 the revert changed nothing outside those 12 rows, and the migration nothing outside them either"
from (
  select a.template_key, a.lang, a.subject, a.body_text from t30_after a
   where (a.template_key, a.lang) not in (select template_key, lang from t30_old)
  except
  select e.template_key, e.lang, e.subject, e.body_text from public.email_templates e
) d;

select case when (select count(*) from public.email_templates) = (select count(*) from t30_after)
            then 'PASS' else 'FAIL the number of templates changed' end
  as "T5 the revert added and removed no template";

-- A row edited since is left alone by the revert.
\i sql/059_email_templates_myplatform.sql
update public.email_templates set subject = subject || ' (edited)'
 where template_key = 'invitation' and lang = 'en';
\i sql/revert/059_email_templates_myplatform_revert.sql

select case when subject = 'You have been invited to MyPlatform (edited)'
            then 'PASS' else 'FAIL got ' || subject end
  as "T6 the revert leaves a template that was edited after 059 as it is"
from public.email_templates where template_key = 'invitation' and lang = 'en';

-- Put the edited row back to the old text, then apply the migration twice.
update public.email_templates e set subject = o.subject, body_text = o.body_text
  from t30_old o where e.template_key = o.template_key and e.lang = o.lang
   and e.template_key = 'invitation' and e.lang = 'en';
\i sql/059_email_templates_myplatform.sql
create temp table t30_once as select * from public.email_templates;
\i sql/059_email_templates_myplatform.sql

select case when count(*) = 0 then 'PASS' else 'FAIL ' || count(*) || ' row(s) differ' end
  as "T7 applying the migration a second time changes nothing (idempotent)"
from (
  (select * from t30_once except select * from public.email_templates)
  union all
  (select * from public.email_templates except select * from t30_once)
) d;

select case when count(*) = 0 then 'PASS' else 'FAIL ' || count(*) || ' row(s) differ' end
  as "T8 after revert and re-apply the whole table is exactly what the migration first produced"
from (
  (select * from t30_after except select * from public.email_templates)
  union all
  (select * from public.email_templates except select * from t30_after)
) d;
