// MyPlatform — the Help questions, shared by the member's Help tab and the
// public help.html. Each question is a <details>: tap it and its answer
// opens. The text is the help.qN / help.aN keys in i18n.js, so it follows the
// language switch like everything else.

const HELP_QUESTIONS = 14;

function renderHelp(container) {
  if (!container) return;
  container.innerHTML = '';
  for (let i = 1; i <= HELP_QUESTIONS; i += 1) {
    const item = document.createElement('details');
    item.className = 'help-item';
    const q = document.createElement('summary');
    q.textContent = t(`help.q${i}`);
    const a = document.createElement('p');
    a.textContent = t(`help.a${i}`);
    item.append(q, a);
    container.append(item);
  }
}
