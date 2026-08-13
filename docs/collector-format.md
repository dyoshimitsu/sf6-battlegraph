# Collector export format

The Buckler collector transfers one structured-clone bundle containing every fetched combined-history page. Version 1 keeps the following envelope so validation and raw persistence remain stable:

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

`npm run build` produces `dist/extension` and `dist/sf6-battlegraph-extension.zip`. The ZIP contains one versioned `sf6-battlegraph-connector-v<version>` directory. Neither output contains credentials.

During development:

1. build the project
2. load `dist/extension` as an unpacked Chrome extension
3. sign in to Buckler
4. press “Fetch from Buckler” in Battlegraph
5. wait while the extension opens the Battle Log, fetches every page, and returns the bundle

The collector reads the current `buildId`, locale, and profile user code from the page. It sends same-origin requests so the browser supplies the existing Buckler session cookie; the cookie is never read into or written to the bundle.

The Battlegraph receiver accepts the versioned message only from `https://www.streetfighter.com`, then performs the same user-code and schema validation used by the persistence pipeline. No battle-log file is downloaded. Backup export and restore remain separate administrative file operations.

The default collector requests only the combined `/battlelog` history. A failed page aborts the collection instead of creating a bundle that looks complete.

## Versioning

Changing the bundle envelope requires a new `version`. Adding Buckler fields inside a raw `response` does not change this format version because those fields are preserved without interpretation.
