const DEFAULT_CONNECTOR_ORIGINS = [
  "http://localhost",
  "http://127.0.0.1",
  "http://192.168.201.128",
  "https://dyoshimitsu.github.io",
];

export function buildConnectorMatchPatterns(value?: string): string[] {
  const origins = value
    ? value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : DEFAULT_CONNECTOR_ORIGINS;
  if (origins.length === 0)
    throw new Error("VITE_CONNECTOR_ORIGINS must contain at least one origin");
  return [
    ...new Set(
      origins.map((origin) => {
        const url = new URL(origin);
        if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) {
          throw new Error(`Invalid connector origin: ${origin}`);
        }
        return `${url.origin}/*`;
      }),
    ),
  ];
}
