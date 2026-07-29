/* ═══════════════════════════════════════════════════════════════
   «Кто хочет стать миллионером» — Telegram Mini App
   ═══════════════════════════════════════════════════════════════ */

/**
 * Безопасная обёртка над Telegram WebApp API: игра работает
 * и внутри Telegram, и в обычном браузере (для отладки).
 */
const TG = (() => {
    const webApp = typeof window !== "undefined" && window.Telegram && window.Telegram.WebApp
        ? window.Telegram.WebApp
        : null;

    return {
        init() {
            if (!webApp) return;
            try {
                webApp.ready();
                webApp.expand();
                if (typeof webApp.setHeaderColor === "function") {
                    webApp.setHeaderColor("#0b1026");
                }
                if (typeof webApp.setBackgroundColor === "function") {
                    webApp.setBackgroundColor("#0b1026");
                }
                if (typeof webApp.disableVerticalSwipes === "function") {
                    webApp.disableVerticalSwipes();
                }
            } catch (e) { /* старые клиенты Telegram */ }
        },
        haptic(type) {
            const h = webApp && webApp.HapticFeedback;
            if (!h) return;
            try {
                if (type === "success" || type === "error" || type === "warning") {
                    h.notificationOccurred(type);
                } else {
                    h.impactOccurred(type || "light");
                }
            } catch (e) { /* noop */ }
        },
        sendResult(payload) {
            if (!webApp || typeof webApp.sendData !== "function") return;
            try {
                webApp.sendData(JSON.stringify(payload));
            } catch (e) { /* noop */ }
        }
    };
})();

class MillionaireGame {
    static PRIZES = [
        100, 200, 300, 500, 1000,
        2000, 4000, 8000, 16000, 32000,
        64000, 125000, 250000, 500000, 1000000
    ];

    static MILESTONES = [4, 9]; // индексы несгораемых сумм (1 000 и 32 000)
    static QUESTION_TIME = 60;  // секунд на вопрос

    constructor() {
        this.prizes = MillionaireGame.PRIZES;
        this.pendingTimeouts = new Set();
        this.timer = null;

        this.cacheElements();
        this.buildPrizeLadder();
        this.bindEvents();
        this.initializeNewGame();
    }

    /* ─── DOM ──────────────────────────────────────────────── */

    cacheElements() {
        const $ = (id) => document.getElementById(id);

        this.introScreen = $("intro-screen");
        this.gameScreen = $("game-screen");
        this.startButton = $("start-button");

        this.questionElement = $("question");
        this.answerButtons = { A: $("A"), B: $("B"), C: $("C"), D: $("D") };
        this.hostMessage = $("host-message");

        this.timerElement = $("timer");
        this.timerValue = $("timer-value");
        this.timerProgress = $("timer-progress");

        this.questionCounter = $("question-counter");
        this.currentPrizeLabel = $("current-prize");
        this.ladderToggle = $("ladder-toggle");
        this.ladderSheet = $("ladder-sheet");
        this.prizeLadder = $("prize-ladder");

        this.audienceChart = $("audience-chart");

        this.lifelines = {
            fiftyFifty: $("fifty-fifty"),
            phoneFriend: $("phone-friend"),
            askAudience: $("ask-audience")
        };

        this.confirmationModal = $("confirmation-modal");
        this.confirmYesButton = $("confirm-yes");
        this.confirmNoButton = $("confirm-no");
        this.winnerModal = $("winner-modal");
        this.consolationModal = $("consolation-modal");
        this.finalResult = $("final-result");
    }

    bindEvents() {
        const on = (el, event, handler) => {
            if (el) el.addEventListener(event, handler);
        };

        on(this.startButton, "click", () => {
            TG.haptic("medium");
            this.startFirstQuestion();
        });

        Object.entries(this.answerButtons).forEach(([letter, button]) => {
            on(button, "click", () => this.checkAnswer(letter));
        });

        on(this.lifelines.fiftyFifty, "click", () => this.useFiftyFifty());
        on(this.lifelines.phoneFriend, "click", () => this.usePhoneFriend());
        on(this.lifelines.askAudience, "click", () => this.useAskAudience());

        on(this.confirmYesButton, "click", () => this.handleConfirmation(true));
        on(this.confirmNoButton, "click", () => this.handleConfirmation(false));

        document.querySelectorAll(".play-again").forEach((button) => {
            button.addEventListener("click", () => {
                TG.haptic("medium");
                this.hideModal(this.winnerModal);
                this.hideModal(this.consolationModal, () => this.resetGame());
            });
        });

        on(this.ladderToggle, "click", () => this.toggleLadder(true));
        document.querySelectorAll("[data-close-ladder]").forEach((el) => {
            el.addEventListener("click", () => this.toggleLadder(false));
        });

        document.querySelectorAll(".promo__copy").forEach((button) => {
            button.addEventListener("click", () => this.copyPromo(button));
        });
    }

