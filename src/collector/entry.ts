import { collectBattleLogs } from "./collectBattleLogs";
import { createCollectorResultMessage, readBattlegraphTargetOrigin } from "./bridge";

interface NextData {
  buildId?: string;
  locale?: string;
  query?: { sid?: string };
  props?: { pageProps?: { sid?: number } };
}

function readNextData(): NextData {
  const element = document.getElementById("__NEXT_DATA__");
  if (!element?.textContent) {
    throw new Error("Buckler __NEXT_DATA__ was not found");
  }
  return JSON.parse(element.textContent) as NextData;
}

function resolveUserCode(nextData: NextData): number {
  const fromProps = nextData.props?.pageProps?.sid;
  const fromQuery = Number(nextData.query?.sid);
  const fromPath = Number(
    window.location.pathname.match(/\/profile\/(\d+)/)?.[1],
  );
  const userCode = fromProps ?? (fromQuery || fromPath);
  if (!Number.isSafeInteger(userCode) || userCode <= 0) {
    throw new Error("Could not determine the profile user code");
  }
  return userCode;
}

function sendToBattlegraph(bundle: Awaited<ReturnType<typeof collectBattleLogs>>) {
  if (!window.opener || window.opener.closed) {
    throw new Error("Open Buckler from SF6 Battlegraph before running the collector");
  }
  const targetOrigin = readBattlegraphTargetOrigin(window.location.hash);
  if (!targetOrigin) throw new Error("Battlegraph target origin was not found");
  window.opener.postMessage(createCollectorResultMessage(bundle), targetOrigin);
}

async function run() {
  if (window.location.hostname !== "www.streetfighter.com") {
    throw new Error("Run this collector on www.streetfighter.com");
  }
  const nextData = readNextData();
  if (!nextData.buildId) throw new Error("Buckler buildId was not found");
  const userCode = resolveUserCode(nextData);
  const locale = nextData.locale ?? "ja-jp";

  console.info("[SF6 Battlegraph] Collection started", { userCode, locale });
  const bundle = await collectBattleLogs({
    buildId: nextData.buildId,
    locale,
    userCode,
    onProgress: ({ sourceType, page, totalPages }) => {
      console.info(
        `[SF6 Battlegraph] ${sourceType}: page ${page}${totalPages ? `/${totalPages}` : ""}`,
      );
    },
  });
  sendToBattlegraph(bundle);
  console.info("[SF6 Battlegraph] Collection complete", {
    pages: bundle.pages.length,
  });
}

void run().catch((error: unknown) => {
  console.error("[SF6 Battlegraph] Collection failed", error);
  window.alert(
    `SF6 Battlegraph collector failed: ${error instanceof Error ? error.message : String(error)}`,
  );
});
