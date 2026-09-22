import { AppendixAKit, Requirement, Question, Flashcard } from './kit.js';

/**
 * Internal Builder Metadata and Representation
 * Separated strictly from the Appendix A public contract.
 */

export type ItemOrigin = 'generated' | 'edited' | 'custom';

export interface BuilderCrawlMetrics {
  pagesAttempted: number;
  pagesSucceeded: number;
  pagesFailed: number;
  pagesSkipped: number;
  blockedByRobots: number;
  statusMessage?: string;
}

export interface ItemMeta {
  origin: ItemOrigin;
  pinned: boolean;
  evidenceText?: string; // Verbatim quote from JD proving requirement existence
  sourceQuestionId?: string; // Explicit reference to originating question
  targetRequirementId?: string; // Explicit reference to targeted requirement
}

export interface InternalRequirement extends Requirement {
  _meta: ItemMeta;
}

export interface InternalQuestion extends Question {
  _meta: ItemMeta;
}

export interface InternalFlashcard extends Flashcard {
  _meta: ItemMeta;
}

export interface InternalPrepKit extends Omit<AppendixAKit, 'questions' | 'flashcards' | 'role'> {
  role: Omit<AppendixAKit['role'], 'requirements'> & {
    requirements: InternalRequirement[];
  };
  questions: InternalQuestion[];
  flashcards: InternalFlashcard[];
  crawlMetrics?: BuilderCrawlMetrics;
}

export interface BuilderViewModel extends InternalPrepKit {
  id: string;
  userId: string;
  status?: 'generating' | 'ready' | 'failed';
  generationVersion: number;
  activeJobId?: string;
  createdAt: string;
  updatedAt: string;
}
