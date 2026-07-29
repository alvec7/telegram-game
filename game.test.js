const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const fs = require('fs');
const vm = require('vm');
const { JSDOM } = require('jsdom');

/**
 * Собирает игровое окружение на основе реального index.html,
 * подгружая questions.js и game.js в контекст JSDOM.
 */
function createGameEnvironment() {
  const html = fs
    .readFileSync('index.html', 'utf8')
    // внешние скрипты не грузим в тестовой среде
    .replace(/<script[^>]*src="https:[^"]*"[^>]*><\/script>/g, '')
    .replace(/<script src="questions\.js[^"]*"><\/script>/, '')
    .replace(/<script src="game\.js[^"]*"><\/script>/, '');

  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
  const ctx = dom.getInternalVMContext();

  vm.runInContext(fs.readFileSync('questions.js', 'utf8'), ctx);
  vm.runInContext(
    fs.readFileSync('game.js', 'utf8') + '\nwindow.MillionaireGame = MillionaireGame;',
    ctx
  );

  return { dom, window: dom.window };
}

describe('Банк вопросов', () => {
  const questionsModule = require('./questions.js');

  test('в банке нет дублирующихся вопросов', () => {
    const all = [
      ...questionsModule.QUESTION_BANK.easy,
      ...questionsModule.QUESTION_BANK.medium,
      ...questionsModule.QUESTION_BANK.hard
    ];
    const texts = all.map((q) => q.question);
    expect(new Set(texts).size).toBe(texts.length);
  });

  test('каждый уровень содержит минимум 10 вопросов для вариативности', () => {
    expect(questionsModule.QUESTION_BANK.easy.length).toBeGreaterThanOrEqual(10);
    expect(questionsModule.QUESTION_BANK.medium.length).toBeGreaterThanOrEqual(10);
    expect(questionsModule.QUESTION_BANK.hard.length).toBeGreaterThanOrEqual(10);
  });

  test('buildQuestionSet возвращает 15 уникальных вопросов', () => {
    const set = questionsModule.buildQuestionSet();
    expect(set).toHaveLength(15);
    const texts = set.map((q) => q.question);
    expect(new Set(texts).size).toBe(15);
  });

  test('правильный ответ сохраняется после перемешивания вариантов', () => {
    const original = questionsModule.QUESTION_BANK.easy[0];
    for (let i = 0; i < 20; i++) {
      const shuffled = questionsModule.shuffleAnswers(original);
      expect(shuffled.answers[shuffled.correct]).toBe(original.answers[original.correct]);
      expect(Object.values(shuffled.answers).sort()).toEqual(
        Object.values(original.answers).sort()
      );
    }
  });

  test('у каждого вопроса корректный ответ указывает на существующий вариант', () => {
    ['easy', 'medium', 'hard'].forEach((tier) => {
      questionsModule.QUESTION_BANK[tier].forEach((q) => {
        expect(['A', 'B', 'C', 'D']).toContain(q.correct);
        expect(q.answers[q.correct]).toBeTruthy();
        expect(Object.keys(q.answers).sort()).toEqual(['A', 'B', 'C', 'D']);
      });
    });
  });
});

