import { createContext, useContext, useState, type ReactNode } from 'react';
import type { PatientCase } from '../types';

interface CurrentCaseValue {
  currentCase: PatientCase | null;
  setCurrentCase: (c: PatientCase | null) => void;
}

/** Published by CaseLayout while a case page is mounted; read by the floating
 * assistant so it can scope its chat to the open case without a second fetch. */
const CurrentCaseContext = createContext<CurrentCaseValue>({
  currentCase: null,
  setCurrentCase: () => {},
});

export function CurrentCaseProvider({ children }: { children: ReactNode }) {
  const [currentCase, setCurrentCase] = useState<PatientCase | null>(null);
  return (
    <CurrentCaseContext.Provider value={{ currentCase, setCurrentCase }}>
      {children}
    </CurrentCaseContext.Provider>
  );
}

export function useCurrentCase(): PatientCase | null {
  return useContext(CurrentCaseContext).currentCase;
}

export function useSetCurrentCase(): (c: PatientCase | null) => void {
  return useContext(CurrentCaseContext).setCurrentCase;
}
