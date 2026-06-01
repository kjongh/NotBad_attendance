import "./styles.css";
import {
  isSupabaseStoreConfigured,
  loadStateFromSupabase,
  queuePersistStateToSupabase,
} from "./supabaseStore";

const STORAGE_KEY = "notbad.attendance.v1";
const SESSION_KEY = "notbad.session.v1";
const KST_TIME_ZONE = "Asia/Seoul";

const RSVP_LABELS = {
  attending: "참석",
  maybe: "미정",
  absent: "불참",
};

const REQUIRED_FINAL_APPROVALS = 2;
const PIN_PATTERN = /^\d{6}$/;

const state = {
  club: { name: "NOTBAD" },
  members: [],
  events: [],
  signupRequests: [],
};
let activeMemberId = null;
let activeView = "dashboard";
let authMode = "login";
let toastTimer = null;
let autoCancelTimer = null;
let dashboardFilter = "all";
let confirmFilter = "needs";

const els = {
  authScreen: document.querySelector("#authScreen"),
  appShell: document.querySelector("#appShell"),
  loginForm: document.querySelector("#loginForm"),
  signupForm: document.querySelector("#signupForm"),
  loginName: document.querySelector("#loginName"),
  loginPin: document.querySelector("#loginPin"),
  signupName: document.querySelector("#signupName"),
  signupPin: document.querySelector("#signupPin"),
  currentMemberName: document.querySelector("#currentMemberName"),
  currentMemberRole: document.querySelector("#currentMemberRole"),
  logoutBtn: document.querySelector("#logoutBtn"),
  memberDialog: document.querySelector("#memberDialog"),
  memberForm: document.querySelector("#memberForm"),
  closeMemberDialog: document.querySelector("#closeMemberDialog"),
  memberName: document.querySelector("#memberName"),
  memberPin: document.querySelector("#memberPin"),
  memberIsAdmin: document.querySelector("#memberIsAdmin"),
  adminRoleLabel: document.querySelector("#adminRoleLabel"),
  editEventDialog: document.querySelector("#editEventDialog"),
  editEventForm: document.querySelector("#editEventForm"),
  closeEditEventDialog: document.querySelector("#closeEditEventDialog"),
  editEventId: document.querySelector("#editEventId"),
  editEventTitle: document.querySelector("#editEventTitle"),
  editEventLocation: document.querySelector("#editEventLocation"),
  editEventDate: document.querySelector("#editEventDate"),
  editEventStartTime: document.querySelector("#editEventStartTime"),
  editEventEndTime: document.querySelector("#editEventEndTime"),
  editEventCapacity: document.querySelector("#editEventCapacity"),
  editEventMinAttendees: document.querySelector("#editEventMinAttendees"),
  editEventCancelAt: document.querySelector("#editEventCancelAt"),
  editEventNote: document.querySelector("#editEventNote"),
  myMonthCount: document.querySelector("#myMonthCount"),
  pendingConfirmCount: document.querySelector("#pendingConfirmCount"),
  nextEventDate: document.querySelector("#nextEventDate"),
  myNextEventDate: document.querySelector("#myNextEventDate"),
  dashboardMonth: document.querySelector("#dashboardMonth"),
  dashboardDate: document.querySelector("#dashboardDate"),
  clearDashboardDate: document.querySelector("#clearDashboardDate"),
  eventList: document.querySelector("#eventList"),
  eventForm: document.querySelector("#eventForm"),
  eventTitle: document.querySelector("#eventTitle"),
  eventLocation: document.querySelector("#eventLocation"),
  eventDate: document.querySelector("#eventDate"),
  eventStartTime: document.querySelector("#eventStartTime"),
  eventEndTime: document.querySelector("#eventEndTime"),
  eventCapacity: document.querySelector("#eventCapacity"),
  eventMinAttendees: document.querySelector("#eventMinAttendees"),
  eventCancelAt: document.querySelector("#eventCancelAt"),
  eventNote: document.querySelector("#eventNote"),
  reportMonth: document.querySelector("#reportMonth"),
  adminReport: document.querySelector("#adminReport"),
  memberRoster: document.querySelector("#memberRoster"),
  signupRequests: document.querySelector("#signupRequests"),
  confirmQueue: document.querySelector("#confirmQueue"),
  exportCsv: document.querySelector("#exportCsv"),
  copyMonthSummary: document.querySelector("#copyMonthSummary"),
  toast: document.querySelector("#toast"),
};

init();

async function init() {
  const nextState = await loadInitialState();
  replaceState(nextState);
  activeMemberId = loadSessionMemberId();
  saveState({ persistRemote: false });
  setDefaultFormValues();
  setDefaultDashboardFilters();
  bindEvents();
  applyHashEventFocus();
  render();
}

async function loadInitialState() {
  const localState = loadState();
  const remoteState = await loadStateFromSupabase();
  if (!remoteState?.members?.length) return localState;

  if (shouldBootstrapSupabaseFromLocal(remoteState, localState)) {
    queuePersistStateToSupabase(localState);
    return localState;
  }

  const migratedRemoteState = migrateState(remoteState);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedRemoteState));
  return migratedRemoteState;
}

function shouldBootstrapSupabaseFromLocal(remoteState, localState) {
  const [remoteMember] = remoteState.members;
  const remoteIsSeedOnly =
    remoteState.events.length === 0 &&
    remoteState.members.length === 1 &&
    remoteMember.id === "member-juice" &&
    !remoteMember.pinHash;
  const localSeedMember = localState.members.find((member) => member.id === "member-juice");
  const localHasUserData =
    localState.events.length > 0 ||
    localState.members.length > 1 ||
    localState.signupRequests.length > 0 ||
    Boolean(localSeedMember?.pinHash);

  return remoteIsSeedOnly && localHasUserData;
}

function replaceState(nextState) {
  state.club = nextState.club;
  state.members = nextState.members;
  state.events = nextState.events;
  state.signupRequests = nextState.signupRequests;
}

