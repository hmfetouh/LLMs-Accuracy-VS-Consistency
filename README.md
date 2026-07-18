# LLM MCQ Evaluator

A Next.js web app that benchmarks large language models on multiple-choice questions, measuring both **accuracy** and **consistency** across repeated trials.

---

## What it does

Upload a CSV of multiple-choice questions, select one or more LLM providers/models, and the app runs each question through **3 trials**. If a model gives different answers across the 3 trials for the same question, it runs **7 additional trials (up to 10 total)** for those inconsistent questions to measure how reliably the model converges on an answer.

**Key metrics produced:**

| Metric | Description |
|---|---|
| Accuracy | % of questions answered correctly per trial |
| Always Correct | Questions the model got right in all 3 trials |
| Always Incorrect | Questions the model got wrong in all 3 trials (same wrong answer) |
| Variable | Questions where the model gave different answers across trials |
| Correct Rate (% of 10) | For variable questions: % of all 10 trials answered correctly |
| Consistency Score | % of questions where the model committed to the same answer (right or wrong) |

Results include per-class breakdowns (if your CSV has a class column), charts, and CSV exports.

---

## Supported providers

| Provider | Notes |
|---|---|
| **Claude** (Anthropic) | Supports adaptive thinking on Opus 4, Sonnet 4.6, Claude 3.7 |
| **OpenAI** | GPT-4o, o1, o3, and compatible models |
| **Ollama** | Local models via `http://localhost:11434` |
| **DeepSeek** | Via DeepSeek API |
| **OpenWebUI** | Local OpenWebUI instance on port 3001 |

---

## CSV format

The app expects a CSV with at least these columns:

```
ID, Question, Answer
```

- **Answer** must be a single letter: `A`, `B`, `C`, `D`, or `E`
- An optional **Class** column groups questions by category (e.g. subject area, difficulty step)

Example:

```csv
ID,Class,Question,Answer
1,Step 1,"A 14-year-old boy presents with...",A
2,Step 2,"A 52-year-old woman presents with...",D
```

CSV files are git-ignored and never committed.

---

## Getting started

**Prerequisites:** Node.js 18+

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # Production build
npm run lint    # ESLint
```

---

## Project structure

```
src/app/
  page.tsx            # All UI and evaluation logic (single file)
  api.ts              # LLM provider verification helpers
  api/chat/route.ts   # Server-side proxy — forwards requests to external LLM APIs
  layout.tsx
  providers.tsx       # Chakra UI provider setup
```

All application logic lives in `src/app/page.tsx`. The server-side proxy at `/api/chat` is the only backend route; it exists to avoid CORS issues when calling external APIs from the browser.

---

## How the evaluation works

1. **Trial 1** — each question is sent individually (one API call per question)
2. **Trial 2 & 3** — all questions are batched (up to 10 per API call) using a numbered-list prompt
3. **Inconsistency detection** — after trial 3, questions where the model gave different answers across trials are identified
4. **Extended trials (4–10)** — those inconsistent questions are re-run in 7 more batched trials to compute a stable correct rate

If any trial produces a response that can't be parsed as a single letter (A–E), it is flagged for **manual review**. The review panel lets you assign the correct answer or mark it as wrong before the evaluation continues.

The evaluation supports **pause/resume** at any point, including mid-trial and mid-review.

---

## System prompt

The default system prompt sent with every question:

```
Answer with only the single correct option letter (A, B, C, or D). For multiple questions, use a numbered list:
1. A
2. B
No explanation or extra text.
```

You can edit it in the app before starting an evaluation.

---

## Exports

All results can be exported as CSV:

- **Full results** — per-question answers for all trials (T1–T10), pre/post-review answers, and % of 10
- **Summary** — per-model accuracy per trial, with optional class breakdown
- **Consistency & reliability** — always correct / always incorrect / variable counts
- **Variable correct rate** — average correct rate for inconsistent questions
- **Consistency score** — how often each model commits to the same answer
- **API logs** — raw request/response log for every API call
