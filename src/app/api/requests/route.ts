import {
  GET as getVersionOneRequests,
  POST as postVersionOneRequest,
} from "../v1/requests/route";

export const runtime = "nodejs";

function markDeprecated(response: Response) {
  response.headers.set("Deprecation", "true");
  response.headers.set("Link", '</api/v1/requests>; rel="successor-version"');
  return response;
}

export async function POST(request: Request) {
  return markDeprecated(await postVersionOneRequest(request));
}

export async function GET() {
  return markDeprecated(await getVersionOneRequests());
}
