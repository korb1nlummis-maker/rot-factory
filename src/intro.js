// New game intro: a welcome, a hiring form to sign with your name, then the factory. playIntro() resolves when the form is signed.
const LINES = ['Welcome to your new life.', 'Please take a seat. There is some paperwork.'];

const FORM = `
<div class="paper">
  <div class="p-head"><b>WAREHOUSE 07</b><span>SORTING &amp; SALVAGE DIVISION</span></div>
  <h2>Employment Agreement <small>Form 7-B</small></h2>
  <ol>
    <li><b>Position.</b> Sorter, Grade 1 (probationary). Probation lasts until the end of time.</li>
    <li><b>Pay.</b> Paid per plush handled, by weight of enthusiasm. Management may double your pay without notice during Golden Hour.</li>
    <li><b>Duties.</b> Grab plush. Feed the SORT bin. Find the one marked <i>Il Rotto Supremo</i>, or dig out through the east wall, 3 km away.</li>
    <li><b>Hours.</b> The lights are on from 07:00 to 19:00. After the chime you are responsible for your own lamp.</li>
    <li><b>Hazards.</b> The Employee accepts the risk of slides, cave-ins, loose plush, thin air and the mountain. Do not climb. The sign says so.</li>
    <li><b>Previous employees.</b> Their belongings are in the pile. Treat them with respect and keep what is useful.</li>
    <li><b>Resignation.</b> Not accepted in writing. See clause 3 for the exit.</li>
  </ol>
  <div class="sig">
    <label for="introName">Employee signature</label>
    <input id="introName" type="text" maxlength="24" autocomplete="off" spellcheck="false" placeholder="Type your name, then press Enter">
    <div class="stamp">HIRED</div>
  </div>
</div>`;

export function playIntro() {
  return new Promise((resolve) => {
    const root = document.createElement('div'); root.id = 'intro';
    root.innerHTML = `<div class="intro-line" id="introLine"></div><div class="intro-hint" id="introHint">click or press Enter</div>${FORM}<div class="intro-welcome" id="introWelcome"></div>`;
    document.body.appendChild(root);
    const line = root.querySelector('#introLine'), hint = root.querySelector('#introHint'), paper = root.querySelector('.paper'), input = root.querySelector('#introName'), welcome = root.querySelector('#introWelcome');
    let stage = 0, timer = 0, done = false;
    const showLine = (n) => { line.classList.remove('on'); clearTimeout(timer); timer = setTimeout(() => { line.textContent = LINES[n]; line.classList.add('on'); }, 350); };
    const next = () => {
      if (done) return;
      if (stage < LINES.length - 1) { stage++; showLine(stage); return; }
      if (stage === LINES.length - 1) { stage++; line.classList.remove('on'); hint.classList.add('off'); clearTimeout(timer); timer = setTimeout(() => { paper.classList.add('on'); input.focus(); }, 500); }
    };
    root.addEventListener('mousedown', () => { if (stage < LINES.length) next(); });
    const onKey = (e) => {
      if (stage < LINES.length && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey, true);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code !== 'Enter' || done) return;
      const name = input.value.replace(/\s+/g, ' ').trim();
      if (!name) { input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake'); return; }
      done = true; input.readOnly = true; paper.classList.add('signed');
      setTimeout(() => { paper.classList.remove('on'); welcome.textContent = `Welcome aboard, ${name}.`; welcome.classList.add('on'); }, 1500);
      setTimeout(() => {
        window.removeEventListener('keydown', onKey, true);
        root.classList.add('black');
        resolve({ name, close: () => { root.classList.add('out'); setTimeout(() => root.remove(), 1200); } });
      }, 3400);
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('keypress', (e) => e.stopPropagation());
    showLine(0);
  });
}
