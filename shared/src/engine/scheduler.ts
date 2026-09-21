import { Question, Requirement, Schedule, ScheduleDay } from '../types/kit.js';
import {
  buildRequirementContext,
  calculateQuestionScore,
  compareQuestionsDeterministic,
} from './scoring.js';
import { calculateCoverage } from './coverage.js';
import {
  InvalidDaysAvailableError,
  MissingMustHaveCoverageError,
  InvalidScheduleError,
} from './errors.js';

/**
 * Deterministically allocates questions across exactly daysAvailable days.
 *
 * Guarantees:
 * 1. Exactly daysAvailable schedule days (valid for N=1, N=5, N=60).
 * 2. Every must-have requirement appears in at least one day's question references.
 * 3. Higher-priority / harder material is scheduled earlier according to deterministic score.
 * 4. Never creates empty days; reuses question IDs deterministically for active recall when questions < days.
 * 5. Uses explicit geometric spaced repetition for large N (e.g. N=60).
 * 6. Durations in integer minutes.
 * 7. 100% deterministic (no Math.random(), no Date.now(), stable tie-breakers).
 */
export function allocateSchedule(
  questionBank: Question[],
  requirements: Requirement[],
  daysAvailable: number
): Schedule {
  // A. Validate daysAvailable
  if (!Number.isInteger(daysAvailable) || daysAvailable < 1) {
    throw new InvalidDaysAvailableError(daysAvailable);
  }

  if (questionBank.length === 0) {
    throw new InvalidScheduleError('Cannot allocate schedule with an empty question bank.');
  }

  // B. Validate input must-have coverage before scheduling
  const context = buildRequirementContext(questionBank, requirements);
  const coverage = calculateCoverage(questionBank, requirements);

  if (coverage.uncoveredMustIds.length > 0) {
    throw new MissingMustHaveCoverageError(coverage.uncoveredMustIds);
  }

  const questionMap = new Map<string, Question>();
  for (const q of questionBank) {
    questionMap.set(q.id, q);
  }

  const mustRequirements = requirements.filter((r) => r.priority === 'must');
  const mustReqIdSet = new Set(mustRequirements.map((r) => r.id));

  // C. Sort questions deterministically using composite score & tie-breakers
  const sortedQuestions = [...questionBank].sort((a, b) =>
    compareQuestionsDeterministic(a, b, context)
  );

  // Filter capacity when questions >> days:
  // Must preserve ALL must-have covering questions, plus top nice-to-have questions up to capacity
  const mustCoveringQuestions: Question[] = [];
  const niceCoveringQuestions: Question[] = [];

  for (const q of sortedQuestions) {
    const coversMust = q.requirement_ids.some((rId) => mustReqIdSet.has(rId));
    if (coversMust) {
      mustCoveringQuestions.push(q);
    } else {
      niceCoveringQuestions.push(q);
    }
  }

  // Capacity limit: allow reasonable daily load (up to 5 questions per day)
  const maxNiceAllowed = Math.max(0, daysAvailable * 5 - mustCoveringQuestions.length);
  const eligibleQuestions = [
    ...mustCoveringQuestions,
    ...niceCoveringQuestions.slice(0, Math.max(2, maxNiceAllowed)),
  ].sort((a, b) => compareQuestionsDeterministic(a, b, context));

  // Mapping of Day Number (1-indexed) -> Set of Question IDs
  const dayQuestionMap = new Map<number, Set<string>>();
  for (let d = 1; d <= daysAvailable; d++) {
    dayQuestionMap.set(d, new Set<string>());
  }

  const totalEligible = eligibleQuestions.length;

  if (daysAvailable === 1) {
    // -------------------------------------------------------------
    // Single Day (N = 1): Intensive Must-Have Focus
    // -------------------------------------------------------------
    const day1Set = dayQuestionMap.get(1)!;
    // Always include all must-have covering questions
    for (const q of mustCoveringQuestions) {
      day1Set.add(q.id);
    }
    // If few must-haves, add top nice-to-haves up to 5 total
    for (const q of niceCoveringQuestions) {
      if (day1Set.size >= 5) break;
      day1Set.add(q.id);
    }
  } else {
    // -------------------------------------------------------------
    // Multi-Day Schedule (N >= 2): Primary Introduction + Spaced Review
    // -------------------------------------------------------------
    const introDays = new Map<string, number>();

    // Step 1: Assign Primary Introduction Day for each question
    if (totalEligible >= daysAvailable) {
      // Questions >= Days: Partition across days 1..N (skewing earlier for high scores)
      for (let i = 0; i < totalEligible; i++) {
        const q = eligibleQuestions[i];
        // Skew allocation: top half of questions occupy days 1..floor(N/2)
        const day = 1 + Math.min(daysAvailable - 1, Math.floor((i / totalEligible) * daysAvailable));
        dayQuestionMap.get(day)!.add(q.id);
        introDays.set(q.id, day);
      }
    } else {
      // Questions < Days: Introduce questions across first half of days
      const spreadWindow = Math.max(1, Math.min(totalEligible, Math.ceil(daysAvailable / 2)));
      for (let i = 0; i < totalEligible; i++) {
        const q = eligibleQuestions[i];
        const day = 1 + Math.floor((i / totalEligible) * spreadWindow);
        dayQuestionMap.get(day)!.add(q.id);
        introDays.set(q.id, day);
      }
    }

    // Step 2: Schedule Deterministic Spaced Reviews
    const PHI = 1.618;
    for (const q of eligibleQuestions) {
      const introDay = introDays.get(q.id) || 1;
      const coversMust = q.requirement_ids.some((rId) => mustReqIdSet.has(rId));

      // Review count formula
      let maxReviews = 0;
      if (daysAvailable <= 3) {
        maxReviews = coversMust ? 1 : 0;
      } else if (daysAvailable <= 5) {
        maxReviews = coversMust ? 2 : 1;
      } else {
        maxReviews = coversMust
          ? Math.min(5, Math.floor(daysAvailable / 10) + 2)
          : Math.min(3, Math.floor(daysAvailable / 15) + 1);
      }

      for (let k = 1; k <= maxReviews; k++) {
        // Geometric review spacing: S_k = floor(2 * 1.618^k)
        const spacing = Math.floor(2 * Math.pow(PHI, k));
        const reviewDay = introDay + spacing;
        if (reviewDay <= daysAvailable) {
          dayQuestionMap.get(reviewDay)!.add(q.id);
        }
      }
    }

    // Step 3: Prevent Empty Days (Active Recall / Review Fill)
    // If any day has 0 questions, assign review questions starting from highest-score must-haves
    const reviewCandidatePool =
      mustCoveringQuestions.length > 0 ? mustCoveringQuestions : eligibleQuestions;

    for (let d = 1; d <= daysAvailable; d++) {
      const daySet = dayQuestionMap.get(d)!;
      if (daySet.size === 0) {
        // Deterministic round-robin pick based on day number
        const pickedQ = reviewCandidatePool[(d - 1) % reviewCandidatePool.length];
        daySet.add(pickedQ.id);

        // Optionally add a second question for balance if pool allows
        if (reviewCandidatePool.length > 1) {
          const secondQ = reviewCandidatePool[d % reviewCandidatePool.length];
          daySet.add(secondQ.id);
        }
      }
    }
  }

  // Step 4: Construct the ScheduleDay objects with integer minutes and deterministic focus
  const scheduleDays: ScheduleDay[] = [];

  for (let d = 1; d <= daysAvailable; d++) {
    const rawQIds = Array.from(dayQuestionMap.get(d)!);

    // Deterministically sort question IDs within the day
    rawQIds.sort((idA, idB) => {
      const qA = questionMap.get(idA)!;
      const qB = questionMap.get(idB)!;
      return compareQuestionsDeterministic(qA, qB, context);
    });

    const dayQuestions = rawQIds.map((id) => questionMap.get(id)!);

    // Duration formula: 15 mins per difficulty point + 15 min synthesis block (strictly integer)
    const baseMinutes = dayQuestions.reduce((sum, q) => sum + q.difficulty * 15, 0);
    const minutes = Math.max(30, Math.min(180, baseMinutes + 15));

    // Focus determination
    const focus = determineDayFocus(d, daysAvailable, dayQuestions);

    scheduleDays.push({
      day: d,
      focus,
      question_ids: rawQIds,
      minutes,
    });
  }

  const finalSchedule: Schedule = {
    days_available: daysAvailable,
    days: scheduleDays,
  };

  // Step 5: Post-Allocation Validation & Invariant Enforcement
  validateScheduleInvariants(finalSchedule, questionBank, mustRequirements);

  return finalSchedule;
}

