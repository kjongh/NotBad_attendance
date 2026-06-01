import { isSupabaseConfigured, supabase } from "./supabaseClient";

let persistQueue = Promise.resolve();

export const isSupabaseStoreConfigured = isSupabaseConfigured;

export async function loadStateFromSupabase() {
  if (!isSupabaseStoreConfigured) return null;

  try {
    const [
      membersResult,
      eventsResult,
      rsvpsResult,
      draftsResult,
      confirmedResult,
      approvalsResult,
      signupRequestsResult,
      feedbackResult,
    ] = await Promise.all([
      supabase.from("members").select("*").order("created_at"),
      supabase.from("events").select("*").order("start_at"),
      supabase.from("rsvps").select("*"),
      supabase.from("attendance_drafts").select("*"),
      supabase.from("confirmed_attendance").select("*"),
      supabase.from("final_approvals").select("*"),
      supabase.from("signup_requests").select("*").order("requested_at"),
      supabase.from("feedback_items").select("*").order("created_at", { ascending: false }),
    ]);

    const results = [
      membersResult,
      eventsResult,
      rsvpsResult,
      draftsResult,
      confirmedResult,
      approvalsResult,
      signupRequestsResult,
      feedbackResult,
    ];
    const failed = results.find((result) => result.error);
    if (failed) throw failed.error;

    const eventsById = new Map(
      eventsResult.data.map((row) => [
        row.id,
        {
          id: row.id,
          title: row.title,
          location: row.location,
          startAt: row.start_at,
          endAt: row.end_at,
          capacity: row.capacity,
          minAttendees: row.min_attendees,
          cancelAt: row.cancel_at,
          canceledAt: row.canceled_at,
          canceledReason: row.canceled_reason,
          canceledBy: row.canceled_by,
          note: row.note || "",
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedBy: row.updated_by,
          updatedAt: row.updated_at,
          finalizedAt: row.finalized_at,
          finalizedBy: row.finalized_by,
          rsvps: {},
          attendanceDraft: {},
          confirmedAttendance: {},
          finalApprovalIds: [],
        },
      ]),
    );

    rsvpsResult.data.forEach((row) => {
      const event = eventsById.get(row.event_id);
      if (event) event.rsvps[row.member_id] = row.status;
    });

    draftsResult.data.forEach((row) => {
      const event = eventsById.get(row.event_id);
      if (event) event.attendanceDraft[row.member_id] = row.attended;
    });

    confirmedResult.data.forEach((row) => {
      const event = eventsById.get(row.event_id);
      if (event) event.confirmedAttendance[row.member_id] = row.attended;
    });

    approvalsResult.data.forEach((row) => {
      const event = eventsById.get(row.event_id);
      if (event) event.finalApprovalIds.push(row.admin_member_id);
    });

    return {
      club: { name: "NOTBAD" },
      members: membersResult.data.map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        pinHash: row.pin_hash,
        createdAt: row.created_at,
      })),
      events: [...eventsById.values()],
      signupRequests: signupRequestsResult.data.map((row) => ({
        id: row.id,
        name: row.name,
        pinHash: row.pin_hash,
        requestedAt: row.requested_at,
      })),
      feedbackItems: feedbackResult.data.map((row) => ({
        id: row.id,
        memberId: row.member_id,
        memberName: row.member_name,
        type: row.type,
        subject: row.subject,
        message: row.message,
        status: row.status,
        pageUrl: row.page_url,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        updatedBy: row.updated_by,
      })),
    };
  } catch (error) {
    console.error("Supabase load failed; falling back to localStorage.", error);
    return null;
  }
}

export function queuePersistStateToSupabase(state) {
  if (!isSupabaseStoreConfigured) return persistQueue;

  const snapshot = JSON.parse(JSON.stringify(state));
  persistQueue = persistQueue
    .catch(() => {})
    .then(() => persistStateToSupabase(snapshot))
    .catch((error) => {
      console.error("Supabase save failed.", error);
    });

  return persistQueue;
}

