import { useState } from "react";
import { getCharacterName } from "../domain/buckler/characterNames";
import { compareCharacterSlugs } from "../domain/buckler/characterOrder";
import type { BucklerBundlePreview, NormalizedMatch } from "../domain/buckler/types";
import { movingAverage } from "../domain/statistics/movingAverage";
import {
  latestRatingCharacterKey,
  ratingCharacterKey,
  ratingMatches,
} from "../domain/statistics/ratingMatches";
import { ratingScale } from "../domain/statistics/ratingScale";
import type { StoredManifest } from "../domain/storage/loadStoredMatches";

export function RatingChart({
  matches,
  allMatches,
  currentRatings,
  allowCurrent,
  locale,
  labels,
}: {
  matches: BucklerBundlePreview["matches"];
  allMatches: NormalizedMatch[];
  currentRatings: StoredManifest["currentRatings"];
  allowCurrent: boolean;
  locale: "ja" | "en";
  labels: Record<
    | "title"
    | "character"
    | "latest"
    | "highest"
    | "lowest"
    | "change"
    | "noData"
    | "firstMatch"
    | "latestMatch",
    string
  >;
}) {
  const [selectedCharacter, setSelectedCharacter] = useState("");
  const characterGroups = new Map<string, BucklerBundlePreview["matches"]>();
  for (const match of ratingMatches(matches)) {
    const key = ratingCharacterKey(match);
    characterGroups.set(key, [...(characterGroups.get(key) ?? []), match]);
  }
  const characters = [...characterGroups.entries()].sort(
    (left, right) =>
      right[1].length - left[1].length ||
      compareCharacterSlugs(
        left[1][0]?.subject.playing_character_tool_name ??
          left[1][0]?.subject.character_tool_name ??
          "unknown",
        right[1][0]?.subject.playing_character_tool_name ??
          right[1][0]?.subject.character_tool_name ??
          "unknown",
      ),
  );
  const effectiveCharacter = characters.some(([key]) => key === selectedCharacter)
    ? selectedCharacter
    : latestRatingCharacterKey(matches);
  const chartMatches = characterGroups.get(effectiveCharacter) ?? [];
  const ordered = [...chartMatches].sort((a, b) => a.playedAtEpoch - b.playedAtEpoch).slice(-100);
  const allCharacterMatches = ratingMatches(allMatches).filter(
    (match) => ratingCharacterKey(match) === effectiveCharacter,
  );
  const chronologicalHistory = [...allCharacterMatches].sort(
    (a, b) => a.playedAtEpoch - b.playedAtEpoch,
  );
  const latestAll = [...allCharacterMatches].sort((a, b) => b.playedAtEpoch - a.playedAtEpoch)[0];
  const latestShown = ordered.at(-1);
  const snapshotRating =
    allowCurrent &&
    latestShown &&
    latestAll?.replayId === latestShown.replayId &&
    currentRatings &&
    Date.parse(currentRatings.fetchedAt) / 1000 >= latestShown.playedAtEpoch
      ? currentRatings.ratings.find((rating) => `id:${rating.characterId}` === effectiveCharacter)
      : undefined;
  const number = new Intl.NumberFormat(locale === "ja" ? "ja-JP" : "en-US");
  const width = 1000,
    height = 230,
    padX = 22,
    padY = 18;
  function series(kind: "lp" | "mr") {
    const averages = movingAverage(
      chronologicalHistory.map((match) => {
        const value = kind === "lp" ? match.subject.league_point : match.subject.master_rating;
        return typeof value === "number" && value > 0 ? value : null;
      }),
      10,
    );
    const averagesByReplay = new Map(
      chronologicalHistory.map((match, index) => [match.replayId, averages[index]]),
    );
    const points = ordered
      .map((match, matchIndex) => ({
        match,
        matchIndex,
        value: kind === "lp" ? match.subject.league_point : match.subject.master_rating,
      }))
      .filter(
        (point): point is { match: (typeof ordered)[number]; matchIndex: number; value: number } =>
          (point.value ?? 0) > 0,
      );
    const currentValue = kind === "lp" ? snapshotRating?.leaguePoint : snapshotRating?.masterRating;
    if (currentValue && latestShown)
      points.push({ match: latestShown, matchIndex: ordered.length, value: currentValue });
    if (!points.length) return null;
    const values = points.map((point) => point.value);
    const highest = Math.max(...values),
      lowest = Math.min(...values);
    const scaleValues = chronologicalHistory
      .slice(-100)
      .map((match) => (kind === "lp" ? match.subject.league_point : match.subject.master_rating))
      .filter((value): value is number => typeof value === "number" && value > 0);
    const current = currentRatings?.ratings.find(
      (rating) => `id:${rating.characterId}` === effectiveCharacter,
    );
    const currentScaleValue = kind === "lp" ? current?.leaguePoint : current?.masterRating;
    if (currentScaleValue && currentScaleValue > 0) scaleValues.push(currentScaleValue);
    for (const match of ordered) {
      const average = averagesByReplay.get(match.replayId);
      if (average != null) scaleValues.push(average);
    }
    const { min, max, step } = ratingScale([...scaleValues, ...values], kind === "lp" ? 100 : 10);
    const y = (value: number) => padY + ((max - value) * (height - padY * 2)) / (max - min);
    const coordinates = points.map((point) => ({
      x:
        padX +
        (ordered.length === 1 && !currentValue
          ? (width - padX * 2) / 2
          : (point.matchIndex * (width - padX * 2)) /
            (ordered.length - 1 + (currentValue ? 1 : 0))),
      y: y(point.value),
      value: point.value,
      replayId: point.match.replayId,
      snapshot: point.matchIndex === ordered.length,
    }));
    const averageSegments: string[][] = [];
    {
      let segment: string[] = [];
      for (let index = 0; index < ordered.length; index++) {
        const average = averagesByReplay.get(ordered[index].replayId);
        const coordinate = coordinates.find(
          (point) => !point.snapshot && point.replayId === ordered[index].replayId,
        );
        if (average == null || !coordinate) {
          if (segment.length) averageSegments.push(segment);
          segment = [];
        } else segment.push(`${coordinate.x},${y(average)}`);
      }
      if (segment.length) averageSegments.push(segment);
    }
    const ticks = Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, index) => ({
      value: min + index * step,
      y: y(min + index * step),
    }));
    return {
      kind,
      coordinates,
      ticks,
      line: coordinates.map((point) => `${point.x},${point.y}`).join(" "),
      averageSegments,
      latest: values.at(-1) as number,
      highest,
      lowest,
      change: (values.at(-1) as number) - values[0],
    };
  }
  const lp = series("lp"),
    mr = series("mr"),
    seriesList = [lp, mr].filter((item): item is NonNullable<typeof item> => item !== null);
  const characterSelector = characters.length > 1 && (
    <label className="rating-character-select">
      <span>{labels.character}</span>
      <select
        value={effectiveCharacter}
        onChange={(event) => setSelectedCharacter(event.target.value)}
      >
        {characters.map(([key, characterMatches]) => (
          <option key={key} value={key}>
            {getCharacterName(characterMatches[0].subject, locale)}
          </option>
        ))}
      </select>
    </label>
  );
  if (!seriesList.length)
    return (
      <article className="lp-card ui-card">
        <div className="lp-heading">
          <div>
            <h3 className="ui-title">{labels.title}</h3>
          </div>
          {characterSelector}
        </div>
        <p className="lp-empty">{labels.noData}</p>
      </article>
    );
  return (
    <article className="lp-card ui-card">
      <div className="lp-heading">
        <div>
          <h3 className="ui-title">{labels.title}</h3>
          <span className="rating-line-key ui-caption">
            {locale === "ja"
              ? "実線：実績 · 破線：10試合平均"
              : "Solid: recorded · dashed: 10-game average"}
          </span>
        </div>
        <div className="rating-controls">
          {characterSelector}
          <div className="rating-metrics">
            {(["lp", "mr"] as const).map((kind) => {
              const item = kind === "lp" ? lp : mr;
              return (
                <div className={`rating-summary ${kind}`} key={kind}>
                  <b>{kind.toUpperCase()}</b>
                  {item ? (
                    <>
                      <span>
                        {labels.latest}
                        <strong>{number.format(item.latest)}</strong>
                        {item.coordinates.at(-1)?.snapshot && (
                          <small className="rating-snapshot">
                            {locale === "ja" ? "（同期時点）" : " (at sync)"}
                          </small>
                        )}
                      </span>
                      <small>
                        {labels.highest} {number.format(item.highest)} · {labels.lowest}{" "}
                        {number.format(item.lowest)} · {labels.change}{" "}
                        <em className={item.change >= 0 ? "positive" : "negative"}>
                          {item.change >= 0 ? "+" : ""}
                          {number.format(item.change)}
                        </em>
                      </small>
                    </>
                  ) : (
                    <small>{labels.noData}</small>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="lp-chart">
        {seriesList.flatMap((item) =>
          item.ticks.map((tick) => (
            <span
              className={`rating-tick ${item.kind}`}
              style={{ top: `${(tick.y / height) * 100}%` }}
              key={`${item.kind}-${tick.value}`}
            >
              {number.format(tick.value)}
            </span>
          )),
        )}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={labels.title}
          preserveAspectRatio="none"
        >
          {seriesList.flatMap((item) =>
            item.ticks.map((tick) => (
              <line
                x1={padX}
                y1={tick.y}
                x2={width - padX}
                y2={tick.y}
                className={`grid-line ${item.kind}`}
                key={`${item.kind}-${tick.value}`}
              />
            )),
          )}
          {seriesList.map((item) => (
            <g className={`rating-series ${item.kind}`} key={item.kind}>
              <polyline points={item.line} />
              {item.coordinates.map((point) => (
                <circle
                  key={`${point.replayId}-${item.kind}-${point.snapshot}`}
                  cx={point.x}
                  cy={point.y}
                  r="3"
                >
                  <title>
                    {number.format(point.value)} {item.kind.toUpperCase()}
                    {point.snapshot ? (locale === "ja" ? "（同期時点）" : " (at sync)") : ""}
                  </title>
                </circle>
              ))}
            </g>
          ))}
          {seriesList.flatMap((item) =>
            item.averageSegments.map((segment) => (
              <polyline
                className={`rating-average-line ${item.kind}`}
                points={segment.join(" ")}
                key={`${item.kind}-${segment[0]}`}
              />
            )),
          )}
        </svg>
        <div className="match-axis">
          <span>{labels.firstMatch}</span>
          <span>
            {labels.latestMatch} · {number.format(ordered.length)}
          </span>
        </div>
      </div>
    </article>
  );
}
