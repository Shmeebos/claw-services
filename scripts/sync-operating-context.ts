import {
  buildHermesProjection,
  buildIngestPayload,
  getLatestLocalSourceHash,
  loadSourceProjection,
  writeLocalSupabase,
} from "../src/lib/operating-context/operating-context";

async function main() {
  const writeLocal = process.argv.includes("--write-local");
  const source = await loadSourceProjection({
    operatingMemoryPath: process.env.CLAW_OPERATING_MEMORY_PATH,
    projectContextPath: process.env.CLAW_PROJECT_CONTEXT_PATH,
  });
  if (writeLocal && (await getLatestLocalSourceHash()) === source.sourceBundleSha256) {
    console.log(
      JSON.stringify(
        {
          mode: "local-noop",
          reason: "source_bundle_unchanged",
          source_bundle_sha256: source.sourceBundleSha256,
          external_actions_authorized: false,
        },
        null,
        2,
      ),
    );
    return;
  }
  const { coach, brief } = await buildHermesProjection(source);
  const ingest = buildIngestPayload(source, coach, brief);

  if (!writeLocal) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          snapshot_id: ingest.snapshotId,
          source_bundle_sha256: ingest.sourceBundleSha256,
          target_count: ingest.payload.targets.length,
          ceo_request_count: ingest.payload.ceo_requests.length,
          external_actions_authorized: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  const receipt = await writeLocalSupabase(ingest);
  console.log(JSON.stringify({ mode: "local-write", receipt }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  console.error(message);
  process.exitCode = 1;
});