async function persistStateToSupabase(state) {
  const memberIds = state.members.map((member) => member.id);
  const eventIds = state.events.map((event) => event.id);
  const signupRequestIds = (state.signupRequests || []).map((request) => request.id);
  const feedbackIds = (state.feedbackItems || []).map((item) => item.id);

  await deleteMissingRows("events", "id", eventIds);
  await deleteMissingRows("members", "id", memberIds);
  await deleteMissingRows("signup_requests", "id", signupRequestIds);
  await deleteMissingRows("feedback_items", "id", feedbackIds);

  await upsertRows(
    "members",
    state.members.map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role,
      pin_hash: member.pinHash,
      created_at: member.createdAt,
    })),
  );

  await upsertRows(
    "signup_requests",
    (state.signupRequests || []).map((request) => ({
      id: request.id,
      name: request.name,
      pin_hash: request.pinHash,
      requested_at: request.requestedAt,
    })),
  );

  await upsertRows(
    "feedback_items",
    (state.feedbackItems || []).map((item) => ({
      id: item.id,
      member_id: item.memberId,
      member_name: item.memberName,
      type: item.type,
      subject: item.subject,
      message: item.message,
      status: item.status,
      page_url: item.pageUrl,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      updated_by: item.updatedBy,
    })),
  );

  await upsertRows(
    "events",
    state.events.map((event) => ({
      id: event.id,
      title: event.title,
      location: event.location,
      note: event.note || "",
      start_at: event.startAt,
      end_at: event.endAt,
      capacity: event.capacity,
      min_attendees: event.minAttendees,
      cancel_at: event.cancelAt,
      canceled_at: event.canceledAt,
      canceled_reason: event.canceledReason,
      canceled_by: event.canceledBy,
      created_by: event.createdBy,
      created_at: event.createdAt,
      updated_by: event.updatedBy,
      updated_at: event.updatedAt,
      finalized_at: event.finalizedAt,
      finalized_by: event.finalizedBy,
    })),
  );

  if (eventIds.length) {
    await Promise.all([
      supabase.from("rsvps").delete().in("event_id", eventIds),
      supabase.from("attendance_drafts").delete().in("event_id", eventIds),
      supabase.from("confirmed_attendance").delete().in("event_id", eventIds),
      supabase.from("final_approvals").delete().in("event_id", eventIds),
    ]);
  }

  await upsertRows("rsvps", flattenRsvps(state.events));
  await upsertRows("attendance_drafts", flattenAttendanceDrafts(state.events));
  await upsertRows("confirmed_attendance", flattenConfirmedAttendance(state.events));
  await upsertRows("final_approvals", flattenFinalApprovals(state.events));
}

async function deleteMissingRows(table, column, ids) {
  const { data, error } = await supabase.from(table).select(column);
  if (error) throw error;

  const nextIds = new Set(ids);
  const staleIds = data.map((row) => row[column]).filter((id) => !nextIds.has(id));
  if (!staleIds.length) return;

  const { error: deleteError } = await supabase.from(table).delete().in(column, staleIds);
  if (deleteError) throw deleteError;
}

async function upsertRows(table, rows) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows);
  if (error) throw error;
}

function flattenRsvps(events) {
  return events.flatMap((event) =>
    Object.entries(event.rsvps || {}).map(([memberId, status]) => ({
      event_id: event.id,
      member_id: memberId,
      status,
      updated_at: new Date().toISOString(),
    })),
  );
}

function flattenAttendanceDrafts(events) {
  return events.flatMap((event) =>
    Object.entries(event.attendanceDraft || {}).map(([memberId, attended]) => ({
      event_id: event.id,
      member_id: memberId,
      attended: Boolean(attended),
      updated_at: new Date().toISOString(),
    })),
  );
}

function flattenConfirmedAttendance(events) {
  return events.flatMap((event) =>
    Object.entries(event.confirmedAttendance || {}).map(([memberId, attended]) => ({
      event_id: event.id,
      member_id: memberId,
      attended: Boolean(attended),
      finalized_at: event.finalizedAt || new Date().toISOString(),
    })),
  );
}

function flattenFinalApprovals(events) {
  return events.flatMap((event) =>
    (event.finalApprovalIds || []).map((memberId) => ({
      event_id: event.id,
      admin_member_id: memberId,
      created_at: event.finalizedAt || event.updatedAt || new Date().toISOString(),
    })),
  );
}
