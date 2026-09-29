import { useState } from 'react';
import type { Degree, Lesson } from '../data/types';
import { useSite } from '../lib/SiteContext';
import { Glyph } from '../admin/kit';
import { faNum, type Profile } from '../lib/storage';
import type { Voice } from '../lib/voices';
import { cn } from '../utils/cn';
import { Quiz } from './Quiz';
import { TravelerStory } from './TravelerStory';
import { BlessingsGame, DailyProgram, RepeatBelief } from './Activities';
import { Btn, QuoteCard, SourceTag, Stars, VoicePlayer } from './ui';

type Step = 'class' | 'activity' | 'quiz' | 'result' | 'traveler' | 'done';

export function LessonView({
  lesson,
  degree,
  orbit,
  kids,
  profile,
  voices,
  onBack,
  onAnswer,
  onPass,
  onTravelerDone,
  onCollect,
  onToggleDaily,
  onRepeat,
}: {
  lesson: Lesson;
  degree: Degree;
  orbit: number;
  kids: boolean;
  profile: Profile;
  voices: Voice[];
  onBack: () => void;
  onAnswer: (ok: boolean) => void;
  onPass: (score: number, total: number, stars: number) => void;
  onTravelerDone: () => void;
  onCollect: (t: string) => void;
  onToggleDaily: (id: string) => void;
  onRepeat: (k: string) => void;
}) {
  const { content } = useSite();
  const { EVOLUTION_Q, HIGHER, NO_GUILT } = content.library;
  const [step, setStep] = useState<Step>('class');
  const [res, setRes] = useState<{ score: number; total: number; stars: number; passed: boolean } | null>(null);
  const [quizKey, setQuizKey] = useState(0);
  const travelerDone = !!profile.progress[lesson.id]?.traveler;

  const steps: { id: Step; label: string }[] = [
    { id: 'class', label: 'کلاس' },
    ...(lesson.activity ? [{ id: 'activity' as Step, label: 'تمرین' }] : []),
    { id: 'quiz', label: 'آزمون' },
    ...(lesson.traveler ? [{ id: 'traveler' as Step, label: 'رهرو' }] : []),
    { id: 'done', label: 'مدار بالاتر' },
  ];
  const cur = step === 'result' ? 'quiz' : step;
  const curIdx = steps.findIndex((s) => s.id === cur);

  const finishQuiz = (score: number, total: number) => {
    const ratio = score / total;
    const passed = kids || ratio >= content.settings.adultPassRate / 100;
    const stars = ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : 1;
    setRes({ score, total, stars, passed });
    if (passed) onPass(score, total, stars);
    setStep('result');
  };

  const text = kids ? 'text-slate-800' : 'text-slate-100';
  const muted = kids ? 'text-slate-500' : 'text-slate-400';

  return (
    <div className={cn('mx-auto min-h-screen max-w-2xl px-4 pb-16 pt-4', text)}>
      {/* هدر درس */}
      <div className="mb-4 flex items-center gap-3">
        <button onClick={onBack} className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg', kids ? 'bg-white shadow' : 'bg-white/10')} aria-label="بازگشت">
          →
        </button>
        <div className="min-w-0 flex-1">
          <div className={cn('text-[11px] font-bold', muted)}>
            {degree.name} · {degree.rank} · مدار {faNum(orbit)}
          </div>
          <h2 className="flex items-center gap-2 truncate text-lg font-black">
            <Glyph value={lesson.icon} size={23} /> {lesson.title}
          </h2>
        </div>
        <SourceTag s={lesson.titleSrc} kids={kids} />
      </div>

      {/* مراحل */}
      <div className="mb-5 flex items-center gap-1">
        {steps.map((s, k) => (
          <div key={s.id} className="flex-1">
            <div className={cn('h-1.5 rounded-full', k <= curIdx ? (kids ? 'bg-orange-400' : 'bg-amber-300') : kids ? 'bg-white' : 'bg-white/10')} />
            <div className={cn('mt-1 text-center text-[10px] font-bold', k <= curIdx ? '' : muted)}>{s.label}</div>
          </div>
        ))}
      </div>

      {step === 'class' && (
        <div className="space-y-3">
          {voices.length > 0 && (
            <div className="space-y-2">
              <div className={cn('text-xs font-extrabold', kids ? 'text-pink-600' : 'text-amber-200')}>🎧 صدای استاد</div>
              {voices.map((v) => (
                <VoicePlayer key={v.id} voice={v} kids={kids} />
              ))}
            </div>
          )}
          {lesson.texts.map((q, k) => (
            <QuoteCard key={k} q={q} kids={kids} />
          ))}
          <Btn variant={kids ? 'kids' : 'gold'} className="sticky bottom-4 w-full py-3.5 text-base" onClick={() => setStep(lesson.activity ? 'activity' : 'quiz')}>
            {lesson.activity ? 'رفتن به تمرین' : 'رفتن به آزمون'}
          </Btn>
        </div>
      )}

      {step === 'activity' && (
        <div className="space-y-4">
          {lesson.activity === 'blessings' && <BlessingsGame kids={kids} collected={profile.blessings} onCollect={onCollect} />}
          {lesson.activity === 'daily' && <DailyProgram kids={kids} profile={profile} onToggle={onToggleDaily} />}
          {lesson.activity === 'repeat' && <RepeatBelief kids={kids} profile={profile} onRepeat={onRepeat} />}
          <Btn variant={kids ? 'kids' : 'gold'} className="w-full py-3.5 text-base" onClick={() => setStep('quiz')}>
            رفتن به آزمون
          </Btn>
        </div>
      )}

      {step === 'quiz' && <Quiz key={quizKey} questions={lesson.quiz} kids={kids} onAnswer={onAnswer} onFinish={finishQuiz} />}

      {step === 'result' && res && (
        <div className="space-y-4 text-center animate-pop">
          <div className={cn('rounded-3xl border p-6', kids ? 'border-sky-200 bg-white' : 'border-white/10 bg-white/[0.04]')}>
            <div className="text-6xl">{res.passed ? '🎓' : '🌱'}</div>
            <div className="mt-2 text-2xl font-black">{res.passed ? 'قبول شدید' : 'یک بار دیگر'}</div>
            <div className={cn('mt-1 text-sm', muted)}>
              پاسخ درست در نخستین تلاش: {faNum(res.score)} از {faNum(res.total)}
            </div>
            {res.passed && (
              <div className="mt-2">
                <Stars n={res.stars} size="text-3xl" />
              </div>
            )}
          </div>
          {res.passed ? (
            <>
              {lesson.traveler && !travelerDone ? (
                <Btn variant={kids ? 'kids' : 'gold'} className="w-full py-3.5 text-base" onClick={() => setStep('traveler')}>
                  <Glyph value={lesson.traveler.avatar} size={22} /> همراهی با رهرو: {lesson.traveler.name}
                </Btn>
              ) : (
                <Btn variant={kids ? 'kids' : 'gold'} className="w-full py-3.5 text-base" onClick={() => setStep('done')}>
                  ادامه
                </Btn>
              )}
              {lesson.traveler && travelerDone && (
                <Btn variant={kids ? 'kidsGhost' : 'ghost'} className="w-full" onClick={() => setStep('traveler')}>
                  <Glyph value={lesson.traveler.avatar} size={22} /> مرور سیر تکاملی {lesson.traveler.name}
                </Btn>
              )}
            </>
          ) : (
            <>
              <QuoteCard q={NO_GUILT} kids={kids} />
              <div className="grid grid-cols-2 gap-2">
                <Btn variant={kids ? 'kidsGhost' : 'ghost'} onClick={() => setStep('class')}>
                  مرور کلاس
                </Btn>
                <Btn
                  variant={kids ? 'kids' : 'gold'}
                  onClick={() => {
                    setQuizKey((k) => k + 1);
                    setStep('quiz');
                  }}
                >
                  آزمون دوباره
                </Btn>
              </div>
            </>
          )}
        </div>
      )}

      {step === 'traveler' && lesson.traveler && (
        <TravelerStory
          t={lesson.traveler}
          kids={kids}
          onDone={() => {
            onTravelerDone();
            setStep('done');
          }}
        />
      )}

      {step === 'done' && (
        <div className="space-y-4 text-center animate-pop">
          <div className="relative mx-auto grid h-48 w-48 place-items-center">
            {[1, 2, 3, 4].map((r) => (
              <div
                key={r}
                className={cn('absolute rounded-full border-2', kids ? 'border-orange-300' : 'border-amber-300/40')}
                style={{ width: r * 44, height: r * 44 }}
              />
            ))}
            <div className={cn('absolute h-4 w-4 rounded-full shadow-lg', kids ? 'bg-pink-500' : 'bg-amber-300')} style={{ transform: `translateY(-${4 * 22}px)` }} />
            <div className="text-3xl font-black">🪐 {faNum(orbit + 1)}</div>
          </div>
          <QuoteCard q={HIGHER} kids={kids} big />
          <QuoteCard q={EVOLUTION_Q} kids={kids} />
          <Btn variant={kids ? 'kids' : 'gold'} className="w-full py-3.5 text-base" onClick={onBack}>
            بازگشت به مسیر تکامل
          </Btn>
        </div>
      )}
    </div>
  );
}