function bindEvents() {
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      setAuthMode(tab.dataset.authMode);
    });
  });

  els.loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleLogin();
  });

  els.signupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSignup();
  });

  els.logoutBtn.addEventListener("click", () => {
    logout();
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (!requireLogin()) return;
      if (tab.dataset.view === "admin" && !isActiveMemberAdmin()) {
        showToast("운영진만 접근할 수 있습니다.");
        return;
      }
      activeView = tab.dataset.view;
      render();
    });
  });

  document.querySelectorAll("[data-confirm-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      confirmFilter = button.dataset.confirmFilter;
      renderAdmin();
    });
  });

  document.querySelectorAll("[data-dashboard-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      dashboardFilter = button.dataset.dashboardFilter;
      renderDashboard();
    });
  });

  els.closeMemberDialog.addEventListener("click", () => {
    els.memberDialog.close();
  });

  els.closeEditEventDialog.addEventListener("click", () => {
    els.editEventDialog.close();
  });

  els.memberForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addMember();
  });

  els.editEventForm.addEventListener("submit", (event) => {
    event.preventDefault();
    updateEvent();
  });

  els.eventForm.addEventListener("submit", (event) => {
    event.preventDefault();
    createEvent();
  });

  els.reportMonth.addEventListener("change", renderAdmin);
  els.exportCsv.addEventListener("click", exportMonthlyCsv);
  els.copyMonthSummary.addEventListener("click", copyMyMonthSummary);
  els.dashboardMonth.addEventListener("change", () => {
    els.dashboardDate.value = "";
    renderDashboard();
  });
  els.dashboardDate.addEventListener("change", () => {
    if (els.dashboardDate.value) {
      els.dashboardMonth.value = els.dashboardDate.value.slice(0, 7);
    }
    renderDashboard();
  });
  els.clearDashboardDate.addEventListener("click", () => {
    els.dashboardDate.value = "";
    renderDashboard();
  });

  document.body.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    const action = target.dataset.action;
    if (action === "open-member-dialog") {
      openMemberDialog();
    }
    if (action === "set-rsvp") {
      setRsvp(target.dataset.eventId, target.dataset.status);
    }
    if (action === "copy-share") {
      copyEventShare(target.dataset.eventId);
    }
    if (action === "open-edit-event") {
      openEditEventDialog(target.dataset.eventId);
    }
    if (action === "delete-event") {
      deleteEvent(target.dataset.eventId);
    }
    if (action === "finalize-event") {
      finalizeEvent(target.dataset.eventId);
    }
    if (action === "reopen-event") {
      reopenEvent(target.dataset.eventId);
    }
    if (action === "delete-member") {
      deleteMember(target.dataset.memberId);
    }
    if (action === "approve-signup") {
      approveSignupRequest(target.dataset.requestId);
    }
    if (action === "reject-signup") {
      rejectSignupRequest(target.dataset.requestId);
    }
  });

  document.body.addEventListener("change", (event) => {
    const target = event.target;
    if (!target.matches("[data-action='toggle-attendance']")) return;
    updateAttendanceDraft(target.dataset.eventId, target.dataset.memberId, target.checked);
  });
}

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.members?.length) return migrateState(parsed);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  const now = new Date().toISOString();
  return {
    club: {
      name: "NOTBAD",
    },
    members: [
      {
        id: "member-juice",
        name: "쥬스",
        role: "admin",
        pinHash: null,
        createdAt: now,
      },
    ],
    events: [],
    signupRequests: [],
  };
}

function migrateState(nextState) {
  const now = new Date().toISOString();
  nextState.club = nextState.club || { name: "NOTBAD" };
  nextState.club.name = nextState.club.name || "NOTBAD";
  nextState.members = (nextState.members || []).map((member) => ({
    id: member.id || createId("member"),
    name: member.name || "이름 없음",
    role: member.role === "admin" ? "admin" : "member",
    pinHash: member.pinHash || null,
    createdAt: member.createdAt || now,
  }));
  nextState.events = (nextState.events || []).map((event) => ({
    ...event,
    rsvps: event.rsvps || {},
    attendanceDraft: event.attendanceDraft || {},
    confirmedAttendance: event.confirmedAttendance || {},
    finalApprovalIds: normalizeIdList(event.finalApprovalIds || (event.finalizedBy ? [event.finalizedBy] : [])),
    minAttendees: event.minAttendees ? Number(event.minAttendees) : null,
    cancelAt: event.cancelAt || null,
    canceledAt: event.canceledAt || null,
    canceledReason: event.canceledReason || null,
    canceledBy: event.canceledBy || null,
    finalizedAt: event.finalizedAt || null,
    finalizedBy: event.finalizedBy || null,
  }));
  nextState.signupRequests = (nextState.signupRequests || []).map((request) => ({
    id: request.id || createId("signup"),
    name: request.name || "이름 없음",
    pinHash: request.pinHash || null,
    requestedAt: request.requestedAt || now,
  }));
  if (!nextState.members.length) {
    nextState.members.push({
      id: "member-juice",
      name: "쥬스",
      role: "admin",
      pinHash: null,
      createdAt: now,
    });
  } else if (!nextState.members.some((member) => member.role === "admin")) {
    nextState.members[0].role = "admin";
  }
  return nextState;
}

function loadSessionMemberId() {
  const stored = localStorage.getItem(SESSION_KEY);
  if (state.members.some((member) => member.id === stored)) return stored;
  localStorage.removeItem(SESSION_KEY);
  return null;
}

function saveState(options = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (options.persistRemote === false) return;
  if (isSupabaseStoreConfigured) {
    queuePersistStateToSupabase(state);
  }
}

function setSession(memberId) {
  activeMemberId = memberId;
  localStorage.setItem(SESSION_KEY, memberId);
}

function render() {
  const canceledNow = applyAutoCancellations();
  renderAuth();
  if (!isLoggedIn()) return;

  renderAccount();
  renderTabs();
  renderSummary();
  renderDashboard();
  renderAdmin();
  applyHashEventFocus();
  scheduleAutoCancelCheck();
  if (canceledNow) {
    showToast("최소 인원 미달로 자동 취소된 일정이 있습니다.");
  }
}

function renderAuth() {
  const loggedIn = isLoggedIn();
  els.authScreen.hidden = loggedIn;
  els.appShell.hidden = !loggedIn;

  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.authMode === authMode);
  });
  els.loginForm.hidden = authMode !== "login";
  els.signupForm.hidden = authMode !== "signup";
}

function renderAccount() {
  const member = getActiveMember();
  els.currentMemberName.textContent = member.name;
  els.currentMemberRole.textContent = member.role === "admin" ? "운영진" : "회원";
}

function renderTabs() {
  if (!isActiveMemberAdmin() && activeView === "admin") {
    activeView = "dashboard";
  }

  document.querySelectorAll(".tab").forEach((tab) => {
    const isAdminTab = tab.dataset.view === "admin";
    tab.hidden = isAdminTab && !isActiveMemberAdmin();
    tab.classList.toggle("is-active", tab.dataset.view === activeView);
  });

  document.querySelectorAll(".view").forEach((view) => {
    view.classList.remove("is-active");
  });
  document.querySelector(`#${activeView}View`)?.classList.add("is-active");
}

function renderSummary() {
  const currentMonth = getMonthKey(new Date());
  const activeMember = getActiveMember();
  const memberCount = countConfirmedAttendance(activeMember.id, currentMonth);
  const myUpcomingCount = state.events.filter((event) => {
    return (
      !isPastEvent(event) &&
      !isEventCanceled(event) &&
      getRsvp(event, activeMember.id) === "attending"
    );
  }).length;
  const nextEvent = getSortedEvents().find((event) => !isPastEvent(event) && !isEventCanceled(event));
  const myNextEvent = getSortedEvents().find((event) => {
    return !isPastEvent(event) && !isEventCanceled(event) && getRsvp(event, activeMember.id) === "attending";
  });

  els.myMonthCount.textContent = memberCount;
  els.pendingConfirmCount.textContent = myUpcomingCount;
  els.nextEventDate.textContent = nextEvent ? formatShortRange(nextEvent) : "-";
  els.myNextEventDate.textContent = myNextEvent ? formatShortRange(myNextEvent) : "-";
}

