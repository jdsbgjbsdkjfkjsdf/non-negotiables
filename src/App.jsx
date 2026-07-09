import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Check,
  LockKeyhole,
  RotateCcw,
  Share2,
  Sparkles,
  Trophy,
} from 'lucide-react';

const TOTAL_DAYS = 30;
const STORAGE_KEY = 'non-negotiables-progress-v1';
const SYNC_API_URL = 'https://api.keyval.org';
const SYNC_KEY = 'non-negotiables-bryan-2026-ab42f078453943db9f24';
const SYNC_INTERVAL_MS = 8000;
const EASTERN_TIME_ZONE = 'America/New_York';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TILE_SIZE = 1080;
const CANVAS_FONT_STACK =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const emptyProgress = () => Array.from({ length: TOTAL_DAYS }, () => false);

const easternDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const countPoints = (days) => days.filter(Boolean).length;

const hasMeaningfulProgress = (state) =>
  countPoints(state.completedDays) > 0 ||
  state.bestStreak > 0 ||
  state.lockedDays.some(Boolean);

const getEasternDateString = (date = new Date()) => {
  const dateParts = Object.fromEntries(
    easternDateFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
};

const parseDateString = (value) => {
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcMs = Date.UTC(year, month - 1, day);
  const parsedDate = new Date(utcMs);

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { day, month, utcMs, year };
};

const isDateString = (value) => Boolean(parseDateString(value));

const formatDateString = (date) =>
  [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');

const addDays = (dateString, days) => {
  const parsedDate = parseDateString(dateString);

  if (!parsedDate) {
    return getEasternDateString();
  }

  return formatDateString(new Date(parsedDate.utcMs + days * MS_PER_DAY));
};

const daysBetween = (startDate, endDate) => {
  const parsedStartDate = parseDateString(startDate);
  const parsedEndDate = parseDateString(endDate);

  if (!parsedStartDate || !parsedEndDate) {
    return 0;
  }

  return Math.floor((parsedEndDate.utcMs - parsedStartDate.utcMs) / MS_PER_DAY);
};

const compactDate = (dateString) => dateString.replaceAll('-', '');

const expandCompactDate = (dateString) => {
  if (typeof dateString !== 'string' || !/^\d{8}$/.test(dateString)) {
    return null;
  }

  const expandedDate = `${dateString.slice(0, 4)}-${dateString.slice(
    4,
    6,
  )}-${dateString.slice(6, 8)}`;

  return isDateString(expandedDate) ? expandedDate : null;
};

const inferStartDateFromProgress = (completedDays, todayDate = getEasternDateString()) => {
  const nextOpenIndex = completedDays.findIndex((isComplete) => !isComplete);
  const dueTodayIndex = nextOpenIndex === -1 ? TOTAL_DAYS - 1 : nextOpenIndex;

  return addDays(todayDate, -dueTodayIndex);
};

const normalizeTrackerState = ({
  bestStreak = 0,
  completedDays = emptyProgress(),
  lockedDays = emptyProgress(),
  schemaVersion = 2,
  startDate,
  updatedAt = 0,
} = {}) => {
  const normalizedCompletedDays = completedDays
    .slice(0, TOTAL_DAYS)
    .map(Boolean);

  while (normalizedCompletedDays.length < TOTAL_DAYS) {
    normalizedCompletedDays.push(false);
  }

  const normalizedLockedDays = lockedDays
    .slice(0, TOTAL_DAYS)
    .map((isLocked, index) => Boolean(isLocked) && normalizedCompletedDays[index]);

  while (normalizedLockedDays.length < TOTAL_DAYS) {
    normalizedLockedDays.push(false);
  }

  const { longestStreak } = calculateStreaks(normalizedCompletedDays);
  const normalizedStartDate = isDateString(startDate)
    ? startDate
    : inferStartDateFromProgress(normalizedCompletedDays);

  return {
    completedDays: normalizedCompletedDays,
    bestStreak: Math.max(longestStreak, clampStreak(bestStreak)),
    lockedDays: normalizedLockedDays,
    schemaVersion,
    startDate: normalizedStartDate,
    updatedAt: sanitizeTimestamp(updatedAt),
  };
};

const clampStreak = (value) => {
  const streak = Number(value);

  if (!Number.isInteger(streak)) {
    return 0;
  }

  return Math.min(Math.max(streak, 0), TOTAL_DAYS);
};

const sanitizeTimestamp = (value) => {
  const timestamp = Number(value);

  if (!Number.isFinite(timestamp) || timestamp < 0) {
    return 0;
  }

  return Math.floor(timestamp);
};

const markStateUpdated = (state) => ({
  ...state,
  updatedAt: Date.now(),
});

const calculateStreaks = (days) => {
  let longestStreak = 0;
  let runningStreak = 0;

  days.forEach((isComplete) => {
    runningStreak = isComplete ? runningStreak + 1 : 0;
    longestStreak = Math.max(longestStreak, runningStreak);
  });

  const lastCompletedIndex = days.lastIndexOf(true);
  let currentStreak = 0;

  if (lastCompletedIndex >= 0) {
    for (let index = lastCompletedIndex; index >= 0 && days[index]; index -= 1) {
      currentStreak += 1;
    }
  }

  return { currentStreak, longestStreak };
};

const getSharedTrackerState = () => {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('days')) {
    return null;
  }

  const progress = emptyProgress();
  const days = params
    .get('days')
    .split(',')
    .map((day) => Number(day.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= TOTAL_DAYS);

  days.forEach((day) => {
    progress[day - 1] = true;
  });

  const { longestStreak } = calculateStreaks(progress);
  const sharedBestStreak = clampStreak(params.get('best'));

  return {
    ...normalizeTrackerState({
      completedDays: progress,
      bestStreak: Math.max(longestStreak, sharedBestStreak),
      lockedDays: emptyProgress(),
      startDate: inferStartDateFromProgress(progress),
      updatedAt: 0,
    }),
    schemaVersion: 1,
  };
};

const normalizeSavedTrackerState = (savedState) => {
  const savedDays = Array.isArray(savedState)
    ? savedState
    : savedState?.completedDays;

  if (!Array.isArray(savedDays) || savedDays.length !== TOTAL_DAYS) {
    return null;
  }

  const completedDays = savedDays.map(Boolean);
  const savedLockedDays = Array.isArray(savedState?.lockedDays)
    ? savedState.lockedDays
    : emptyProgress();
  const lockedDays = savedLockedDays
    .slice(0, TOTAL_DAYS)
    .map((isLocked, index) => Boolean(isLocked) && completedDays[index]);

  while (lockedDays.length < TOTAL_DAYS) {
    lockedDays.push(false);
  }

  const savedBestStreak = Array.isArray(savedState)
    ? 0
    : clampStreak(savedState.bestStreak);

  return normalizeTrackerState({
    completedDays,
    bestStreak: savedBestStreak,
    lockedDays,
    schemaVersion: 2,
    startDate: savedState?.startDate || inferStartDateFromProgress(completedDays),
    updatedAt: sanitizeTimestamp(savedState?.updatedAt),
  });
};

const loadTrackerState = () => {
  const sharedTrackerState = getSharedTrackerState();

  if (sharedTrackerState) {
    return sharedTrackerState;
  }

  try {
    const savedState = normalizeSavedTrackerState(
      JSON.parse(localStorage.getItem(STORAGE_KEY)),
    );

    if (savedState) {
      return savedState;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  return normalizeTrackerState({
    completedDays: emptyProgress(),
    bestStreak: 0,
    lockedDays: emptyProgress(),
    startDate: getEasternDateString(),
    updatedAt: 0,
  });
};

const progressToBits = (days) => days.map((isComplete) => (isComplete ? '1' : '0')).join('');

const bitsToProgress = (bits) => {
  if (typeof bits !== 'string' || bits.length !== TOTAL_DAYS || /[^01]/.test(bits)) {
    return null;
  }

  return bits.split('').map((bit) => bit === '1');
};

const encodeSyncState = (state) =>
  `v2-s${compactDate(state.startDate)}-c${progressToBits(
    state.completedDays,
  )}-l${progressToBits(
    state.lockedDays,
  )}-b${clampStreak(state.bestStreak)}-u${sanitizeTimestamp(state.updatedAt)}`;

const decodeSyncState = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const v2Match = value.match(
    /^v2-s(\d{8})-c([01]{30})-l([01]{30})-b(\d{1,2})-u(\d{1,16})$/,
  );

  if (v2Match) {
    const startDate = expandCompactDate(v2Match[1]);
    const completedDays = bitsToProgress(v2Match[2]);
    const lockedBits = bitsToProgress(v2Match[3]);

    if (!startDate || !completedDays || !lockedBits) {
      return null;
    }

    return normalizeTrackerState({
      completedDays,
      bestStreak: clampStreak(v2Match[4]),
      lockedDays: lockedBits,
      schemaVersion: 2,
      startDate,
      updatedAt: sanitizeTimestamp(v2Match[5]),
    });
  }

  const v1Match = value.match(/^v1-c([01]{30})-l([01]{30})-b(\d{1,2})-u(\d{1,16})$/);

  if (!v1Match) {
    return null;
  }

  const completedDays = bitsToProgress(v1Match[1]);
  const lockedBits = bitsToProgress(v1Match[2]);

  if (!completedDays || !lockedBits) {
    return null;
  }

  return normalizeTrackerState({
    completedDays,
    bestStreak: clampStreak(v1Match[3]),
    lockedDays: lockedBits,
    schemaVersion: 1,
    startDate: inferStartDateFromProgress(completedDays),
    updatedAt: sanitizeTimestamp(v1Match[4]),
  });
};

const getChallengeStatus = (state, todayDate) => {
  const elapsedDays = Math.max(0, daysBetween(state.startDate, todayDate));
  const points = countPoints(state.completedDays);
  const isComplete = points === TOTAL_DAYS;
  const requiredThroughIndex = Math.min(elapsedDays, TOTAL_DAYS);
  const missedDayIndex = state.completedDays.findIndex(
    (isCompleteDay, index) => index < requiredThroughIndex && !isCompleteDay,
  );
  const isBroken = !isComplete && missedDayIndex !== -1;
  const dueDayIndex =
    !isBroken && !isComplete && elapsedDays >= 0 && elapsedDays < TOTAL_DAYS
      ? elapsedDays
      : null;
  const todayLogged =
    dueDayIndex !== null && Boolean(state.completedDays[dueDayIndex]);
  const firstIncompleteIndex = state.completedDays.findIndex((isCompleteDay) => !isCompleteDay);
  const currentStreak = isBroken
    ? 0
    : firstIncompleteIndex === -1
      ? TOTAL_DAYS
      : firstIncompleteIndex;

  if (isComplete) {
    return {
      currentStreak,
      dueDayIndex: null,
      elapsedDays,
      headline: '30/30. Perfect month.',
      isBroken: false,
      missedDayIndex: null,
      subline: 'The 30-day streak is complete.',
      todayLogged: false,
    };
  }

  if (isBroken) {
    return {
      currentStreak,
      dueDayIndex: null,
      elapsedDays,
      headline: 'Streak broken. Start a new run.',
      isBroken: true,
      missedDayIndex,
      subline: `Day ${formatDayNumber(missedDayIndex + 1)} was missed.`,
      todayLogged: false,
    };
  }

  if (todayLogged) {
    return {
      currentStreak,
      dueDayIndex,
      elapsedDays,
      headline: 'Today logged',
      isBroken: false,
      missedDayIndex: null,
      subline: `Day ${formatDayNumber(dueDayIndex + 1)} is locked in for today.`,
      todayLogged: true,
    };
  }

  if (dueDayIndex !== null) {
    return {
      currentStreak,
      dueDayIndex,
      elapsedDays,
      headline: `Day ${formatDayNumber(dueDayIndex + 1)} due today`,
      isBroken: false,
      missedDayIndex: null,
      subline: 'Complete today’s non-negotiables, then check it off.',
      todayLogged: false,
    };
  }

  return {
    currentStreak: 0,
    dueDayIndex: null,
    elapsedDays,
    headline: 'Streak broken. Start a new run.',
    isBroken: true,
    missedDayIndex: TOTAL_DAYS - 1,
    subline: 'The 30-day window has closed.',
    todayLogged: false,
  };
};

const getDayCardStatus = ({ challengeStatus, index, isComplete, isLocked }) => {
  if (isLocked) {
    return { className: 'is-locked', label: 'Locked' };
  }

  if (isComplete) {
    return { className: 'is-complete', label: 'Complete' };
  }

  if (index < Math.min(challengeStatus.elapsedDays, TOTAL_DAYS)) {
    return { className: 'is-missed', label: 'Missed' };
  }

  if (!challengeStatus.isBroken && index === challengeStatus.dueDayIndex) {
    return { className: 'is-due', label: 'Due today' };
  }

  return { className: 'is-waiting', label: 'Waiting' };
};

const fetchSharedTrackerState = async () => {
  const response = await fetch(`${SYNC_API_URL}/get/${SYNC_KEY}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Unable to load shared progress');
  }

  const payload = await response.json();

  if (payload.status !== 'SUCCESS' || !payload.val) {
    return null;
  }

  return decodeSyncState(payload.val);
};

const saveSharedTrackerState = async (state) => {
  const encodedState = encodeSyncState(state);
  const response = await fetch(`${SYNC_API_URL}/set/${SYNC_KEY}/${encodedState}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Unable to save shared progress');
  }

  const payload = await response.json();

  if (payload.status !== 'SUCCESS') {
    throw new Error('Unable to save shared progress');
  }

  return encodedState;
};

const pluralizeDay = (count) => `${count} ${count === 1 ? 'day' : 'days'}`;

const formatDayNumber = (dayNumber) => String(dayNumber).padStart(2, '0');

const roundedRect = (context, x, y, width, height, radius) => {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
};

const drawCheckMark = (context, x, y, size) => {
  context.beginPath();
  context.moveTo(x + size * 0.24, y + size * 0.54);
  context.lineTo(x + size * 0.43, y + size * 0.72);
  context.lineTo(x + size * 0.78, y + size * 0.31);
  context.stroke();
};

const canvasToBlob = (canvas) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Unable to create accountability tile'));
      }
    }, 'image/png');
  });

