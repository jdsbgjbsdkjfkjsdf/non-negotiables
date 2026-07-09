import { useEffect, useMemo, useState } from 'react';
import { Check, RotateCcw, Share2, Sparkles, Trophy } from 'lucide-react';

const TOTAL_DAYS = 30;
const STORAGE_KEY = 'non-negotiables-progress-v1';

const emptyProgress = () => Array.from({ length: TOTAL_DAYS }, () => false);

const getSharedProgress = () => {
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

  return progress;
};

const loadProgress = () => {
  const sharedProgress = getSharedProgress();

  if (sharedProgress) {
    return sharedProgress;
  }

  try {
    const savedProgress = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (Array.isArray(savedProgress) && savedProgress.length === TOTAL_DAYS) {
      return savedProgress.map(Boolean);
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  return emptyProgress();
};

const calculateStreaks = (days) => {
  let bestStreak = 0;
  let runningStreak = 0;

  days.forEach((isComplete) => {
    runningStreak = isComplete ? runningStreak + 1 : 0;
    bestStreak = Math.max(bestStreak, runningStreak);
  });

  const lastCompletedIndex = days.lastIndexOf(true);
  let currentStreak = 0;

  if (lastCompletedIndex >= 0) {
    for (let index = lastCompletedIndex; index >= 0 && days[index]; index -= 1) {
      currentStreak += 1;
    }
  }

  return { currentStreak, bestStreak };
};

const pluralizeDay = (count) => `${count} ${count === 1 ? 'day' : 'days'}`;

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
  const [completedDays, setCompletedDays] = useState(loadProgress);
  const [animatedDay, setAnimatedDay] = useState(null);
  const [shareState, setShareState] = useState('Share status');

  const stats = useMemo(() => {
    const points = completedDays.filter(Boolean).length;
    const percentage = Math.round((points / TOTAL_DAYS) * 100);
    const { currentStreak, bestStreak } = calculateStreaks(completedDays);

    return {
      points,
      percentage,
      currentStreak,
      bestStreak,
      isComplete: points === TOTAL_DAYS,
    };
  }, [completedDays]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completedDays));
  }, [completedDays]);

  const statusUrl = useMemo(() => {
    const url = new URL(window.location.href);
    const days = completedDays
      .map((isComplete, index) => (isComplete ? index + 1 : null))
      .filter(Boolean)
      .join(',');

    url.searchParams.set('days', days);
    return url.toString();
  }, [completedDays]);

  const toggleDay = (index) => {
    const isCompleting = !completedDays[index];

    setCompletedDays((currentDays) =>
      currentDays.map((isComplete, currentIndex) =>
        currentIndex === index ? !isComplete : isComplete,
      ),
    );

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
      'Reset all 30 days? This clears the progress saved in this browser.',
    );

    if (confirmed) {
      setCompletedDays(emptyProgress());
      setAnimatedDay(null);
    }
  };

  const shareProgress = async () => {
    try {
      await copyTextToClipboard(statusUrl);
      setShareState('Link copied');
    } catch {
      setShareState('Copy failed');
    }

    window.setTimeout(() => setShareState('Share status'), 1800);
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

            return (
              <button
                className={`day-card ${isComplete ? 'is-complete' : ''} ${
                  isAnimating ? 'just-completed' : ''
                }`}
                type="button"
                key={dayNumber}
                onClick={() => toggleDay(index)}
                aria-pressed={isComplete}
                aria-label={`Day ${dayNumber}, ${
                  isComplete ? 'complete' : 'incomplete'
                }`}
              >
                <span className="day-label">Day</span>
                <strong>{String(dayNumber).padStart(2, '0')}</strong>
                <span className="check-ring" aria-hidden="true">
                  <Check size={22} strokeWidth={3.1} />
                </span>
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
