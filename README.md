# Telegram Millionaire Game

This project contains a small web game that mimics "Who Wants to Be a Millionaire". The repository now includes a Jest based test suite.

## Running the tests

Install dependencies before running tests:

```bash
npm install
```

In automated environments you may prefer:

```bash
npm ci
```

Run the Jest suite:

```bash
npm test
```

The test environment uses JSDOM to simulate the game DOM and verify behaviours of `MillionaireGame`.

## Bot configuration

The Telegram bot expects its token to be supplied via the `BOT_TOKEN` environment
variable. Start the bot with:

```bash
BOT_TOKEN=your-telegram-token node bot.js
```
