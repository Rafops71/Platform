// Translate glossary (owner, 19 Nov 2026; docs/AGREED-2026-11-19-translate-glossary.md).
//
//   Item18  a member's translation of a listing keeps the ten approved trade terms, and never shows a made-up word
//   Item78  the Operator's message translation does the same
//
// WHAT THIS PROVES, AND WHAT IT CANNOT. The glossary code is one block, identical in both Edge Functions. Here the
// block is taken out of each function's own file (so what is tested is what is deployed), and the machine's
// answers are FAKED: the nine real outputs of the real model (supervisor's run, 19 Nov, Cloudflare m2m100) are the
// fixtures, plus invented damaged ones. So this proves the swap, the put-back, the little-word fix and the
// fail-closed rule. It cannot prove that the real model keeps the made-up word every time: one run is not proof,
// which is why a damaged word shows nothing.

'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.join(__dirname, '..', '..');
const source = (n) => fs.readFileSync(path.join(ROOT, 'supabase', 'functions', n, 'index.ts'), 'utf8');
const BLOCK = /\/\/ ---- GLOSSARY-BEGIN[\s\S]*?\/\/ ---- GLOSSARY-END ----\n/;

// The block, compiled from the function's own file (types stripped by Node, nothing else changed).
function load(fn) {
  const m = source(fn).match(BLOCK);
  expect(m, `the glossary block is missing in ${fn}`).not.toBeNull();
  const js = require('node:module').stripTypeScriptTypes(m[0]);
  return new Function(`${js}\nreturn { GLOSSARY_VERSION, GLOSSARY, glossaryPrepare, glossaryRestore };`)();
}
const G = load('translate-listing');

// What the machine returns for `text` when it leaves the made-up words alone, via a fake machine.
function run(text, src, tgt, machine) {
  const plan = G.glossaryPrepare(text, src);
  if (plan === null) return null;
  return G.glossaryRestore(machine(plan.text), plan, tgt);
}

