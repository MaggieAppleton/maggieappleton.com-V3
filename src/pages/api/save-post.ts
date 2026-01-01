import type { APIRoute } from "astro";
import fs from "fs/promises";

// This endpoint should render on-demand, not be prerendered
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  // Only allow in dev mode
  if (import.meta.env.PROD) {
    return new Response(
      JSON.stringify({ error: "API only available in development mode" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await request.json();
    const { filePath, content, expectedLastModified, force } = body;

    if (!filePath || !content) {
      return new Response(
        JSON.stringify({ error: "Missing filePath or content" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Security check - ensure we're only writing to content directory
    if (!filePath.includes("/src/content/")) {
      return new Response(
        JSON.stringify({ error: "Invalid file path" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check for conflicts (unless force is true)
    if (!force && expectedLastModified) {
      try {
        const stats = await fs.stat(filePath);
        const currentModified = stats.mtimeMs;

        // If file was modified after our known version, there's a conflict
        if (currentModified > expectedLastModified + 1000) {
          // 1 second tolerance
          const serverContent = await fs.readFile(filePath, "utf-8");
          return new Response(
            JSON.stringify({
              conflict: true,
              serverContent,
              serverModified: currentModified,
              message: "File was modified externally",
            }),
            { status: 409, headers: { "Content-Type": "application/json" } }
          );
        }
      } catch (error) {
        // File might not exist, which is fine for new files
        console.error("Error checking file stats:", error);
      }
    }

    // Write the file
    await fs.writeFile(filePath, content, "utf-8");

    // Get the new modification time
    const newStats = await fs.stat(filePath);

    return new Response(
      JSON.stringify({
        success: true,
        newLastModified: newStats.mtimeMs,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Save error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to save file",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
