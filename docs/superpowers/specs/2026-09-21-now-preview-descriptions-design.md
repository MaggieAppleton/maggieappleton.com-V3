# Now Preview Descriptions

## Summary

Now-page link previews should use the same title-and-description card as essays and notes. Titles use `Now update – <frontmatter title>`. Descriptions are generated once with a local Ollama model, stored in each Now entry's frontmatter, and remain editable editorial metadata.

## Goals

- Give every non-draft Now entry a concise preview description.
- Keep normal development and production builds deterministic and independent of Ollama.
- Store descriptions beside their source content for later editing and reuse.
- Generate descriptions locally without sending content to third-party services.
- Preserve existing descriptions unless regeneration is explicitly requested.

## Generation workflow

Add a dedicated script that:

1. Reads all `src/content/now/*.mdx` entries.
2. Skips drafts and entries with an existing description by default.
3. Removes frontmatter, imports, JSX-only lines, Markdown formatting, and excess whitespace from the body.
4. Sends the title and cleaned body to Ollama using `qwen3.6:35b`.
5. Requests one factual plain-text sentence, approximately 110 characters or fewer, without repeating the title or inventing details.
6. Validates the returned text.
7. Writes the description into the entry's YAML frontmatter.
8. Prints changed, skipped, and failed entries.

An explicit regeneration flag may replace existing generated or edited descriptions. The default command must never overwrite them.

## Ollama boundary

The generator calls Ollama's local HTTP API at `http://127.0.0.1:11434`. The model defaults to `qwen3.6:35b` and may be overridden by a command-line option for local experimentation.

Model output is untrusted. A valid description must:

- be non-empty plain text;
- contain no Markdown, wrapping quotes, or line breaks;
- stay within the configured length limit;
- not begin with the Now entry title;
- contain no obvious preamble such as "Here is" or "This post".

An invalid response fails that entry visibly and is not written.

## Persistence and schema

Add optional `description` support to the Now content schema. Generated descriptions are written as quoted YAML strings in each entry's frontmatter. Frontmatter is the only durable source of Now descriptions; no separate sidecar is introduced.

The existing preview-index generator reads this field and emits:

```json
{
  "/now-2026-01": {
    "title": "Now update – January 2026",
    "description": "..."
  }
}
```

Ollama is never called by `npm run dev`, `npm run build`, or `npm run generate-links`.

## Error handling

- If Ollama is unavailable, stop before changing files and print an actionable connection error.
- If the requested model is unavailable, report the model name and the installed-model command.
- If an individual response is invalid, leave that entry unchanged and report the reason.
- If frontmatter cannot be parsed or rewritten safely, leave the file unchanged and fail the command.
- Use a non-zero exit code when any requested entry fails.

## Review and verification

Automated tests cover body cleanup, output validation, non-overwrite behavior, frontmatter serialization, and preview-index integration.

After generation:

- review all 14 descriptions for factual accuracy and voice;
- rerun the generator without regeneration and confirm every entry is skipped;
- run the focused link-preview tests;
- run the local production build;
- hover a Now link and confirm the card shows the formatted title and stored description.

## Scope

This change includes the local generation script, Now schema support, frontmatter descriptions for existing Now entries, preview-index integration, and focused tests. It does not add runtime AI calls, automatic build-time generation, descriptions for other collections, or a general-purpose summarization framework.
