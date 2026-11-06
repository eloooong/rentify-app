import { NextResponse, type NextRequest } from "next/server";
import { api, ApiError, jsonBody, limitedBody } from "@/lib/catalog/http";
import { MAX_IMAGE_BYTES, normalizeImage } from "@/lib/catalog/images";
import { identity } from "@/lib/chat/http";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createRouteClient } from "@/lib/supabase/route";
import {
  checklistId,
  checklistSchema,
  confirmationSchema,
  sideSchema,
  stageSchema,
} from "./validation";

const bucket = "checklist-evidence";
type RouteClient = ReturnType<typeof createRouteClient>;
type Params = { id: string; stage: string };

function handleError(error: { code: string; message: string } | null) {
  if (!error) return;
  if (error.message === "sign_in" && error.code === "42501")
    throw new ApiError(401, "sign_in", "Sign in with a verified email.");
  if (error.code === "42501")
    throw new ApiError(
      403,
      "forbidden",
      "An active account is required to confirm.",
    );
  if (error.code === "22023")
    throw new ApiError(400, "validation", "Check the checklist fields.");
  if (error.code === "P0001") {
    if (error.message === "not_found")
      throw new ApiError(404, "not_found", "Checklist not found.");
    if (error.message === "stage_closed")
      throw new ApiError(
        409,
        "stage_closed",
        "This checklist is currently closed.",
      );
    if (error.message === "already_confirmed")
      throw new ApiError(
        409,
        "already_confirmed",
        "Your confirmation has already been recorded.",
      );
  }
  throw new ApiError(
    503,
    "unavailable",
    "The checklist could not be loaded or saved. Try again.",
  );
}

async function read(client: RouteClient, params: Params) {
  const result = await client.rpc("get_condition_checklist", {
    p_booking: checklistId.parse(params.id),
    p_stage: stageSchema.parse(params.stage),
  });
  handleError(result.error);
  const parsed = checklistSchema.safeParse(result.data);
  if (!parsed.success)
    throw new ApiError(
      503,
      "unavailable",
      "The checklist could not be loaded.",
    );
  return parsed.data;
}

export function getChecklist(request: NextRequest, params: Params) {
  return api(request, async (client) => {
    await identity(client);
    return NextResponse.json({ data: await read(client, params) });
  });
}

export function confirmChecklist(request: NextRequest, params: Params) {
  return api(request, async (client) => {
    await identity(client);
    const input = confirmationSchema.parse(await jsonBody(request));
    const result = await client.rpc("confirm_condition_checklist", {
      p_booking: checklistId.parse(params.id),
      p_stage: stageSchema.parse(params.stage),
      p_checks: input.checks,
      p_note: input.note,
    });
    handleError(result.error);
    const parsed = checklistSchema.safeParse(result.data);
    if (!parsed.success)
      throw new ApiError(
        503,
        "unavailable",
        "Refresh to check whether your confirmation was saved.",
      );
    return NextResponse.json({ data: parsed.data });
  });
}

export function uploadEvidence(
  request: NextRequest,
  params: Params & { side: string },
) {
  return api(request, async (client) => {
    await identity(client);
    const side = sideSchema.parse(params.side);
    const report = await read(client, params);
    if (side !== report.role)
      throw new ApiError(403, "forbidden", "Upload a photo in your own slot.");
    if (!report.can_confirm)
      throw new ApiError(
        409,
        "stage_closed",
        "This checklist is currently closed.",
      );
    if (report[`${side}_photo`])
      throw new ApiError(
        409,
        "photo_exists",
        "Your evidence photo has already been saved.",
      );
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(
        request.headers.get("content-type") ?? "",
      )
    )
      throw new ApiError(
        415,
        "content_type",
        "Choose a JPEG, PNG or WebP photo.",
      );
    const bytes = await limitedBody(request, MAX_IMAGE_BYTES);
    let image;
    try {
      image = await normalizeImage(bytes);
    } catch {
      throw new ApiError(
        400,
        "invalid_photo",
        "Choose a valid JPEG, PNG or WebP photo up to 4 MiB.",
      );
    }
    const uploaded = await client.storage
      .from(bucket)
      .upload(`${report.booking_id}/${report.stage}/${side}.webp`, image, {
        contentType: "image/webp",
        upsert: false,
      });
    if (uploaded.error) {
      const latest = await read(client, params);
      if (latest[`${side}_photo`])
        throw new ApiError(
          409,
          "photo_exists",
          "Your evidence photo has already been saved. Refresh to view it.",
        );
      if (!latest.can_confirm)
        throw new ApiError(
          409,
          "stage_closed",
          "This checklist is currently closed.",
        );
      throw new ApiError(
        503,
        "unavailable",
        "The photo could not be uploaded. Try again.",
      );
    }
    return NextResponse.json(
      { data: await read(client, params) },
      { status: 201 },
    );
  });
}

export function downloadEvidence(
  request: NextRequest,
  params: Params & { side: string },
) {
  return api(request, async (client) => {
    await identity(client);
    const side = sideSchema.parse(params.side);
    const report = await read(client, params);
    if (!report[`${side}_photo`])
      throw new ApiError(404, "not_found", "Evidence photo not found.");
    // Access and the object path come from the participant-only RPC above.
    const result = await createAdminClient()
      .storage.from(bucket)
      .download(`${report.booking_id}/${report.stage}/${side}.webp`);
    if (result.error)
      throw new ApiError(
        503,
        "unavailable",
        "The photo could not be loaded. Try again.",
      );
    let image;
    try {
      // Direct Storage uploads may spoof MIME. Serve only decoded image data.
      image = await normalizeImage(
        new Uint8Array(await result.data.arrayBuffer()),
      );
    } catch {
      throw new ApiError(
        422,
        "invalid_photo",
        "This evidence file is not a readable photo.",
      );
    }
    return new NextResponse(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Disposition": 'inline; filename="checklist-photo.webp"',
      },
    });
  });
}
