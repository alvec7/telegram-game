const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const fs = require('fs');
const vm = require('vm');
const { JSDOM } = require('jsdom');

function loadScripts(dom) {
  const ctx = dom.getInternalVMContext();
  const qCode = fs.readFileSync('questions.js', 'utf8')
    .replace('const questions', 'window.questions')
    .replace('const hostPhrases', 'window.hostPhrases');
  vm.runInContext(qCode, ctx);

  const gCode = fs.readFileSync('game.js', 'utf8') + '\nwindow.MillionaireGame = MillionaireGame;';
  vm.runInContext(gCode, ctx);
}

describe('MillionaireGame lifeline confirmation', () => {
  let game;

  beforeAll(() => {
    const html = `<!DOCTYPE html><body>
      <div id="question"></div>
      <button id="A"></button><button id="B"></button>
      <button id="C"></button><button id="D"></button>
      <div id="timer"></div>
      <div id="confirmation-modal" style="display:none"></div>
      <button id="confirm-yes"></button><button id="confirm-no"></button>
      <div id="start-button-container"></div>
      <button id="start-button"></button>
      <div class="lifelines">
        <button id="fifty-fifty"></button>
        <button id="phone-friend"></button>
        <button id="ask-audience"></button>
      </div>
      <div id="winner-modal"></div>
      <div id="consolation-modal"><div class="prize-buttons"><button class="play-again"></button></div></div>
      <div id="host-message"></div>
    </body>`;

    const dom = new JSDOM(html, { runScripts: 'dangerously' });
    dom.window.Telegram = {
      WebApp: {
        expand() {},
        ready() {},
        MainButton: { setText() {}, show() {}, onClick() {} }
      }
    };
    loadScripts(dom);
    game = new dom.window.MillionaireGame();
    game.startFirstQuestion();
  });

  test('checkAnswer shows confirmation modal after using lifeline', () => {
    game.useFiftyFifty();
    game.thinkingStartTime = Date.now();
    game.checkAnswer('A');
    expect(game.confirmationModal.style.display).toBe('flex');
  });
});
