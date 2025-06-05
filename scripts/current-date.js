#!/usr/bin/env node

/**
 * Current Date Utility for AI Assistant Documentation Updates
 *
 * Returns the current date in human-readable format: "May 29, 2025"
 */

const now = new Date();

console.log(
	now.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	})
);