test.describe('the glossary block', () => {

  test('Item78 both functions carry the same glossary block, letter for letter', () => {
    const a = source('translate-listing').match(BLOCK), b = source('operator-translate').match(BLOCK);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a[0]).toBe(b[0]);
  });

  test('Item18 the glossary holds exactly the approved terms, in both directions, and nothing else', () => {
    const both = G.GLOSSARY.filter((t) => !t.only).map((t) => `${t.en} = ${t.es}`).sort();
    expect(both).toEqual([
      'advance payment = pago anticipado',
      'aluminium ingots = lingotes de aluminio',
      'balance against copy of bill of lading = saldo contra copia del conocimiento de embarque',
      'bill of lading = conocimiento de embarque',
      'cargo survey = inspección de carga',
      'copper cathode, grade A = cátodos de cobre grado A',
      'independent surveyor = inspector independiente',
      'ingots = lingotes',
      'irrevocable letter of credit = carta de crédito irrevocable',
      'letter of credit = carta de crédito',
      'no advance payment = sin anticipo',
    ].sort());
    expect(G.GLOSSARY.filter((t) => t.only).map((t) => `${t.only}: ${t.en} = ${t.es}`).sort())
      .toEqual(['en>es: granular urea = urea granulada', 'es>en: surveyor = perito']);
  });

  // The nine REAL answers of the real model (made-up word "Zorvex", one run each, 19 Nov), restored.
  const REAL = [
    ['en', 'es', 'Price USD 4,250 per tonne, 25 tonnes of aluminium ingots, loading 5 May 2027.',
      'Precio USD 4.250 por tonelada, 25 toneladas de Zorvex1, cargado el 5 de mayo de 2027.',
      'Precio USD 4.250 por tonelada, 25 toneladas de lingotes de aluminio, cargado el 5 de mayo de 2027.'],
    ['en', 'es', 'The bill of lading must be issued by an independent surveyor before 30 June.',
      'El Zorvex1 debe ser emitido por un Zorvex2 antes del 30 de junio.',
      'El conocimiento de embarque debe ser emitido por un inspector independiente antes del 30 de junio.'],
    ['en', 'es', 'Payment by irrevocable letter of credit; 30% advance payment and balance against copy of bill of lading.',
      // ADAPTED: the supervisor's real run put "balance against" outside the third made-up word; here the whole term is swapped.
      'Pago por Zorvex1; 30% por Zorvex2 y Zorvex3.',
      'Pago por carta de crédito irrevocable; 30% por pago anticipado y saldo contra copia del conocimiento de embarque.'],
    ['en', 'es', 'Cargo survey and an independent surveyor at the load port, at the buyer\'s cost.',
      'Zorvex1 y un Zorvex2 en el puerto de carga, a costa del comprador.',
      'Inspección de carga y un inspector independiente en el puerto de carga, a costa del comprador.'],
    ['en', 'es', 'Copper cathode, grade A will be shipped in two lots; EUR 1.250,50 per tonne.',
      'Zorvex1 se enviará en dos lotes; EUR 1.250,50 por tonelada.',
      'Cátodos de cobre grado A se enviará en dos lotes; EUR 1.250,50 por tonelada.'],
    ['en', 'es', 'No advance payment is not accepted on this deal.',
      'Zorvex1 no está aceptado en este acuerdo.',
      'Sin anticipo no está aceptado en este acuerdo.'],
    ['es', 'en', 'El conocimiento de embarque se emitirá antes del 30 de junio; pago 70% mediante carta de crédito irrevocable.',
      'The Zorvex1 will be issued before 30 June; 70% payment through Zorvex2.',
      'The bill of lading will be issued before 30 June; 70% payment through irrevocable letter of credit.'],
    ['es', 'en', 'El perito certificará la carga.',
      'The Zorvex1 will certify the load.',
      'The surveyor will certify the load.'],
    ['en', 'es', 'The warehouse is open on Monday and the goods are ready for loading.',
      'El almacén está abierto el lunes y las mercancías están listas para la carga.',
      'El almacén está abierto el lunes y las mercancías están listas para la carga.'],
  ];
  REAL.forEach(([src, tgt, text, machine, want], i) => {
    test(`Item18 real model output ${i + 1} (${src} to ${tgt}) comes back with the approved terms`, () => {
      const plan = G.glossaryPrepare(text, src);
      expect(plan).not.toBeNull();
      expect(plan.text, 'a glossary term was still in the text sent to the machine').not.toMatch(
        /bill of lading|letter of credit|ingots|advance payment|surveyor|cargo survey|cathode|conocimiento|carta de cr|lingotes|anticipo|perito/i);
      expect(G.glossaryRestore(machine, plan, tgt)).toBe(want);
      // Numbers, prices and dates are never touched: every digit of the machine's answer is still there.
      expect((G.glossaryRestore(machine, plan, tgt).match(/\d/g) || []).join('')).toBe(
        (machine.replace(/Zorvex\d/g, '').match(/\d/g) || []).join(''));
    });
  });

  test('Item18 what is matched: whole words, any capitals, the longest term first; every other form is left alone', () => {
    const swap = (t, s = 'en') => G.glossaryPrepare(t, s).text;
    expect(swap('BILL OF LADING and Letter Of Credit')).toBe('Zorvex1 and Zorvex2');
    expect(swap('no advance payment')).toBe('Zorvex1');                       // not "no" + "advance payment"
    expect(swap('irrevocable letter of credit')).toBe('Zorvex1');
    expect(swap('balance against copy of bill of lading')).toBe('Zorvex1');
    expect(swap('Aluminium Ingots and ingots')).toBe('Zorvex1 and Zorvex2');
    expect(swap('bill of lading, bill of lading')).toBe('Zorvex1, Zorvex1');
    expect(swap('copper cathode,   grade A')).toBe('Zorvex1');
    // Left alone on purpose (not in the owner's list): other forms of the same words.
    for (const t of ['one ingot', 'two bills of lading', 'letters of credit', 'surveyors', 'bill of ladings', 'Singots', 'granular ureas', 'perito']) {
      expect(swap(t), t).toBe(t);
    }
    expect(swap('Lingotes de aluminio y lingotes', 'es')).toBe('Zorvex1 y Zorvex2');
    expect(swap('un lingote, una carta de créditos', 'es')).toBe('un lingote, una carta de créditos');
    // The two one-way extras.
    expect(swap('granular urea')).toBe('Zorvex1');
    expect(swap('urea granulada', 'es')).toBe('urea granulada');
    expect(swap('El perito', 'es')).toBe('El Zorvex1');
    expect(swap('surveyor')).toBe('surveyor');
  });

  test('Item18 a term with regex characters in it is matched as plain text (the escape line is intact)', () => {
    const h = load('translate-listing'), o = load('operator-translate');
    for (const X of [h, o]) {
      X.GLOSSARY.push({ en: 'lot (a+b) 5.0*', es: 'lote (a+b) 5,0*', g: 'm', plural: false });
      expect(X.glossaryPrepare('the Lot (A+B) 5.0* arrives', 'en').text).toBe('the Zorvex1 arrives');
      expect(X.glossaryPrepare('the lot aab 5x0 arrives', 'en').text).toBe('the lot aab 5x0 arrives');   // . and + are not wildcards
      expect(X.glossaryPrepare('lote (a+b) 5,0*', 'es').text).toBe('Zorvex1');
    }
    // And the line itself: it once picked up a pasted comment through a "$&" in a shell step.
    for (const fn of ['translate-listing', 'operator-translate']) {
      const line = source(fn).split('\n').find((l) => l.includes('const escape = '));
      expect(line, fn).toContain("'\\\\$&'");
      expect(source(fn).split('The request body is read with a ceiling').length - 1, `${fn}: that comment appears once`).toBe(1);
    }
  });

  test('Item18 a text that already holds our made-up word is refused, because the two could not be told apart', () => {
    expect(G.glossaryPrepare('the bill of lading Zorvex1', 'en')).toBeNull();
    expect(G.glossaryPrepare('zorvex', 'en')).toBeNull();
  });

  test('Item18 THE MACHINE MANGLES A MADE-UP WORD: nothing is shown (never a half-translated sentence, never the made-up word)', () => {
    const text = 'The bill of lading must be issued by an independent surveyor before 30 June.';
    const bad = [
      'El [1] debe ser emitido por un [2] antes del 30 de junio.',            // brackets instead of the word
      'El Zorvex1 debe ser emitido por un inspector antes del 30 de junio.',  // one word lost
      'El Zorvex1 debe ser emitido por un Zorvex1 antes del 30 de junio.',    // one doubled, one lost
      'El zorvex1 debe ser emitido por un Zorvex2 antes del 30 de junio.',    // changed capital
      'El Zorvex1s debe ser emitido por un Zorvex2 antes del 30 de junio.',   // letters added
      'El Zorvex1 debe ser emitido por un Zorvex2 y un Zorvex3 antes del 30.',// an invented extra
      'El Zorvex1 y Zorvex1 debe ser emitido por un Zorvex2.',                // too many
      'En el mes de junio, los Juegos Olímpicos.',                            // an unrelated sentence
      '',                                                                      // nothing at all
    ];
    for (const out of bad) {
      expect(run(text, 'en', 'es', () => out), JSON.stringify(out)).toBeNull();
    }
    // The same text with the made-up words intact is shown.
    expect(run(text, 'en', 'es', () => 'El Zorvex1 debe ser emitido por un Zorvex2 antes del 30 de junio.')).not.toBeNull();
    // A text with no glossary term needs no made-up word and is returned as the machine wrote it.
    expect(run('The warehouse is open.', 'en', 'es', () => 'El almacén está abierto.')).toBe('El almacén está abierto.');
  });

  test('Item18 the little word in front of a term is set right for the term\'s gender and number (Spanish) and a/an (English)', () => {
    const one = (term, src, tgt, machine) => run(term, src, tgt, () => machine);
    // letter of credit is feminine
    expect(one('letter of credit', 'en', 'es', 'El Zorvex1 es válido')).toBe('La carta de crédito es válido');
    expect(one('letter of credit', 'en', 'es', 'pago por un Zorvex1')).toBe('pago por una carta de crédito');
    expect(one('letter of credit', 'en', 'es', 'el pago del Zorvex1')).toBe('el pago de la carta de crédito');
    expect(one('letter of credit', 'en', 'es', 'enviado al Zorvex1')).toBe('enviado a la carta de crédito');
    // bill of lading is masculine
    expect(one('bill of lading', 'en', 'es', 'el pago de la Zorvex1')).toBe('el pago del conocimiento de embarque');
    expect(one('bill of lading', 'en', 'es', 'enviado a la Zorvex1')).toBe('enviado al conocimiento de embarque');
    expect(one('bill of lading', 'en', 'es', 'Una Zorvex1 válida')).toBe('Un conocimiento de embarque válida');
    // cargo survey (feminine) and ingots (masculine plural)
    expect(one('cargo survey', 'en', 'es', 'El Zorvex1 y la Zorvex1')).toBeNull();                 // used twice, sent once: refused
    expect(one('cargo survey', 'en', 'es', 'El Zorvex1')).toBe('La inspección de carga');
    expect(one('ingots', 'en', 'es', 'compro el Zorvex1')).toBe('compro los lingotes');
    expect(one('ingots', 'en', 'es', 'precio del Zorvex1')).toBe('precio de los lingotes');
    expect(one('ingots', 'en', 'es', 'un Zorvex1')).toBe('unos lingotes');
    // a feminine one-way term
    expect(one('granular urea', 'en', 'es', 'el Zorvex1')).toBe('la urea granulada');
    // a term with no little word in front is not given one
    expect(one('letter of credit', 'en', 'es', 'Pago por Zorvex1')).toBe('Pago por carta de crédito');
    // English: a / an
    expect(one('independent surveyor', 'en', 'en', 'x')).toBeNull();                               // no made-up word came back
    expect(run('un inspector independiente', 'es', 'en', () => 'a Zorvex1')).toBe('an independent surveyor');
    expect(run('una inspección de carga', 'es', 'en', () => 'An Zorvex1')).toBe('A cargo survey');
    expect(run('el perito', 'es', 'en', () => 'the Zorvex1')).toBe('the surveyor');
  });

  test('Item18 a capital letter is used where a sentence starts, and not in the middle of one', () => {
    expect(run('Bill of lading', 'en', 'es', () => 'Zorvex1 es necesario. Zorvex1 llega mañana.')).toBeNull();   // sent once, came twice
    expect(run('Bill of lading. The bill of lading', 'en', 'es', () => 'Zorvex1. Zorvex1')).toBe('Conocimiento de embarque. Conocimiento de embarque');
    expect(run('Pay by letter of credit', 'en', 'es', () => 'Pagar con Zorvex1')).toBe('Pagar con carta de crédito');
  });

  test('Item18 the glossary version is part of what a stored translation was made from, so a new glossary makes old ones stale', () => {
    expect(G.GLOSSARY_VERSION).toMatch(/^glossary-\d{4}-\d{2}-\d{2}-\d+$/);
    const a = source('translate-listing');
    expect(a).toContain('sha256(`${GLOSSARY_VERSION}\\n${text}`)');
  });

  test('Item78 the glossary is used on every path, and no text or term is ever written to a log', () => {
    for (const fn of ['translate-listing', 'operator-translate']) {
      const s = source(fn);
      expect(s, fn).toContain('glossaryPrepare(');
      expect(s, fn).toContain('glossaryRestore(');
      // Every log line prints a fixed sentence or a code, never a variable that could hold a text.
      for (const line of s.split('\n').filter((l) => /console\.(log|error|warn|info)/.test(l))) {
        expect(line, `${fn}: ${line.trim()}`).toMatch(/console\.\w+\((['"`])[^$]*\1(, [a-zA-Z.?]+( \?\? '')?)?\)/);
      }
    }
  });
});
