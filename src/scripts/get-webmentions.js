import fs from "fs";
import fetch from "node-fetch";
import lodash from "lodash";
import dotenv from "dotenv";
dotenv.config();

// Define Cache Location and API Endpoint
const CACHE_DIR = "src/content/data";
const TOKEN = process.env.WEBMENTION_API_KEY;

async function fetchWebmentions(since, perPage = 100) {
  let allMentions = { children: [] };
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    // Clamp the since date to the current time to avoid querying future dates
    let sinceParam = since;
    if (since) {
      const sinceDate = new Date(since);
      const now = new Date();
      if (sinceDate > now) {
        console.log(
          ">>> Warning: Last fetch time was in the future, resetting to current time",
        );
        sinceParam = now.toISOString();
      }
    }

    let url = `https://webmention.io/api/mentions.jf2?domain=maggieappleton.com&token=${TOKEN}&per-page=${perPage}&page=${page}`;
    if (sinceParam) {
      url += `&since=${sinceParam}`;
    }

    console.log(`>>> Fetching webmentions page ${page}...`);
    const response = await fetch(url);
    console.log(">>> Response status:", response.status);

    if (response.ok) {
      const feed = await response.json();
      if (feed.children && feed.children.length > 0) {
        allMentions.children = [...allMentions.children, ...feed.children];
        console.log(
          `>>> ${feed.children.length} mentions fetched on page ${page}`,
        );
        page++;
      } else {
        hasMore = false;
      }
    } else {
      const errorText = await response.text();
      console.log(">>> Error response:", errorText);
      hasMore = false;
    }
  }

  console.log(`>>> Total mentions fetched: ${allMentions.children.length}`);
  return allMentions;
}

// Merge fresh webmentions with cached entries, unique per id
function mergeWebmentions(a, b) {
  return lodash.unionBy(a.children, b.children, "wm-id");
}

// save combined webmentions in cache file
function writeToCache(data) {
  const filePath = `${CACHE_DIR}/webmentions.json`;
  const fileContent = JSON.stringify(data, null, 2);
  // create cache folder if it doesnt exist already
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR);
  }
  // write data to cache json file synchronously so errors propagate to the caller
  fs.writeFileSync(filePath, fileContent);
  console.log(`>>> webmentions saved to ${filePath}`);
}

// get cache contents from json file
function readFromCache() {
  const filePath = `${CACHE_DIR}/webmentions.json`;

  if (fs.existsSync(filePath)) {
    const cacheFile = fs.readFileSync(filePath);
    const cache = JSON.parse(cacheFile);
    console.log(">>> Last fetch time was:", cache.lastFetched);
    return cache;
  }

  // no cache found.
  return {
    lastFetched: null,
    children: [],
  };
}

async function readCacheAndFetch() {
  console.log(">>> Starting webmention fetch...");
  const cache = readFromCache();

  if (cache.children.length) {
    console.log(`>>> ${cache.children.length} webmentions loaded from cache`);
    console.log(">>> Fetching new webmentions since last fetch...");
    const feed = await fetchWebmentions(cache.lastFetched);

    if (feed) {
      const webmentions = {
        lastFetched: new Date().toISOString(),
        children: mergeWebmentions({ children: cache.children }, feed),
      };
      writeToCache(webmentions);
      return webmentions;
    }
  } else {
    // No cache exists, fetch all mentions
    console.log(">>> No cache found. Fetching all webmentions...");
    const feed = await fetchWebmentions(null);

    if (feed) {
      const webmentions = {
        lastFetched: new Date().toISOString(),
        children: feed.children,
      };
      writeToCache(webmentions);
      return webmentions;
    }
  }

  return cache;
}

readCacheAndFetch().catch(console.error);
