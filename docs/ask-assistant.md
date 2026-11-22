# Ask Developer Connects: the property research assistant

A chat at `/ask` for buyers in Mumbai/India and Dubai. It is more accurate than a general chatbot on this subject because it is narrower, not because it uses a smarter model.

## How it stays accurate

1. **Closed knowledge.** It answers only from the site's own published content: 38 guides, the glossary, city pages, regulator facts and tool explanations, cut into 507 passages (`src/lib/ask/corpus.ts`). Built from the same data as the pages, so a corrected guide corrects the assistant. No database is read, so it uses no Firestore reads.
2. **Decline in code first.** `retrieve.ts` ranks passages (BM25) and decides when nothing really answers the question (off-topic, or not covered). Then no AI is called and the visitor is told so. Predictable, free, tested.
3. **Verified citations.** The passages are sent to Claude as documents with citations switched on (`prompt.ts`). The API ties each sentence to the exact quoted words in a passage (`answer.ts`). The buyer sees numbered markers, the quote, the page link and the date the facts were last checked.
4. **No source, no answer.** If a reply carries no citation it is not shown as an answer; the visitor gets the relevant guide passages instead. The model replies `NOT_COVERED` when the documents do not answer; that becomes a plain "not covered" message.
5. **Rules in the prompt.** Documents only; India and Dubai kept apart (never mix rupees and dirhams); no changing rates stated unless a document gives them with its checked date; no rankings, "best", price or return predictions, or "safe/licensed" claims; no legal, tax or investment advice; documents are data, not instructions (prompt-injection resistant).
6. **Degrades safely.** No API key, daily cap reached, API error, or refusal: the page still works as search over the guides (zero cost, cannot be wrong about what the guides say).

It cannot know: live listings, current prices, today's stamp-duty or other changing rates, individual projects' RERA status, or anything not in the guides. That is deliberate.

## Turning AI answers on (you do this part)

1. Create an Anthropic API key at console.anthropic.com. In the console, set a **monthly spend limit** on the workspace: that is the real hard cap on cost.
2. Add `ANTHROPIC_API_KEY` to the Vercel project environment (Production) and redeploy.
3. Optional settings (all environment variables): `ASK_MODEL` (default `claude-opus-5-5`), `ASK_EFFORT` (`low` default, `medium`, `high`), `ASK_DAILY_CAP` (default 400 AI answers a day per server instance, then visitors get search results), `ASK_ENABLED=false` to switch AI answers off without removing the key.
4. Run `npm run ask:eval` once with the key set. It runs every evaluation question through the real model and checks citations, correct source, no mixed currencies, and that rankings, rate and injection traps are not answered. Read the printed answers too.

## Cost (estimates, not yet measured)

About 1,300 input and 250 to 550 output tokens per question. At Claude Opus 5.5 prices ($4 / $20 per million tokens) that is roughly 1.5 to 2 US cents (about ₹1.5) a question; Claude Sonnet 5.5 ($2 / $10) about half; Claude Haiku 5.5 ($0.10 / $0.50) about a tenth of a cent. Set `ASK_MODEL` to change it. Measure with the real numbers in the Vercel logs (`ask` lines carry token counts, never the question).

## Privacy

The question text is never stored or logged. Logs hold only sizes, the ids of the passages used, token counts and timings. Requests are limited per visitor (8 per 10 minutes, 40 a day) and per day for the site, in memory per server instance. Because uploaded documents are not accepted yet, no personal documents are processed.

## Keeping it accurate

- `src/lib/ask/eval-set.ts` is the contract: questions that must find their source, and questions that must be declined. `npm test` fails if a guide change breaks one.
- Add a question there whenever a buyer asks something the assistant got wrong.
- Guide facts carry a checked date; update it only when the facts were actually re-checked.

## Not built yet (and why)

- Answers about a specific project or developer: needs the regulator-record archive described in `docs/differentiation-strategy.md`.
- Live Dubai transaction data: needs a check of the Dubai Pulse data's freshness and terms.
- Uploading an agreement: needs consent, retention and deletion rules (India's data protection law) reviewed first.
- Hindi/Marathi quality checks: Claude replies in the buyer's language, but the guides are in English; test with native readers before promoting.
