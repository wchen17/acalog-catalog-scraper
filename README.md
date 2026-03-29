# Modern Campus Catalog (Acalog) PDF Scraper

A vanilla JavaScript browser script to extract and combine every course page from a Modern Campus Catalog (formerly Acalog) into a single, clean, searchable PDF.

Many universities use Acalog for their course catalogs but do not provide an easy way to download the entire expanded course list at once. This script automates the process by fetching every page in the background, stripping out the repetitive UI elements, and stitching the raw course data together on a clean white background so you can print it to PDF.

## Features
* **Zero Setup:** Runs entirely in your browser console. No Python, no dependencies, no API keys.
* **Auto-Detects Limits:** Automatically detects the last page of the catalog and stops scraping.
* **Preserves Formatting:** Keeps course titles, credits, and descriptions cleanly formatted.
* **Searchable:** The resulting PDF is fully text-searchable.

## How to Use

1. Navigate to your university's Acalog course search page. 
2. Ensure you have the view expanded (look for `print=1` and `expand=1` in your URL). A typical URL looks like this:
   `https://catalog.[school].edu/content.php?...&expand=1&print=1`
3. Press `F12` to open Developer Tools and go to the **Console** tab.
4. Paste the script from `scraper.js` into the console and press Enter.
5. Wait for the script to fetch all pages. The screen will say "Done!" when finished.
6. Press `Ctrl + P` (or `Cmd + P` on Mac) and select **Save as PDF**.

## How it Works
The script grabs the current URL and iterates through the `filter[cpage]` parameter. It uses `fetch()` to grab the HTML of each subsequent page, parses it using `DOMParser`, extracts the core course table (`td.block_content`), and appends it to your current view. It stops automatically when a fetched page matches the previous page or returns empty.
