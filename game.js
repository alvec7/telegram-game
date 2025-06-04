const tg = window.Telegram.WebApp;

// Инициализация WebApp
tg.expand(); // Развернуть на весь экран
tg.ready(); // Сообщить Telegram что приложение готово

// Для отправки результатов игры в Telegram:
function sendGameResults(score) {
    tg.sendData(JSON.stringify({
        score: score,
        timestamp: Date.now()
    }));
}

class MillionaireGame {
    constructor() {
        this.currentQuestion = 0;
        this.prizes = [
            100, 200, 300, 500, 1000,      // 1-5
            2000, 4000, 8000, 16000, 32000, // 6-10
            64000, 125000, 250000, 500000, 1000000 // 11-15
        ];
        this.questions = [...questions];
        this.usedLifelines = {
            fiftyFifty: false,
            phoneFriend: false,
            askAudience: false,
            lastQuestionUsed: -1
        };

        this.timer = null;
        this.timeLeft = 60;
        this.timerElement = document.getElementById('timer');

        this.thinkingStartTime = null;
        this.selectedAnswer = null;
        this.confirmationModal = document.getElementById('confirmation-modal');
        this.confirmYesButton = document.getElementById('confirm-yes');
        this.confirmNoButton = document.getElementById('confirm-no');

        this.isPaused = false;

        this.startButtonContainer = document.getElementById('start-button-container');
        this.startButton = document.getElementById('start-button');

        this.lifelines = {
            fiftyFifty: document.getElementById('fifty-fifty'),
            phoneFriend: document.getElementById('phone-friend'),
            askAudience: document.getElementById('ask-audience')
        };
        this.lifelinesContainer = document.querySelector('.lifelines');

        this.winnerModal = document.getElementById('winner-modal');
        this.consolationModal = document.getElementById('consolation-modal');

        this.initializeElements();
        this.initializeEventListeners();
        this.initializeNewGame();
        this.startGame();

        // Находим все кнопки закрытия
        document.querySelectorAll('.close-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const modal = e.target.closest('.confirmation-modal, .prize-modal');
                if (modal) {
                    if (modal.id === 'confirmation-modal') {
                        this.hideConfirmationModal();
                    } else if (modal.id === 'winner-modal') {
                        this.hideWinnerModal();
                    } else if (modal.id === 'consolation-modal') {
                        this.hideConsolationModal();
                    }
                }
            });
        });

        const mainButton = tg.MainButton;

        document.getElementById('start-button').addEventListener('click', () => {
            mainButton.setText('Играть снова');
            mainButton.show();
        });

        mainButton.onClick(() => {
            this.startFirstQuestion();
        });
    }

    initializeElements() {
        this.questionElement = document.getElementById('question');
        this.answerButtons = {
            A: document.getElementById('A'),
            B: document.getElementById('B'),
            C: document.getElementById('C'),
            D: document.getElementById('D')
        };
        this.hostMessage = document.getElementById('host-message');
    }

    initializeEventListeners() {
        Object.entries(this.answerButtons).forEach(([letter, button]) => {
            button.addEventListener('click', () => this.checkAnswer(letter));
        });

        this.lifelines.fiftyFifty.addEventListener('click', () => this.useFiftyFifty());
        this.lifelines.phoneFriend.addEventListener('click', () => this.usePhoneFriend());
        this.lifelines.askAudience.addEventListener('click', () => this.useAskAudience());

        this.confirmYesButton.addEventListener('click', () => this.handleConfirmation(true));
        this.confirmNoButton.addEventListener('click', () => this.handleConfirmation(false));

        this.startButton.addEventListener('click', () => this.startFirstQuestion());

        // Добавляем обработчик для кнопки "Сыграть снова"
        document.querySelector('.play-again').addEventListener('click', () => {
            this.hideConsolationModal(() => this.resetGame());
        });
    }

    initializeNewGame() {
        this.currentQuestion = 0;
        this.questions = [...questions];
        this.usedLifelines = {
            fiftyFifty: false,
            phoneFriend: false,
            askAudience: false,
            lastQuestionUsed: -1
        };

        this.timeLeft = 60;
        this.timer = null;
        this.thinkingStartTime = null;
        this.isPaused = false;

        Object.keys(this.lifelines).forEach(key => {
            this.lifelines[key].disabled = false;
        });

        Object.values(this.answerButtons).forEach(button => {
            button.className = 'answer';
        });
    }

    resetGame() {
        this.questionElement.style.visibility = 'hidden';
        Object.values(this.answerButtons).forEach(button => {
            button.style.visibility = 'hidden';
        });
        this.timerElement.style.visibility = 'hidden';
        this.lifelinesContainer.style.display = 'none';

        this.initializeNewGame();

        this.startGame();
    }

    startGame() {
        const introMessages = [
            "Приветствуем вас на игре «Кто хочет стать миллионером»! Вам предстоит проверить свои знания о морском деле и побороться за миллион.",
            "Для ответа на каждый вопрос у вас будет ровно минута. Следите за временем — секундомер справа от вас.",
            "Наш спонсор – маркетплейс яхтенных туров ImSkipper – желает вам семь футов под килем! Отдать швартовы!"
        ];

        this.questionElement.style.visibility = 'hidden';
        Object.values(this.answerButtons).forEach(button => {
            button.style.visibility = 'hidden';
        });
        this.timerElement.style.visibility = 'hidden';
        this.startButtonContainer.style.display = 'none';
        this.lifelinesContainer.style.display = 'none';

        this.showHostMessage(introMessages[0]);

        setTimeout(() => {
            this.showHostMessage(introMessages[1]);

            setTimeout(() => {
                this.showHostMessage(introMessages[2]);

                setTimeout(() => {
                    this.startButtonContainer.style.display = 'block';
                }, 5000);

            }, 5000);

        }, 5000);
    }

    startFirstQuestion() {
        this.startButtonContainer.style.display = 'none';

        this.questionElement.style.visibility = 'visible';
        Object.values(this.answerButtons).forEach(button => {
            button.style.visibility = 'visible';
        });
        this.timerElement.style.visibility = 'visible';
        this.lifelinesContainer.style.display = 'flex';

        this.showQuestion();
    }

    startTimer() {
        this.timeLeft = 60;
        this.updateTimerDisplay();
        this.thinkingStartTime = Date.now();

        if (this.timer) {
            clearInterval(this.timer);
        }

        this.timer = setInterval(() => {
            if (!this.isPaused) {
                this.timeLeft--;
                this.updateTimerDisplay();

                if (this.timeLeft <= 10) {
                    this.timerElement.classList.add('warning');
                }

                if (this.timeLeft <= 0) {
                    this.timeExpired();
                }
            }
        }, 1000);
    }

    updateTimerDisplay() {
        this.timerElement.textContent = this.timeLeft;
    }

    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.timerElement.classList.remove('warning');
    }

    timeExpired() {
        this.stopTimer();
        this.showHostMessage("Время истекло!");
        setTimeout(() => {
            this.showHostMessage(this.getRandomPhrase('wrong'));
            setTimeout(() => this.endGame(), 2000);
        }, 1000);
    }

    showQuestion() {
        if (this.currentQuestion >= this.questions.length) {
            this.winGame();
            return;
        }

        const question = this.questions[this.currentQuestion];
        if (!question) {
            console.error('Ошибка: вопрос не найден');
            this.endGame();
            return;
        }

        this.questionElement.textContent = question.question;

        Object.entries(question.answers).forEach(([letter, answer]) => {
            const button = this.answerButtons[letter];
            button.innerHTML = `<span class="letter">${letter}:</span> «${answer}»`;
            button.className = 'answer';
            button.style.visibility = 'visible';
        });

        this.startTimer();
        this.thinkingStartTime = Date.now();
        this.updatePrizeTable();
    }

    checkAnswer(selectedAnswer) {
        const thinkingTime = (Date.now() - this.thinkingStartTime) / 1000;
        const lifelineUsed = this.usedLifelines.fiftyFifty ||
                             this.usedLifelines.phoneFriend ||
                             this.usedLifelines.askAudience;
        const usedLifelinesOnCurrentQuestion =
            lifelineUsed && this.usedLifelines.lastQuestionUsed === this.currentQuestion;

        if (thinkingTime > 25 || usedLifelinesOnCurrentQuestion) {
            this.selectedAnswer = selectedAnswer;
            this.showConfirmationModal();
        } else {
            this.processAnswer(selectedAnswer);
        }
    }

    useFiftyFifty() {
        if (this.usedLifelines.fiftyFifty) return;

        const question = this.questions[this.currentQuestion];
        const wrongAnswers = Object.keys(question.answers)
            .filter(letter => letter !== question.correct);

        const answersToHide = wrongAnswers
            .sort(() => Math.random() - 0.5)
            .slice(0, 2);

        answersToHide.forEach(letter => {
            this.answerButtons[letter].style.visibility = 'hidden';
        });

        this.usedLifelines.fiftyFifty = true;
        this.usedLifelines.lastQuestionUsed = this.currentQuestion;
        this.lifelines.fiftyFifty.disabled = true;
    }

    usePhoneFriend() {
        if (this.usedLifelines.phoneFriend) return;

        const question = this.questions[this.currentQuestion];
        const confidence = Math.random();
        let message;

        if (confidence > 0.7) {
            const correctText = question.answers[question.correct];
            message = `Я уверен на 90%, что правильный ответ - ${question.correct}: «${correctText}»`;
        } else {
            const randomLetter = Object.keys(question.answers)[Math.floor(Math.random() * 4)];
            const randomText = question.answers[randomLetter];
            message = `Я не совсем уверен, но возможно это ${randomLetter}: «${randomText}»`;
        }

        this.showHostMessage(`Ваш друг говорит: "${message}"`);
        this.usedLifelines.phoneFriend = true;
        this.usedLifelines.lastQuestionUsed = this.currentQuestion;
        this.lifelines.phoneFriend.disabled = true;
    }

    useAskAudience() {
        if (this.usedLifelines.askAudience) return;

        const question = this.questions[this.currentQuestion];
        const results = {};
        let remaining = 100;

        Object.keys(question.answers).forEach(letter => {
            if (letter === question.correct) {
                results[letter] = 40 + Math.floor(Math.random() * 30);
            } else {
                results[letter] = Math.floor(Math.random() * (remaining / 3));
            }
            remaining -= results[letter];
        });

        this.showHostMessage(`Результаты голосования зала:
            A: ${results.A}%,
            B: ${results.B}%,
            C: ${results.C}%,
            D: ${results.D}%`);

        this.usedLifelines.askAudience = true;
        this.usedLifelines.lastQuestionUsed = this.currentQuestion;
        this.lifelines.askAudience.disabled = true;
    }

    showHostMessage(message) {
        this.hostMessage.textContent = message;
    }

    getRandomPhrase(type) {
        const phrases = hostPhrases[type];
        return phrases[Math.floor(Math.random() * phrases.length)];
    }

    updatePrizeTable() {
        document.querySelectorAll('.prize-row').forEach(row => {
            row.classList.remove('current');
        });

        const currentRow = document.getElementById(String(this.currentQuestion + 1));
        if (currentRow) {
            currentRow.classList.add('current');
        }
    }

    showWinnerModal() {
        this.winnerModal.style.display = 'flex';
        this.winnerModal.classList.remove('fade-out');
        void this.winnerModal.offsetWidth;
        this.winnerModal.classList.add('fade-in');
    }

    showConsolationModal() {
        this.consolationModal.style.display = 'flex';
        this.consolationModal.classList.remove('fade-out');
        void this.consolationModal.offsetWidth;
        this.consolationModal.classList.add('fade-in');
    }

    hideWinnerModal() {
        this.winnerModal.classList.remove('fade-in');
        this.winnerModal.classList.add('fade-out');
        this.winnerModal.addEventListener('animationend', () => {
            this.winnerModal.style.display = 'none';
            this.winnerModal.classList.remove('fade-out');
        }, { once: true });
    }

    hideConsolationModal(callback) {
        this.consolationModal.classList.remove('fade-in');
        this.consolationModal.classList.add('fade-out');
        this.consolationModal.addEventListener('animationend', () => {
            this.consolationModal.style.display = 'none';
            this.consolationModal.classList.remove('fade-out');
            if (callback) callback();
        }, { once: true });
    }

    winGame() {
        this.showHostMessage("Поздравляем! Вы стали миллионером!");
        setTimeout(() => {
            this.showWinnerModal();
        }, 3000);
    }

    endGame() {
        let finalPrize = 0;
        if (this.currentQuestion >= 10) {
            finalPrize = 32000;
        } else if (this.currentQuestion >= 5) {
            finalPrize = 1000;
        } else if (this.currentQuestion > 0) {
            finalPrize = this.prizes[this.currentQuestion - 1];
        }

        this.showHostMessage(`Игра окончена. Ваш выигрыш: ${finalPrize} рублей`);
        setTimeout(() => {
            this.showConsolationModal();
        }, 3000);
    }

    showConfirmationModal() {
        this.isPaused = true;
        this.confirmationModal.style.display = 'flex';
    }

    hideConfirmationModal() {
        this.isPaused = false;
        this.confirmationModal.style.display = 'none';
    }

    handleConfirmation(confirmed) {
        this.hideConfirmationModal();
        if (confirmed) {
            this.processAnswer(this.selectedAnswer);
        }
    }

    processAnswer(selectedAnswer) {
        this.stopTimer();
        const question = this.questions[this.currentQuestion];

        if (selectedAnswer === question.correct) {
            this.answerButtons[selectedAnswer].classList.add('correct');
            this.showHostMessage(this.getRandomPhrase('correct'));

            setTimeout(() => {
                const currentPrize = this.prizes[this.currentQuestion];
                this.showHostMessage(`Вы выиграли ${currentPrize} рублей!`);

                setTimeout(() => {
                    this.currentQuestion++;
                    if (this.currentQuestion < this.questions.length) {
                        this.showHostMessage(`Следующий вопрос будет на ${this.prizes[this.currentQuestion]} рублей.`);
                        setTimeout(() => {
                            this.thinkingStartTime = null;
                            this.showQuestion();
                        }, 2000);
                    } else {
                        this.winGame();
                    }
                }, 2000);
            }, 2000);
        } else {
            this.answerButtons[selectedAnswer].classList.add('wrong');
            this.answerButtons[question.correct].classList.add('correct');
            this.showHostMessage(this.getRandomPhrase('wrong'));
            this.thinkingStartTime = null;
            setTimeout(() => this.endGame(), 2000);
        }
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = MillionaireGame;
} else {
    window.onload = () => new MillionaireGame();
}