/**
 * Deterministically generates a focus string based on day position and questions.
 */
function determineDayFocus(
  day: number,
  daysAvailable: number,
  dayQuestions: Question[]
): string {
  if (daysAvailable === 1) {
    return 'Comprehensive Must-Have Mastery & Core Preparation';
  }

  if (day === daysAvailable && daysAvailable >= 3) {
    return 'Full Mock Simulation & Final Synthesis';
  }

  // Category counts
  const counts = {
    technical: 0,
    'system-design': 0,
    behavioural: 0,
    'company-fit': 0,
  };

  for (const q of dayQuestions) {
    counts[q.category]++;
  }

  if (counts['system-design'] >= counts.technical && counts['system-design'] > 0) {
    return 'System Architecture & Distributed Design';
  }

  if (counts.technical >= counts.behavioural && counts.technical > 0) {
    return day <= 2 ? 'Core Technical Must-Haves & Architecture' : 'Technical Deep-Dives & Practical Scenarios';
  }

  if (counts.behavioural > 0) {
    return 'Leadership, Mentorship & Behavioural Mastery';
  }

  if (counts['company-fit'] > 0) {
    return 'Company Alignment, Values & Cultural Readiness';
  }

  return 'Spaced Active Recall & Core Competency Drill';
}

/**
 * Validates that the schedule satisfies all assessment requirements.
 */
