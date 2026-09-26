# Writing Assist decisions

## 2026-09-26 · 00 foundation · Default text generator

Maggie asked for OpenAI `gpt-6-sol` as Writing Assist's default text generator. The debug tool therefore uses OpenAI `gpt-6-sol` instead of the Anthropic Haiku model shown in the approved foundation config. `OPENAI_MODEL` can override the model, and the OpenAI provider is available when its API key is set. The Anthropic adapter remains available for tools that select it. This changes the default provider and model; the interface and tool behaviour stay as specified.

## 2026-09-26 · 02 repetition · Default text generator

Maggie confirmed that OpenAI `gpt-6-sol` is the default text generator for Writing Assist itself. Repetition chat therefore uses OpenAI `gpt-6-sol` instead of the Anthropic model in spec 02. `OPENAI_MODEL` can override it; the Anthropic provider remains selectable and is still checked live at the end of the slice. The repetition analysis remains with Jev.

## 2026-09-26 · 04 margin checks · Default text generator

Maggie's OpenAI `gpt-6-sol` default also applies to margin check hover suggestions and chat. Both use OpenAI `gpt-6-sol` instead of the two Anthropic models shown in spec 04; `OPENAI_MODEL` can override the model. Check detection remains with Jev, and the Anthropic provider remains available and is checked live.
