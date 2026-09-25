# Local writing editor

Run `npm run dev` and choose **Edit** on an existing note or essay, including a draft. Create new MDX files through the normal development workflow. The editor and its file-writing API are available only on the local development server; they are absent from production builds.

Edit the title, description, and supported prose in place. Images, code blocks, tables, embeds, and other components retain their rendered appearance but are read-only. Existing `[[wiki links]]` remain intact; the editor does not insert or retarget them.

Changes autosave after a short pause. Use **Save** or Cmd/Ctrl+S to save immediately. The fixed dock shows save status and opens a details panel for errors. If the file changed elsewhere, saving stops so you can copy or download your browser version before loading the disk version. Unsaved recovery copies are stored in this browser for the current local origin.

To check changes, run `npm run test:editor`, `npm run test:editor:e2e`, and `npm run build:local`. Browser tests work in disposable project copies; they do not edit authored content in this checkout.
