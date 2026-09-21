import { AppendixAKit, Requirement, Question, Flashcard } from './kit.js';

/**
 * Internal Builder Metadata and Representation
 * Separated strictly from the Appendix A public contract.
 */

export type ItemOrigin = 'generated' | 'edited' | 'custom';

export interface ItemMeta {
  origin: ItemOrigin;
  pinned: boolean;
  evidenceText?: string; // Verbatim quote from JD proving requirement existence
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
}

export interface BuilderViewModel extends InternalPrepKit {
  id: string;
  userId: string;
  generationVersion: number;
  activeJobId?: string;
  createdAt: string;
  updatedAt: string;
}