function renderDashboard() {
  const activeMember = getActiveMember();
  const events = getSortedEvents().filter(eventMatchesDashboardFilter);

  renderDashboardFilterButtons();
  els.eventList.innerHTML = renderEventGroup(
    getDashboardFilterLabel(dashboardFilter),
    getDashboardFilteredEvents(events),
    activeMember,
  );
}

function renderDashboardFilterButtons() {
  document.querySelectorAll("[data-dashboard-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.dashboardFilter === dashboardFilter);
  });
}

function getDashboardFilteredEvents(events) {
  if (dashboardFilter === "pending") {
    return events.filter((event) => !isEventCanceled(event) && !event.finalizedAt);
  }
  if (dashboardFilter === "canceled") {
    return events.filter((event) => isEventCanceled(event)).reverse();
  }
  if (dashboardFilter === "completed") {
    return events.filter((event) => event.finalizedAt).reverse();
  }
  return events;
}

function getDashboardFilterLabel(filter) {
  if (filter === "pending") return "현재 대기중인 일정";
  if (filter === "canceled") return "취소된 일정";
  if (filter === "completed") return "완료된 일정";
  return "전체 일정";
}

function renderEventGroup(title, events, activeMember) {
  const body = events.length
    ? events.map((event) => renderEventCard(event, activeMember)).join("")
    : `<div class="empty-state compact">해당 일정이 없습니다.</div>`;

  return `
    <section class="event-group" aria-label="${escapeHtml(title)}">
      <div class="event-group-head">
        <h3>${escapeHtml(title)}</h3>
        <span class="pill">${events.length}개</span>
      </div>
      <div class="event-group-list">${body}</div>
    </section>
  `;
}

function eventMatchesDashboardFilter(event) {
  const eventStart = new Date(event.startAt);
  if (els.dashboardDate.value) {
    return getDayKey(eventStart) === els.dashboardDate.value;
  }
  return getMonthKey(eventStart) === els.dashboardMonth.value;
}

function renderEventCard(event, member) {
  const isFinalized = Boolean(event.finalizedAt);
  const isCanceled = isEventCanceled(event);
  const rsvp = getRsvp(event, member.id);
  const creator = state.members.find((candidate) => candidate.id === event.createdBy);
  const attendingCount = countAttendingRsvps(event);
  const confirmedCount = countEventConfirmedAttendance(event);
  const canDelete = canDeleteEvent(event);
  const canEdit = canEditEvent(event);
  const capacity = event.capacity ? ` / ${event.capacity}` : "";
  const autoCancelPills = renderAutoCancelPills(event);
  const statusPill = isCanceled
    ? `<span class="pill coral">취소됨</span>`
    : isFinalized
      ? `<span class="pill green">확정 ${confirmedCount}명</span>`
      : isPastEvent(event)
        ? `<span class="pill coral">출석 확인 전</span>`
        : `<span class="pill blue">신청 ${attendingCount}${capacity}명</span>`;
  const locked = isFinalized || isCanceled ? "disabled" : "";
  const rsvpHint = isCanceled
    ? `<p class="event-note small">${escapeHtml(event.canceledReason || "취소된 일정입니다.")}</p>`
    : isFinalized
      ? `<p class="event-note small">운영진이 출석을 확정한 일정이라 참석 상태를 변경할 수 없습니다.</p>`
      : "";

  return `
    <article class="event-card ${isCanceled ? "is-canceled" : ""}" id="event-${escapeHtml(event.id)}">
      <div class="event-main">
        <div class="event-meta">
          <span class="pill">${escapeHtml(formatShortRange(event))}</span>
          <span class="pill">${escapeHtml(event.location)}</span>
          ${statusPill}
          ${autoCancelPills}
        </div>
        <h3>${escapeHtml(event.title)}</h3>
        <p class="event-note">${escapeHtml(event.note || "메모 없음")}</p>
        <p class="event-note">등록: ${escapeHtml(creator?.name || "알 수 없음")}</p>
      </div>
      <div class="event-actions">
        <div class="status-group" aria-label="참석 상태">
          ${renderStatusButton(event, "attending", rsvp, locked)}
          ${renderStatusButton(event, "maybe", rsvp, locked)}
          ${renderStatusButton(event, "absent", rsvp, locked)}
        </div>
        ${rsvpHint}
        <div class="secondary-actions">
          <button class="tool-btn" type="button" data-action="copy-share" data-event-id="${escapeHtml(event.id)}" title="공유 문구 복사">
            <span aria-hidden="true">↗</span>
            <span>공유</span>
          </button>
          ${
            canEdit
              ? `<button class="tool-btn" type="button" data-action="open-edit-event" data-event-id="${escapeHtml(event.id)}" title="일정 수정">
                  <span aria-hidden="true">✎</span>
                  <span>수정</span>
                </button>`
              : ""
          }
          ${
            canDelete
              ? `<button class="danger-btn" type="button" data-action="delete-event" data-event-id="${escapeHtml(event.id)}" title="일정 삭제">
                  <span aria-hidden="true">×</span>
                  <span>삭제</span>
                </button>`
              : ""
          }
        </div>
      </div>
    </article>
  `;
}

function renderStatusButton(event, status, currentStatus, locked) {
  const isActive = currentStatus === status;
  return `
    <button
      class="status-btn ${isActive ? "is-active" : ""}"
      type="button"
      data-action="set-rsvp"
      data-event-id="${escapeHtml(event.id)}"
      data-status="${status}"
      ${locked}
    >
      ${RSVP_LABELS[status]}
    </button>
  `;
}

function renderAdmin() {
  if (!isActiveMemberAdmin()) {
    els.adminReport.innerHTML = "";
    els.memberRoster.innerHTML = "";
    els.signupRequests.innerHTML = "";
    els.confirmQueue.innerHTML = "";
    return;
  }

  if (!els.reportMonth.value) {
    els.reportMonth.value = getMonthKey(new Date());
  }

  const month = els.reportMonth.value;
  const monthEvents = getSortedEvents().filter((event) => getMonthKey(new Date(event.startAt)) === month);

  renderConfirmFilterButtons();
  els.signupRequests.innerHTML = renderSignupRequests();
  els.adminReport.innerHTML = renderReportTable(month, monthEvents);
  els.memberRoster.innerHTML = renderMemberRoster();
  els.confirmQueue.innerHTML = renderConfirmQueue(monthEvents);
}

function renderConfirmFilterButtons() {
  document.querySelectorAll("[data-confirm-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.confirmFilter === confirmFilter);
  });
}