describe('MillionaireGame', () => {
  let game;
  let window;

  beforeEach(() => {
    const env = createGameEnvironment();
    window = env.window;
    game = new window.MillionaireGame();
    game.startFirstQuestion();
  });

  afterEach(() => {
    game.stopTimer();
    game.clearAllTimeouts();
  });

  test('оверлеи (шторка, модалки, диаграмма) скрыты на старте', () => {
    const env = createGameEnvironment();
    const doc = env.window.document;
    new env.window.MillionaireGame();

    ['ladder-sheet', 'audience-chart', 'confirmation-modal', 'winner-modal', 'consolation-modal']
      .forEach((id) => {
        const el = doc.getElementById(id);
        expect(el.hidden).toBe(true);
        // Инлайновый display:none — защита от закешированного CSS в Telegram WebView
        expect(el.style.display).toBe('none');
      });
    // CSS-страховка: атрибут hidden обязан побеждать классовые display-правила
    const css = fs.readFileSync('styles.css', 'utf8');
    expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important/);

    // В разметке оверлеи также должны иметь инлайновый display:none
    const html = fs.readFileSync('index.html', 'utf8');
    ['ladder-sheet', 'confirmation-modal', 'winner-modal', 'consolation-modal'].forEach((id) => {
      expect(html).toMatch(new RegExp(`id="${id}"[^>]*style="display:none"`));
    });
  });

  test('шторку с таблицей выигрышей можно открыть и закрыть', () => {
    const sheet = window.document.getElementById('ladder-sheet');
    game.toggleLadder(true);
    expect(sheet.hidden).toBe(false);
    expect(sheet.style.display).toBe('flex');
    game.toggleLadder(false);
    expect(sheet.hidden).toBe(true);
    expect(sheet.style.display).toBe('none');
  });

  test('после подсказки требуется подтверждение ответа', () => {
    game.useFiftyFifty();
    game.thinkingStartTime = Date.now();
    game.checkAnswer('A');
    expect(game.confirmationModal.hidden).toBe(false);
  });

  test('быстрый ответ без подсказок не требует подтверждения', () => {
    game.thinkingStartTime = Date.now();
    const correct = game.questions[0].correct;
    game.checkAnswer(correct);
    expect(game.confirmationModal.hidden).toBe(true);
    expect(game.answerButtons[correct].classList.contains('is-correct')).toBe(true);
  });

  test('50:50 скрывает ровно два неверных варианта', () => {
    game.useFiftyFifty();
    const hidden = Object.entries(game.answerButtons)
      .filter(([, btn]) => btn.classList.contains('is-hidden'))
      .map(([letter]) => letter);
    expect(hidden).toHaveLength(2);
    expect(hidden).not.toContain(game.questions[0].correct);
  });

  test('несгораемые суммы рассчитываются по правилам', () => {
    game.currentQuestion = 3;
    expect(game.getGuaranteedPrize()).toBe(0);
    game.currentQuestion = 7;
    expect(game.getGuaranteedPrize()).toBe(1000);
    game.currentQuestion = 12;
    expect(game.getGuaranteedPrize()).toBe(32000);
  });

  test('«Сыграть снова» сбрасывает состояние и подбирает новый набор вопросов', () => {
    game.useFiftyFifty();
    game.currentQuestion = 5;
    game.resetGame();

    expect(game.currentQuestion).toBe(0);
    expect(game.usedLifelines.fiftyFifty).toBe(false);
    expect(game.lifelines.fiftyFifty.disabled).toBe(false);
    expect(game.questions).toHaveLength(15);
    Object.values(game.answerButtons).forEach((btn) => {
      expect(btn.classList.contains('is-hidden')).toBe(false);
    });
  });

  test('resetGame отменяет все отложенные таймеры', () => {
    game.setTrackedTimeout(() => {}, 5000);
    game.setTrackedTimeout(() => {}, 5000);
    expect(game.pendingTimeouts.size).toBeGreaterThan(0);
    game.resetGame();
    expect(game.pendingTimeouts.size).toBe(0);
  });

  test('помощь зала даёт распределение, суммирующееся в 100%', () => {
    game.useAskAudience();
    const chart = window.document.getElementById('audience-chart');
    expect(chart.hidden).toBe(false);
    const percents = [...chart.querySelectorAll('.audience-chart__pct')]
      .map((el) => parseInt(el.textContent, 10) || 0);
    expect(percents.reduce((a, b) => a + b, 0)).toBe(100);
  });

  test('после неверного ответа кнопки блокируются', () => {
    game.thinkingStartTime = Date.now();
    const wrong = ['A', 'B', 'C', 'D'].find((l) => l !== game.questions[0].correct);
    game.checkAnswer(wrong);
    expect(game.answersLocked).toBe(true);
    Object.values(game.answerButtons).forEach((btn) => {
      expect(btn.disabled).toBe(true);
    });
  });
});