    buildPrizeLadder() {
        if (!this.prizeLadder) return;

        this.prizeLadder.innerHTML = "";
        for (let i = this.prizes.length - 1; i >= 0; i--) {
            const row = document.createElement("li");
            row.className = "ladder__row";
            row.dataset.index = String(i);
            if (MillionaireGame.MILESTONES.includes(i) || i === this.prizes.length - 1) {
                row.classList.add("ladder__row--milestone");
            }
            row.innerHTML =
                `<span><span class="ladder__num">${i + 1}</span>${this.formatMoney(this.prizes[i])}</span>`;
            this.prizeLadder.appendChild(row);
        }
    }

    /* ─── Вспомогательные ──────────────────────────────────── */

    formatMoney(value) {
        return `${value.toLocaleString("ru-RU")} ₽`;
    }

    setTrackedTimeout(fn, delay) {
        const id = setTimeout(() => {
            this.pendingTimeouts.delete(id);
            fn();
        }, delay);
        this.pendingTimeouts.add(id);
        return id;
    }

    clearAllTimeouts() {
        this.pendingTimeouts.forEach((id) => clearTimeout(id));
        this.pendingTimeouts.clear();
    }

    getRandomPhrase(type) {
        const phrases = (typeof hostPhrases !== "undefined" && hostPhrases[type]) || [""];
        return phrases[Math.floor(Math.random() * phrases.length)];
    }

    showHostMessage(message) {
        if (!this.hostMessage) return;
        this.hostMessage.classList.add("is-updating");
        this.setTrackedTimeout(() => {
            this.hostMessage.textContent = message;
            this.hostMessage.classList.remove("is-updating");
        }, 150);
    }

    /* ─── Жизненный цикл игры ──────────────────────────────── */

    initializeNewGame() {
        this.currentQuestion = 0;
        // Каждая партия — новый случайный набор вопросов без повторов.
        this.questions = typeof buildQuestionSet === "function"
            ? buildQuestionSet()
            : [...questions];

        this.usedLifelines = {
            fiftyFifty: false,
            phoneFriend: false,
            askAudience: false,
            lastQuestionUsed: -1
        };

        this.timeLeft = MillionaireGame.QUESTION_TIME;
        this.thinkingStartTime = null;
        this.selectedAnswer = null;
        this.isPaused = false;
        this.answersLocked = false;

        Object.values(this.lifelines).forEach((button) => {
            if (button) button.disabled = false;
        });

        Object.values(this.answerButtons).forEach((button) => {
            if (!button) return;
            button.className = "answer";
            button.disabled = false;
        });

        this.hideAudienceChart();
    }

    resetGame() {
        this.stopTimer();
        this.clearAllTimeouts();
        this.initializeNewGame();
        this.showScreen(this.introScreen);
    }

    showScreen(screen) {
        [this.introScreen, this.gameScreen].forEach((s) => {
            if (s) s.classList.toggle("is-active", s === screen);
        });
    }

    startFirstQuestion() {
        this.showScreen(this.gameScreen);
        this.showHostMessage(this.getRandomPhrase("welcome"));
        this.showQuestion();
    }

    /* ─── Таймер ───────────────────────────────────────────── */

    startTimer() {
        this.stopTimer();
        this.timeLeft = MillionaireGame.QUESTION_TIME;
        this.thinkingStartTime = Date.now();
        this.updateTimerDisplay();

        this.timer = setInterval(() => {
            if (this.isPaused) return;

            this.timeLeft--;
            this.updateTimerDisplay();

            if (this.timeLeft <= 10 && this.timerElement) {
                this.timerElement.classList.add("is-warning");
            }
            if (this.timeLeft <= 0) {
                this.timeExpired();
            }
        }, 1000);
    }

