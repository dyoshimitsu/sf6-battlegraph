# Collector export format

The Buckler collector exports one JSON bundle containing every fetched combined-history page. Version 1 has the following envelope:

```json
{
  "format": "sf6-battlegraph.collector",
  "version": 1,
  "userCode": 1000000001,
  "buildId": "current-next-build-id",
  "exportedAt": "2026-08-13T00:00:00.000Z",
  "pages": [
    {
      "sourceType": "all",
      "sourcePath": "/battlelog",
      "page": 1,
      "fetchedAt": "2026-08-13T00:00:00.000Z",
      "response": { "pageProps": {} }
    }
  ]
}
```

## Fields

- `format`: constant identifier `sf6-battlegraph.collector`
- `version`: collector envelope version; currently `1`
- `userCode`: target SF6 user code
- `buildId`: Next.js build ID observed by the collector
- `exportedAt`: ISO 8601 bundle creation time
- `pages`: raw Buckler page responses and acquisition metadata

Each page contains:

- `sourceType`: normally `all`; other values remain accepted for compatibility and investigation
- `sourcePath`: Buckler page path used to derive the JSON request
- `page`: requested page number
- `fetchedAt`: ISO 8601 acquisition time
- `response`: complete, unmodified Buckler JSON response

The envelope is metadata around raw data. It must not remove fields from `response`.

## Import behavior

The importer validates every page, reports missing or duplicate source pages, merges every `replay_list`, deduplicates by `replay_id`, records all source types, and normalizes the tracked player as `subject` regardless of player side.

A single raw Buckler page remains accepted for development and recovery. It is assigned `sourceType: unknown` because its source cannot be established from the response alone.

## Running the collector

`npm run build` produces a standalone `dist/collector.js`. It contains no credentials and must be executed only while viewing a logged-in Buckler profile page.

During development:

1. build the project
2. open `dist/collector.js` and copy its complete contents
3. sign in to Buckler and open the target profile's Battle Log
4. open the browser developer console, paste the script, and run it
5. wait for all progress messages and the JSON download

The collector reads the current `buildId`, locale, and profile user code from the page. It sends same-origin requests so the browser supplies the existing Buckler session cookie; the cookie is never read into or written to the bundle.

The default collector requests only the combined `/battlelog` history. A failed page aborts the collection instead of creating a bundle that looks complete.

## Versioning

Changing the bundle envelope requires a new `version`. Adding Buckler fields inside a raw `response` does not change this format version because those fields are preserved without interpretation.