function validateScheduleInvariants(
  schedule: Schedule,
  questionBank: Question[],
  mustRequirements: Requirement[]
): void {
  // Invariant 1: Exactly days_available days
  if (schedule.days.length !== schedule.days_available) {
    throw new InvalidScheduleError(
      `Schedule days count (${schedule.days.length}) does not match days_available (${schedule.days_available})`
    );
  }

  // Invariant 2: No empty days & integer minutes
  for (const day of schedule.days) {
    if (day.question_ids.length === 0) {
      throw new InvalidScheduleError(`Schedule Day ${day.day} has 0 assigned questions.`);
    }
    if (!Number.isInteger(day.minutes) || day.minutes <= 0) {
      throw new InvalidScheduleError(`Schedule Day ${day.day} duration must be an integer > 0.`);
    }
  }

  // Invariant 3: Question reference integrity
  const existingQIds = new Set(questionBank.map((q) => q.id));
  for (const day of schedule.days) {
    for (const qId of day.question_ids) {
      if (!existingQIds.has(qId)) {
        throw new InvalidScheduleError(
          `Schedule references non-existent question ID: "${qId}"`
        );
      }
    }
  }

  // Invariant 4: Every must-have requirement appears somewhere in the schedule
  const scheduledQIds = new Set(schedule.days.flatMap((d) => d.question_ids));
  const coveredReqIds = new Set<string>();

  for (const qId of scheduledQIds) {
    const q = questionBank.find((item) => item.id === qId);
    if (q) {
      for (const rId of q.requirement_ids) {
        coveredReqIds.add(rId);
      }
    }
  }

  const missingMustIds = mustRequirements
    .filter((r) => !coveredReqIds.has(r.id))
    .map((r) => r.id);

  if (missingMustIds.length > 0) {
    throw new MissingMustHaveCoverageError(missingMustIds);
  }
}