    updateTimerDisplay() {
        if (this.timerValue) {
            this.timerValue.textContent = String(Math.max(this.timeLeft, 0));
        } else if (this.timerElement) {
            this.timerElement.textContent = String(Math.max(this.timeLeft, 0));
        }

        if (this.timerProgress) {
            const circumference = 125.66;
            const fraction = Math.max(this.timeLeft, 0) / MillionaireGame.QUESTION_TIME;
            this.timerProgress.style.strokeDashoffset = String(circumference * (1 - fraction));
        }
    }

    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.timerElement) {
            this.timerElement.classList.remove("is-warning");
        }
    }

    timeExpired() {
        this.stopTimer();
        this.answersLocked = true;
        TG.haptic("error");
        this.showHostMessage("Время истекло! " + this.getRandomPhrase("wrong"));

        const question = this.questions[this.currentQuestion];
        if (question && this.answerButtons[question.correct]) {
            this.answerButtons[question.correct].classList.add("is-correct");
        }
        this.setTrackedTimeout(() => this.endGame(), 2200);
    }

    /* ─── Вопросы и ответы ─────────────────────────────────── */

    showQuestion() {
        if (this.currentQuestion >= this.questions.length) {
            this.winGame();
            return;
        }

        const question = this.questions[this.currentQuestion];
        if (!question) {
            this.endGame();
            return;
        }

        this.answersLocked = false;
        this.hideAudienceChart();

        if (this.questionElement) {
            this.questionElement.textContent = question.question;
        }

        Object.entries(question.answers).forEach(([letter, answer]) => {
            const button = this.answerButtons[letter];
            if (!button) return;
            button.className = "answer";
            button.disabled = false;
            const textEl = button.querySelector(".answer__text");
            if (textEl) {
                textEl.textContent = answer;
            } else {
                button.textContent = `${letter}: ${answer}`;
            }
        });

        this.updateProgress();
        this.startTimer();
    }

    updateProgress() {
        if (this.questionCounter) {
            this.questionCounter.textContent =
                `Вопрос ${this.currentQuestion + 1} из ${this.questions.length}`;
        }
        if (this.currentPrizeLabel) {
            this.currentPrizeLabel.textContent = this.formatMoney(this.prizes[this.currentQuestion]);
        }
        this.updatePrizeLadder();
    }

    updatePrizeLadder() {
        if (!this.prizeLadder) return;
        this.prizeLadder.querySelectorAll(".ladder__row").forEach((row) => {
            const index = Number(row.dataset.index);
            row.classList.toggle("ladder__row--current", index === this.currentQuestion);
            row.classList.toggle("ladder__row--passed", index < this.currentQuestion);
        });
    }

    toggleLadder(open) {
        if (!this.ladderSheet) return;
        this.ladderSheet.hidden = !open;
        if (open) {
            TG.haptic("light");
            this.updatePrizeLadder();
        }
    }

    checkAnswer(selectedAnswer) {
        if (this.answersLocked || this.isPaused) return;

        TG.haptic("light");

        const thinkingTime = this.thinkingStartTime
            ? (Date.now() - this.thinkingStartTime) / 1000
            : 0;
        const usedLifelineHere =
            this.usedLifelines.lastQuestionUsed === this.currentQuestion;

        if (thinkingTime > 25 || usedLifelineHere) {
            this.selectedAnswer = selectedAnswer;
            const button = this.answerButtons[selectedAnswer];
            if (button) button.classList.add("is-selected");
            this.showConfirmationModal();
        } else {
            this.processAnswer(selectedAnswer);
        }
    }

    processAnswer(selectedAnswer) {
        if (this.answersLocked) return;
        this.answersLocked = true;
        this.stopTimer();

        const question = this.questions[this.currentQuestion];
        const selectedButton = this.answerButtons[selectedAnswer];
        if (selectedButton) selectedButton.classList.remove("is-selected");

        Object.values(this.answerButtons).forEach((button) => {
            if (button) button.disabled = true;
        });

        if (selectedAnswer === question.correct) {
            TG.haptic("success");
            if (selectedButton) selectedButton.classList.add("is-correct");

            const wonPrize = this.prizes[this.currentQuestion];
            this.showHostMessage(
                `${this.getRandomPhrase("correct")} Ваш выигрыш — ${this.formatMoney(wonPrize)}.`
            );

            this.setTrackedTimeout(() => {
                this.currentQuestion++;
                if (this.currentQuestion < this.questions.length) {
                    this.showHostMessage(
                        `Следующий вопрос — на ${this.formatMoney(this.prizes[this.currentQuestion])}.`
                    );
                    this.setTrackedTimeout(() => this.showQuestion(), 1400);
                } else {
                    this.winGame();
                }
            }, 2000);
        } else {
            TG.haptic("error");
            if (selectedButton) selectedButton.classList.add("is-wrong");
            const correctButton = this.answerButtons[question.correct];
            if (correctButton) correctButton.classList.add("is-correct");

            this.showHostMessage(this.getRandomPhrase("wrong"));
            this.setTrackedTimeout(() => this.endGame(), 2600);
        }
    }

    /* ─── Подсказки ────────────────────────────────────────── */

    useFiftyFifty() {
        if (this.usedLifelines.fiftyFifty || this.answersLocked) return;
        TG.haptic("medium");

        const question = this.questions[this.currentQuestion];
        const wrongAnswers = Object.keys(question.answers)
            .filter((letter) => letter !== question.correct);

        wrongAnswers
            .sort(() => Math.random() - 0.5)
            .slice(0, 2)
            .forEach((letter) => {
                const button = this.answerButtons[letter];
                if (button) {
                    button.classList.add("is-hidden");
                    button.disabled = true;
                }
            });

        this.showHostMessage("Убираем два неверных варианта. Осталось выбрать из двух!");
        this.usedLifelines.fiftyFifty = true;
        this.usedLifelines.lastQuestionUsed = this.currentQuestion;
        if (this.lifelines.fiftyFifty) this.lifelines.fiftyFifty.disabled = true;
    }

    usePhoneFriend() {
        if (this.usedLifelines.phoneFriend || this.answersLocked) return;
        TG.haptic("medium");

        const question = this.questions[this.currentQuestion];
        const visibleLetters = Object.keys(question.answers).filter((letter) => {
            const button = this.answerButtons[letter];
            return !button || !button.classList.contains("is-hidden");
        });

        const confident = Math.random() > 0.3;
        let message;

        if (confident) {
            message = `Ваш друг: «Я почти уверен — это ${question.correct}: "${question.answers[question.correct]}"».`;
        } else {
            const guess = visibleLetters[Math.floor(Math.random() * visibleLetters.length)];
            message = `Ваш друг: «Сложный вопрос… Рискнул бы поставить на ${guess}: "${question.answers[guess]}"».`;
        }

        this.showHostMessage(message);
        this.usedLifelines.phoneFriend = true;
        this.usedLifelines.lastQuestionUsed = this.currentQuestion;
        if (this.lifelines.phoneFriend) this.lifelines.phoneFriend.disabled = true;
    }

    useAskAudience() {
        if (this.usedLifelines.askAudience || this.answersLocked) return;
        TG.haptic("medium");

        const question = this.questions[this.currentQuestion];
        const letters = Object.keys(question.answers);
        const visible = letters.filter((letter) => {
            const button = this.answerButtons[letter];
            return !button || !button.classList.contains("is-hidden");
        });

        // Голоса: правильный ответ получает бонус, остальные — случайный вес.
        const weights = {};
        visible.forEach((letter) => {
            weights[letter] = (letter === question.correct ? 50 : 8) + Math.random() * 25;
        });
        const total = Object.values(weights).reduce((sum, w) => sum + w, 0);

        const results = {};
        let allocated = 0;
        visible.forEach((letter, i) => {
            if (i === visible.length - 1) {
                results[letter] = 100 - allocated;
            } else {
                results[letter] = Math.round((weights[letter] / total) * 100);
                allocated += results[letter];
            }
        });
        letters.forEach((letter) => {
            if (!(letter in results)) results[letter] = 0;
        });

        this.renderAudienceChart(results);
        this.showHostMessage("Зал проголосовал — результаты на экране!");

        this.usedLifelines.askAudience = true;
        this.usedLifelines.lastQuestionUsed = this.currentQuestion;
        if (this.lifelines.askAudience) this.lifelines.askAudience.disabled = true;
    }

    renderAudienceChart(results) {
        if (!this.audienceChart) {
            this.showHostMessage(
                `Голоса зала — A: ${results.A}%, B: ${results.B}%, C: ${results.C}%, D: ${results.D}%`
            );
            return;
        }

        this.audienceChart.hidden = false;
        this.audienceChart.querySelectorAll(".audience-chart__col").forEach((col) => {
            const bar = col.querySelector(".audience-chart__bar");
            const pct = col.querySelector(".audience-chart__pct");
            const letter = bar.dataset.letter;
            const value = results[letter] || 0;
            pct.textContent = `${value}%`;
            requestAnimationFrame(() => {
                bar.style.height = `${Math.max(value, 2)}%`;
            });
        });
    }

    hideAudienceChart() {
        if (!this.audienceChart) return;
        this.audienceChart.hidden = true;
        this.audienceChart.querySelectorAll(".audience-chart__bar").forEach((bar) => {
            bar.style.height = "0%";
        });
    }

    /* ─── Подтверждение ответа ─────────────────────────────── */

    showConfirmationModal() {
        this.isPaused = true;
        this.showModal(this.confirmationModal);
    }

    hideConfirmationModal() {
        this.isPaused = false;
        this.hideModal(this.confirmationModal);
    }

    handleConfirmation(confirmed) {
        const answer = this.selectedAnswer;
        this.hideConfirmationModal();

        if (confirmed) {
            this.processAnswer(answer);
        } else {
            const button = this.answerButtons[answer];
            if (button) button.classList.remove("is-selected");
        }
        this.selectedAnswer = null;
    }

    /* ─── Модальные окна ───────────────────────────────────── */

    showModal(modal) {
        if (!modal) return;
        modal.classList.remove("is-closing");
        modal.hidden = false;
        // Совместимость со старыми проверками display
        modal.style.display = "flex";
    }

    hideModal(modal, callback) {
        if (!modal || modal.hidden) {
            if (callback) callback();
            return;
        }

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            modal.hidden = true;
            modal.style.display = "none";
            modal.classList.remove("is-closing");
            if (callback) callback();
        };

        modal.classList.add("is-closing");
        modal.addEventListener("animationend", finish, { once: true });
        // Страховка, если animationend не сработает (reduced motion, JSDOM)
        this.setTrackedTimeout(finish, 350);
    }

    copyPromo(button) {
        const code = button.dataset.copy;
        const done = () => {
            const original = button.textContent;
            button.textContent = "Скопировано!";
            this.setTrackedTimeout(() => { button.textContent = original; }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(done).catch(done);
        } else {
            done();
        }
        TG.haptic("success");
    }

    /* ─── Завершение игры ──────────────────────────────────── */

    getGuaranteedPrize() {
        let guaranteed = 0;
        MillionaireGame.MILESTONES.forEach((index) => {
            if (this.currentQuestion > index) {
                guaranteed = this.prizes[index];
            }
        });
        return guaranteed;
    }

    winGame() {
        this.stopTimer();
        this.answersLocked = true;
        this.showHostMessage("Невероятно! Вы стали миллионером!");
        TG.sendResult({ result: "win", prize: 1000000, timestamp: Date.now() });
        this.setTrackedTimeout(() => this.showModal(this.winnerModal), 1800);
    }

    endGame() {
        this.stopTimer();
        const finalPrize = this.getGuaranteedPrize();

        if (this.finalResult) {
            this.finalResult.textContent = finalPrize > 0
                ? `Ваш выигрыш: ${this.formatMoney(finalPrize)}`
                : `Вы дошли до вопроса №${this.currentQuestion + 1}`;
        }

        TG.sendResult({
            result: "lose",
            prize: finalPrize,
            question: this.currentQuestion + 1,
            timestamp: Date.now()
        });

        this.showModal(this.consolationModal);
    }
}

/* ─── Запуск ───────────────────────────────────────────────── */

if (typeof module !== "undefined" && module.exports) {
    module.exports = MillionaireGame;
} else {
    document.addEventListener("DOMContentLoaded", () => {
        TG.init();
        new MillionaireGame();
    });
}
