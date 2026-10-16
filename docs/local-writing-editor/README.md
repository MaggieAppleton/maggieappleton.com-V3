# Local writing editor

Run `npm run dev` and choose **Edit** on an existing note or essay, including a draft. Create new MDX files through the normal development workflow. The editor and its file-writing API are available only on the local development server; they are absent from production builds.

Edit the title, description, and supported prose in place. Images, code blocks, tables, embeds, and other components retain their rendered appearance but are read-only. Existing `[[wiki links]]` remain intact; the editor does not insert or retarget them.

Changes autosave after a short pause. Use **Save** or Cmd/Ctrl+S to save immediately. The fixed dock shows save status and opens a details panel for errors.

The file can change elsewhere while it is open, for example in another editor, another tab, or through git. If you have no unsaved writing, the editor reloads to show the new file. If you do, it merges your writing with the file on disk, paragraph by paragraph, and saves the result. If both sides changed the same passage, the dock asks you to choose. **Keep my edits** saves your version of that passage and keeps every other change from disk. **Use file on disk** loads the file as it is. Either way, the version you don't keep is set aside in the dock, where you can copy or download it.

Unsaved recovery copies are stored in this browser for the current local origin. When you recover one, it is merged with the current file in the same way.

To check changes, run `npm run test:editor`, `npm run test:editor:e2e`, and `npm run build:local`. Browser tests work in disposable project copies; they do not edit authored content in this checkout.
