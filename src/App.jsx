import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  LockKeyhole,
  RotateCcw,
  Share2,
  Sparkles,
  Trophy,
} from 'lucide-react';

const TOTAL_DAYS = 30;
const STORAGE_KEY = 'non-negotiables-progress-v1';
const TILE_SIZE = 1080;
const CANVAS_FONT_STACK =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const emptyProgress = () => Array.from({ length: TOTAL_DAYS }, () => false);

const clampStreak = (value) => {
  const streak = Number(value);

  if (!Number.isInteger(streak)) {
    return 0;
  }

  return Math.min(Math.max(streak, 0), TOTAL_DAYS);
};

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
    completedDays: progress,
    bestStreak: Math.max(longestStreak, sharedBestStreak),
    lockedDays: emptyProgress(),
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

  const { longestStreak } = calculateStreaks(completedDays);
  const savedBestStreak = Array.isArray(savedState)
    ? 0
    : clampStreak(savedState.bestStreak);

  return {
    completedDays,
    bestStreak: Math.max(longestStreak, savedBestStreak),
    lockedDays,
  };
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

  return {
    completedDays: emptyProgress(),
    bestStreak: 0,
    lockedDays: emptyProgress(),
  };
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
  const { completedDays, bestStreak, lockedDays } = trackerState;

  const stats = useMemo(() => {
    const points = completedDays.filter(Boolean).length;
    const percentage = Math.round((points / TOTAL_DAYS) * 100);
    const { currentStreak } = calculateStreaks(completedDays);

    return {
      points,
      percentage,
      currentStreak,
      bestStreak,
      isComplete: points === TOTAL_DAYS,
    };
  }, [bestStreak, completedDays]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trackerState));
  }, [trackerState]);

  const statusUrl = useMemo(() => {
    const url = new URL(window.location.href);
    const days = completedDays
      .map((isComplete, index) => (isComplete ? index + 1 : null))
      .filter(Boolean)
      .join(',');

    url.searchParams.set('days', days);
    url.searchParams.set('best', String(stats.bestStreak));
    return url.toString();
  }, [completedDays, stats.bestStreak]);

  const latestCompletedDay = useMemo(
    () =>
      completedDays.reduce(
        (latestDay, isComplete, index) => (isComplete ? index + 1 : latestDay),
        0,
      ),
    [completedDays],
  );

  const toggleDay = (index) => {
    if (lockedDays[index]) {
      return;
    }

    const isCompleting = !completedDays[index];

    setTrackerState((currentState) => {
      const nextCompletedDays = currentState.completedDays.map(
        (isComplete, currentIndex) =>
          currentIndex === index ? !isComplete : isComplete,
      );
      const nextLockedDays = currentState.lockedDays.map((isLocked, currentIndex) =>
        currentIndex === index && !nextCompletedDays[currentIndex] ? false : isLocked,
      );
      const { longestStreak } = calculateStreaks(nextCompletedDays);

      return {
        completedDays: nextCompletedDays,
        bestStreak: Math.max(currentState.bestStreak, longestStreak),
        lockedDays: nextLockedDays,
      };
    });

    setAnimatedDay(isCompleting ? index : null);

    if (isCompleting) {
      window.setTimeout(() => {
        setAnimatedDay((currentDay) => (currentDay === index ? null : currentDay));
      }, 700);
    }
  };

  const resetProgress = () => {
    if (stats.points === 0) {
      return;
    }

    const confirmed = window.confirm(
      'Reset the daily check marks? Your best streak will stay saved.',
    );

    if (confirmed) {
      setTrackerState((currentState) => ({
        completedDays: emptyProgress(),
        bestStreak: currentState.bestStreak,
        lockedDays: emptyProgress(),
      }));
      setAnimatedDay(null);
    }
  };

  const lockCompletedDay = (dayNumber) => {
    setTrackerState((currentState) => ({
      ...currentState,
      lockedDays: currentState.lockedDays.map((isLocked, index) =>
        index === dayNumber - 1 && currentState.completedDays[index] ? true : isLocked,
      ),
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
            Reset
          </button>
        </div>

        <div className="day-grid">
          {completedDays.map((isComplete, index) => {
            const dayNumber = index + 1;
            const isAnimating = animatedDay === index && isComplete;
            const isLocked = lockedDays[index];

            return (
              <button
                className={`day-card ${isComplete ? 'is-complete' : ''} ${
                  isLocked ? 'is-locked' : ''
                } ${
                  isAnimating ? 'just-completed' : ''
                }`}
                type="button"
                key={dayNumber}
                onClick={() => toggleDay(index)}
                aria-pressed={isComplete}
                aria-label={`Day ${dayNumber}, ${
                  isLocked ? 'locked complete' : isComplete ? 'complete' : 'incomplete'
                }`}
                disabled={isLocked}
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