const downloadBlob = (blob, fileName) => {
  const imageUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = imageUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
};

const downloadTextFile = (text, fileName, type) => {
  downloadBlob(new Blob([text], { type }), fileName);
};

const escapeCalendarText = (value) =>
  String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\n', '\\n');

const getCalendarTimestamp = () =>
  new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}Z$/, 'Z');

const getCalendarDateTime = (dateString, hour, minute = 0) =>
  `${compactDate(dateString)}T${String(hour).padStart(2, '0')}${String(minute).padStart(
    2,
    '0',
  )}00`;

const createReminderCalendar = ({ startDate, statusUrl }) => {
  const description = `Bryan's daily Non Negotiables accountability check-in. ${statusUrl}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Non Negotiables//Daily Guardrails//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:non-negotiables-${compactDate(startDate)}-${SYNC_KEY}@non-negotiables`,
    `DTSTAMP:${getCalendarTimestamp()}`,
    `DTSTART;TZID=${EASTERN_TIME_ZONE}:${getCalendarDateTime(startDate, 21)}`,
    `DTEND;TZID=${EASTERN_TIME_ZONE}:${getCalendarDateTime(startDate, 21, 15)}`,
    'RRULE:FREQ=DAILY;COUNT=30',
    `SUMMARY:${escapeCalendarText('Non Negotiables check-in')}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    `URL:${statusUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
};

const createAccountabilityTile = async ({ dayNumber, stats }) => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const dayLabel = formatDayNumber(dayNumber);
  const today = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;

  if (!context) {
    throw new Error('Unable to create accountability tile');
  }

  context.fillStyle = '#f6f8fb';
  context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  context.save();
  context.shadowColor = 'rgba(11, 18, 32, 0.14)';
  context.shadowBlur = 46;
  context.shadowOffsetY = 24;
  roundedRect(context, 72, 72, 936, 936, 56);
  context.fillStyle = '#ffffff';
  context.fill();
  context.restore();

  roundedRect(context, 72, 72, 936, 936, 56);
  context.strokeStyle = '#e1e7ef';
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = '#0b1220';
  roundedRect(context, 124, 124, 72, 72, 18);
  context.fill();
  context.strokeStyle = '#1aa899';
  context.lineWidth = 8;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  drawCheckMark(context, 124, 124, 72);

  context.fillStyle = '#8a94a5';
  context.font = `800 30px ${CANVAS_FONT_STACK}`;
  context.fillText('NON NEGOTIABLES', 220, 151);

  context.fillStyle = '#5d6675';
  context.font = `650 34px ${CANVAS_FONT_STACK}`;
  context.fillText('30 days. 30 check marks. No excuses.', 220, 194);

  const titleText = `Bryan completed day: ${dayLabel}`;
  let titleFontSize = 86;

  do {
    context.font = `850 ${titleFontSize}px ${CANVAS_FONT_STACK}`;
    titleFontSize -= 2;
  } while (context.measureText(titleText).width > 832 && titleFontSize > 58);

  context.fillStyle = '#0b1220';
  context.fillText(titleText, 124, 406);

  context.fillStyle = '#5d6675';
  context.font = `650 38px ${CANVAS_FONT_STACK}`;
  context.fillText(`${stats.points} out of 30 days complete`, 124, 474);

  roundedRect(context, 124, 554, 832, 26, 13);
  context.fillStyle = '#edf2f7';
  context.fill();

  roundedRect(context, 124, 554, Math.max(26, 832 * (stats.percentage / 100)), 26, 13);
  const progressGradient = context.createLinearGradient(124, 554, 956, 554);
  progressGradient.addColorStop(0, '#0b1220');
  progressGradient.addColorStop(1, '#1aa899');
  context.fillStyle = progressGradient;
  context.fill();

  const metricItems = [
    ['CURRENT STREAK', `${stats.currentStreak}`],
    ['BEST STREAK', `${stats.bestStreak}`],
    ['COMPLETE', `${stats.percentage}%`],
  ];

  metricItems.forEach(([label, value], index) => {
    const x = 124 + index * 286;
    roundedRect(context, x, 650, 260, 166, 24);
    context.fillStyle = '#fbfcfe';
    context.fill();
    context.strokeStyle = '#e5eaf1';
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = '#8a94a5';
    context.font = `800 20px ${CANVAS_FONT_STACK}`;
    context.fillText(label, x + 24, 705);

    context.fillStyle = '#0b1220';
    context.font = `850 58px ${CANVAS_FONT_STACK}`;
    context.fillText(value, x + 24, 773);
  });

  context.fillStyle = '#5d6675';
  context.font = `650 30px ${CANVAS_FONT_STACK}`;
  context.fillText(`Accountability check-in - ${today}`, 124, 918);

  context.textAlign = 'right';
  context.fillStyle = '#0f766e';
  context.font = `800 30px ${CANVAS_FONT_STACK}`;
  context.fillText(`${stats.points}/30`, 956, 918);
  context.textAlign = 'left';

  return canvasToBlob(canvas);
};

