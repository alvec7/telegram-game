# Telegram Millionaire Game

This project contains a small web game that mimics "Who Wants to Be a Millionaire". The repository now includes a Jest based test suite.

## Running the tests

Before running the tests you must install the project dependencies.
For local development use:

```bash
npm install
```

In automated environments you may prefer the stricter:

```bash
npm ci
```

Run the Jest suite:

```bash
npm test
```

The test environment uses JSDOM to simulate the game DOM and verify behaviours of `MillionaireGame`.

## Continuous integration

For automated testing pipelines you can install dependencies using the helper
script in `scripts/setup-ci.sh`:

```bash
./scripts/setup-ci.sh
npm test
```

## Bot configuration

The Telegram bot expects its token to be supplied via the `BOT_TOKEN` environment
variable. Start the bot with:

```bash
BOT_TOKEN=your-telegram-token node bot.js
```