function renderReportTable(month, monthEvents) {
  const finalizedEvents = monthEvents.filter((event) => event.finalizedAt && !isEventCanceled(event));
  const dayKeys = getMonthDayKeys(month);

  if (!monthEvents.length) {
    return `<div class="empty-state">${escapeHtml(month)} 일정이 없습니다.</div>`;
  }

  const headers = dayKeys
    .map((dayKey) => `<th>${escapeHtml(formatDayColumn(dayKey))}</th>`)
    .join("");

  const rows = state.members
    .map((member) => {
      let total = 0;
      const cells = dayKeys
        .map((dayKey) => {
          const count = finalizedEvents.filter((event) => {
            return getDayKey(new Date(event.startAt)) === dayKey && event.confirmedAttendance?.[member.id];
          }).length;
          total += count;
          return `<td>${count || ""}</td>`;
        })
        .join("");
      return `
        <tr>
          <td>${escapeHtml(member.name)}${member.role === "admin" ? " · 운영진" : ""}</td>
          ${cells}
          <td class="count-cell">${total}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="report-wrap">
      <div class="roster-head">
        <h3>월별 참석 현황</h3>
        <span class="pill">확정 일정 ${finalizedEvents.length}개</span>
      </div>
      <table class="report-table">
        <thead>
          <tr>
            <th>회원</th>
            ${headers}
            <th>합계</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderSignupRequests() {
  if (!state.signupRequests.length) {
    return `<div class="empty-state compact">대기 중인 가입 요청이 없습니다.</div>`;
  }

  const rows = state.signupRequests
    .map((request) => `
      <tr>
        <td>${escapeHtml(request.name)}</td>
        <td>${escapeHtml(formatDateTime(new Date(request.requestedAt)))}</td>
        <td>
          <div class="table-actions">
            <button class="primary-btn" type="button" data-action="approve-signup" data-request-id="${escapeHtml(request.id)}">
              <span aria-hidden="true">✓</span>
              <span>승인</span>
            </button>
            <button class="danger-btn" type="button" data-action="reject-signup" data-request-id="${escapeHtml(request.id)}">
              <span aria-hidden="true">×</span>
              <span>거절</span>
            </button>
          </div>
        </td>
      </tr>
    `)
    .join("");

  return `
    <div class="report-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>이름</th>
            <th>요청 시각</th>
            <th>처리</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderMemberRoster() {
  const adminCount = state.members.filter((member) => member.role === "admin").length;
  const rows = state.members
    .map((member) => {
      const isLastAdmin = member.role === "admin" && adminCount <= 1;
      const canDelete = member.id !== activeMemberId && !isLastAdmin;
      return `
        <tr>
          <td>${escapeHtml(member.name)}</td>
          <td>${member.role === "admin" ? "운영진" : "회원"}</td>
          <td>${countMemberEvents(member.id)}</td>
          <td>
            ${
              canDelete
                ? `<button class="danger-btn" type="button" data-action="delete-member" data-member-id="${escapeHtml(member.id)}">
                    <span aria-hidden="true">×</span>
                    <span>제거</span>
                  </button>`
                : ""
            }
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="report-wrap">
      <div class="roster-head">
        <h3>회원 관리</h3>
        <div class="roster-actions">
          <span class="pill">${state.members.length}명</span>
          <button class="tool-btn" type="button" data-action="open-member-dialog" title="회원 추가">
            <span aria-hidden="true">+</span>
            <span>회원 추가</span>
          </button>
        </div>
      </div>
      <table class="report-table">
        <thead>
          <tr>
            <th>회원</th>
            <th>권한</th>
            <th>관련 일정</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderConfirmQueue(monthEvents) {
  const filteredEvents = monthEvents.filter((event) => {
    if (isEventCanceled(event)) return false;
    if (confirmFilter === "needs") return isPastEvent(event) && !event.finalizedAt;
    if (confirmFilter === "upcoming") return !isPastEvent(event) && !event.finalizedAt;
    if (confirmFilter === "finalized") return Boolean(event.finalizedAt);
    return true;
  });

  if (!filteredEvents.length) {
    return `<div class="empty-state compact">해당 일정이 없습니다.</div>`;
  }

  return filteredEvents
    .map((event) => {
      const isFinalized = Boolean(event.finalizedAt);
      const future = !isPastEvent(event);
      const approvalIds = getFinalApprovalIds(event);
      const hasActiveApproval = approvalIds.includes(activeMemberId);
      const approvalCount = approvalIds.length;
      const approvalPill = !isFinalized && !future
        ? `<span class="pill ${approvalCount ? "blue" : ""}">운영진 승인 ${approvalCount}/${REQUIRED_FINAL_APPROVALS}</span>`
        : "";
      const adminShortagePill = !isFinalized && !future && getAdminMembers().length < REQUIRED_FINAL_APPROVALS
        ? `<span class="pill coral">운영진 추가 필요</span>`
        : "";
      const summary = isFinalized
        ? `<span class="pill green">확정 ${countEventConfirmedAttendance(event)}명</span>`
        : future
          ? `<span class="pill blue">진행 예정</span>`
          : `<span class="pill coral">출석 확인 필요</span>`;
      const approvalNote = renderFinalApprovalNote(event, future, isFinalized);
      const checkboxes = state.members
        .map((member) => {
          const checked = getAttendanceDraft(event, member.id) ? "checked" : "";
          const disabled = isFinalized ? "disabled" : "";
          return `
            <label class="check-row">
              <input
                type="checkbox"
                data-action="toggle-attendance"
                data-event-id="${escapeHtml(event.id)}"
                data-member-id="${escapeHtml(member.id)}"
                ${checked}
                ${disabled}
              />
              <span>${escapeHtml(member.name)}</span>
            </label>
          `;
        })
        .join("");

      return `
        <article class="confirm-card">
          <div class="confirm-top">
            <div>
              <div class="event-meta">
                <span class="pill">${escapeHtml(formatShortRange(event))}</span>
                <span class="pill">${escapeHtml(event.location)}</span>
                ${summary}
                ${approvalPill}
                ${adminShortagePill}
              </div>
              <h3>${escapeHtml(event.title)}</h3>
            </div>
          </div>
          <div class="confirm-grid">${checkboxes}</div>
          ${approvalNote}
          <div class="confirm-actions">
            ${
              isFinalized
                ? `<button class="plain-btn" type="button" data-action="reopen-event" data-event-id="${escapeHtml(event.id)}">
                    <span aria-hidden="true">↺</span>
                    <span>확정 해제</span>
                  </button>`
                : `<button class="primary-btn" type="button" data-action="finalize-event" data-event-id="${escapeHtml(event.id)}" ${future || hasActiveApproval ? "disabled" : ""}>
                    <span aria-hidden="true">✓</span>
                    <span>${hasActiveApproval ? "승인 완료" : "출석 확정 승인"}</span>
                  </button>`
            }
          </div>
        </article>
      `;
    })
    .join("");
}

async function handleLogin() {
  const name = els.loginName.value.trim();
  const pin = els.loginPin.value.trim();
  if (!name || !isValidPin(pin)) {
    showToast("PIN은 숫자 6자리여야 합니다.");
    return;
  }

  const member = findMemberByName(name);
  if (!member) {
    if (findSignupRequestByName(name)) {
      showToast("운영진 승인 대기 중입니다.");
      return;
    }
    showToast("등록되지 않은 이름입니다. 회원 가입을 먼저 해주세요.");
    return;
  }

  const nextHash = await hashPin(member.name, pin);
  if (!member.pinHash) {
    member.pinHash = nextHash;
    saveState();
    showToast("PIN을 설정하고 로그인했습니다.");
  } else if (member.pinHash !== nextHash) {
    showToast("PIN이 맞지 않습니다.");
    return;
  }

  setSession(member.id);
  els.loginForm.reset();
  activeView = "dashboard";
  render();
}

async function handleSignup() {
  const name = els.signupName.value.trim();
  const pin = els.signupPin.value.trim();
  if (!name || !isValidPin(pin)) {
    showToast("이름과 숫자 6자리 PIN을 입력해주세요.");
    return;
  }

  if (findMemberByName(name)) {
    showToast("이미 등록된 이름입니다. 로그인해주세요.");
    setAuthMode("login");
    els.loginName.value = name;
    els.loginPin.focus();
    return;
  }

  if (findSignupRequestByName(name)) {
    showToast("이미 가입 승인 대기 중입니다.");
    return;
  }

  const request = {
    id: createId("signup"),
    name,
    pinHash: await hashPin(name, pin),
    requestedAt: new Date().toISOString(),
  };

  state.signupRequests.push(request);
  saveState();
  els.signupForm.reset();
  setAuthMode("login");
  els.loginName.value = name;
  showToast("가입 요청을 보냈습니다. 운영진 승인 후 로그인할 수 있습니다.");
  render();
}

function logout() {
  activeMemberId = null;
  localStorage.removeItem(SESSION_KEY);
  activeView = "dashboard";
  setAuthMode("login");
  render();
}

function openMemberDialog() {
  if (!isActiveMemberAdmin()) {
    showToast("운영진만 회원을 추가할 수 있습니다.");
    return;
  }

  els.memberName.value = "";
  els.memberPin.value = "";
  els.memberIsAdmin.checked = false;
  els.adminRoleLabel.hidden = false;
  els.memberDialog.showModal();
  els.memberName.focus();
}

async function addMember() {
  if (!isActiveMemberAdmin()) {
    showToast("운영진만 회원을 추가할 수 있습니다.");
    return;
  }

  const name = els.memberName.value.trim();
  const pin = els.memberPin.value.trim();
  if (!name || !isValidPin(pin)) {
    showToast("이름과 숫자 6자리 PIN을 입력해주세요.");
    return;
  }

  const exists = state.members.some((member) => normalizeName(member.name) === normalizeName(name));
  if (exists) {
    showToast("이미 등록된 이름입니다.");
    return;
  }
  if (findSignupRequestByName(name)) {
    showToast("같은 이름의 가입 요청이 대기 중입니다.");
    return;
  }

  const member = {
    id: createId("member"),
    name,
    role: els.memberIsAdmin.checked ? "admin" : "member",
    pinHash: await hashPin(name, pin),
    createdAt: new Date().toISOString(),
  };

  state.members.push(member);
  saveState();
  els.memberDialog.close();
  showToast(`${name} 회원을 추가했습니다.`);
  render();
}

function approveSignupRequest(requestId) {
  if (!isActiveMemberAdmin()) {
    showToast("운영진만 가입을 승인할 수 있습니다.");
    return;
  }

  const request = state.signupRequests.find((candidate) => candidate.id === requestId);
  if (!request) return;

  if (findMemberByName(request.name)) {
    state.signupRequests = state.signupRequests.filter((candidate) => candidate.id !== requestId);
    saveState();
    showToast("이미 등록된 이름이라 가입 요청을 정리했습니다.");
    render();
    return;
  }

  state.members.push({
    id: createId("member"),
    name: request.name,
    role: "member",
    pinHash: request.pinHash,
    createdAt: new Date().toISOString(),
  });
  state.signupRequests = state.signupRequests.filter((candidate) => candidate.id !== requestId);
  saveState();
  showToast(`${request.name} 가입을 승인했습니다.`);
  render();
}

function rejectSignupRequest(requestId) {
  if (!isActiveMemberAdmin()) {
    showToast("운영진만 가입 요청을 처리할 수 있습니다.");
    return;
  }

  const request = state.signupRequests.find((candidate) => candidate.id === requestId);
  if (!request) return;
  if (!window.confirm(`${request.name} 가입 요청을 거절할까요?`)) return;

  state.signupRequests = state.signupRequests.filter((candidate) => candidate.id !== requestId);
  saveState();
  showToast("가입 요청을 거절했습니다.");
  render();
}

function createEvent() {
  if (!requireLogin()) return;

  const { startAt, endAt } = buildEventRange(
    els.eventDate.value,
    els.eventStartTime.value,
    els.eventEndTime.value,
  );
  const autoCancel = getAutoCancelOptions(els.eventMinAttendees.value, els.eventCancelAt.value);
  if (!autoCancel.valid) {
    showToast(autoCancel.message);
    return;
  }
  if (!validateCancelDeadline(autoCancel.cancelAt, startAt)) return;

  const event = {
    id: createId("event"),
    title: els.eventTitle.value.trim(),
    location: els.eventLocation.value.trim(),
    startAt,
    endAt,
    capacity: els.eventCapacity.value ? Number(els.eventCapacity.value) : null,
    minAttendees: autoCancel.minAttendees,
    cancelAt: autoCancel.cancelAt,
    canceledAt: null,
    canceledReason: null,
    canceledBy: null,
    note: els.eventNote.value.trim(),
    createdBy: activeMemberId,
    createdAt: new Date().toISOString(),
    rsvps: {
      [activeMemberId]: "attending",
    },
    attendanceDraft: {},
    confirmedAttendance: {},
    finalApprovalIds: [],
    finalizedAt: null,
    finalizedBy: null,
  };

  state.events.push(event);
  saveState();
  els.eventForm.reset();
  setDefaultFormValues();
  activeView = "dashboard";
  showToast("일정을 등록했습니다.");
  render();
}

function openEditEventDialog(eventId) {
  if (!requireLogin()) return;

  const event = getEvent(eventId);
  if (!event) return;
  if (!canEditEvent(event)) {
    showToast("일정 작성자와 운영진만 수정할 수 있습니다.");
    return;
  }

  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  els.editEventId.value = event.id;
  els.editEventTitle.value = event.title;
  els.editEventLocation.value = event.location;
  els.editEventDate.value = toInputDate(start);
  els.editEventStartTime.value = toInputTime(start);
  els.editEventEndTime.value = toInputTime(end);
  els.editEventCapacity.value = event.capacity || "";
  els.editEventMinAttendees.value = event.minAttendees || "";
  els.editEventCancelAt.value = event.cancelAt ? toInputDateTime(new Date(event.cancelAt)) : "";
  els.editEventNote.value = event.note || "";
  els.editEventDialog.showModal();
  els.editEventTitle.focus();
}

function updateEvent() {
  if (!requireLogin()) return;

  const event = getEvent(els.editEventId.value);
  if (!event) return;
  if (!canEditEvent(event)) {
    showToast("일정 작성자와 운영진만 수정할 수 있습니다.");
    return;
  }

  const { startAt, endAt } = buildEventRange(
    els.editEventDate.value,
    els.editEventStartTime.value,
    els.editEventEndTime.value,
  );
  const autoCancel = getAutoCancelOptions(els.editEventMinAttendees.value, els.editEventCancelAt.value);
  if (!autoCancel.valid) {
    showToast(autoCancel.message);
    return;
  }
  if (!validateCancelDeadline(autoCancel.cancelAt, startAt)) return;

  event.title = els.editEventTitle.value.trim();
  event.location = els.editEventLocation.value.trim();
  event.startAt = startAt;
  event.endAt = endAt;
  event.capacity = els.editEventCapacity.value ? Number(els.editEventCapacity.value) : null;
  event.minAttendees = autoCancel.minAttendees;
  event.cancelAt = autoCancel.cancelAt;
  event.note = els.editEventNote.value.trim();
  event.updatedAt = new Date().toISOString();
  event.updatedBy = activeMemberId;

  saveState();
  els.editEventDialog.close();
  showToast("일정을 수정했습니다.");
  render();
}

function setRsvp(eventId, status) {
  if (!requireLogin()) return;

  const event = getEvent(eventId);
  if (!event) return;
  if (event.finalizedAt) return;
  if (isEventCanceled(event)) {
    showToast("취소된 일정은 참석 상태를 변경할 수 없습니다.");
    return;
  }

  event.rsvps = event.rsvps || {};
  event.rsvps[activeMemberId] = status;
  if (!event.attendanceDraft || Object.keys(event.attendanceDraft).length === 0) {
    event.attendanceDraft = {};
  }
  const approvalsCleared = clearFinalApprovals(event);
  saveState();
  showToast(
    approvalsCleared
      ? `${RSVP_LABELS[status]}으로 저장했습니다. 출석 확정 승인은 초기화했습니다.`
      : `${RSVP_LABELS[status]}으로 저장했습니다.`,
  );
  render();
}

function updateAttendanceDraft(eventId, memberId, checked) {
  if (!isActiveMemberAdmin()) {
    showToast("운영진만 출석을 확정할 수 있습니다.");
    render();
    return;
  }

  const event = getEvent(eventId);
  if (!event || event.finalizedAt || isEventCanceled(event)) return;

  event.attendanceDraft = event.attendanceDraft || {};
  event.attendanceDraft[memberId] = checked;
  const approvalsCleared = clearFinalApprovals(event);
  saveState();
  if (approvalsCleared) {
    showToast("출석 명단이 변경되어 기존 확정 승인을 초기화했습니다.");
  }
  renderSummary();
  renderAdmin();
}

function finalizeEvent(eventId) {
  if (!isActiveMemberAdmin()) {
    showToast("운영진만 출석을 확정할 수 있습니다.");
    return;
  }

  const event = getEvent(eventId);
  if (!event || event.finalizedAt || isEventCanceled(event) || !isPastEvent(event)) return;

  event.attendanceDraft = materializeAttendanceDraft(event);
  event.finalApprovalIds = getFinalApprovalIds(event);

  if (event.finalApprovalIds.includes(activeMemberId)) {
    const remaining = Math.max(0, REQUIRED_FINAL_APPROVALS - event.finalApprovalIds.length);
    showToast(`이미 승인했습니다. 운영진 ${remaining}명의 승인이 더 필요합니다.`);
    return;
  }

  event.finalApprovalIds.push(activeMemberId);

  if (event.finalApprovalIds.length < REQUIRED_FINAL_APPROVALS) {
    const remaining = REQUIRED_FINAL_APPROVALS - event.finalApprovalIds.length;
    saveState();
    showToast(`확정 승인을 저장했습니다. 운영진 ${remaining}명의 승인이 더 필요합니다.`);
    render();
    return;
  }

  event.confirmedAttendance = buildConfirmedAttendance(event);
  event.finalizedAt = new Date().toISOString();
  event.finalizedBy = activeMemberId;
  saveState();
  showToast(`운영진 ${REQUIRED_FINAL_APPROVALS}명 승인으로 출석을 확정했습니다.`);
  render();
}

function reopenEvent(eventId) {
  if (!isActiveMemberAdmin()) {
    showToast("운영진만 확정을 해제할 수 있습니다.");
    return;
  }

  const event = getEvent(eventId);
  if (!event || !event.finalizedAt) return;

  event.attendanceDraft = materializeAttendanceDraftFromConfirmed(event);
  event.confirmedAttendance = {};
  event.finalApprovalIds = [];
  event.finalizedAt = null;
  event.finalizedBy = null;
  saveState();
  showToast("확정을 해제했습니다.");
  render();
}

function deleteEvent(eventId) {
  if (!requireLogin()) return;

  const event = getEvent(eventId);
  if (!event) return;
  if (!canDeleteEvent(event)) {
    showToast("일정 작성자와 운영진만 삭제할 수 있습니다.");
    return;
  }
  if (!window.confirm(`"${event.title}" 일정을 삭제할까요?`)) return;

  state.events = state.events.filter((candidate) => candidate.id !== eventId);
  saveState();
  showToast("일정을 삭제했습니다.");
  render();
}

function deleteMember(memberId) {
  if (!isActiveMemberAdmin()) {
    showToast("운영진만 회원을 관리할 수 있습니다.");
    return;
  }

  const member = state.members.find((candidate) => candidate.id === memberId);
  if (!member || member.id === activeMemberId) return;

  const adminCount = state.members.filter((candidate) => candidate.role === "admin").length;
  if (member.role === "admin" && adminCount <= 1) {
    showToast("마지막 운영진은 제거할 수 없습니다.");
    return;
  }

  if (!window.confirm(`${member.name} 회원을 제거할까요?`)) return;

  state.members = state.members.filter((candidate) => candidate.id !== memberId);
  state.events.forEach((event) => {
    delete event.rsvps?.[memberId];
    delete event.attendanceDraft?.[memberId];
    delete event.confirmedAttendance?.[memberId];
    event.finalApprovalIds = getFinalApprovalIds(event).filter((approvalId) => approvalId !== memberId);
    if (event.createdBy === memberId) {
      event.createdBy = activeMemberId;
    }
  });

  saveState();
  showToast("회원을 제거했습니다.");
  render();
}

async function copyEventShare(eventId) {
  if (!requireLogin()) return;

  const event = getEvent(eventId);
  if (!event) return;

  const url = `${window.location.href.split("#")[0]}#event=${encodeURIComponent(event.id)}`;
  const text = [
    `[NOTBAD] ${event.title}`,
    isEventCanceled(event) ? "상태: 취소됨" : "",
    formatLongRange(event),
    `장소: ${event.location}`,
    event.capacity ? `정원: ${event.capacity}명` : "",
    event.minAttendees ? `최소 인원: ${event.minAttendees}명` : "",
    event.cancelAt ? `자동 취소 시각: ${formatDateTime(new Date(event.cancelAt))}` : "",
    event.note ? `메모: ${event.note}` : "",
    `참석 링크: ${url}`,
  ]
    .filter(Boolean)
    .join("\n");

  await copyText(text);
  showToast("공유 문구를 복사했습니다.");
}

async function copyMyMonthSummary() {
  if (!requireLogin()) return;

  const member = getActiveMember();
  const month = getMonthKey(new Date());
  const count = countConfirmedAttendance(member.id, month);
  const text = `[NOTBAD] ${member.name} ${month} 확정 출석: ${count}회`;
  await copyText(text);
  showToast("월간 요약을 복사했습니다.");
}

function exportMonthlyCsv() {
  if (!isActiveMemberAdmin()) {
    showToast("운영진만 CSV를 다운로드할 수 있습니다.");
    return;
  }

  const month = els.reportMonth.value || getMonthKey(new Date());
  const dayKeys = getMonthDayKeys(month);
  const finalizedEvents = getSortedEvents().filter((event) => {
    return getMonthKey(new Date(event.startAt)) === month && event.finalizedAt && !isEventCanceled(event);
  });
  const header = ["회원명", "역할", ...dayKeys.map(formatDayColumn), "합계"];
  const rows = state.members.map((member) => {
    let total = 0;
    const dayCounts = dayKeys.map((dayKey) => {
      const count = finalizedEvents.filter((event) => {
        return getDayKey(new Date(event.startAt)) === dayKey && event.confirmedAttendance?.[member.id];
      }).length;
      total += count;
      return count || "";
    });

    return [
      member.name,
      member.role === "admin" ? "운영진" : "회원",
      ...dayCounts,
      total,
    ];
  });

  const csv = [header, ...rows]
    .map((row) => row.map(toCsvCell).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `notbad-attendance-${month}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV를 다운로드했습니다.");
}

function setAuthMode(mode) {
  authMode = mode === "signup" ? "signup" : "login";
  renderAuth();
}

function setDefaultFormValues() {
  const now = new Date();
  const defaultStart = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  defaultStart.setHours(19, 0, 0, 0);
  const defaultEnd = new Date(defaultStart.getTime() + 2 * 60 * 60 * 1000);

  els.eventDate.value = toInputDate(defaultStart);
  els.eventStartTime.value = toInputTime(defaultStart);
  els.eventEndTime.value = toInputTime(defaultEnd);
}

function setDefaultDashboardFilters() {
  els.dashboardMonth.value = getMonthKey(new Date());
  els.dashboardDate.value = "";
}

function isLoggedIn() {
  return Boolean(activeMemberId && state.members.some((member) => member.id === activeMemberId));
}

function requireLogin() {
  if (isLoggedIn()) return true;
  showToast("로그인이 필요합니다.");
  return false;
}

function getActiveMember() {
  return state.members.find((member) => member.id === activeMemberId) || null;
}

function isActiveMemberAdmin() {
  return getActiveMember()?.role === "admin";
}

function getAdminMembers() {
  return state.members.filter((member) => member.role === "admin");
}

function canDeleteEvent(event) {
  return isActiveMemberAdmin() || event.createdBy === activeMemberId;
}

function canEditEvent(event) {
  return !isEventCanceled(event) && (isActiveMemberAdmin() || event.createdBy === activeMemberId);
}

function getEvent(eventId) {
  return state.events.find((event) => event.id === eventId);
}

function getRsvp(event, memberId) {
  return event.rsvps?.[memberId] || "maybe";
}

function getAttendanceDraft(event, memberId) {
  if (event.finalizedAt) return Boolean(event.confirmedAttendance?.[memberId]);
  if (event.attendanceDraft && Object.prototype.hasOwnProperty.call(event.attendanceDraft, memberId)) {
    return Boolean(event.attendanceDraft[memberId]);
  }
  return getRsvp(event, memberId) === "attending";
}

function buildConfirmedAttendance(event) {
  const attendance = {};
  state.members.forEach((member) => {
    if (getAttendanceDraft(event, member.id)) {
      attendance[member.id] = true;
    }
  });
  return attendance;
}

function materializeAttendanceDraft(event) {
  const draft = {};
  state.members.forEach((member) => {
    draft[member.id] = getAttendanceDraft(event, member.id);
  });
  return draft;
}

function materializeAttendanceDraftFromConfirmed(event) {
  const draft = {};
  state.members.forEach((member) => {
    draft[member.id] = Boolean(event.confirmedAttendance?.[member.id]);
  });
  return draft;
}

function normalizeIdList(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];
}

function getFinalApprovalIds(event) {
  const approvalIds = normalizeIdList(event.finalApprovalIds || (event.finalizedBy ? [event.finalizedBy] : []));
  return approvalIds.filter((memberId) => {
    const member = state.members.find((candidate) => candidate.id === memberId);
    return member?.role === "admin";
  });
}

function clearFinalApprovals(event) {
  const hadApprovals = getFinalApprovalIds(event).length > 0;
  event.finalApprovalIds = [];
  return hadApprovals;
}

function renderFinalApprovalNote(event, future, isFinalized) {
  if (future) return "";

  const approvalNames = getFinalApprovalIds(event)
    .map((memberId) => state.members.find((member) => member.id === memberId)?.name)
    .filter(Boolean);

  if (isFinalized && !approvalNames.length) return "";

  const text = isFinalized
    ? `확정 승인: ${approvalNames.join(", ")}`
    : approvalNames.length
      ? `승인한 운영진: ${approvalNames.join(", ")}`
      : "아직 승인한 운영진이 없습니다.";
  const shortage = !isFinalized && getAdminMembers().length < REQUIRED_FINAL_APPROVALS
    ? ` 운영진 ${REQUIRED_FINAL_APPROVALS}명 이상이 있어야 최종 확정됩니다.`
    : "";

  return `<p class="approval-note">${escapeHtml(text + shortage)}</p>`;
}

function countConfirmedAttendance(memberId, monthKey) {
  return state.events.filter((event) => {
    return (
      event.finalizedAt &&
      getMonthKey(new Date(event.startAt)) === monthKey &&
      event.confirmedAttendance?.[memberId]
    );
  }).length;
}

function countEventConfirmedAttendance(event) {
  return Object.values(event.confirmedAttendance || {}).filter(Boolean).length;
}

function countAttendingRsvps(event) {
  return Object.values(event.rsvps || {}).filter((status) => status === "attending").length;
}

function countMemberEvents(memberId) {
  return state.events.filter((event) => {
    return (
      event.createdBy === memberId ||
      Object.prototype.hasOwnProperty.call(event.rsvps || {}, memberId) ||
      Object.prototype.hasOwnProperty.call(event.attendanceDraft || {}, memberId) ||
      Object.prototype.hasOwnProperty.call(event.confirmedAttendance || {}, memberId) ||
      getFinalApprovalIds(event).includes(memberId)
    );
  }).length;
}

function getSortedEvents() {
  return [...state.events].sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
}

function isPastEvent(event) {
  return new Date(event.endAt) <= new Date();
}

function isEventCanceled(event) {
  return Boolean(event.canceledAt);
}

function findMemberByName(name) {
  return state.members.find((member) => normalizeName(member.name) === normalizeName(name));
}

function findSignupRequestByName(name) {
  return state.signupRequests.find((request) => normalizeName(request.name) === normalizeName(name));
}

function isValidPin(pin) {
  return PIN_PATTERN.test(pin);
}

async function hashPin(name, pin) {
  const payload = `notbad|${normalizeName(name)}|${pin}`;
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
    return `sha256:${Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")}`;
  }
  return `fallback:${btoa(unescape(encodeURIComponent(payload)))}`;
}

function getAutoCancelOptions(minValue, cancelAtValue) {
  const hasMin = Boolean(String(minValue || "").trim());
  const hasCancelAt = Boolean(String(cancelAtValue || "").trim());

  if (!hasMin && !hasCancelAt) {
    return { valid: true, minAttendees: null, cancelAt: null };
  }

  if (hasMin !== hasCancelAt) {
    return {
      valid: false,
      message: "자동 취소를 쓰려면 최소 인원과 자동 취소 시각을 함께 입력해주세요.",
    };
  }

  const minAttendees = Number(minValue);
  const cancelAt = toKstDateTimeIso(cancelAtValue);
  if (!Number.isInteger(minAttendees) || minAttendees < 1) {
    return { valid: false, message: "최소 인원은 1명 이상이어야 합니다." };
  }
  if (!cancelAt || Number.isNaN(new Date(cancelAt).getTime())) {
    return { valid: false, message: "자동 취소 시각을 다시 확인해주세요." };
  }

  return { valid: true, minAttendees, cancelAt };
}

function validateCancelDeadline(cancelAt, startAt) {
  if (!cancelAt) return true;
  if (new Date(cancelAt) <= new Date(startAt)) return true;
  showToast("자동 취소 시각은 일정 시작 전이어야 합니다.");
  return false;
}

function applyAutoCancellations() {
  const now = new Date();
  let changed = false;

  state.events.forEach((event) => {
    if (!shouldAutoCancel(event, now)) return;

    event.canceledAt = new Date(event.cancelAt).toISOString();
    event.canceledBy = "auto";
    event.canceledReason = `최소 인원 ${event.minAttendees}명 미달로 자동 취소되었습니다.`;
    event.updatedAt = new Date().toISOString();
    changed = true;
  });

  if (changed) saveState();
  return changed;
}

function shouldAutoCancel(event, now) {
  if (!event.minAttendees || !event.cancelAt) return false;
  if (event.finalizedAt || isEventCanceled(event)) return false;
  if (new Date(event.cancelAt) > now) return false;
  return countAttendingRsvps(event) < event.minAttendees;
}

function scheduleAutoCancelCheck() {
  window.clearTimeout(autoCancelTimer);

  const now = new Date();
  const nextCancelAt = state.events
    .filter((event) => event.minAttendees && event.cancelAt && !event.finalizedAt && !isEventCanceled(event))
    .map((event) => new Date(event.cancelAt).getTime())
    .filter((time) => time > now.getTime())
    .sort((a, b) => a - b)[0];

  if (!nextCancelAt) return;

  const delay = Math.min(Math.max(nextCancelAt - now.getTime() + 500, 500), 2_147_483_647);
  autoCancelTimer = window.setTimeout(() => {
    render();
  }, delay);
}

function renderAutoCancelPills(event) {
  if (!event.minAttendees && !event.cancelAt) return "";

  const parts = [];
  if (event.minAttendees) {
    parts.push(`<span class="pill">최소 ${escapeHtml(event.minAttendees)}명</span>`);
  }
  if (event.cancelAt) {
    parts.push(`<span class="pill">자동취소 ${escapeHtml(formatDateTime(new Date(event.cancelAt)))}</span>`);
  }
  return parts.join("");
}

function buildEventRange(dateValue, startTimeValue, endTimeValue) {
  const startAt = toKstIso(dateValue, startTimeValue);
  let endAt = toKstIso(dateValue, endTimeValue);

  if (new Date(endAt) <= new Date(startAt)) {
    endAt = new Date(new Date(endAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
  }

  return { startAt, endAt };
}

function toKstIso(dateValue, timeValue) {
  return new Date(`${dateValue}T${timeValue}:00+09:00`).toISOString();
}

function toKstDateTimeIso(dateTimeValue) {
  if (!dateTimeValue) return null;
  return new Date(`${dateTimeValue}:00+09:00`).toISOString();
}

function toInputDate(date) {
  const parts = getDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toInputTime(date) {
  const parts = getDateParts(date);
  return `${parts.hour}:${parts.minute}`;
}

function toInputDateTime(date) {
  const parts = getDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function getMonthKey(date) {
  const parts = getDateParts(date);
  return `${parts.year}-${parts.month}`;
}

function getDayKey(date) {
  const parts = getDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getMonthDayKeys(monthKey) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const daysInMonth = new Date(year, month, 0).getDate();

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return `${monthKey}-${day}`;
  });
}

function getDateParts(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

function formatShortRange(event) {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const date = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST_TIME_ZONE,
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(start);
  const startTime = formatTime(start);
  const endTime = formatTime(end);
  return `${date} ${startTime}-${endTime}`;
}

function formatLongRange(event) {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const date = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(start);
  return `${date} ${formatTime(start)}-${formatTime(end)}`;
}

function formatDayColumn(dayKey) {
  const [, month, day] = dayKey.split("-");
  return `${month}/${day}`;
}

function formatDateTime(date) {
  const day = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST_TIME_ZONE,
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
  return `${day} ${formatTime(date)}`;
}

function formatTime(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function createId(prefix) {
  if (crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeName(name) {
  return name.trim().toLocaleLowerCase("ko-KR");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 2200);
}

function applyHashEventFocus() {
  const match = window.location.hash.match(/^#event=(.+)$/);
  if (!match) return;

  window.requestAnimationFrame(() => {
    const id = decodeURIComponent(match[1]);
    document.querySelector(`#event-${CSS.escape(id)}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}
