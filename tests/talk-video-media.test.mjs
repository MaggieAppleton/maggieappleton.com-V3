import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('every Reveal demo has the same playable mobile clip and a poster', async () => {
  const [markup, transcript, media] = await Promise.all([
    read('src/components/unique/fortune-telling/slides.html'),
    read('src/content/talks/fortune-telling.mdx'),
    read('src/data/talks/fortune-telling.json').then(JSON.parse),
  ]);
  let demos = 0;
  for (const section of markup.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)) {
    const clip = section[2].match(/<source\b[^>]*src="([^"]+\.mp4)"/);
    if (!clip) continue;
    demos++;
    const source = section[1].match(/data-source-slide="([^"]+)"/)[1];
    const steps = [...transcript.matchAll(/<div data-slide="(\d+)" data-source-slide="([^"]+)"/g)]
      .filter(step => step[2] === source);
    assert(steps.length, `Missing transcript for ${source}`);
    for (const step of steps) {
      const entry = media[Number(step[1])];
      assert.equal(entry?.src, clip[1], `Mobile must play ${clip[1]}`);
      assert(entry.title, `Missing accessible name for ${clip[1]}`);
      assert.match(entry.background, /^#[a-f0-9]{6}$/i);
      await access(fileURLToPath(new URL(`public${entry.src}`, root)));
      await access(fileURLToPath(new URL(`public${entry.src.replace(/\.mp4$/, '-poster.jpg')}`, root)));
    }
  }
  assert(demos > 0, 'No desktop demos found');
});