const copyTextToClipboard = async (text) => {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy copy path for stricter browser sessions.
    }
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.top = '0';
  textArea.style.left = '-9999px';

  document.body.appendChild(textArea);
  textArea.select();
  textArea.setSelectionRange(0, text.length);

  const copied = document.execCommand('copy');
  document.body.removeChild(textArea);

  if (!copied) {
    throw new Error('Unable to copy status link');
  }
};

function App() {
  const [trackerState, setTrackerState] = useState(loadTrackerState);
  const [animatedDay, setAnimatedDay] = useState(null);
  const [shareState, setShareState] = useState('Copy status link');
  const [tileShareState, setTileShareState] = useState('Share image');
  const [syncState, setSyncState] = useState('Syncing');
  const [syncReady, setSyncReady] = useState(false);
  const [todayDate, setTodayDate] = useState(getEasternDateString);
  const trackerStateRef = useRef(trackerState);
  const lastSyncedValueRef = useRef(null);
  const isSavingRef = useRef(false);
  const { completedDays, bestStreak, lockedDays } = trackerState;

  useEffect(() => {
    trackerStateRef.current = trackerState;
  }, [trackerState]);

  useEffect(() => {
    const refreshTodayDate = () => {
      setTodayDate((currentDate) => {
        const nextDate = getEasternDateString();
        return currentDate === nextDate ? currentDate : nextDate;
      });
    };
    const dateTimer = window.setInterval(refreshTodayDate, 60 * 1000);

    window.addEventListener('focus', refreshTodayDate);

    return () => {
      window.clearInterval(dateTimer);
      window.removeEventListener('focus', refreshTodayDate);
    };
  }, []);

  const challengeStatus = useMemo(
    () => getChallengeStatus(trackerState, todayDate),
    [todayDate, trackerState],
  );

  const stats = useMemo(() => {
    const points = completedDays.filter(Boolean).length;
    const percentage = Math.round((points / TOTAL_DAYS) * 100);

    return {
      points,
      percentage,
      currentStreak: challengeStatus.currentStreak,
      bestStreak,
      isComplete: points === TOTAL_DAYS,
    };
  }, [bestStreak, challengeStatus.currentStreak, completedDays]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trackerState));
    } catch {
      // Local storage can be unavailable in stricter browser modes.
    }
  }, [trackerState]);

  const applyRemoteState = useCallback((remoteState) => {
    const encodedRemoteState = encodeSyncState(remoteState);
    lastSyncedValueRef.current =
      remoteState.schemaVersion === 2 ? encodedRemoteState : null;
    setTrackerState({ ...remoteState, schemaVersion: 2 });
    setSyncState('Synced');
  }, []);

  const saveStateLive = useCallback(async (state, nextStatus = 'Synced') => {
    const stateToSave = normalizeTrackerState({
      ...state,
      schemaVersion: 2,
      updatedAt: state.updatedAt || Date.now(),
    });

    isSavingRef.current = true;
    setSyncState('Saving');

    try {
      const encodedState = await saveSharedTrackerState(stateToSave);
      lastSyncedValueRef.current = encodedState;
      setSyncState(nextStatus);
    } finally {
      isSavingRef.current = false;
    }

    return stateToSave;
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const initializeLiveSync = async () => {
      setSyncState('Syncing');

      try {
        const remoteState = await fetchSharedTrackerState();

        if (isCancelled) {
          return;
        }

        const localState = trackerStateRef.current;
        const localIsLegacy = localState.updatedAt === 0;
        const shouldPromoteLegacyLocal =
          localIsLegacy &&
          hasMeaningfulProgress(localState) &&
          (!remoteState || !hasMeaningfulProgress(remoteState));

        if (!remoteState || shouldPromoteLegacyLocal) {
          const promotedState = markStateUpdated(localState);
          setTrackerState(promotedState);
          await saveStateLive(promotedState);
        } else if (remoteState.updatedAt >= localState.updatedAt) {
          applyRemoteState(remoteState);
        } else {
          await saveStateLive(localState);
        }

        if (!isCancelled) {
          setSyncReady(true);
        }
      } catch {
        if (!isCancelled) {
          setSyncReady(true);
          setSyncState('Offline');
        }
      }
    };

    initializeLiveSync();

    return () => {
      isCancelled = true;
    };
  }, [applyRemoteState, saveStateLive]);

  useEffect(() => {
    if (!syncReady) {
      return undefined;
    }

    const encodedState = encodeSyncState(trackerState);

    if (encodedState === lastSyncedValueRef.current) {
      return undefined;
    }

    const saveTimer = window.setTimeout(async () => {
      try {
        await saveStateLive(trackerState);
      } catch {
        setSyncState('Offline');
      }
    }, 350);

    return () => window.clearTimeout(saveTimer);
  }, [saveStateLive, syncReady, trackerState]);

  const refreshFromLiveState = useCallback(async () => {
    if (isSavingRef.current || document.visibilityState === 'hidden') {
      return;
    }

    try {
      const remoteState = await fetchSharedTrackerState();

      if (!remoteState) {
        return;
      }

      const localState = trackerStateRef.current;

      if (remoteState.updatedAt > localState.updatedAt) {
        applyRemoteState(remoteState);
      } else {
        setSyncState('Synced');
      }
    } catch {
      setSyncState('Offline');
    }
  }, [applyRemoteState]);

  useEffect(() => {
    if (!syncReady) {
      return undefined;
    }

    const syncTimer = window.setInterval(refreshFromLiveState, SYNC_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshFromLiveState();
      }
    };

    window.addEventListener('focus', refreshFromLiveState);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(syncTimer);
      window.removeEventListener('focus', refreshFromLiveState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshFromLiveState, syncReady]);

  const statusUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('days');
    url.searchParams.delete('best');
    return url.toString();
  }, []);

  const latestCompletedDay = useMemo(
    () =>
      completedDays.reduce(
        (latestDay, isComplete, index) => (isComplete ? index + 1 : latestDay),
        0,
      ),
    [completedDays],
  );

  const toggleDay = (index) => {
    if (
      challengeStatus.isBroken ||
      index !== challengeStatus.dueDayIndex ||
      completedDays[index] ||
      lockedDays[index]
    ) {
      return;
    }

    setTrackerState((currentState) => {
      const currentChallengeStatus = getChallengeStatus(currentState, todayDate);

      if (
        currentChallengeStatus.isBroken ||
        index !== currentChallengeStatus.dueDayIndex ||
        currentState.completedDays[index] ||
        currentState.lockedDays[index]
      ) {
        return currentState;
      }

      const nextCompletedDays = currentState.completedDays.map(
        (isComplete, currentIndex) =>
          currentIndex === index ? true : isComplete,
      );
      const { longestStreak } = calculateStreaks(nextCompletedDays);

      return {
        completedDays: nextCompletedDays,
        bestStreak: Math.max(currentState.bestStreak, longestStreak),
        lockedDays: currentState.lockedDays,
        schemaVersion: 2,
        startDate: currentState.startDate,
        updatedAt: Date.now(),
      };
    });

    setAnimatedDay(index);

    window.setTimeout(() => {
      setAnimatedDay((currentDay) => (currentDay === index ? null : currentDay));
    }, 700);
  };

  const resetProgress = () => {
    if (stats.points === 0 && !challengeStatus.isBroken) {
      return;
    }

    const confirmed = window.confirm(
      'Start a new 30-day run? Your best streak will stay saved.',
    );

    if (confirmed) {
      setTrackerState((currentState) => ({
        completedDays: emptyProgress(),
        bestStreak: currentState.bestStreak,
        lockedDays: emptyProgress(),
        schemaVersion: 2,
        startDate: todayDate,
        updatedAt: Date.now(),
      }));
      setAnimatedDay(null);
    }
  };

  const lockCompletedDay = (dayNumber) => {
    setTrackerState((currentState) => ({
      ...currentState,
      schemaVersion: 2,
      lockedDays: currentState.lockedDays.map((isLocked, index) =>
        index === dayNumber - 1 && currentState.completedDays[index] ? true : isLocked,
      ),
      updatedAt: Date.now(),
    }));
  };

  const shareProgress = async () => {
    try {
      await copyTextToClipboard(statusUrl);
      setShareState('Link copied');
    } catch {
      setShareState('Copy failed');
    }

    window.setTimeout(() => setShareState('Copy status link'), 1800);
  };

  const addCalendarReminder = () => {
    const reminderCalendar = createReminderCalendar({
      startDate: todayDate,
      statusUrl,
    });

    downloadTextFile(
      reminderCalendar,
      'non-negotiables-9pm-reminder.ics',
      'text/calendar;charset=utf-8',
    );
  };

  const shareAccountabilityTile = async () => {
    if (!latestCompletedDay) {
      return;
    }

    const dayLabel = formatDayNumber(latestCompletedDay);
    const tileText = `Bryan completed day: ${dayLabel}`;

    try {
      lockCompletedDay(latestCompletedDay);
      setTileShareState('Locked - creating image');

      const tileBlob = await createAccountabilityTile({
        dayNumber: latestCompletedDay,
        stats,
      });
      const fileName = `bryan-completed-day-${dayLabel}.png`;
      const tileFile =
        typeof File === 'function'
          ? new File([tileBlob], fileName, { type: 'image/png' })
          : null;
      let canNativeShare = false;

      try {
        canNativeShare = Boolean(
          tileFile && navigator.share && navigator.canShare?.({ files: [tileFile] }),
        );
      } catch {
        canNativeShare = false;
      }

      if (canNativeShare) {
        try {
          await navigator.share({
            files: [tileFile],
            title: 'Non Negotiables',
            text: tileText,
          });
          setTileShareState('Shared');
          window.setTimeout(() => setTileShareState('Share image'), 2200);
          return;
        } catch (error) {
          if (error.name === 'AbortError') {
            setTileShareState('Share canceled');
            window.setTimeout(() => setTileShareState('Share image'), 2200);
            return;
          }
        }
      }

      downloadBlob(tileBlob, fileName);
      setTileShareState('Image downloaded');
    } catch (error) {
      setTileShareState(error.name === 'AbortError' ? 'Share canceled' : 'Try again');
    }

    window.setTimeout(() => setTileShareState('Share image'), 2200);
  };

  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="page-title">
        <div className="hero-copy">
          <div className="brand-line">
            <span className="brand-mark" aria-hidden="true">
              <Check size={18} strokeWidth={3} />
            </span>
            <span>Daily accountability</span>
          </div>
          <h1 id="page-title">Non Negotiables</h1>
          <p className="tagline">30 days. 30 check marks. No excuses.</p>
          <p className="intro">
            Every day I complete my non-negotiable tasks, I earn one point. The
            goal is a perfect 30-day streak.
          </p>
        </div>

        <aside className="status-panel" aria-label="Share-friendly status">
          <div>
            <p className="eyebrow">Bryan’s Progress</p>
            <p className="status-count">{stats.points} out of 30 days complete</p>
            <p className="status-streak">
              Current streak: {pluralizeDay(stats.currentStreak)}
            </p>
            <p className={`sync-pill ${syncState === 'Offline' ? 'is-offline' : ''}`}>
              {syncState}
            </p>
          </div>
          <button className="text-button" type="button" onClick={shareProgress}>
            <Share2 size={17} aria-hidden="true" />
            {shareState}
          </button>
        </aside>
      </section>

      <section className="progress-band" aria-label="Progress summary">
        <div className="progress-header">
          <div>
            <p className="eyebrow">Challenge progress</p>
            <h2>{stats.points}/30 check marks</h2>
          </div>
          <span className="percent-pill">{stats.percentage}% complete</span>
        </div>

        <div
          className={`daily-checkin ${
            challengeStatus.isBroken
              ? 'is-broken'
              : challengeStatus.todayLogged
                ? 'is-logged'
                : ''
          }`}
          aria-live="polite"
        >
          <div>
            <p className="eyebrow">Today’s check-in</p>
            <h3>{challengeStatus.headline}</h3>
            <p>{challengeStatus.subline}</p>
          </div>
          <button
            className="text-button reminder-button"
            type="button"
            onClick={addCalendarReminder}
          >
            <Bell size={17} aria-hidden="true" />
            Add 9 PM reminder
          </button>
        </div>

        <div className="progress-track" aria-label={`${stats.percentage}% complete`}>
          <span style={{ width: `${stats.percentage}%` }} />
        </div>

        <div className="stats-grid">
          <article className="stat-card">
            <span>Current points</span>
            <strong>{stats.points} / 30</strong>
          </article>
          <article className="stat-card">
            <span>Completion percentage</span>
            <strong>{stats.percentage}%</strong>
          </article>
          <article className="stat-card">
            <span>Current streak</span>
            <strong>{stats.currentStreak}</strong>
          </article>
          <article className="stat-card">
            <span>Best streak</span>
            <strong>{stats.bestStreak}</strong>
          </article>
        </div>
      </section>

      <section className="accountability-section" aria-labelledby="tile-title">
        <div className="tile-copy">
          <p className="eyebrow">Family accountability</p>
          <h2 id="tile-title">
            Bryan completed day:{' '}
            {latestCompletedDay ? formatDayNumber(latestCompletedDay) : '__'}
          </h2>
          <p className="tile-subline">
            {latestCompletedDay
              ? `${stats.points} out of 30 days complete`
              : 'No completed day yet'}
          </p>
          <button
            className="text-button tile-action"
            type="button"
            onClick={shareAccountabilityTile}
            disabled={!latestCompletedDay}
          >
            <Share2 size={17} aria-hidden="true" />
            {tileShareState}
          </button>
        </div>

        <div
          className={`accountability-preview ${
            latestCompletedDay ? '' : 'is-empty'
          }`}
          aria-label="Accountability image preview"
        >
          <div className="preview-topline">
            <span className="brand-mark mini" aria-hidden="true">
              <Check size={14} strokeWidth={3} />
            </span>
            <span>Non Negotiables</span>
          </div>
          <strong>
            Bryan completed day:{' '}
            {latestCompletedDay ? formatDayNumber(latestCompletedDay) : '__'}
          </strong>
          <p>{stats.points} out of 30 days complete</p>
          <div className="preview-progress" aria-hidden="true">
            <span style={{ width: `${stats.percentage}%` }} />
          </div>
        </div>
      </section>

      {stats.isComplete && (
        <section className="success-state" aria-live="polite">
          <div className="celebration" aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
          <Trophy size={26} aria-hidden="true" />
          <div>
            <h2>30/30. Perfect month.</h2>
            <p>The streak is complete.</p>
          </div>
        </section>
      )}

      <section className="day-section" aria-labelledby="grid-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">30-day grid</p>
            <h2 id="grid-title">Daily check marks</h2>
          </div>
          <button className="reset-button" type="button" onClick={resetProgress}>
            <RotateCcw size={16} aria-hidden="true" />
            {challengeStatus.isBroken ? 'Start new run' : 'Reset'}
          </button>
        </div>

        <div className="day-grid">
          {completedDays.map((isComplete, index) => {
            const dayNumber = index + 1;
            const isAnimating = animatedDay === index && isComplete;
            const isLocked = lockedDays[index];
            const cardStatus = getDayCardStatus({
              challengeStatus,
              index,
              isComplete,
              isLocked,
            });
            const isInteractive =
              !challengeStatus.isBroken &&
              index === challengeStatus.dueDayIndex &&
              !isComplete &&
              !isLocked;

            return (
              <button
                className={`day-card ${isComplete ? 'is-complete' : ''} ${
                  isLocked ? 'is-locked' : ''
                } ${cardStatus.className} ${
                  isInteractive ? 'is-interactive' : ''
                } ${
                  isAnimating ? 'just-completed' : ''
                }`}
                type="button"
                key={dayNumber}
                onClick={() => toggleDay(index)}
                aria-pressed={isComplete}
                aria-label={`Day ${dayNumber}, ${cardStatus.label.toLowerCase()}`}
                disabled={!isInteractive}
              >
                <span className="day-label">Day</span>
                <strong>{formatDayNumber(dayNumber)}</strong>
                <span className="check-ring" aria-hidden="true">
                  <Check size={22} strokeWidth={3.1} />
                </span>
                {isLocked && (
                  <span className="lock-badge" aria-hidden="true">
                    <LockKeyhole size={12} strokeWidth={2.8} />
                    Locked
                  </span>
                )}
                {!isLocked && (
                  <span className="state-badge" aria-hidden="true">
                    {cardStatus.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <footer className="page-footer">
        <Sparkles size={16} aria-hidden="true" />
        <span>Built for a perfect 30-day streak.</span>
      </footer>
    </main>
  );
}

export default App;
