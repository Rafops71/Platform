# AGREED 19 Nov 2026: Translate glossary (owner's decision)

Why: a live test of the Translate machine (m2m100) on 10 trade sentences made 4 costly errors:
"ingots" -> "engranajes" (gears), "bill of lading" -> "factura de carga", "surveyor" -> "investigador",
"carta de credito" -> "credit card". The owner asked for the correct terms to be found and enforced.

Sources: ChatGPT and Grok were asked the same prompt (owner pasted both answers, 19 Nov); both agree on every
term below. Terms checked by the supervisor against pages: letter of credit, irrevocable, advance payment
(camtomx.com glossary), lingote (es.wikipedia), catodos "A" (Cochilco monthly report, seen in a search result).
Not independently checked by the supervisor: bill of lading, balance against copy, surveyor, cargo survey, sin anticipo.

Owner approved (19 Nov, "Yes"): these 10, and the same terms in reverse for Spanish to English:

| English | Spanish |
|---|---|
| bill of lading | conocimiento de embarque |
| letter of credit | carta de credito |
| irrevocable letter of credit | carta de credito irrevocable |
| advance payment | pago anticipado |
| balance against copy of bill of lading | saldo contra copia del conocimiento de embarque |
| independent surveyor | inspector independiente |
| cargo survey | inspeccion de carga |
| ingots / aluminium ingots | lingotes / lingotes de aluminio |
| copper cathode, grade A | catodos de cobre grado A |
| no advance payment | sin anticipo |

(Write the Spanish with its accents: crédito, inspección, cátodos.)

Owner's answers to the two disagreements: Spanish "perito" -> English "surveyor"; "granular urea" -> "urea granulada".

Scope: only these terms. The machine is forced to use them in both functions (operator-translate and
translate-listing). It cannot fix other mistakes. Build only after BATCH GO.
