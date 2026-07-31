import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_STATE_MESSAGES,
  KPI_METRICS,
  OPPORTUNITIES,
  filterOpportunities,
  formatRate,
  getCopilotResponse,
} from "../app/crm-model.ts";

test("zero or unknown denominators render UNKNOWN, never 0%", () => {
  assert.deepEqual(formatRate(0, 0), {
    display: "UNKNOWN",
    quality: "unknown",
    detail: "No rate is calculable",
  });
  assert.equal(formatRate(undefined, undefined).display, "UNKNOWN");
});

test("rates expose their counts and flag small samples", () => {
  assert.deepEqual(formatRate(5, 6), {
    display: "83%",
    quality: "directional-small-sample",
    detail: "5 / 6",
  });
  assert.deepEqual(formatRate(23, 25), {
    display: "92%",
    quality: "measured",
    detail: "23 / 25",
  });
});

test("pipeline filters combine owner, source, and stage", () => {
  const filtered = filterOpportunities(
    OPPORTUNITIES,
    "Shane",
    "Website",
    "discovery_completed",
  );

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.company, "Harbor & Pine Realty");
});

test("empty-mode copilot refuses to calculate performance", () => {
  const response = getCopilotResponse("Summarize this week", {
    mode: "empty",
    view: "overview",
    owner: "All owners",
    source: "All sources",
    visibleOpportunities: [],
  });

  assert.match(response.body, /no rate is calculable/i);
  assert.match(response.body, /lead activation is not authorized/i);
  assert.equal(EMPTY_STATE_MESSAGES.length, 4);
});

test("KPI explanations cite the selected visible metric", () => {
  const selectedMetric = KPI_METRICS.find(
    (metric) => metric.id === "completeness",
  );
  assert.ok(selectedMetric);

  const response = getCopilotResponse("Explain this KPI", {
    mode: "demo",
    view: "overview",
    owner: "All owners",
    source: "All sources",
    selectedMetric,
    visibleOpportunities: OPPORTUNITIES,
  });

  assert.equal(response.title, "Evidence completeness");
  assert.ok(response.citations.some((citation) => citation.includes("92%")));
  assert.match(response.nextAction, /two outstanding evidence items/i);
});
