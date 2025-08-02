#!/usr/bin/env node

import inquirer from "inquirer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createSmidgeon() {
  // Get smidgeon type from user
  const { smidgeonType } = await inquirer.prompt([
    {
      type: "list",
      name: "smidgeonType",
      message: "What type of smidgeon would you like to create?",
      choices: [
        { name: "Plain smidgeon note", value: "plain" },
        { name: "Link to external article/thing", value: "external" },
        { name: "Citation to a paper", value: "citation" },
      ],
    },
  ]);

  // Get title from user
  const { title } = await inquirer.prompt([
    {
      type: "input",
      name: "title",
      message: "What is the title of your smidgeon?",
      validate: (input) => {
        if (input.trim() === "") {
          return "Title cannot be empty";
        }
        return true;
      },
    },
  ]);

  // Get topics from user
  const { topics } = await inquirer.prompt([
    {
      type: "input",
      name: "topics",
      message: "What topics does this relate to? (comma-separated)",
      validate: (input) => {
        if (input.trim() === "") {
          return "Please provide at least one topic";
        }
        return true;
      },
    },
  ]);

  // Parse topics into array
  const topicsArray = topics
    .split(",")
    .map((topic) => `"${topic.trim()}"`)
    .join(", ");

  // Create filename
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric chars with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens

  const filename = `${year}-${month}-${slug}.mdx`;

  // Create frontmatter based on type
  let frontmatter = "";
  
  if (smidgeonType === "plain") {
    frontmatter = `---
title: "${title}"
startDate: ${date.toISOString()}
type: "smidgeon"
topics: [${topicsArray}]
draft: true
---

`;
  } else if (smidgeonType === "external") {
    frontmatter = `---
title: "${title}"
startDate: ${date.toISOString()}
type: "smidgeon"
topics: [${topicsArray}]
external:
  url: ""
  title: ""
  author: ""
draft: true
---

`;
  } else if (smidgeonType === "citation") {
    frontmatter = `---
title: "${title}"
startDate: ${date.toISOString()}
type: "smidgeon"
topics: [${topicsArray}]
citation:
  title: ""
  authors: [""]
  journal: ""
  year: 
  url: ""
draft: true
---

`;
  }

  // Write file directly in smidgeons directory
  const smidgeonsDir = path.join(
    __dirname,
    "..",
    "src",
    "content",
    "smidgeons",
  );
  const filePath = path.join(smidgeonsDir, filename);
  await fs.writeFile(filePath, frontmatter);

  console.log(`Created new ${smidgeonType} smidgeon at: ${filePath}`);

  // Open in VS Code
  exec(`code ${filePath}`, (error) => {
    if (error) {
      console.error("Could not open file in VS Code:", error);
    }
  });
}

createSmidgeon().catch(console.error);
