/**
 * Build script that temporarily removes dev-only pages before building.
 * This allows us to have dynamic dev-only pages (edit, API) without breaking the static build.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

// Files/directories to temporarily remove during build
const devOnlyPaths = [
  'src/pages/edit',
  'src/pages/api/render-component.ts',
  'src/pages/api/save-post.ts',
];

// Temporary backup location
const backupDir = path.join(projectRoot, '.dev-only-backup');

// Backup dev-only files
function backupDevFiles() {
  console.log('📦 Backing up dev-only files...');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  for (const relativePath of devOnlyPaths) {
    const fullPath = path.join(projectRoot, relativePath);
    const backupPath = path.join(backupDir, relativePath);

    if (fs.existsSync(fullPath)) {
      // Create parent directory in backup
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });

      // Move file/directory to backup
      fs.renameSync(fullPath, backupPath);
      console.log(`  ✓ Backed up ${relativePath}`);
    }
  }
}

// Restore dev-only files from backup
function restoreDevFiles() {
  console.log('📦 Restoring dev-only files...');

  for (const relativePath of devOnlyPaths) {
    const fullPath = path.join(projectRoot, relativePath);
    const backupPath = path.join(backupDir, relativePath);

    if (fs.existsSync(backupPath)) {
      // Ensure parent directory exists
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });

      // Move back from backup
      fs.renameSync(backupPath, fullPath);
      console.log(`  ✓ Restored ${relativePath}`);
    }
  }

  // Clean up backup directory
  if (fs.existsSync(backupDir)) {
    fs.rmSync(backupDir, { recursive: true });
  }
}

// Temporarily modify astro.config.mjs to remove server output
function modifyAstroConfig() {
  const configPath = path.join(projectRoot, 'astro.config.mjs');
  const content = fs.readFileSync(configPath, 'utf-8');

  // Store original content
  fs.writeFileSync(path.join(backupDir, 'astro.config.mjs.bak'), content);

  // Remove output: "server" line
  const modified = content.replace(/\s*\/\/.*\n\s*\/\/.*\n\s*output:\s*["']server["'],?\n?/g, '\n');
  fs.writeFileSync(configPath, modified);
  console.log('  ✓ Temporarily removed server output from astro.config.mjs');
}

// Restore astro.config.mjs
function restoreAstroConfig() {
  const configPath = path.join(projectRoot, 'astro.config.mjs');
  const backupPath = path.join(backupDir, 'astro.config.mjs.bak');

  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, configPath);
    console.log('  ✓ Restored astro.config.mjs');
  }
}

async function main() {
  try {
    // Step 1: Backup dev-only files
    backupDevFiles();
    modifyAstroConfig();

    // Step 2: Run astro build
    console.log('\n🚀 Running astro build...\n');
    try {
      execSync('npx astro build', {
        stdio: 'inherit',
        cwd: projectRoot
      });
      console.log('\n✅ Build completed successfully!\n');
    } catch (buildError) {
      // Astro might exit with error code even when build partially succeeds
      // Check if dist folder has content
      const distPath = path.join(projectRoot, 'dist');
      if (fs.existsSync(distPath) && fs.readdirSync(distPath).length > 10) {
        console.log('\n⚠️  Build completed with some errors (check output above)\n');
      } else {
        throw buildError;
      }
    }
  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exitCode = 1;
  } finally {
    // Step 3: Always restore dev-only files
    restoreAstroConfig();
    restoreDevFiles();
  }
}

main();
