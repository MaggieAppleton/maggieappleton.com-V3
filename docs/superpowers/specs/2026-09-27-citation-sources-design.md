# Citation sources in Writing Assist

## Existing flow

Jev classifies sentences for the Citation needed check. The hover card stays compact. The pinned `ChecksPopover` currently has no citation body; the editor mount keeps generated check state for a page visit. The assist controller maps sentence offsets to Lexical text nodes and uses `$toggleLink` for internal links.

## Behaviour

Opening a pinned citation card requests claim extraction for that sentence. The generator returns exact substrings and the kind of source each needs. The server accepts only nonempty, unique substrings that occur in the supplied sentence, with unambiguous offsets. It does not change Jev's classification. The card shows each claim as a quote with its source guidance and a **Find sources** button. No web search runs during hover or extraction.

Clicking **Find sources** searches the web for that claim. The local editor server uses OpenAI's web search tool to discover candidate URLs, fetches a small bounded set of public HTML pages, and assesses passages against the claim. A passage must match the fetched page text before it can be displayed. Search snippets and model assertions alone never count as evidence. Show at most two candidates, each with title, publisher, URL, supporting passage, and an explicit **Uncertain match** label when support is indirect. Unsupported or inaccessible pages are omitted. Loading, no-result, and error states stay inside the relevant claim row. **Open source** opens the URL; **Insert citation** links the exact claim span.

Claim and source state lives in the editor mount, keyed by annotation identity and sentence hash. Closing and reopening the card during one page visit preserves results. Changing the sentence gives a new key and requires extraction and search again.

## Insertion safety

Before linking, compare the stored sentence text and claim substring with the current sentence and mapped DOM range. Inside the Lexical update, select only the claim offsets, require plain unlinked text, verify the selected text again, then apply the external URL with `$toggleLink`. A mismatch leaves the document untouched and tells the writer to search again. Only valid `http` or `https` source URLs can be inserted.

## Boundaries and verification

Use a small citation server module and one authenticated editor route for extraction/search, following existing assist routes and provider configuration. Keep citation UI separate from other check suggestions and preserve existing CSS tokens. Focused tests cover multiple claims, invalid claim quotes, unsupported and uncertain source results, stale text, and exact-span link insertion. No source text is persisted beyond the current page visit.
